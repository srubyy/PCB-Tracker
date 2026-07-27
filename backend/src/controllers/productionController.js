import pool, { isFallback, query } from '../config/db.js';
import { Lot } from '../models/Lot.js';
import { RepairStep } from '../models/RepairStep.js';
import * as memoryDb from '../services/memoryDb.js';

// Helper to get step-wise aggregates (committed + pending logs)
const getStepSum = async (lotId, stepNo, fields, includePending = true) => {
  if (isFallback()) {
    const comLogs = memoryDb.tables.production_logs.filter(l => l.lot_id === lotId && l.step_no === stepNo);
    const penLogs = includePending
      ? memoryDb.tables.pending_production_logs.filter(l => l.lot_id === lotId && l.step_no === stepNo && !['Approved', 'Rejected'].includes(l.approval_status))
      : [];

    const result = {};
    fields.forEach(f => {
      let sum = 0;
      comLogs.forEach(l => {
        sum += parseInt(l.step_data[f] || 0);
      });
      penLogs.forEach(l => {
        sum += parseInt(l.step_data[f] || 0);
      });
      result[f] = sum;
    });
    return result;
  }

  const selectCommitted = fields.map(f => `COALESCE(SUM((step_data->>'${f}')::integer), 0) AS ${f}`).join(', ');
  const comRes = await query(`SELECT ${selectCommitted} FROM production_logs WHERE lot_id = $1 AND step_no = $2`, [lotId, stepNo]);

  let penRes = { rows: [{}] };
  if (includePending) {
    const selectPending = fields.map(f => `COALESCE(SUM((step_data->>'${f}')::integer), 0) AS ${f}`).join(', ');
    penRes = await query(`SELECT ${selectPending} FROM pending_production_logs WHERE lot_id = $1 AND step_no = $2 AND approval_status NOT IN ('Approved', 'Rejected')`, [lotId, stepNo]);
  }

  const result = {};
  fields.forEach(f => {
    result[f] = parseInt(comRes.rows[0][f] || 0) + parseInt(penRes.rows[0]?.[f] || 0);
  });
  return result;
};

