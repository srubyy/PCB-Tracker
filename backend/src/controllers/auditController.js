import pool, { isFallback } from '../config/db.js';
import { tables } from '../services/memoryDb.js';
import { Audit } from '../models/Audit.js';

export const scanItem = async (req, res) => {
  const { lot_id, checkpoint_step, scanned_value } = req.body;

  if (!lot_id || !checkpoint_step || !scanned_value) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  const cleanScan = String(scanned_value).trim();
  const lotId = parseInt(lot_id, 10);
  const step = parseInt(checkpoint_step, 10);
  const userId = req.user ? req.user.id : null;

  try {
    let matchedPanel = null;
    let matchedBy = 'none';

    // 1. Find matching panel in the lot
    if (isFallback()) {
      matchedPanel = (tables.panels || []).find(
        p => p.lot_id === lotId && (
          (p.barcode && p.barcode.toLowerCase() === cleanScan.toLowerCase()) ||
          (p.dummy_sr_no && p.dummy_sr_no.toLowerCase() === cleanScan.toLowerCase())
        )
      );
    } else {
      const dbRes = await pool.query(
        `SELECT * FROM panels 
         WHERE lot_id = $1 AND (
           LOWER(barcode) = LOWER($2) OR 
           LOWER(dummy_sr_no) = LOWER($2)
         ) LIMIT 1`,
        [lotId, cleanScan]
      );
      if (dbRes.rows.length > 0) {
        matchedPanel = dbRes.rows[0];
      }
    }

    if (matchedPanel) {
      const barcodeMatch = matchedPanel.barcode && matchedPanel.barcode.toLowerCase() === cleanScan.toLowerCase();
      matchedBy = barcodeMatch ? 'barcode' : 'pcb_sr_no';
    }

    // 2. Insert scan record
    const scanRecord = await Audit.insertScan({
      lot_id: lotId,
      panel_id: matchedPanel ? matchedPanel.id : null,
      checkpoint_step: step,
      scanned_value: cleanScan,
      matched_by: matchedBy,
      scanner_id: userId,
      is_unknown: !matchedPanel
    });

    res.json({
      scan: {
        ...scanRecord,
        pcb_sr_no: matchedPanel ? matchedPanel.dummy_sr_no : null,
        barcode: matchedPanel ? matchedPanel.barcode : null,
        scanner_name: req.user ? req.user.name : 'Unknown'
      },
      is_unknown: !matchedPanel
    });
  } catch (err) {
    console.error('Scan item error:', err);
    res.status(500).json({ error: 'Failed to record scan.' });
  }
};

