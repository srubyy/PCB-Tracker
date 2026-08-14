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

const getStepSumForPcbType = async (lotId, stepNo, pcbType, fields, includePending = true) => {
  if (isFallback()) {
    const comLogs = memoryDb.tables.production_logs.filter(l => l.lot_id === lotId && l.step_no === stepNo && l.pcb_type === pcbType);
    const penLogs = includePending
      ? memoryDb.tables.pending_production_logs.filter(l => l.lot_id === lotId && l.step_no === stepNo && l.pcb_type === pcbType && !['Approved', 'Rejected'].includes(l.approval_status))
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
  const comRes = await query(`SELECT ${selectCommitted} FROM production_logs WHERE lot_id = $1 AND step_no = $2 AND pcb_type = $3`, [lotId, stepNo, pcbType]);

  let penRes = { rows: [{}] };
  if (includePending) {
    const selectPending = fields.map(f => `COALESCE(SUM((step_data->>'${f}')::integer), 0) AS ${f}`).join(', ');
    penRes = await query(`SELECT ${selectPending} FROM pending_production_logs WHERE lot_id = $1 AND step_no = $2 AND pcb_type = $3 AND approval_status NOT IN ('Approved', 'Rejected')`, [lotId, stepNo, pcbType]);
  }

  const result = {};
  fields.forEach(f => {
    result[f] = parseInt(comRes.rows[0][f] || 0) + parseInt(penRes.rows[0]?.[f] || 0);
  });
  return result;
};

const getPartCodeLimit = async (lotId, limitType, partCode) => {
  if (isFallback()) {
    if (limitType === 'inward') {
      return (memoryDb.tables.panels || []).filter(p => p.lot_id === lotId && p.part_code === partCode).length;
    } else if (limitType === 'step6') {
      return (memoryDb.tables.checkpoint_scans || []).filter(
        cs => cs.lot_id === lotId && 
              cs.checkpoint_step === 6 && 
              !cs.is_unknown && 
              (memoryDb.tables.panels || []).find(p => p.id === cs.panel_id)?.part_code === partCode
      ).length;
    }
    return 0;
  }

  if (limitType === 'inward') {
    const res = await pool.query('SELECT COUNT(*)::integer FROM panels WHERE lot_id = $1 AND part_code = $2', [lotId, partCode]);
    return res.rows[0].count;
  } else if (limitType === 'step6') {
    const res = await pool.query(`
      SELECT COUNT(*)::integer 
      FROM checkpoint_scans cs 
      JOIN panels p ON cs.panel_id = p.id 
      WHERE cs.lot_id = $1 AND cs.checkpoint_step = 6 AND p.part_code = $2 AND cs.is_unknown = FALSE
    `, [lotId, partCode]);
    return res.rows[0].count;
  }
  return 0;
};

const extractMfgYear = (serial) => {
  if (!serial) return null;
  const s = String(serial).trim();
  const len = s.length;
  if (s.startsWith('AT') && len <= 8) return null;
  const matches = s.match(/[a-zA-Z](\d{2})/g);
  if (matches) {
    for (const m of matches) {
      const yr = parseInt(m.substring(1), 10);
      if (yr >= 10 && yr <= 50) return 2000 + yr;
    }
  }
  if (len >= 4) {
    const yrPart = s.substring(2, 4);
    const yr = parseInt(yrPart, 10);
    if (!isNaN(yr) && yr >= 10 && yr <= 50) return 2000 + yr;
  }
  if (len === 16 || len === 17) {
    const yr = parseInt(s.substring(3, 5), 10);
    if (!isNaN(yr)) return yr + 2000;
  }
  if (s.startsWith('AGV')) {
    const cIndex = s.indexOf('C');
    if (cIndex !== -1 && s.length > cIndex + 2) {
      const yr = parseInt(s.substring(cIndex + 1, cIndex + 3), 10);
      if (!isNaN(yr)) return yr + 2000;
    }
  }
  return null;
};

const getStepOkSum = async (lotId, stepNo, partCode, okField) => {
  const targetCode = String(partCode).split(' - ')[0].trim().toUpperCase();
  const cleanLotId = await resolveLotId(lotId);
  const rawLotId = parseInt(lotId, 10);

  if (isFallback()) {
    const comLogs = (memoryDb.tables.production_logs || []).filter(
      l => (l.lot_id === cleanLotId || l.lot_id === rawLotId) && 
           l.step_no === stepNo && 
           l.pcb_type.split(' - ')[0].trim().toUpperCase() === targetCode
    );
    const penLogs = (memoryDb.tables.pending_production_logs || []).filter(
      l => (l.lot_id === cleanLotId || l.lot_id === rawLotId) && 
           l.step_no === stepNo && 
           l.pcb_type.split(' - ')[0].trim().toUpperCase() === targetCode &&
           l.approval_status !== 'Rejected'
    );
    let sum = 0;
    comLogs.forEach(l => {
      sum += parseInt(l.step_data?.[okField] || 0);
    });
    penLogs.forEach(l => {
      sum += parseInt(l.step_data?.[okField] || 0);
    });
    return sum;
  }

  try {
    const res = await pool.query(
      `SELECT (
         COALESCE((SELECT SUM((step_data->>$1)::integer) FROM production_logs WHERE (lot_id = $2 OR lot_id = $5) AND step_no = $3 AND UPPER(TRIM(SPLIT_PART(pcb_type, ' - ', 1))) = $4), 0) +
         COALESCE((SELECT SUM((step_data->>$1)::integer) FROM pending_production_logs WHERE (lot_id = $2 OR lot_id = $5) AND step_no = $3 AND UPPER(TRIM(SPLIT_PART(pcb_type, ' - ', 1))) = $4 AND approval_status <> 'Rejected'), 0)
       ) AS total`,
      [okField, cleanLotId, stepNo, targetCode, rawLotId]
    );
    return parseInt(res.rows[0]?.total || 0);
  } catch (err) {
    const comLogs = (memoryDb.tables.production_logs || []).filter(
      l => (l.lot_id === cleanLotId || l.lot_id === rawLotId) && 
           l.step_no === stepNo && 
           l.pcb_type.split(' - ')[0].trim().toUpperCase() === targetCode
    );
    const penLogs = (memoryDb.tables.pending_production_logs || []).filter(
      l => (l.lot_id === cleanLotId || l.lot_id === rawLotId) && 
           l.step_no === stepNo && 
           l.pcb_type.split(' - ')[0].trim().toUpperCase() === targetCode &&
           l.approval_status !== 'Rejected'
    );
    let sum = 0;
    comLogs.forEach(l => {
      sum += parseInt(l.step_data?.[okField] || 0);
    });
    penLogs.forEach(l => {
      sum += parseInt(l.step_data?.[okField] || 0);
    });
    return sum;
  }
};

const getStep6AuditLimit = async (lotId, partCode) => {
  let auditCount = 0;
  const cleanLotId = await resolveLotId(lotId);
  const rawLotId = parseInt(lotId, 10);

  if (isFallback()) {
    auditCount = (memoryDb.tables.checkpoint_scans || []).filter(
      cs => (cs.lot_id === cleanLotId || cs.lot_id === rawLotId) && 
            cs.checkpoint_step === 6 && 
            !cs.is_unknown && 
            (memoryDb.tables.panels || []).find(p => p.id === cs.panel_id)?.part_code === partCode
    ).length;
  } else {
    try {
      const res = await pool.query(`
        SELECT COUNT(*)::integer 
        FROM checkpoint_scans cs 
        JOIN panels p ON cs.panel_id = p.id 
        WHERE (cs.lot_id = $1 OR cs.lot_id = $3) AND cs.checkpoint_step = 6 AND p.part_code = $2 AND cs.is_unknown = FALSE
      `, [cleanLotId, partCode, rawLotId]);
      auditCount = res.rows[0].count;
    } catch (err) {
      auditCount = 0;
    }
  }

  if (auditCount === 0) {
    return getStepOkSum(lotId, 6, partCode, 'entry_count');
  }
  return auditCount;
};

const getStep10AuditLimit = async (lotId, partCode) => {
  let auditCount = 0;
  const cleanLotId = await resolveLotId(lotId);
  const rawLotId = parseInt(lotId, 10);

  if (isFallback()) {
    auditCount = (memoryDb.tables.checkpoint_scans || []).filter(
      cs => (cs.lot_id === cleanLotId || cs.lot_id === rawLotId) && 
            cs.checkpoint_step === 10 && 
            !cs.is_unknown && 
            (memoryDb.tables.panels || []).find(p => p.id === cs.panel_id)?.part_code === partCode
    ).length;
  } else {
    try {
      const res = await pool.query(`
        SELECT COUNT(*)::integer 
        FROM checkpoint_scans cs 
        JOIN panels p ON cs.panel_id = p.id 
        WHERE (cs.lot_id = $1 OR cs.lot_id = $3) AND cs.checkpoint_step = 10 AND p.part_code = $2 AND cs.is_unknown = FALSE
      `, [cleanLotId, partCode, rawLotId]);
      auditCount = res.rows[0].count;
    } catch (err) {
      auditCount = 0;
    }
  }

  if (auditCount === 0) {
    return getStepOkSum(lotId, 10, partCode, 'qty_passed');
  }
  return auditCount;
};

const resolveLotId = async (inputLotId) => {
  const num = parseInt(inputLotId, 10);
  if (isNaN(num)) return null;
  if (isFallback()) {
    const lot = (memoryDb.tables.lots || []).find(l => l.id === num || l.lot_no === num);
    return lot ? lot.id : num;
  }
  try {
    const res = await pool.query('SELECT id FROM lots WHERE id = $1 OR lot_no = $1 LIMIT 1', [num]);
    return res.rows.length > 0 ? res.rows[0].id : num;
  } catch (err) {
    return num;
  }
};

export const getScannedVerifiedQtyForPartCode = async (lotId, partCode) => {
  const saMatch = String(partCode).match(/SA\d+/i);
  const cleanPartCode = saMatch ? saMatch[0].toUpperCase() : partCode.split(' - ')[0].trim().toUpperCase();
  const cleanLotId = await resolveLotId(lotId);
  const rawLotId = parseInt(lotId, 10);

  if (isFallback()) {
    const lotScanLogs = (memoryDb.tables.scan_logs || []).filter(sl => (sl.lot_id === cleanLotId || sl.lot_id === rawLotId) && sl.timestamp);
    const scannedRowIndices = new Set(lotScanLogs.map(sl => sl.row_idx).filter(r => r !== null && r !== undefined));
    const scannedDummyNos = new Set(lotScanLogs.map(sl => sl.dummy_sr_no).filter(Boolean));
    const scannedBarcodes = new Set(lotScanLogs.map(sl => sl.actual_serial_no).filter(Boolean));

    const scannedPanels = (memoryDb.tables.panels || []).filter(p => {
      if (p.lot_id !== cleanLotId && p.lot_id !== rawLotId) return false;
      const pCode = (p.part_code || '').trim().toUpperCase();
      if (pCode !== cleanPartCode && !pCode.includes(cleanPartCode)) return false;

      const isScanned = scannedRowIndices.has(p.sr_no - 1) || 
                        scannedRowIndices.has(p.sr_no) ||
                        scannedDummyNos.has(p.dummy_sr_no) ||
                        scannedBarcodes.has(p.barcode) ||
                        scannedBarcodes.has(p.real_sr_no);
      return isScanned;
    });

    if (scannedPanels.length > 0) return scannedPanels.length;
    return lotScanLogs.filter(sl => {
      const pCode = sl.actual_serial_no ? (sl.actual_serial_no.match(/SA\d+/i)?.[0]?.toUpperCase() || 'SA0010') : 'SA0010';
      return pCode === cleanPartCode;
    }).length;
  } else {
    try {
      const res = await pool.query(`
        SELECT COUNT(DISTINCT p.id)::integer 
        FROM panels p
        JOIN scan_logs sl ON (sl.lot_id = p.lot_id OR sl.lot_id = $3) AND sl.timestamp IS NOT NULL AND (
          (sl.row_idx IS NOT NULL AND (sl.row_idx = p.sr_no - 1 OR sl.row_idx = p.sr_no)) OR
          (sl.dummy_sr_no IS NOT NULL AND sl.dummy_sr_no <> '' AND sl.dummy_sr_no = p.dummy_sr_no) OR
          (sl.actual_serial_no IS NOT NULL AND sl.actual_serial_no <> '' AND (sl.actual_serial_no = p.barcode OR sl.actual_serial_no = p.real_sr_no))
        )
        WHERE (p.lot_id = $1 OR p.lot_id = $3)
          AND (UPPER(p.part_code) = $2 OR UPPER(p.part_code) LIKE '%' || $2 || '%')
      `, [cleanLotId, cleanPartCode, rawLotId]);

      const count = res.rows[0].count;
      if (count > 0) return count;

      const scanRes = await pool.query(`
        SELECT COUNT(DISTINCT id)::integer
        FROM scan_logs
        WHERE (lot_id = $1 OR lot_id = $3) AND timestamp IS NOT NULL
          AND UPPER(actual_serial_no) LIKE '%' || $2 || '%'
      `, [cleanLotId, cleanPartCode, rawLotId]);
      return scanRes.rows[0].count;
    } catch (err) {
      return 0;
    }
  }
};

export const getPartCodeStepCap = async (lotId, stepNo, partCode) => {
  const saMatch = String(partCode).match(/SA\d+/i);
  const cleanPartCode = saMatch ? saMatch[0].toUpperCase() : partCode.split(' - ')[0].trim().toUpperCase();
  const cleanLotId = await resolveLotId(lotId);
  const rawLotId = parseInt(lotId, 10);

  if (stepNo === 2) {
    if (isFallback()) {
      return (memoryDb.tables.panels || []).filter(p => (p.lot_id === cleanLotId || p.lot_id === rawLotId) && (p.part_code || '').trim().toUpperCase().includes(cleanPartCode)).length;
    } else {
      try {
        const res = await pool.query('SELECT COUNT(*)::integer FROM panels WHERE (lot_id = $1 OR lot_id = $3) AND UPPER(TRIM(part_code)) LIKE \'%\' || $2 || \'%\'', [cleanLotId, cleanPartCode, rawLotId]);
        return res.rows[0].count;
      } catch (err) {
        return (memoryDb.tables.panels || []).filter(p => (p.lot_id === cleanLotId || p.lot_id === rawLotId) && (p.part_code || '').trim().toUpperCase().includes(cleanPartCode)).length;
      }
    }
  }

  if (stepNo === 3) {
    if (isFallback()) {
      const lot = (memoryDb.tables.lots || []).find(l => l.id === cleanLotId || l.lot_no === rawLotId);
      const scrapYear = lot && lot.scrap_year_threshold !== null ? lot.scrap_year_threshold : 2021;
      const sepYear = lot && lot.separate_year_threshold !== null ? lot.separate_year_threshold : 2022;
      const chkYear = lot && lot.checkbox_year_threshold !== null ? lot.checkbox_year_threshold : 2023;

      const lotScanLogs = (memoryDb.tables.scan_logs || []).filter(sl => (sl.lot_id === cleanLotId || sl.lot_id === rawLotId) && sl.timestamp);
      const scannedRowIndices = new Set(lotScanLogs.map(sl => sl.row_idx).filter(r => r !== null && r !== undefined));
      const scannedDummyNos = new Set(lotScanLogs.map(sl => sl.dummy_sr_no).filter(Boolean));
      const scannedBarcodes = new Set(lotScanLogs.map(sl => sl.actual_serial_no).filter(Boolean));
      const lotCellEdits = (memoryDb.tables.cell_edits || []).filter(e => e.lot_id === cleanLotId || e.lot_id === rawLotId);

      const panels = (memoryDb.tables.panels || []).filter(p => {
        if (p.lot_id !== cleanLotId && p.lot_id !== rawLotId) return false;
        
        const pCode = (p.part_code || '').trim().toUpperCase();
        if (pCode !== cleanPartCode && !pCode.includes(cleanPartCode)) return false;

        const isScanned = scannedRowIndices.has(p.sr_no - 1) || 
                          scannedRowIndices.has(p.sr_no) ||
                          scannedDummyNos.has(p.dummy_sr_no) ||
                          scannedBarcodes.has(p.barcode) ||
                          scannedBarcodes.has(p.real_sr_no);
        if (!isScanned) return false;

        if (p.status === 'Scrap' || p.status === 'Separate' || p.status === 'Non-Repairable' || p.action === 'Scrap' || p.action === 'Separate') {
          return false;
        }

        const mfgYear = p.mfg_year || extractMfgYear(p.barcode, p.mfg_year) || extractMfgYear(p.real_sr_no);
        if (mfgYear) {
          if (mfgYear <= scrapYear) return false;
          if (sepYear !== null && mfgYear === sepYear) return false;

          if (chkYear !== null && mfgYear >= chkYear) {
            const edit = lotCellEdits.find(e => Number(e.row_idx) === (p.sr_no - 1) && String(e.col_idx) === 'repairable');
            let isRepairable = p.repairable;
            if (edit) {
              isRepairable = (edit.value === 'true' || edit.value === true);
            }
            if (isRepairable === false || isRepairable === 'false' || p.status === 'Non-Repairable') {
              return false;
            }
          }
        }

        return true;
      });

      if (panels.length > 0) return panels.length;

      // Fallback: If no panels in memoryDb yet, count valid repairable scanned items directly from scan_logs
      let validScanCount = 0;
      lotScanLogs.forEach(sl => {
        const mfgYear = sl.mfg_year || extractMfgYear(sl.actual_serial_no);
        if (mfgYear) {
          if (mfgYear <= scrapYear) return;
          if (sepYear !== null && mfgYear === sepYear) return;
        }
        if (sl.scrap === 'Yes' || sl.scrap === 'Separate') return;
        validScanCount++;
      });
      return validScanCount;
    } else {
      try {
        const lotRes = await pool.query('SELECT scrap_year_threshold, separate_year_threshold, checkbox_year_threshold FROM lots WHERE id = $1 OR lot_no = $2', [cleanLotId, rawLotId]);
        const lot = lotRes.rows[0];
        const scrapYear = lot && lot.scrap_year_threshold !== null ? lot.scrap_year_threshold : 2021;
        const sepYear = lot && lot.separate_year_threshold !== null ? lot.separate_year_threshold : 2022;
        const chkYear = lot && lot.checkbox_year_threshold !== null ? lot.checkbox_year_threshold : 2023;

        const res = await pool.query(`
          SELECT COUNT(DISTINCT p.id)::integer 
          FROM panels p
          JOIN scan_logs sl ON (sl.lot_id = p.lot_id OR sl.lot_id = $4) AND sl.timestamp IS NOT NULL AND (
            (sl.row_idx IS NOT NULL AND (sl.row_idx = p.sr_no - 1 OR sl.row_idx = p.sr_no)) OR
            (sl.dummy_sr_no IS NOT NULL AND sl.dummy_sr_no <> '' AND sl.dummy_sr_no = p.dummy_sr_no) OR
            (sl.actual_serial_no IS NOT NULL AND sl.actual_serial_no <> '' AND (sl.actual_serial_no = p.barcode OR sl.actual_serial_no = p.real_sr_no))
          )
          LEFT JOIN cell_edits ce ON (ce.lot_id = p.lot_id OR ce.lot_id = $4) AND (ce.row_idx = p.sr_no - 1 OR ce.row_idx = p.sr_no) AND ce.col_idx = 'repairable'
          WHERE (p.lot_id = $1 OR p.lot_id = $4)
            AND (UPPER(p.part_code) = $2 OR UPPER(p.part_code) LIKE '%' || $2 || '%')
            AND (p.status IS NULL OR (LOWER(p.status) NOT IN ('scrap', 'separate', 'non-repairable')))
            AND (p.mfg_year IS NULL OR (p.mfg_year > $3 AND p.mfg_year <> $5))
            AND (
              p.mfg_year IS NULL OR p.mfg_year < $6 OR 
              (ce.value = 'true' OR (ce.value IS NULL AND (p.repairable IS TRUE OR p.repairable IS NULL)))
            )
        `, [cleanLotId, cleanPartCode, scrapYear, rawLotId, sepYear, chkYear]);

        const count = res.rows[0].count;
        if (count > 0) return count;

        const scanRes = await pool.query(`
          SELECT COUNT(DISTINCT id)::integer
          FROM scan_logs
          WHERE (lot_id = $1 OR lot_id = $4) AND timestamp IS NOT NULL
            AND (scrap IS NULL OR scrap <> 'Yes')
            AND (mfg_year IS NULL OR (mfg_year > $2 AND mfg_year <> $3))
        `, [cleanLotId, scrapYear, sepYear, rawLotId]);
        return scanRes.rows[0].count;
      } catch (dbErr) {
        const lot = (memoryDb.tables.lots || []).find(l => l.id === cleanLotId || l.lot_no === rawLotId);
        const scrapYear = lot && lot.scrap_year_threshold !== null ? lot.scrap_year_threshold : 2021;
        const sepYear = lot && lot.separate_year_threshold !== null ? lot.separate_year_threshold : 2022;
        const chkYear = lot && lot.checkbox_year_threshold !== null ? lot.checkbox_year_threshold : 2023;

        const lotScanLogs = (memoryDb.tables.scan_logs || []).filter(sl => (sl.lot_id === cleanLotId || sl.lot_id === rawLotId) && sl.timestamp);
        const scannedRowIndices = new Set(lotScanLogs.map(sl => sl.row_idx).filter(r => r !== null && r !== undefined));
        const scannedDummyNos = new Set(lotScanLogs.map(sl => sl.dummy_sr_no).filter(Boolean));
        const scannedBarcodes = new Set(lotScanLogs.map(sl => sl.actual_serial_no).filter(Boolean));
        const lotCellEdits = (memoryDb.tables.cell_edits || []).filter(e => e.lot_id === cleanLotId || e.lot_id === rawLotId);

        const panels = (memoryDb.tables.panels || []).filter(p => {
          if (p.lot_id !== cleanLotId && p.lot_id !== rawLotId) return false;
          const pCode = (p.part_code || '').trim().toUpperCase();
          if (pCode !== cleanPartCode && !pCode.includes(cleanPartCode)) return false;
          const isScanned = scannedRowIndices.has(p.sr_no - 1) || 
                            scannedRowIndices.has(p.sr_no) ||
                            scannedDummyNos.has(p.dummy_sr_no) ||
                            scannedBarcodes.has(p.barcode) ||
                            scannedBarcodes.has(p.real_sr_no);
          if (!isScanned) return false;
          if (p.status === 'Scrap' || p.status === 'Separate' || p.status === 'Non-Repairable' || p.action === 'Scrap' || p.action === 'Separate') return false;
          const mfgYear = p.mfg_year || extractMfgYear(p.barcode) || extractMfgYear(p.real_sr_no);
          if (mfgYear) {
            if (mfgYear <= scrapYear) return false;
            if (sepYear !== null && mfgYear === sepYear) return false;
            if (chkYear !== null && mfgYear >= chkYear) {
              const edit = lotCellEdits.find(e => Number(e.row_idx) === (p.sr_no - 1) && String(e.col_idx) === 'repairable');
              let isRepairable = p.repairable;
              if (edit) {
                isRepairable = (edit.value === 'true' || edit.value === true);
              }
              if (isRepairable === false || isRepairable === 'false' || p.status === 'Non-Repairable') {
                return false;
              }
            }
          }
          return true;
        });
        if (panels.length > 0) return panels.length;
        let validScanCount = 0;
        lotScanLogs.forEach(sl => {
          const mfgYear = sl.mfg_year || extractMfgYear(sl.actual_serial_no);
          if (mfgYear) {
            if (mfgYear <= scrapYear) return;
            if (sepYear !== null && mfgYear === sepYear) return;
          }
          if (sl.scrap === 'Yes' || sl.scrap === 'Separate') return;
          validScanCount++;
        });
        return validScanCount;
      }
    }
  }
};
  if (stepNo === 4) {
    return getStepOkSum(cleanLotId, 3, cleanPartCode, 'code_ok');
  }

  if (stepNo === 5) {
    return getStepOkSum(cleanLotId, 4, cleanPartCode, 'qty_passed');
  }

  if (stepNo === 6) {
    return getStepOkSum(cleanLotId, 5, cleanPartCode, 'debug_ok');
  }

  if (stepNo === 7) {
    return getStep6AuditLimit(cleanLotId, cleanPartCode);
  }

  if (stepNo === 8) {
    return getStepOkSum(cleanLotId, 7, cleanPartCode, 'qty_cleaned');
  }

  if (stepNo === 9) {
    return getStepOkSum(cleanLotId, 8, cleanPartCode, 'qty_passed');
  }

  if (stepNo === 10) {
    return getStepOkSum(cleanLotId, 9, cleanPartCode, 'qty_coated');
  }

  if (stepNo === 11) {
    return getStep10AuditLimit(cleanLotId, cleanPartCode);
  }

  if (stepNo === 12) {
    return getStepOkSum(cleanLotId, 11, cleanPartCode, 'bubble_packed');
  }

  return 999999;
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
    const partCode = pcb_type.split(' - ')[0].trim();
    if (stepNo >= 2 && stepNo <= 12) {
      let fields = [];
      if (stepNo === 2) fields = ['repairable_qty', 'scrap_qty'];
      else if (stepNo === 3) fields = ['code_ok', 'code_not_ok'];
      else if (stepNo === 4) fields = ['qty_passed', 'qty_failed'];
      else if (stepNo === 5) fields = ['debug_ok', 'critical_qty', 'scrap_qty'];
      else if (stepNo === 6) fields = ['entry_count'];
      else if (stepNo === 7) fields = ['qty_cleaned', 'qc_reject'];
      else if (stepNo === 8) fields = ['qty_passed', 'qty_failed'];
      else if (stepNo === 9) fields = ['qty_coated'];
      else if (stepNo === 10) fields = ['qty_passed', 'qty_failed'];
      else if (stepNo === 11) fields = ['bubble_packed', 'box_packed'];
      else if (stepNo === 12) fields = ['entry_count'];

      const stepCap = await getPartCodeStepCap(lotId, stepNo, partCode);
      const existing = await getStepSumForPcbType(lotId, stepNo, pcb_type, fields);
      
      let currentInputSum = 0;
      fields.forEach(f => {
        currentInputSum += parseInt(step_data[f] || 0);
      });
      
      let existingSum = 0;
      fields.forEach(f => {
        existingSum += parseInt(existing[f] || 0);
      });

      const total = existingSum + currentInputSum;
      if (total > stepCap) {
        return res.status(400).json({ error: `🚫 Checksum Error: Total quantity for ${partCode} (${total}) would exceed the allowed cap (${stepCap}) for Step ${stepNo} of Lot ${lot.lot_no}.` });
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
        memoryDb.tables.lot_part_code_baselines
          .filter(b => b.lot_id === pLog.lot_id)
          .forEach(b => { b.locked = true; });
      } else {
        await txClient.query('UPDATE lots SET received_qty = received_qty + $1, qty_sent = qty_sent + $2 WHERE id = $3', [recCount, expectedCount, pLog.lot_id]);
        await txClient.query('UPDATE lot_part_code_baselines SET locked = true WHERE lot_id = $1', [pLog.lot_id]);
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
    const rawLotId = parseInt(req.params.lot_id, 10);
    const lotId = await resolveLotId(rawLotId);
    const lot = await Lot.findById(lotId) || await Lot.findById(rawLotId);
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
    const step6PartCodeCounts = {};
    if (isFallback()) {
      const panels = (memoryDb.tables.panels || []).filter(p => p.lot_id === lotId || p.lot_id === rawLotId);
      panels.forEach(p => {
        const pc = p.part_code || '';
        partCodeCounts[pc] = (partCodeCounts[pc] || 0) + 1;
      });

      const step6Scans = (memoryDb.tables.checkpoint_scans || []).filter(
        cs => (cs.lot_id === lotId || cs.lot_id === rawLotId) && cs.checkpoint_step === 6 && !cs.is_unknown
      );
      step6Scans.forEach(cs => {
        const p = (memoryDb.tables.panels || []).find(p => p.id === cs.panel_id);
        if (p) {
          const pc = p.part_code || '';
          step6PartCodeCounts[pc] = (step6PartCodeCounts[pc] || 0) + 1;
        }
      });
    } else {
      const pRes = await pool.query('SELECT part_code, COUNT(*)::integer FROM panels WHERE lot_id = $1 OR lot_id = $2 GROUP BY part_code', [lotId, rawLotId]);
      pRes.rows.forEach(row => {
        partCodeCounts[row.part_code || ''] = row.count;
      });

      const s6Res = await pool.query(`
        SELECT p.part_code, COUNT(*)::integer 
        FROM checkpoint_scans cs
        JOIN panels p ON cs.panel_id = p.id
        WHERE (cs.lot_id = $1 OR cs.lot_id = $2) AND cs.checkpoint_step = 6 AND cs.is_unknown = FALSE
        GROUP BY p.part_code
      `, [lotId, rawLotId]);
      s6Res.rows.forEach(row => {
        step6PartCodeCounts[row.part_code || ''] = row.count;
      });
    }
    stats.part_code_counts = partCodeCounts;
    stats.step6_part_code_counts = step6PartCodeCounts;

    const pcbTypeStats = {};
    if (isFallback()) {
      const allLogs = [
        ...memoryDb.tables.production_logs.filter(l => l.lot_id === lotId || l.lot_id === rawLotId),
        ...memoryDb.tables.pending_production_logs.filter(l => (l.lot_id === lotId || l.lot_id === rawLotId) && !['Approved', 'Rejected'].includes(l.approval_status))
      ];
      allLogs.forEach(log => {
        const key = `${log.step_no}_${log.pcb_type}`;
        if (!pcbTypeStats[key]) {
          pcbTypeStats[key] = {
            step_no: log.step_no,
            pcb_type: log.pcb_type,
            repairable_qty: 0, scrap_qty: 0,
            code_ok: 0, code_not_ok: 0,
            qty_passed: 0, qty_failed: 0,
            debug_ok: 0, critical_qty: 0,
            entry_count: 0, qty_cleaned: 0,
            qc_reject: 0, qty_coated: 0,
            bubble_packed: 0, box_packed: 0
          };
        }
        const fields = [
          'repairable_qty', 'scrap_qty', 'code_ok', 'code_not_ok',
          'qty_passed', 'qty_failed', 'debug_ok', 'critical_qty',
          'entry_count', 'qty_cleaned', 'qc_reject', 'qty_coated',
          'bubble_packed', 'box_packed'
        ];
        fields.forEach(f => {
          pcbTypeStats[key][f] += parseInt(log.step_data?.[f] || 0);
        });
      });
    } else {
      const pcbRes = await pool.query(`
        SELECT step_no, pcb_type,
               COALESCE(SUM((step_data->>'repairable_qty')::integer), 0) AS repairable_qty,
               COALESCE(SUM((step_data->>'scrap_qty')::integer), 0) AS scrap_qty,
               COALESCE(SUM((step_data->>'code_ok')::integer), 0) AS code_ok,
               COALESCE(SUM((step_data->>'code_not_ok')::integer), 0) AS code_not_ok,
               COALESCE(SUM((step_data->>'qty_passed')::integer), 0) AS qty_passed,
               COALESCE(SUM((step_data->>'qty_failed')::integer), 0) AS qty_failed,
               COALESCE(SUM((step_data->>'debug_ok')::integer), 0) AS debug_ok,
               COALESCE(SUM((step_data->>'critical_qty')::integer), 0) AS critical_qty,
               COALESCE(SUM((step_data->>'entry_count')::integer), 0) AS entry_count,
               COALESCE(SUM((step_data->>'qty_cleaned')::integer), 0) AS qty_cleaned,
               COALESCE(SUM((step_data->>'qc_reject')::integer), 0) AS qc_reject,
               COALESCE(SUM((step_data->>'qty_coated')::integer), 0) AS qty_coated,
               COALESCE(SUM((step_data->>'bubble_packed')::integer), 0) AS bubble_packed,
               COALESCE(SUM((step_data->>'box_packed')::integer), 0) AS box_packed
        FROM (
          SELECT lot_id, step_no, pcb_type, step_data FROM production_logs WHERE lot_id = $1 OR lot_id = $2
          UNION ALL
          SELECT lot_id, step_no, pcb_type, step_data FROM pending_production_logs WHERE (lot_id = $1 OR lot_id = $2) AND approval_status NOT IN ('Approved', 'Rejected')
        ) combined
        GROUP BY step_no, pcb_type
      `, [lotId, rawLotId]);
      pcbRes.rows.forEach(row => {
        const key = `${row.step_no}_${row.pcb_type}`;
        pcbTypeStats[key] = {
          step_no: row.step_no,
          pcb_type: row.pcb_type,
          repairable_qty: parseInt(row.repairable_qty || 0),
          scrap_qty: parseInt(row.scrap_qty || 0),
          code_ok: parseInt(row.code_ok || 0),
          code_not_ok: parseInt(row.code_not_ok || 0),
          qty_passed: parseInt(row.qty_passed || 0),
          qty_failed: parseInt(row.qty_failed || 0),
          debug_ok: parseInt(row.debug_ok || 0),
          critical_qty: parseInt(row.critical_qty || 0),
          entry_count: parseInt(row.entry_count || 0),
          qty_cleaned: parseInt(row.qty_cleaned || 0),
          qc_reject: parseInt(row.qc_reject || 0),
          qty_coated: parseInt(row.qty_coated || 0),
          bubble_packed: parseInt(row.bubble_packed || 0),
          box_packed: parseInt(row.box_packed || 0)
        };
      });
    }
    stats.pcb_type_stats = pcbTypeStats;

    let baselines = [];
    if (isFallback()) {
      baselines = memoryDb.tables.lot_part_code_baselines.filter(b => b.lot_id === lotId || b.lot_id === rawLotId);
      if (baselines.length === 0) {
        const { initializeLotBaselines } = await import('./panelController.js');
        await initializeLotBaselines(lotId);
        baselines = memoryDb.tables.lot_part_code_baselines.filter(b => b.lot_id === lotId || b.lot_id === rawLotId);
      }
    } else {
      const baseRes = await pool.query('SELECT part_code, verified_qty, locked FROM lot_part_code_baselines WHERE lot_id = $1 OR lot_id = $2', [lotId, rawLotId]);
      baselines = baseRes.rows;
      if (baselines.length === 0) {
        const { initializeLotBaselines } = await import('./panelController.js');
        await initializeLotBaselines(lotId);
        const refetched = await pool.query('SELECT part_code, verified_qty, locked FROM lot_part_code_baselines WHERE lot_id = $1 OR lot_id = $2', [lotId, rawLotId]);
        baselines = refetched.rows;
      }
    }
    // Dynamically compute real-time scanned verified count per part code for baselines
    for (const base of baselines) {
      if (!base.locked) {
        base.verified_qty = await getScannedVerifiedQtyForPartCode(lotId, base.part_code);
      }
    }
    stats.part_code_baselines = baselines;

    const partCodeCaps = {};
    const partCodesList = new Set([
      ...Object.keys(partCodeCounts),
      ...(baselines || []).map(b => b.part_code),
      'SA0010', 'SA0019', 'SA0021', 'SA0022', 'SA0011', 'SA0061', 'SA0060', 'SA0039', 'SA0038', 'SA0087'
    ]);
    for (const pc of partCodesList) {
      if (pc) {
        partCodeCaps[pc] = {};
        for (let s = 2; s <= 12; s++) {
          partCodeCaps[pc][s] = await getPartCodeStepCap(lotId, s, pc);
        }
      }
    }
    stats.part_code_caps = partCodeCaps;

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