export const getProductionLogs = async (req, res) => {
  const { lot_id, step_no } = req.query;

  if (isFallback()) {
    let logs = memoryDb.tables.production_logs.map(pl => {
      const lot = memoryDb.tables.lots.find(l => l.id === pl.lot_id);
      const user = memoryDb.tables.users.find(u => u.id === pl.operator_id);
      return {
        ...pl,
        lot_no: lot ? lot.lot_no : null,
        batch_no: lot ? lot.batch_no : null,
        pixel_pitch: lot ? lot.pixel_pitch : null,
        operator_name: user ? user.name : 'Unknown'
      };
    });
    if (lot_id) {
      logs = logs.filter(pl => pl.lot_id === parseInt(lot_id));
    }
    if (step_no) {
      logs = logs.filter(pl => pl.step_no === parseInt(step_no));
    }
    return res.json(logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
  }

  let q = `
    SELECT pl.*, l.lot_no, l.batch_no, l.pixel_pitch, u.name as operator_name 
    FROM production_logs pl
    JOIN lots l ON pl.lot_id = l.id
    LEFT JOIN users u ON pl.operator_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (lot_id) {
    params.push(parseInt(lot_id));
    q += ` AND pl.lot_id = $${params.length}`;
  }
  if (step_no) {
    params.push(parseInt(step_no));
    q += ` AND pl.step_no = $${params.length}`;
  }
  q += ` ORDER BY pl.timestamp DESC`;

  try {
    const resLogs = await query(q, params);
    res.json(resLogs.rows);
  } catch (err) {
    console.error('Fetch logs error:', err);
    res.status(500).json({ error: "Failed to fetch production logs." });
  }
};

export const getPendingProductionLogs = async (req, res) => {
  const { step_no } = req.query;

  if (isFallback()) {
    let logs = memoryDb.tables.pending_production_logs
      .filter(pl => pl.approval_status === 'Pending Team Lead')
      .map(pl => {
        const lot = memoryDb.tables.lots.find(l => l.id === pl.lot_id);
        const user = memoryDb.tables.users.find(u => u.id === pl.operator_id);
        const tl = memoryDb.tables.users.find(u => u.id === pl.team_lead_id);
        const mgr = memoryDb.tables.users.find(u => u.id === pl.manager_id);
        return {
          ...pl,
          lot_no: lot ? lot.lot_no : null,
          batch_no: lot ? lot.batch_no : null,
          pixel_pitch: lot ? lot.pixel_pitch : null,
          operator_name: user ? user.name : 'Unknown',
          team_lead_name: tl ? tl.name : null,
          manager_name: mgr ? mgr.name : null
        };
      });
    if (step_no) {
      logs = logs.filter(pl => pl.step_no === parseInt(step_no));
    }
    return res.json(logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
  }

  let q = `
    SELECT pl.*, l.lot_no, l.batch_no, l.pixel_pitch, u.name as operator_name, tl.name as team_lead_name, mgr.name as manager_name
    FROM pending_production_logs pl
    JOIN lots l ON pl.lot_id = l.id
    LEFT JOIN users u ON pl.operator_id = u.id
    LEFT JOIN users tl ON pl.team_lead_id = tl.id
    LEFT JOIN users mgr ON pl.manager_id = mgr.id
    WHERE 1=1
  `;
  const params = [];

  q += ` AND pl.approval_status = 'Pending Team Lead'`;

  if (step_no) {
    params.push(parseInt(step_no));
    q += ` AND pl.step_no = $${params.length}`;
  }

  q += ` ORDER BY pl.timestamp DESC`;

  try {
    const resLogs = await query(q, params);
    res.json(resLogs.rows);
  } catch (err) {
    console.error('Fetch pending logs error:', err);
    res.status(500).json({ error: "Failed to fetch pending production logs." });
  }
};

export const logProduction = async (req, res) => {
  const { lot_id, step_no, pcb_type, step_data } = req.body;

  if (!lot_id || !step_no || !pcb_type || !step_data) {
    return res.status(400).json({ error: "Missing required entry fields." });
  }

  try {
    const lotId = parseInt(lot_id);
    const stepNo = parseInt(step_no);
    const lot = await Lot.findById(lotId);
    if (!lot) {
      return res.status(404).json({ error: "Selected lot does not exist." });
    }
    const received_qty = lot.received_qty;

    // Checksums Validation
    if (stepNo === 2) {
      const { repairable_qty, scrap_qty } = step_data;
      const existing = await getStepSum(lotId, 2, ['repairable_qty', 'scrap_qty']);
      const total = existing.repairable_qty + existing.scrap_qty + parseInt(repairable_qty || 0) + parseInt(scrap_qty || 0);
      if (total > received_qty) {
        return res.status(400).json({ error: `🚫 Checksum Error: Total segregated PCBs (${total}) would exceed the actual received quantity (${received_qty}) of Lot ${lot.lot_no}.` });
      }
    } else if (stepNo === 3) {
      const { code_ok, code_not_ok } = step_data;
      const step2 = await getStepSum(lotId, 2, ['repairable_qty']);
      const existing = await getStepSum(lotId, 3, ['code_ok', 'code_not_ok']);
      const total = existing.code_ok + existing.code_not_ok + parseInt(code_ok || 0) + parseInt(code_not_ok || 0);
      if (total > step2.repairable_qty) {
        return res.status(400).json({ error: `🚫 Checksum Error: Total programmed PCBs (${total}) would exceed the segregated repairable quantity (${step2.repairable_qty}) of Lot ${lot.lot_no}.` });
      }
    } else if (stepNo === 4) {
      const { qty_passed, qty_failed } = step_data;
      const step3 = await getStepSum(lotId, 3, ['code_ok']);
      const existing = await getStepSum(lotId, 4, ['qty_passed', 'qty_failed']);
      const total = existing.qty_passed + existing.qty_failed + parseInt(qty_passed || 0) + parseInt(qty_failed || 0);
      if (total > step3.code_ok) {
        return res.status(400).json({ error: `🚫 Checksum Error: Total tested PCBs (${total}) would exceed the programmed OK quantity (${step3.code_ok}) of Lot ${lot.lot_no}.` });
      }
    } else if (stepNo === 5) {
      const { debug_ok, critical_qty, scrap_qty } = step_data;
      const step4 = await getStepSum(lotId, 4, ['qty_failed']);
      const existing = await getStepSum(lotId, 5, ['debug_ok', 'critical_qty', 'scrap_qty']);
      const total = existing.debug_ok + existing.critical_qty + existing.scrap_qty + parseInt(debug_ok || 0) + parseInt(critical_qty || 0) + parseInt(scrap_qty || 0);
      if (total > step4.qty_failed) {
        return res.status(400).json({ error: `🚫 Checksum Error: Total debugged PCBs (${total}) would exceed the failed quantity from 1st Testing (${step4.qty_failed}) of Lot ${lot.lot_no}.` });
      }
    } else if (stepNo === 6) {
      const { entry_count } = step_data;
      const step4 = await getStepSum(lotId, 4, ['qty_passed']);
      const step5 = await getStepSum(lotId, 5, ['debug_ok']);
      const limit = step4.qty_passed + step5.debug_ok;
      const existing = await getStepSum(lotId, 6, ['entry_count']);
      const total = existing.entry_count + parseInt(entry_count || 0);
      if (total > limit) {
        return res.status(400).json({ error: `🚫 Checksum Error: Total entered PCBs (${total}) would exceed the passed/debugged count (${limit}) of Lot ${lot.lot_no}.` });
      }
    } else if (stepNo === 7) {
      const { qty_cleaned, qc_reject } = step_data;
      const step6 = await getStepSum(lotId, 6, ['entry_count']);
      const existing = await getStepSum(lotId, 7, ['qty_cleaned', 'qc_reject']);
      const total = existing.qty_cleaned + existing.qc_reject + parseInt(qty_cleaned || 0) + parseInt(qc_reject || 0);
      if (total > step6.entry_count) {
        return res.status(400).json({ error: `🚫 Checksum Error: Total cleaned PCBs (${total}) would exceed the entry count (${step6.entry_count}) of Lot ${lot.lot_no}.` });
      }
    } else if (stepNo === 8) {
      const { qty_passed, qty_failed } = step_data;
      const step7 = await getStepSum(lotId, 7, ['qty_cleaned']);
      const existing = await getStepSum(lotId, 8, ['qty_passed', 'qty_failed']);
      const total = existing.qty_passed + existing.qty_failed + parseInt(qty_passed || 0) + parseInt(qty_failed || 0);
      if (total > step7.qty_cleaned) {
        return res.status(400).json({ error: `🚫 Checksum Error: Total QC-inspected PCBs (${total}) would exceed the cleaned count (${step7.qty_cleaned}) of Lot ${lot.lot_no}.` });
      }
    } else if (stepNo === 9) {
      const { qty_coated } = step_data;
      const step8 = await getStepSum(lotId, 8, ['qty_passed']);
      const existing = await getStepSum(lotId, 9, ['qty_coated']);
      const total = existing.qty_coated + parseInt(qty_coated || 0);
      if (total > step8.qty_passed) {
        return res.status(400).json({ error: `🚫 Checksum Error: Total coated PCBs (${total}) would exceed the QC-passed count (${step8.qty_passed}) of Lot ${lot.lot_no}.` });
      }
    } else if (stepNo === 10) {
      const { qty_passed, qty_failed } = step_data;
      const step9 = await getStepSum(lotId, 9, ['qty_coated']);
      const existing = await getStepSum(lotId, 10, ['qty_passed', 'qty_failed']);
      const total = existing.qty_passed + existing.qty_failed + parseInt(qty_passed || 0) + parseInt(qty_failed || 0);
      if (total > step9.qty_coated) {
        return res.status(400).json({ error: `🚫 Checksum Error: Total final-tested PCBs (${total}) would exceed the coated count (${step9.qty_coated}) of Lot ${lot.lot_no}.` });
      }
    } else if (stepNo === 11) {
      const { bubble_packed, box_packed } = step_data;
      const step10 = await getStepSum(lotId, 10, ['qty_passed']);
      const existing = await getStepSum(lotId, 11, ['bubble_packed', 'box_packed']);
      const total = existing.bubble_packed + existing.box_packed + parseInt(bubble_packed || 0) + parseInt(box_packed || 0);
      if (total > step10.qty_passed) {
        return res.status(400).json({ error: `🚫 Checksum Error: Total packed PCBs (${total}) would exceed the final test-passed count (${step10.qty_passed}) of Lot ${lot.lot_no}.` });
      }
    } else if (stepNo === 12) {
      const { entry_count } = step_data;
      const step11 = await getStepSum(lotId, 11, ['bubble_packed', 'box_packed']);
      const limit = step11.bubble_packed + step11.box_packed;
      const existing = await getStepSum(lotId, 12, ['entry_count']);
      const total = existing.entry_count + parseInt(entry_count || 0);
      if (total > limit) {
        return res.status(400).json({ error: `🚫 Checksum Error: Total final entries (${total}) would exceed the packed count (${limit}) of Lot ${lot.lot_no}.` });
      }
    }

    if (stepNo === 1) {
      const qty_rec = parseInt(step_data.qty_received || 0);
      const expected = parseInt(step_data.expected_qty || 0);
      step_data.shortage = expected - qty_rec;
    }

    let logResult;
    if (isFallback()) {
      logResult = {
        id: memoryDb.tables.pending_production_logs.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1,
        lot_id: lotId,
        step_no: stepNo,
        pcb_type,
        operator_id: req.user.id,
        step_data,
        approval_status: 'Pending Team Lead',
        timestamp: new Date().toISOString()
      };
      memoryDb.tables.pending_production_logs.push(logResult);
    } else {
      const insRes = await query(`
        INSERT INTO pending_production_logs (lot_id, step_no, pcb_type, operator_id, step_data, approval_status)
        VALUES ($1, $2, $3, $4, $5, 'Pending Team Lead')
        RETURNING *
      `, [lotId, stepNo, pcb_type, req.user.id, JSON.stringify(step_data)]);
      logResult = insRes.rows[0];
    }

    res.status(201).json({
      success: true,
      pending: true,
      log: logResult,
      message: "Step production log submitted successfully! Awaiting Team Lead clearance."
    });

  } catch (err) {
    console.error('Log creation error:', err);
    res.status(500).json({ error: "Failed to record pending step log entry." });
  }
};

export const tlApproveLog = async (req, res) => {
  const { pending_log_id } = req.body;
  if (!pending_log_id) {
    return res.status(400).json({ error: "Missing pending log ID." });
  }

  const useTx = !isFallback();
  const txClient = useTx ? await pool.connect() : null;

  try {
    if (useTx) await txClient.query('BEGIN');

    let pLog = null;
    if (isFallback()) {
      pLog = memoryDb.tables.pending_production_logs.find(pl => pl.id === parseInt(pending_log_id) && pl.approval_status === 'Pending Team Lead');
    } else {
      const logRes = await txClient.query("SELECT * FROM pending_production_logs WHERE id = $1 AND approval_status = 'Pending Team Lead'", [pending_log_id]);
      if (logRes.rowCount > 0) pLog = logRes.rows[0];
    }

    if (!pLog) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(404).json({ error: "Pending log not found or already verified." });
    }

    // Insert into committed production_logs
    if (isFallback()) {
      memoryDb.tables.production_logs.push({
        id: memoryDb.tables.production_logs.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1,
        lot_id: pLog.lot_id,
        step_no: pLog.step_no,
        pcb_type: pLog.pcb_type,
        operator_id: pLog.operator_id,
        step_data: pLog.step_data,
        timestamp: pLog.timestamp || new Date().toISOString()
      });
      pLog.approval_status = 'Approved';
      pLog.team_lead_id = req.user.id;
      pLog.team_lead_approved_at = new Date().toISOString();
    } else {
      await txClient.query(`
        INSERT INTO production_logs (lot_id, step_no, pcb_type, operator_id, step_data, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [pLog.lot_id, pLog.step_no, pLog.pcb_type, pLog.operator_id, pLog.step_data, pLog.timestamp]);

      await txClient.query(`
        UPDATE pending_production_logs 
        SET approval_status = 'Approved', team_lead_id = $1, team_lead_approved_at = NOW()
        WHERE id = $2
      `, [req.user.id, pending_log_id]);
    }

    // Adjust lot stats if Step 1 (Inward) is committed
    if (pLog.step_no === 1) {
      const recCount = parseInt(pLog.step_data.qty_received || 0);
      const expectedCount = parseInt(pLog.step_data.expected_qty || 0);
      if (isFallback()) {
        const lot = memoryDb.tables.lots.find(l => l.id === pLog.lot_id);
        if (lot) {
          lot.received_qty = (lot.received_qty || 0) + recCount;
          lot.qty_sent = (lot.qty_sent || 0) + expectedCount;
        }
      } else {
        await txClient.query('UPDATE lots SET received_qty = received_qty + $1, qty_sent = qty_sent + $2 WHERE id = $3', [recCount, expectedCount, pLog.lot_id]);
      }
    }

    // Fetch lot to get client_id
    let clientId = null;
    if (isFallback()) {
      const lot = memoryDb.findLotById(pLog.lot_id);
      if (lot) clientId = lot.client_id;
    } else {
      const lotRes = await txClient.query('SELECT client_id FROM lots WHERE id = $1', [pLog.lot_id]);
      if (lotRes.rows[0]) clientId = lotRes.rows[0].client_id;
    }

    const steps = await RepairStep.getAllForClient(clientId);
    const stepObj = steps.find(s => s.step_no === pLog.step_no);
    const stepName = stepObj ? stepObj.name : '';

    // Adjust lot stats if Step is Final Entry
    if (stepName === 'Final Entry') {
      const finalCount = parseInt(pLog.step_data.entry_count || 0);
      
      if (isFallback()) {
        const lot = memoryDb.tables.lots.find(l => l.id === pLog.lot_id);
        if (lot) {
          lot.dispatched_qty = (lot.dispatched_qty || 0) + finalCount;
          if (lot.dispatched_qty >= lot.received_qty) {
            lot.status = 'Complete';
          }
        }
      } else {
        await txClient.query('UPDATE lots SET dispatched_qty = COALESCE(dispatched_qty, 0) + $1 WHERE id = $2', [finalCount, pLog.lot_id]);
        
        const checkLot = await txClient.query('SELECT * FROM lots WHERE id = $1', [pLog.lot_id]);
        const activeLot = checkLot.rows[0];
        if (activeLot.dispatched_qty >= activeLot.received_qty) {
          await txClient.query("UPDATE lots SET status = 'Complete' WHERE id = $1", [pLog.lot_id]);
        }
      }
    }

    if (useTx) {
      await txClient.query('COMMIT');
      txClient.release();
    }

    res.json({ success: true, message: "Production log committed and approved successfully!" });
  } catch (err) {
    if (useTx && txClient) {
      await txClient.query('ROLLBACK');
      txClient.release();
    }
    console.error('TL approve error:', err);
    res.status(500).json({ error: "Failed to finalize quality clearance transaction." });
  }
};