export const completeCheckpoint = async (req, res) => {
  const { lot_id, checkpoint_step } = req.body;

  if (!lot_id || !checkpoint_step) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  const lotId = parseInt(lot_id, 10);
  const step = parseInt(checkpoint_step, 10);

  // In-scope steps:
  // Step 6 covers 1-5
  // Step 10 covers 7-9
  const inScopeSteps = step === 6 ? [1, 2, 3, 4, 5] : [7, 8, 9];

  try {
    // 1. Fetch all panels in the lot
    let allPanels = [];
    if (isFallback()) {
      allPanels = (tables.panels || []).filter(p => p.lot_id === lotId);
    } else {
      const panelRes = await pool.query('SELECT * FROM panels WHERE lot_id = $1', [lotId]);
      allPanels = panelRes.rows;
    }

    const panelMap = new Map(allPanels.map(p => [p.id, p]));

    // 2. Fetch all panel logs for in-scope steps in this lot
    let panelLogs = [];
    if (isFallback()) {
      panelLogs = (tables.panel_logs || []).filter(log => {
        const p = panelMap.get(log.panel_id);
        if (!p) return false;
        // Map step_id (which could be the serial id of steps) to step_no
        const stepObj = (tables.repair_steps || []).find(rs => rs.id === log.step_id || rs.step_no === log.step_id);
        const stepNo = stepObj ? stepObj.step_no : null;
        return inScopeSteps.includes(stepNo);
      }).map(log => {
        const stepObj = (tables.repair_steps || []).find(rs => rs.id === log.step_id || rs.step_no === log.step_id);
        return { ...log, step_no: stepObj ? stepObj.step_no : null };
      });
    } else {
      const logRes = await pool.query(
        `SELECT pl.*, rs.step_no 
         FROM panel_logs pl
         JOIN repair_steps rs ON pl.step_id = rs.id
         JOIN panels p ON pl.panel_id = p.id
         WHERE p.lot_id = $1 AND rs.step_no = ANY($2)`,
        [lotId, inScopeSteps]
      );
      panelLogs = logRes.rows;
    }

    // Identify panels that have logs in the in-scope steps
    const loggedPanelIds = new Set(panelLogs.map(l => l.panel_id));
    const total_in_scope = loggedPanelIds.size;

    // 3. Fetch all scans at this checkpoint
    const scansList = await Audit.getScans(lotId, step);
    const scannedPanelIds = new Set(
      scansList.filter(s => !s.is_unknown && s.panel_id).map(s => s.panel_id)
    );
    const total_scanned = scannedPanelIds.size;

    // Clear old missing items for this checkpoint first
    await Audit.clearMissing(lotId, step);

    let total_missing = 0;
    let total_never_touched = 0;

    // 4. Compute Check 1 (Missing PCBs)
    for (const pId of loggedPanelIds) {
      if (!scannedPanelIds.has(pId)) {
        // Find last log entry in scope for this panel
        const pLogs = panelLogs.filter(l => l.panel_id === pId);
        pLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const lastLog = pLogs[0];

        await Audit.insertMissing({
          lot_id: lotId,
          checkpoint_step: step,
          panel_id: pId,
          last_step_id: lastLog ? lastLog.step_no : null,
          last_logged_by: lastLog ? lastLog.engineer_id : null,
          last_logged_at: lastLog ? lastLog.timestamp : null,
          missing_type: 'Not scanned at checkpoint'
        });
        total_missing++;
      }
    }

    // 5. Compute Check 3 (Never Touched PCBs)
    for (const p of allPanels) {
      if (!loggedPanelIds.has(p.id) && !scannedPanelIds.has(p.id)) {
        await Audit.insertMissing({
          lot_id: lotId,
          checkpoint_step: step,
          panel_id: p.id,
          last_step_id: null,
          last_logged_by: null,
          last_logged_at: null,
          missing_type: 'Never touched'
        });
        total_never_touched++;
      }
    }

    // 6. Upsert checkpoint results summary
    const results = await Audit.upsertResults({
      lot_id: lotId,
      checkpoint_step: step,
      total_in_scope,
      total_scanned,
      total_missing,
      total_never_touched
    });

    res.json({
      message: 'Checkpoint completed and cross-check computed successfully.',
      results
    });
  } catch (err) {
    console.error('Complete checkpoint error:', err);
    res.status(500).json({ error: 'Failed to complete checkpoint.' });
  }
};