export const rejectLog = async (req, res) => {
  const { pending_log_id, rejection_reason } = req.body;
  if (!pending_log_id || !rejection_reason) {
    return res.status(400).json({ error: "Pending log ID and rejection reason are required." });
  }

  try {
    const expectedStatus = 'Pending Team Lead';

    if (isFallback()) {
      const log = memoryDb.tables.pending_production_logs.find(pl => pl.id === parseInt(pending_log_id) && pl.approval_status === expectedStatus);
      if (!log) {
        return res.status(404).json({ error: "Pending production log not found or already processed." });
      }
      log.approval_status = 'Rejected';
      log.rejection_reason = rejection_reason;
      return res.json({ success: true, log });
    }

    const updateRes = await query(`
      UPDATE pending_production_logs 
      SET approval_status = 'Rejected', rejection_reason = $1
      WHERE id = $2 AND approval_status = $3
      RETURNING *
    `, [rejection_reason, pending_log_id, expectedStatus]);

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: "Pending production log not found or already processed." });
    }

    res.json({ success: true, log: updateRes.rows[0] });
  } catch (err) {
    console.error('Reject log error:', err);
    res.status(500).json({ error: "Failed to reject pending production log." });
  }
};

export const getLotProductionStats = async (req, res) => {
  try {
    const lotId = parseInt(req.params.lot_id);
    const lot = await Lot.findById(lotId);
    if (!lot) {
      return res.status(404).json({ error: "Lot not found." });
    }

    const stats = {
      lot_no: lot.lot_no,
      batch_no: lot.batch_no,
      pixel_pitch: lot.pixel_pitch,
      qty_sent: lot.qty_sent,
      received_qty: lot.received_qty,
      dispatched_qty: lot.dispatched_qty,
      steps: {}
    };

    const partCodeCounts = {};
    if (isFallback()) {
      const panels = (memoryDb.tables.panels || []).filter(p => p.lot_id === lotId);
      panels.forEach(p => {
        const pc = p.part_code || '';
        partCodeCounts[pc] = (partCodeCounts[pc] || 0) + 1;
      });
    } else {
      const pRes = await pool.query('SELECT part_code, COUNT(*)::integer FROM panels WHERE lot_id = $1 GROUP BY part_code', [lotId]);
      pRes.rows.forEach(row => {
        partCodeCounts[row.part_code || ''] = row.count;
      });
    }
    stats.part_code_counts = partCodeCounts;

    // Pull aggregates sequentially for the 12 steps
    stats.steps[1] = { inward: lot.received_qty, expected: lot.qty_sent, shortage: lot.qty_sent - lot.received_qty };
    stats.steps[2] = await getStepSum(lotId, 2, ['repairable_qty', 'scrap_qty'], false);
    stats.steps[3] = await getStepSum(lotId, 3, ['code_ok', 'code_not_ok'], false);
    stats.steps[4] = await getStepSum(lotId, 4, ['qty_passed', 'qty_failed'], false);
    stats.steps[5] = await getStepSum(lotId, 5, ['debug_ok', 'critical_qty', 'scrap_qty'], false);
    stats.steps[6] = await getStepSum(lotId, 6, ['entry_count'], false);
    stats.steps[7] = await getStepSum(lotId, 7, ['qty_cleaned', 'qc_reject'], false);
    stats.steps[8] = await getStepSum(lotId, 8, ['qty_passed', 'qty_failed'], false);
    stats.steps[9] = await getStepSum(lotId, 9, ['qty_coated'], false);
    stats.steps[10] = await getStepSum(lotId, 10, ['qty_passed', 'qty_failed'], false);
    stats.steps[11] = await getStepSum(lotId, 11, ['bubble_packed', 'box_packed'], false);
    stats.steps[12] = await getStepSum(lotId, 12, ['entry_count'], false);

    res.json(stats);
  } catch (err) {
    console.error('Stats aggregation error:', err);
    res.status(500).json({ error: "Failed to compile lot production stats." });
  }
};