export const getCheckpointReport = async (req, res) => {
  const { lotId, step } = req.params;
  const parsedLotId = parseInt(lotId, 10);
  const parsedStep = parseInt(step, 10);

  if (isNaN(parsedLotId) || isNaN(parsedStep)) {
    return res.status(400).json({ error: 'Invalid parameters.' });
  }

  const inScopeSteps = parsedStep === 6 ? [1, 2, 3, 4, 5] : [7, 8, 9];

  try {
    const results = await Audit.getResults(parsedLotId, parsedStep);
    const missingRaw = await Audit.getMissing(parsedLotId, parsedStep);
    const scans = await Audit.getScans(parsedLotId, parsedStep);
    const ack = await Audit.getAcknowledgement(parsedLotId, parsedStep);

    // Fetch timelines for each missing item
    const missing = [];
    for (const m of missingRaw) {
      let timeline = [];
      if (isFallback()) {
        timeline = (tables.panel_logs || [])
          .filter(pl => pl.panel_id === m.panel_id)
          .map(pl => {
            const stepObj = (tables.repair_steps || []).find(rs => rs.id === pl.step_id || rs.step_no === pl.step_id);
            const userObj = (tables.users || []).find(u => u.id === pl.engineer_id);
            return {
              step_no: stepObj ? stepObj.step_no : null,
              step_name: stepObj ? stepObj.name : 'Unknown',
              logged_by: userObj ? userObj.name : 'Unknown',
              timestamp: pl.timestamp
            };
          })
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      } else {
        const timelineRes = await pool.query(
          `SELECT pl.timestamp, rs.step_no, rs.name as step_name, u.name as logged_by
           FROM panel_logs pl
           JOIN repair_steps rs ON pl.step_id = rs.id
           LEFT JOIN users u ON pl.engineer_id = u.id
           WHERE pl.panel_id = $1
           ORDER BY pl.timestamp ASC`,
          [m.panel_id]
        );
        timeline = timelineRes.rows;
      }
      missing.push({
        ...m,
        timeline
      });
    }

    // Process Unknown Scans and Similarity Match
    const unknownScans = [];
    for (const s of scans) {
      if (s.is_unknown) {
        let matchingPanel = null;
        const cleanVal = s.scanned_value.trim().toLowerCase();
        if (isFallback()) {
          matchingPanel = (tables.panels || []).find(
            p => p.lot_id !== parsedLotId && (
              (p.barcode && p.barcode.toLowerCase() === cleanVal) ||
              (p.dummy_sr_no && p.dummy_sr_no.toLowerCase() === cleanVal)
            )
          );
        } else {
          const pRes = await pool.query(
            `SELECT p.*, l.lot_no 
             FROM panels p
             JOIN lots l ON p.lot_id = l.id
             WHERE p.lot_id <> $1 AND (
               LOWER(p.barcode) = $2 OR LOWER(p.dummy_sr_no) = $2
             ) LIMIT 1`,
            [parsedLotId, cleanVal]
          );
          if (pRes.rows.length > 0) {
            matchingPanel = pRes.rows[0];
          }
        }

        let possibleMatch = 'No similar match found';
        if (matchingPanel) {
          let lotNo = matchingPanel.lot_no;
          if (isFallback()) {
            const lotObj = (tables.lots || []).find(l => l.id === matchingPanel.lot_id);
            lotNo = lotObj ? lotObj.lot_no : 'Unknown';
          }
          possibleMatch = `Similar to ${matchingPanel.dummy_sr_no || matchingPanel.barcode} in Lot ${lotNo}`;
        }
        unknownScans.push({
          ...s,
          possible_match: possibleMatch
        });
      }
    }

    // Compute Scanner Activity
    const scannerStats = {};
    scans.forEach(s => {
      const name = s.scanner_name || 'System';
      if (!scannerStats[name]) {
        scannerStats[name] = {
          name,
          scanned_count: 0,
          min_time: null,
          max_time: null
        };
      }
      scannerStats[name].scanned_count++;
      const t = new Date(s.timestamp).getTime();
      if (!scannerStats[name].min_time || t < scannerStats[name].min_time) {
        scannerStats[name].min_time = t;
      }
      if (!scannerStats[name].max_time || t > scannerStats[name].max_time) {
        scannerStats[name].max_time = t;
      }
    });

    const scannerActivity = Object.values(scannerStats).map(stat => {
      let durationStr = '0s';
      if (stat.min_time && stat.max_time && stat.min_time !== stat.max_time) {
        const diffSeconds = Math.round((stat.max_time - stat.min_time) / 1000);
        const minutes = Math.floor(diffSeconds / 60);
        const seconds = diffSeconds % 60;
        if (minutes > 0) {
          durationStr = `${minutes}m ${seconds}s`;
        } else {
          durationStr = `${seconds}s`;
        }
      }
      return {
        scanner_name: stat.name,
        pcbs_scanned: stat.scanned_count,
        time_started: stat.min_time ? new Date(stat.min_time).toISOString() : null,
        time_completed: stat.max_time ? new Date(stat.max_time).toISOString() : null,
        duration: durationStr
      };
    });

    // Dynamic Mismatch computation
    let allPanels = [];
    if (isFallback()) {
      allPanels = (tables.panels || []).filter(p => p.lot_id === parsedLotId);
    } else {
      const panelRes = await pool.query('SELECT * FROM panels WHERE lot_id = $1', [parsedLotId]);
      allPanels = panelRes.rows;
    }
    const panelMap = new Map(allPanels.map(p => [p.id, p]));

    // Fetch all logs in scope
    let panelLogs = [];
    if (isFallback()) {
      panelLogs = (tables.panel_logs || []).filter(log => {
        const p = panelMap.get(log.panel_id);
        if (!p) return false;
        const stepObj = (tables.repair_steps || []).find(rs => rs.id === log.step_id || rs.step_no === log.step_id);
        const stepNo = stepObj ? stepObj.step_no : null;
        return inScopeSteps.includes(stepNo);
      }).map(log => {
        const stepObj = (tables.repair_steps || []).find(rs => rs.id === log.step_id || rs.step_no === log.step_id);
        return {
          ...log,
          step_no: stepObj ? stepObj.step_no : null,
          step_name: stepObj ? stepObj.name : 'Unknown',
          engineer_name: (tables.users || []).find(u => u.id === log.engineer_id)?.name || 'Unknown'
        };
      });
    } else {
      const logRes = await pool.query(
        `SELECT pl.*, rs.step_no, rs.name as step_name, u.name as engineer_name
         FROM panel_logs pl
         JOIN repair_steps rs ON pl.step_id = rs.id
         LEFT JOIN users u ON pl.engineer_id = u.id
         JOIN panels p ON pl.panel_id = p.id
         WHERE p.lot_id = $1 AND rs.step_no = ANY($2)`,
        [parsedLotId, inScopeSteps]
      );
      panelLogs = logRes.rows;
    }

    // Group logs by part code and step
    const partCodeExpectedMap = new Map();
    const partCodeScannedMap = new Map();

    panelLogs.forEach(l => {
      const panel = panelMap.get(l.panel_id);
      if (panel && panel.part_code) {
        if (!partCodeExpectedMap.has(panel.part_code)) {
          partCodeExpectedMap.set(panel.part_code, new Set());
        }
        partCodeExpectedMap.get(panel.part_code).add(l.panel_id);
      }
    });

    scans.forEach(s => {
      if (!s.is_unknown && s.panel_id) {
        const panel = panelMap.get(s.panel_id);
        if (panel && panel.part_code) {
          if (!partCodeScannedMap.has(panel.part_code)) {
            partCodeScannedMap.set(panel.part_code, new Set());
          }
          partCodeScannedMap.get(panel.part_code).add(s.panel_id);
        }
      }
    });

    let stepsList = [];
    if (isFallback()) {
      stepsList = (tables.repair_steps || []).filter(rs => inScopeSteps.includes(rs.step_no));
    } else {
      const stepsRes = await pool.query('SELECT * FROM repair_steps WHERE step_no = ANY($1) ORDER BY step_no', [inScopeSteps]);
      stepsList = stepsRes.rows;
    }

    const mismatches = [];
    const allPartCodes = new Set([...partCodeExpectedMap.keys(), ...partCodeScannedMap.keys()]);

    for (const partCode of allPartCodes) {
      const expectedSet = partCodeExpectedMap.get(partCode) || new Set();
      const scannedSet = partCodeScannedMap.get(partCode) || new Set();

      const expected = expectedSet.size;
      const scanned = scannedSet.size;

      if (expected !== scanned) {
        const stepsBreakdown = [];
        let firstStepDropped = null;
        let lastStepCount = null;

        for (const st of stepsList) {
          const stepLogs = panelLogs.filter(l => {
            const panel = panelMap.get(l.panel_id);
            return panel && panel.part_code === partCode && l.step_no === st.step_no;
          });

          const uniquePanelIdsAtStep = new Set(stepLogs.map(l => l.panel_id));
          const stepCount = uniquePanelIdsAtStep.size;

          const opsMap = {};
          stepLogs.forEach(l => {
            opsMap[l.engineer_name] = (opsMap[l.engineer_name] || 0) + 1;
          });
          const loggedByStr = Object.entries(opsMap).map(([name, c]) => `${name} (${c} logs)`).join(', ') || 'No logs';

          stepsBreakdown.push({
            step_no: st.step_no,
            step_name: st.name,
            count: stepCount,
            logged_by: loggedByStr
          });

          if (lastStepCount !== null && stepCount < lastStepCount && !firstStepDropped) {
            firstStepDropped = st.name;
          }
          lastStepCount = stepCount;
        }

        mismatches.push({
          part_code: partCode,
          expected,
          scanned,
          delta: expected - scanned,
          steps_breakdown: stepsBreakdown,
          first_step_dropped: firstStepDropped || 'N/A'
        });
      }
    }

    const totalExpected = results ? results.total_in_scope : allPanels.length;

    res.json({
      results,
      missing,
      scans,
      unknown_scans: unknownScans,
      scanner_activity: scannerActivity,
      mismatches,
      totalExpected,
      acknowledgement: ack ? {
        acknowledged: true,
        acknowledged_by: ack.acknowledged_by_name,
        acknowledged_at: ack.acknowledged_at
      } : {
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null
      }
    });
  } catch (err) {
    console.error('Get checkpoint report error:', err);
    res.status(500).json({ error: 'Failed to retrieve checkpoint report.' });
  }
};

export const acknowledgeCheckpoint = async (req, res) => {
  const { lot_id, checkpoint_step } = req.body;
  if (!lot_id || !checkpoint_step) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }
  const userId = req.user ? req.user.id : null;
  try {
    const ack = await Audit.acknowledgeCheckpoint(lot_id, checkpoint_step, userId);
    res.json({ message: 'Checkpoint acknowledged successfully.', acknowledgement: ack });
  } catch (err) {
    console.error('Acknowledge checkpoint error:', err);
    res.status(500).json({ error: 'Failed to acknowledge checkpoint.' });
  }
};

export const resolveMissing = async (req, res) => {
  const { missing_id, action, note } = req.body;
  if (!missing_id || !action) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }
  const userId = req.user ? req.user.id : null;
  try {
    const resolved = await Audit.resolveMissingPCB(missing_id, action, note, userId);
    res.json({ message: 'Missing PCB resolved successfully.', resolved });
  } catch (err) {
    console.error('Resolve missing PCB error:', err);
    res.status(500).json({ error: 'Failed to resolve missing PCB.' });
  }
};
