import pool, { isFallback, query } from '../config/db.js';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { buildExportWorkbook } from '../utils/export.js';
import { Panel } from '../models/Panel.js';
import { Lot } from '../models/Lot.js';
import { PendingLog } from '../models/PendingLog.js';
import { RepairStep } from '../models/RepairStep.js';
import { Audit } from '../models/Audit.js';
import * as memoryDb from '../services/memoryDb.js';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

const extractMfgYear = (serial) => {
  if (!serial) return null;
  const s = String(serial).trim();
  const len = s.length;

  // Guard: if it starts with 'AT' and has length <= 8, it is a dummy serial number
  if (s.startsWith('AT') && len <= 8) {
    return null;
  }

  // Try regex matching: any letter followed by exactly 2 digits (e.g. B22, E26, D21)
  const matches = s.match(/[a-zA-Z](\d{2})/g);
  if (matches) {
    for (const m of matches) {
      const yr = parseInt(m.substring(1), 10);
      if (yr >= 10 && yr <= 50) {
        return 2000 + yr;
      }
    }
  }

  // 1. Fallback: Atomberg format: extract characters at index 2 and 3 (0-based)
  if (len >= 4) {
    const yrPart = s.substring(2, 4);
    const yr = parseInt(yrPart, 10);
    if (!isNaN(yr) && yr >= 10 && yr <= 50) {
      return 2000 + yr;
    }
  }

  // 2. Legacy fallback patterns
  if (len === 16 || len === 17) {
    const yr = parseInt(s.substring(3, 5), 10);
    if (!isNaN(yr)) return yr + 2000;
  }
  if (s.startsWith('AGV')) {
    const cIndex = s.indexOf('C');
    if (cIndex !== -1 && cIndex + 2 < len) {
      const yr = parseInt(s.substring(cIndex + 1, cIndex + 3), 10);
      if (!isNaN(yr)) return yr + 2000;
    }
  }
  if (s.startsWith('EA') && len === 22) {
    const yr = parseInt(s.substring(15, 17), 10);
    if (!isNaN(yr)) return yr + 2000;
  }
  return null;
};

export const getPanels = async (req, res) => {
  const { step_no, lot_id } = req.query;

  try {
    const filters = {};
    if (step_no) {
      filters.step_no = parseInt(step_no);
      filters.notStatus = 'Scrap';
    }
    if (lot_id) {
      filters.lot_id = parseInt(lot_id);
    }

    // RLS Context scoped via req.user passed to model
    const list = await Panel.getAll(filters, req.user);
    res.json(list);
  } catch (err) {
    console.error('Fetch panels error:', err);
    res.status(500).json({ error: "Failed to fetch panels." });
  }
};

export const searchPanel = async (req, res) => {
  const { barcode, sr_no, lot_no } = req.query;

  try {
    let panel = null;

    if (isFallback()) {
      if (barcode) {
        panel = memoryDb.findPanelByBarcode(barcode);
      } else if (sr_no && lot_no) {
        const lot = memoryDb.findLotByLotNo(Number(lot_no));
        if (lot) {
          panel = memoryDb.findPanelByLotAndSrNo(lot.id, Number(sr_no));
        }
      }
      if (panel) {
        const lot = memoryDb.findLotById(panel.lot_id);
        const eng = memoryDb.findUserByIdAndRefreshToken(panel.assigned_engineer_id, panel.refresh_token) || memoryDb.tables.users.find(u => u.id === panel.assigned_engineer_id);
        panel = {
          ...panel,
          lot_no: lot ? lot.lot_no : null,
          batch_no: lot ? lot.batch_no : null,
          pixel_pitch: lot ? lot.pixel_pitch : null,
          engineer_name: eng ? eng.name : 'Unassigned'
        };
      }
    } else {
      let panelRes;
      if (barcode) {
        panelRes = await query(`
          SELECT p.*, l.lot_no, l.batch_no, l.pixel_pitch, l.client_id, e.name as engineer_name 
          FROM panels p
          JOIN lots l ON p.lot_id = l.id
          LEFT JOIN users e ON p.assigned_engineer_id = e.id
          WHERE p.barcode = $1
        `, [barcode.trim()]);
      } else if (sr_no && lot_no) {
        panelRes = await query(`
          SELECT p.*, l.lot_no, l.batch_no, l.pixel_pitch, l.client_id, e.name as engineer_name
          FROM panels p
          JOIN lots l ON p.lot_id = l.id
          LEFT JOIN users e ON p.assigned_engineer_id = e.id
          WHERE p.sr_no = $1 AND l.lot_no = $2
        `, [sr_no, lot_no]);
      }
      if (panelRes && panelRes.rowCount > 0) {
        panel = panelRes.rows[0];
      }
    }

    if (!panel) {
      return res.status(404).json({ error: "Panel not found." });
    }

    // 1. Fetch panel log activities
    let activities = [];
    if (isFallback()) {
      activities = memoryDb.getPanelLogs(panel.id);
      // Sort activities step_no ASC, timestamp ASC matching standard SQL ORDER BY
      activities.sort((a, b) => {
        const stepA = memoryDb.tables.repair_steps.find(s => s.id === a.step_id)?.step_no || 0;
        const stepB = memoryDb.tables.repair_steps.find(s => s.id === b.step_id)?.step_no || 0;
        return stepA - stepB || new Date(a.timestamp) - new Date(b.timestamp);
      });
    } else {
      const actRes = await query(`
        SELECT a.*, s.name as step_name, e.name as engineer_name 
        FROM panel_logs a
        JOIN repair_steps s ON a.step_id = s.id
        LEFT JOIN users e ON a.engineer_id = e.id
        WHERE a.panel_id = $1
        ORDER BY s.step_no ASC, a.timestamp ASC
      `, [panel.id], req.user);
      activities = actRes.rows;
    }

    // 2. Fetch pending log details
    let isLocked = false;
    let pendingInfo = null;
    let reworkInfo = null;

    let clientId = null;
    if (isFallback()) {
      const lot = memoryDb.findLotById(panel.lot_id);
      if (lot) clientId = lot.client_id;
    } else {
      clientId = panel.client_id;
    }
    const steps = await RepairStep.getAllForClient(clientId);

    if (isFallback()) {
      const pLog = memoryDb.tables.pending_logs
        .filter(pl => pl.panel_id === panel.id && ['Pending Team Lead', 'Rejected'].includes(pl.approval_status))
        .sort((a, b) => b.id - a.id)[0];
        
      if (pLog) {
        const eng = memoryDb.tables.users.find(u => u.id === pLog.engineer_id);
        const stepObj = steps.find(s => s.step_no === pLog.step_no);
        const step_name = stepObj ? stepObj.name : `Step ${pLog.step_no}`;

        if (pLog.approval_status === 'Rejected') {
          reworkInfo = {
            rejection_reason: pLog.rejection_reason,
            step_no: pLog.step_no,
            step_name
          };
        } else {
          isLocked = true;
          pendingInfo = {
            id: pLog.id,
            step_no: pLog.step_no,
            step_name,
            approval_status: pLog.approval_status,
            engineer_name: eng ? eng.name : 'Unknown'
          };
        }
      }
    } else {
      const pendingRes = await query(`
        SELECT pl.*, u.name as engineer_name 
        FROM pending_logs pl
        JOIN users u ON pl.engineer_id = u.id
        WHERE pl.panel_id = $1 AND pl.approval_status IN ('Pending Team Lead', 'Rejected')
        ORDER BY pl.id DESC LIMIT 1
      `, [panel.id], req.user);

      if (pendingRes.rowCount > 0) {
        const pLog = pendingRes.rows[0];
        const stepObj = steps.find(s => s.step_no === pLog.step_no);
        const step_name = stepObj ? stepObj.name : `Step ${pLog.step_no}`;

        if (pLog.approval_status === 'Rejected') {
          reworkInfo = {
            rejection_reason: pLog.rejection_reason,
            step_no: pLog.step_no,
            step_name
          };
        } else {
          isLocked = true;
          pendingInfo = {
            id: pLog.id,
            step_no: pLog.step_no,
            step_name,
            approval_status: pLog.approval_status,
            engineer_name: pLog.engineer_name
          };
        }
      }
    }

    res.json({
      panel,
      activities,
      is_locked: isLocked,
      pending_info: pendingInfo,
      rework_info: reworkInfo
    });

  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: "Failed to search panel." });
  }
};

export const assignPanel = async (req, res) => {
  const { lot_no, sr_no, side, engineer_id } = req.body;

  if (!lot_no || !sr_no || !side || !engineer_id) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const useTx = !isFallback();
  const txClient = useTx ? await pool.connect() : null;

  try {
    if (useTx) await txClient.query('BEGIN');

    // Fetch lot
    const lot = await Lot.findByLotNo(lot_no, txClient);
    if (!lot) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(404).json({ error: `Lot number ${lot_no} does not exist.` });
    }

    // Barcode generation formula
    const pitchStr = lot.pixel_pitch.replace('.', '');
    const sideChar = side[0];
    const srStr = String(sr_no).padStart(4, '0');
    const barcode = `ESRP2${pitchStr}${lot.lot_no}E26${lot.batch_no}${sideChar}${srStr}`;

    // Validate duplicate barcode
    const checkBarcode = await Panel.findByBarcode(barcode);
    if (checkBarcode) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(400).json({ error: `Barcode ${barcode} already exists.` });
    }

    // Validate duplicate serial
    const checkSerial = await Panel.findByLotAndSrNo(lot.id, sr_no);
    if (checkSerial) {
      if (useTx) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(400).json({ error: `Serial number ${sr_no} has already been registered in Lot ${lot_no}.` });
    }

    // Insert new panel
    const newPanel = await Panel.create({
      lot_id: lot.id,
      sr_no,
      side,
      barcode,
      status: 'Repairable',
      current_step: 1,
      assigned_engineer_id: engineer_id
    }, txClient);

    // Log Step 1 activity
    await Panel.createLog({
      panel_id: newPanel.id,
      step_no: 1,
      engineer_id,
      status: 'OK',
      remark: 'Initial registration and panel assignment'
    }, txClient);

    if (useTx) {
      await txClient.query('COMMIT');
      txClient.release();
    }

    res.status(201).json({ panel: newPanel, barcode });

  } catch (err) {
    if (useTx && txClient) {
      await txClient.query('ROLLBACK');
      txClient.release();
    }
    console.error('Assign error:', err);
    res.status(500).json({ error: "Failed to register panel." });
  }
};

export const progressRepair = async (req, res) => {
  const { panel_id, engineer_id, status, remark } = req.body;

  if (!panel_id || !engineer_id || !status) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const panel = await Panel.findById(panel_id);
    if (!panel) {
      return res.status(404).json({ error: "Panel not found." });
    }

    if (panel.status === 'Scrap') {
      return res.status(400).json({ error: "Cannot process a scrapped panel." });
    }
    if (panel.current_step === 12) {
      return res.status(400).json({ error: "Panel is already fully dispatched." });
    }

    // Check if there is already an active pending approval entry
    const activePending = await PendingLog.findPendingByPanel(panel_id);
    if (activePending) {
      return res.status(400).json({ error: "This panel already has a pending clearance approval." });
    }

    // RBAC check: Employees can only progress panels assigned to them
    if (req.user.role === 'Employee' && panel.assigned_engineer_id !== req.user.id) {
      return res.status(403).json({ error: "Access denied. You can only update panels assigned to you." });
    }

    const currentStepNo = panel.current_step;

    // 2-Tier Quality Clearance Workflow: Employee entries go to pending_logs (temp db)
    if (req.user.role === 'Employee') {
      await PendingLog.create({
        panel_id,
        step_no: currentStepNo,
        engineer_id: req.user.id,
        status,
        remark: remark || ''
      });

      return res.json({
        success: true,
        pending: true,
        message: "Work logged successfully. Awaiting Team Lead clearance approval."
      });
    }

    // Team Leads bypass approvals when logging directly
    let nextStepNo = currentStepNo;
    let nextStatus = panel.status;

    const useTx = !isFallback();
    const txClient = useTx ? await pool.connect() : null;

    try {
      if (useTx) await txClient.query('BEGIN');

      if (status === 'Scrap') {
        nextStatus = 'Scrap';
        const scrapReason = remark || 'Scrapped during repair';

        // Update panel status to Scrap
        if (useTx) {
          await txClient.query(`
            UPDATE panels 
            SET status = $1, scrap_reason = $2, assigned_engineer_id = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
          `, [nextStatus, scrapReason, engineer_id, panel_id]);
        } else {
          const p = memoryDb.tables.panels.find(p => p.id === panel_id);
          if (p) {
            p.status = nextStatus;
            p.scrap_reason = scrapReason;
            p.assigned_engineer_id = engineer_id;
            p.updated_at = new Date().toISOString();
          }
        }

        // Log Step Scrap
        await Panel.createLog({
          panel_id,
          step_no: currentStepNo,
          engineer_id,
          status: 'Scrap',
          remark: scrapReason
        }, txClient);

      } else if (status === 'Faulty') {
        // Re-assign to engineer for rework
        if (useTx) {
          await txClient.query(`
            UPDATE panels 
            SET assigned_engineer_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [engineer_id, panel_id]);
        } else {
          const p = memoryDb.tables.panels.find(p => p.id === panel_id);
          if (p) {
            p.assigned_engineer_id = engineer_id;
            p.updated_at = new Date().toISOString();
          }
        }

        // Log Step Faulty
        await Panel.createLog({
          panel_id,
          step_no: currentStepNo,
          engineer_id,
          status: 'Faulty',
          remark: remark || 'Failed test, sent for rework'
        }, txClient);

      } else if (status === 'OK') {
        nextStepNo = currentStepNo + 1;

        // Progress panel current_step
        if (useTx) {
          await txClient.query(`
            UPDATE panels 
            SET current_step = $1, assigned_engineer_id = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
          `, [nextStepNo, engineer_id, panel_id]);
        } else {
          const p = memoryDb.tables.panels.find(p => p.id === panel_id);
          if (p) {
            p.current_step = nextStepNo;
            p.assigned_engineer_id = engineer_id;
            p.updated_at = new Date().toISOString();
          }
        }

        // Resolve client_id and step name dynamically
        let clientId = null;
        if (isFallback()) {
          const p = memoryDb.findPanelById(panel_id);
          const lot = p ? memoryDb.findLotById(p.lot_id) : null;
          if (lot) clientId = lot.client_id;
        } else {
          const lotRes = await txClient.query(
            'SELECT l.client_id FROM panels p JOIN lots l ON p.lot_id = l.id WHERE p.id = $1',
            [panel_id]
          );
          if (lotRes.rows[0]) clientId = lotRes.rows[0].client_id;
        }

        const steps = await RepairStep.getAllForClient(clientId);
        const stepObj = steps.find(s => s.step_no === currentStepNo);
        const stepName = stepObj ? stepObj.name : `Step ${currentStepNo}`;

        // Log Step OK
        await Panel.createLog({
          panel_id,
          step_no: currentStepNo,
          engineer_id,
          status: 'OK',
          remark: remark || `Successfully completed step ${stepName}`
        }, txClient);
      }

      if (useTx) {
        await txClient.query('COMMIT');
        txClient.release();
      }

      res.json({
        success: true,
        current_step: nextStepNo,
        status: nextStatus
      });

    } catch (err) {
      if (useTx && txClient) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      throw err;
    }

  } catch (err) {
    console.error('Repair transition error:', err);
    res.status(500).json({ error: "Failed to progress panel in repair." });
  }
};

export const importPanels = async (req, res) => {
  const { lot_id, panels } = req.body;
  if (!lot_id || !Array.isArray(panels) || panels.length === 0) {
    return res.status(400).json({ error: "lot_id and non-empty panels list are required." });
  }

  const useTx = !isFallback();
  const txClient = useTx ? await pool.connect() : null;

  try {
    if (useTx) await txClient.query('BEGIN');

    // Verify lot exists
    const lot = await Lot.findById(lot_id, txClient);
    if (!lot) {
      if (useTx && txClient) {
        await txClient.query('ROLLBACK');
        txClient.release();
      }
      return res.status(404).json({ error: `Selected lot does not exist.` });
    }

    const importedPanels = [];

    // Get current maximum serial number count inside this lot to auto-increment sr_no
    let currentMaxSr = 0;
    if (isFallback()) {
      const lotPanels = memoryDb.tables.panels.filter(p => p.lot_id === lot.id);
      currentMaxSr = lotPanels.reduce((max, p) => Math.max(max, p.sr_no || 0), 0);
    } else {
      const srRes = await txClient.query('SELECT COALESCE(MAX(sr_no), 0) as max_sr FROM panels WHERE lot_id = $1', [lot.id]);
      currentMaxSr = parseInt(srRes.rows[0].max_sr || 0);
    }

    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      const dummy = p.dummy_sr_no ? String(p.dummy_sr_no).trim() : null;
      const real = p.real_sr_no ? String(p.real_sr_no).trim() : null;
      const box = p.box_no ? String(p.box_no).trim() : null;

      if (!dummy && !real) {
        throw new Error(`Row ${i + 1} does not contain a dummy or real serial number.`);
      }

      // Check year validation
      const mfgYear = extractMfgYear(real);
      let status = 'Repairable';
      let scrapReason = null;
      if (mfgYear && mfgYear <= 2022) {
        status = 'Scrap';
        scrapReason = `Manufacturing Year (${mfgYear}) <= 2022`;
      }

      const srNo = currentMaxSr + i + 1;
      
      // Auto-generate a valid unique barcode
      const pitchStr = lot.pixel_pitch.replace('.', '');
      // Ensure barcode fits standard
      const side = p.side || 'Left';
      const sideChar = side[0];
      const srStr = String(srNo).padStart(4, '0');
      // If real_sr_no is present, we can use it as the unique barcode, or fallback to auto-generated barcode
      const barcode = real || `ESRP2${pitchStr}${lot.lot_no}E26${lot.batch_no}${sideChar}${srStr}`;

      const excelData = p.excel_data ? JSON.stringify(p.excel_data) : null;
      const partCode = p.excel_data ? (p.excel_data.part_code || p.excel_data.PartCode || p.excel_data.Col_3 || '') : '';
      const model = p.excel_data ? (p.excel_data.model || p.excel_data.Model || p.excel_data.Col_5 || '') : '';

      let newPanel;
      if (isFallback()) {
        newPanel = {
          id: memoryDb.tables.panels.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1,
          lot_id: lot.id,
          sr_no: srNo,
          side,
          barcode,
          status,
          scrap_reason: scrapReason,
          current_step: 1,
          assigned_engineer_id: null,
          dummy_sr_no: dummy,
          real_sr_no: real,
          mfg_year: mfgYear,
          box_no: box,
          part_code: partCode,
          model: model,
          excel_data: p.excel_data || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        memoryDb.tables.panels.push(newPanel);

        // Log panel activity
        memoryDb.tables.panel_logs.push({
          id: memoryDb.tables.panel_logs.reduce((max, l) => Math.max(max, l.id || 0), 0) + 1,
          panel_id: newPanel.id,
          step_id: 1,
          engineer_id: null,
          status: status === 'Scrap' ? 'Scrap' : 'OK',
          remark: scrapReason || 'Inwarded via Excel Import'
        });
      } else {
        // Insert panel
        const insRes = await txClient.query(`
          INSERT INTO panels (lot_id, sr_no, side, barcode, status, scrap_reason, current_step, dummy_sr_no, real_sr_no, mfg_year, box_no, part_code, model, excel_data)
          VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *
        `, [lot.id, srNo, side, barcode, status, scrapReason, dummy, real, mfgYear, box, partCode, model, excelData]);
        newPanel = insRes.rows[0];

        // Fetch step_id for step 1 of this client
        const stepRes = await txClient.query(
          'SELECT id FROM repair_steps WHERE (client_id = $1 OR client_id IS NULL) AND step_no = 1 ORDER BY client_id DESC LIMIT 1',
          [lot.client_id]
        );
        const stepId = stepRes.rows[0]?.id;

        // Log activity
        await txClient.query(`
          INSERT INTO panel_logs (panel_id, step_id, engineer_id, status, remark)
          VALUES ($1, $2, null, $3, $4)
        `, [newPanel.id, stepId, status === 'Scrap' ? 'Scrap' : 'OK', scrapReason || 'Inwarded via Excel Import']);
      }

      importedPanels.push(newPanel);
    }

    if (useTx) {
      await txClient.query('COMMIT');
      txClient.release();
    }

    res.status(201).json({
      success: true,
      count: importedPanels.length,
      panels: importedPanels,
      message: `Successfully imported ${importedPanels.length} panels into Lot ${lot.lot_no}.`
    });

  } catch (err) {
    if (useTx && txClient) {
      await txClient.query('ROLLBACK');
      txClient.release();
    }
    console.error('Excel Import panels error:', err);
    res.status(500).json({ error: err.message || "Failed to import panels." });
  }
};

export const patchPanel = async (req, res) => {
  const { id } = req.params;
  const fields = { ...req.body };

  try {
    const panel = await Panel.findById(id);
    if (!panel) {
      return res.status(404).json({ error: "Panel not found." });
    }

    // Recalculate year & scrap status if barcode/real_sr_no is modified
    if (fields.real_sr_no !== undefined || fields.barcode !== undefined) {
      const newSerial = fields.real_sr_no || fields.barcode || '';
      const cleanSerial = String(newSerial).trim();
      if (cleanSerial && cleanSerial !== '-') {
        const mfgYear = extractMfgYear(cleanSerial);
        fields.mfg_year = mfgYear;
        fields.barcode = cleanSerial;
        fields.real_sr_no = cleanSerial;
        if (mfgYear && mfgYear <= 2022) {
          fields.status = 'Scrap';
          fields.scrap_reason = `Manufacturing Year (${mfgYear}) <= 2022`;
        } else {
          fields.status = 'Repairable';
          fields.scrap_reason = null;
        }
      } else {
        fields.mfg_year = null;
        fields.barcode = fields.barcode || '';
        fields.real_sr_no = '';
        fields.status = 'Repairable';
        fields.scrap_reason = null;
      }
    }

    const updated = await Panel.updatePanelFields(id, fields);
    res.json({ success: true, panel: updated });
  } catch (err) {
    console.error('Patch panel error:', err);
    res.status(500).json({ error: err.message || "Failed to update panel." });
  }
};

export const deletePanel = async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await Panel.delete(id);
    res.json({ success: true, message: "Panel deleted successfully.", panel: deleted });
  } catch (err) {
    console.error('Delete panel error:', err);
    res.status(500).json({ error: "Failed to delete panel." });
  }
};

export const createPanel = async (req, res) => {
  const { lot_id, side, box_no, dummy_sr_no, real_sr_no, excel_data } = req.body;

  if (!lot_id) {
    return res.status(400).json({ error: "Missing lot_id." });
  }

  try {
    const lot = await Lot.findById(lot_id);
    if (!lot) {
      return res.status(404).json({ error: "Lot not found." });
    }

    let currentMaxSr = 0;
    if (isFallback()) {
      const lotPanels = memoryDb.tables.panels.filter(p => p.lot_id === lot.id);
      currentMaxSr = lotPanels.reduce((max, p) => Math.max(max, p.sr_no || 0), 0);
    } else {
      const srRes = await pool.query('SELECT COALESCE(MAX(sr_no), 0) as max_sr FROM panels WHERE lot_id = $1', [lot.id]);
      currentMaxSr = parseInt(srRes.rows[0].max_sr || 0);
    }

    const srNo = currentMaxSr + 1;
    const real = real_sr_no ? String(real_sr_no).trim() : null;
    const dummy = dummy_sr_no ? String(dummy_sr_no).trim() : null;
    const box = box_no ? String(box_no).trim() : 'Box 1';
    
    const mfgYear = extractMfgYear(real);
    let status = 'Repairable';
    let scrapReason = null;
    if (mfgYear && mfgYear <= 2022) {
      status = 'Scrap';
      scrapReason = `Manufacturing Year (${mfgYear}) <= 2022`;
    }

    const pitchStr = lot.pixel_pitch.replace('.', '');
    const sideVal = side || 'Left';
    const sideChar = sideVal[0];
    const srStr = String(srNo).padStart(4, '0');
    const barcode = real || `ESRP2${pitchStr}${lot.lot_no}E26${lot.batch_no}${sideChar}${srStr}`;

    const partCode = excel_data ? (excel_data.part_code || excel_data.PartCode || excel_data.Col_3 || '') : '';
    const model = excel_data ? (excel_data.model || excel_data.Model || excel_data.Col_5 || '') : '';

    let newPanel;
    if (isFallback()) {
      newPanel = {
        id: memoryDb.tables.panels.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1,
        lot_id: lot.id,
        sr_no: srNo,
        side: sideVal,
        barcode,
        status,
        scrap_reason: scrapReason,
        current_step: 1,
        assigned_engineer_id: null,
        dummy_sr_no: dummy,
        real_sr_no: real,
        mfg_year: mfgYear,
        box_no: box,
        part_code: partCode,
        model: model,
        excel_data: excel_data || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryDb.tables.panels.push(newPanel);
    } else {
      const insRes = await pool.query(`
        INSERT INTO panels (lot_id, sr_no, side, barcode, status, scrap_reason, current_step, dummy_sr_no, real_sr_no, mfg_year, box_no, part_code, model, excel_data)
        VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [lot.id, srNo, sideVal, barcode, status, scrapReason, dummy, real, mfgYear, box, partCode, model, excel_data ? JSON.stringify(excel_data) : null]);
      newPanel = insRes.rows[0];
    }

    res.status(201).json({ success: true, panel: newPanel });
  } catch (err) {
    console.error('Create panel error:', err);
    res.status(500).json({ error: "Failed to create panel." });
  }
};

export const clearLotPanels = async (req, res) => {
  const { lot_id } = req.query;
  if (!lot_id) {
    return res.status(400).json({ error: "Missing lot_id." });
  }

  try {
    if (isFallback()) {
      memoryDb.tables.panels = memoryDb.tables.panels.filter(p => p.lot_id !== parseInt(lot_id));
    } else {
      await pool.query('DELETE FROM panels WHERE lot_id = $1', [parseInt(lot_id, 10)]);
    }
    res.json({ success: true, message: "Cleared all panels for this lot." });
  } catch (err) {
    console.error('Clear panels error:', err);
    res.status(500).json({ error: "Failed to clear panels." });
  }
};

const findColumnIndices = (sheetRows) => {
  let dummyColIdx = -1;
  let barcodeColIdx = -1;
  let mfgYearColIdx = -1;
  let partCodeColIdx = -1;
  let modelColIdx = -1;
  let boxColIdx = -1;

  for (let r = 0; r < Math.min(sheetRows.length, 20); r++) {
    const row = sheetRows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim().toLowerCase();
      if (dummyColIdx === -1 && (val === 'pcb sr no' || val === 'dummy sr no' || val.includes('pcb sr') || val === 'sr no')) {
        dummyColIdx = c;
      }
      if (barcodeColIdx === -1 && (val === 'barcode' || val === 'actual barcode' || val === 'real serial')) {
        barcodeColIdx = c;
      }
      if (mfgYearColIdx === -1 && (val === 'mfg year' || val === 'mfg_year' || val === 'year')) {
        mfgYearColIdx = c;
      }
      if (partCodeColIdx === -1 && (val === 'part code' || val === 'part_code' || val === 'partcode')) {
        partCodeColIdx = c;
      }
      if (modelColIdx === -1 && (val === 'model' || val === 'model name' || val === 'product model')) {
        modelColIdx = c;
      }
      if (boxColIdx === -1 && (val === 'box' || val === 'box no' || val === 'box_no' || val === 'box number')) {
        boxColIdx = c;
      }
    }
  }
  return { dummyColIdx, barcodeColIdx, mfgYearColIdx, partCodeColIdx, modelColIdx, boxColIdx };
};

export const initializeLotBaselines = async (lotId, clientTransaction = null) => {
  const db = clientTransaction || pool;
  if (isFallback()) {
    const lot = memoryDb.tables.lots.find(l => l.id === lotId);
    const scrapYear = lot && lot.scrap_year_threshold !== null ? lot.scrap_year_threshold : 2021;
    const sepYear = lot && lot.separate_year_threshold !== null ? lot.separate_year_threshold : 2022;

    // Delete unlocked baselines
    memoryDb.tables.lot_part_code_baselines = memoryDb.tables.lot_part_code_baselines.filter(
      b => !(b.lot_id === lotId && b.locked === false)
    );
    // Find panels in this lot and group by part_code (excluding scrap and separate)
    const panels = memoryDb.tables.panels.filter(p => 
      p.lot_id === lotId &&
      (p.mfg_year === null || p.mfg_year === undefined || (p.mfg_year > scrapYear && p.mfg_year !== sepYear))
    );
    const groups = {};
    panels.forEach(p => {
      const pc = p.part_code || '';
      if (pc) {
        groups[pc] = (groups[pc] || 0) + 1;
      }
    });
    Object.entries(groups).forEach(([pc, qty]) => {
      const exists = memoryDb.tables.lot_part_code_baselines.some(b => b.lot_id === lotId && b.part_code === pc);
      if (!exists) {
        memoryDb.tables.lot_part_code_baselines.push({
          id: Date.now() + Math.random(),
          lot_id: lotId,
          part_code: pc,
          verified_qty: qty,
          locked: false
        });
      }
    });
  } else {
    const lotRes = await db.query('SELECT scrap_year_threshold, separate_year_threshold FROM lots WHERE id = $1', [lotId]);
    const lot = lotRes.rows[0];
    const scrapYear = lot && lot.scrap_year_threshold !== null ? lot.scrap_year_threshold : 2021;
    const sepYear = lot && lot.separate_year_threshold !== null ? lot.separate_year_threshold : 2022;

    // Delete unlocked baselines
    await db.query('DELETE FROM lot_part_code_baselines WHERE lot_id = $1 AND locked = false', [lotId]);
    // Insert fresh unlocked ones (excluding scrap and separate)
    await db.query(`
      INSERT INTO lot_part_code_baselines (lot_id, part_code, verified_qty, locked)
      SELECT lot_id, part_code, COUNT(*)::integer, false
      FROM panels
      WHERE lot_id = $1 
        AND part_code IS NOT NULL 
        AND part_code <> ''
        AND (mfg_year IS NULL OR (mfg_year > $2 AND mfg_year <> $3))
      GROUP BY lot_id, part_code
      ON CONFLICT (lot_id, part_code) DO NOTHING
    `, [lotId, scrapYear, sepYear]);
  }
};

const syncExcelPanels = async (lotId, sheets) => {
  let targetSheetName = null;
  let maxRows = 0;
  
  for (const [sheetName, rows] of Object.entries(sheets)) {
    if (rows.length > maxRows) {
      maxRows = rows.length;
    }
    const { dummyColIdx, barcodeColIdx } = findColumnIndices(rows);
    if (dummyColIdx !== -1 || barcodeColIdx !== -1) {
      targetSheetName = sheetName;
      break;
    }
  }
  
  if (!targetSheetName) {
    for (const [sheetName, rows] of Object.entries(sheets)) {
      if (rows.length === maxRows) {
        targetSheetName = sheetName;
        break;
      }
    }
  }

  if (!targetSheetName) return;

  const rows = sheets[targetSheetName];
  const { dummyColIdx, barcodeColIdx, partCodeColIdx, modelColIdx, boxColIdx } = findColumnIndices(rows);

  if (isFallback()) {
    memoryDb.tables.panels = memoryDb.tables.panels.filter(p => p.lot_id !== lotId);
  } else {
    await pool.query('DELETE FROM panels WHERE lot_id = $1', [lotId]);
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const dummy = dummyColIdx !== -1 ? String(row[dummyColIdx] || '').trim() : '';
    const rawBarcode = barcodeColIdx !== -1 ? String(row[barcodeColIdx] || '').trim() : '';
    const partCode = partCodeColIdx !== -1 ? String(row[partCodeColIdx] || '').trim() : '';
    const model = modelColIdx !== -1 ? String(row[modelColIdx] || '').trim() : '';
    const box = boxColIdx !== -1 && row[boxColIdx] ? String(row[boxColIdx]).trim() : 'Box 1';

    if (r < 5) {
      const isHeader = [dummy, rawBarcode].some(val => {
        const l = val.toLowerCase();
        return l.includes('pcb sr') || l.includes('barcode') || l.includes('serial') || l.includes('sr no');
      });
      if (isHeader) continue;
    }

    if (!dummy && !rawBarcode) continue;

    const hasRealBarcode = rawBarcode && rawBarcode !== '-';
    const barcode = hasRealBarcode ? rawBarcode : (dummy || `DUMMY-${lotId}-${r + 1}-${Date.now()}`);
    const mfgYear = hasRealBarcode ? extractMfgYear(rawBarcode) : null;
    let status = 'Repairable';
    let scrapReason = null;
    if (mfgYear && mfgYear <= 2022) {
      status = 'Scrap';
      scrapReason = `Manufacturing Year (${mfgYear}) <= 2022`;
    }

    const excelData = {};
    row.forEach((cell, cIdx) => {
      excelData[`Col_${cIdx}`] = cell;
    });

    if (isFallback()) {
      memoryDb.tables.panels.push({
        id: Date.now() + Math.random(),
        lot_id: lotId,
        sr_no: r + 1,
        dummy_sr_no: dummy,
        real_sr_no: hasRealBarcode ? rawBarcode : '',
        barcode: barcode,
        box_no: box,
        mfg_year: mfgYear,
        part_code: partCode,
        model: model,
        status,
        scrap_reason: scrapReason,
        excel_data: excelData,
        current_step: 1
      });
    } else {
      await pool.query(`
        INSERT INTO panels (lot_id, sr_no, dummy_sr_no, real_sr_no, barcode, box_no, mfg_year, part_code, model, status, scrap_reason, excel_data, current_step)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1)
      `, [lotId, r + 1, dummy, hasRealBarcode ? rawBarcode : '', barcode, box, mfgYear, partCode, model, status, scrapReason, JSON.stringify(excelData)]);
    }
  }

  await initializeLotBaselines(lotId);
};

export const uploadExcel = async (req, res) => {
  const { id } = req.params;
  const lotId = parseInt(id, 10);
  if (isNaN(lotId)) {
    return res.status(400).json({ error: "Invalid lot ID." });
  }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const tempFilePath = path.join(uploadsDir, `lot_${lotId}_temp.xlsx`);
  const finalJsonPath = path.join(uploadsDir, `lot_${lotId}_raw.json`);

  const fileStream = fs.createWriteStream(tempFilePath);
  req.pipe(fileStream);

  fileStream.on('finish', async () => {
    try {
      const workbook = XLSX.readFile(tempFilePath);
      const sheets = {};
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        // Convert to 2D array
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        // Format exactly as the python parser did: all cells as strings
        const cleanedRows = rows.map(row => 
          row.map(val => (val !== undefined && val !== null) ? String(val).trim() : '')
        );
        sheets[sheetName] = cleanedRows;
      });

      try { fs.unlinkSync(tempFilePath); } catch (e) {}

      fs.writeFileSync(finalJsonPath, JSON.stringify(sheets), 'utf8');

      if (isFallback()) {
        memoryDb.tables.lot_raw_sheets = memoryDb.tables.lot_raw_sheets || [];
        const existingIdx = memoryDb.tables.lot_raw_sheets.findIndex(s => s.lot_id === lotId);
        if (existingIdx !== -1) {
          memoryDb.tables.lot_raw_sheets[existingIdx].raw_json = JSON.stringify(sheets);
        } else {
          memoryDb.tables.lot_raw_sheets.push({ lot_id: lotId, raw_json: JSON.stringify(sheets) });
        }
      } else {
        await pool.query(`
          INSERT INTO lot_raw_sheets (lot_id, raw_json)
          VALUES ($1, $2)
          ON CONFLICT (lot_id)
          DO UPDATE SET raw_json = $2
        `, [lotId, JSON.stringify(sheets)]);
      }

      if (isFallback()) {
        memoryDb.tables.cell_edits = memoryDb.tables.cell_edits.filter(e => e.lot_id !== lotId);
      } else {
        await pool.query('DELETE FROM cell_edits WHERE lot_id = $1', [lotId]);
      }

      await syncExcelPanels(lotId, sheets);

      res.json({ success: true, message: "Imported Excel file successfully." });
    } catch (ex) {
      console.error('Upload handler error:', ex);
      try { fs.unlinkSync(tempFilePath); } catch (e) {}
      res.status(500).json({ error: ex.message || "Failed to parse Excel file." });
    }
  });

  fileStream.on('error', (err) => {
    console.error('File stream error:', err);
    res.status(500).json({ error: "Failed writing uploaded file." });
  });
};

export const getExcelData = async (req, res) => {
  const { id } = req.params;
  const lotId = parseInt(id, 10);
  if (isNaN(lotId)) {
    return res.status(400).json({ error: "Invalid lot ID." });
  }

  const formatLocalTime = (dateInput) => {
    if (!dateInput) return '';
    const dObj = new Date(dateInput);
    if (isNaN(dObj.getTime())) return String(dateInput);
    const pad = (num) => String(num).padStart(2, '0');
    return `${dObj.getFullYear()}-${pad(dObj.getMonth() + 1)}-${pad(dObj.getDate())} ${pad(dObj.getHours())}:${pad(dObj.getMinutes())}:${pad(dObj.getSeconds())}`;
  };

  const processSheets = (sheetsObj, logsList) => {
    if (!sheetsObj) return {};
    const processed = {};
    Object.keys(sheetsObj).forEach(sheetName => {
      const rows = sheetsObj[sheetName] || [];
      if (rows.length === 0) {
        processed[sheetName] = rows;
        return;
      }

      const header = rows[0] || [];
      let dateColIdx = -1;
      let monthColIdx = -1;
      for (let c = 0; c < header.length; c++) {
        const val = String(header[c] || '').trim().toLowerCase();
        if (val === 'date') dateColIdx = c;
        if (val === 'month') monthColIdx = c;
      }

      const appendTime = (monthColIdx === -1);
      const appendDate = (dateColIdx === -1);

      const newRows = [];
      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = [...rows[rIdx]];
        if (rIdx === 0) {
          if (monthColIdx !== -1) {
            row[monthColIdx] = 'Time';
          } else {
            row.push('Time');
          }
          if (dateColIdx !== -1) {
            row[dateColIdx] = 'Date';
          } else {
            row.push('Date');
          }
        } else {
          const log = logsList.find(l => l.sheet_name === sheetName && Number(l.row_idx) === rIdx);
          let scanDateStr = '';
          let scanTimeStr = '';
          if (log && log.timestamp) {
            const parts = String(log.timestamp).split(' ');
            if (parts.length === 2) {
              scanDateStr = parts[0];
              scanTimeStr = parts[1];
            } else {
              const dObj = new Date(log.timestamp);
              if (!isNaN(dObj.getTime())) {
                const pad = (num) => String(num).padStart(2, '0');
                scanDateStr = `${dObj.getFullYear()}-${pad(dObj.getMonth() + 1)}-${pad(dObj.getDate())}`;
                scanTimeStr = `${pad(dObj.getHours())}:${pad(dObj.getMinutes())}:${pad(dObj.getSeconds())}`;
              }
            }
          }

          if (monthColIdx !== -1) {
            row[monthColIdx] = scanTimeStr || '-';
          }
          if (dateColIdx !== -1) {
            if (scanDateStr) {
              row[dateColIdx] = scanDateStr;
            }
          }

          if (appendTime) {
            row.push(scanTimeStr || '-');
          }
          if (appendDate) {
            row.push(scanDateStr || '');
          }
        }
        newRows.push(row);
      }
      processed[sheetName] = newRows;
    });
    return processed;
  };

  const finalJsonPath = path.join(process.cwd(), 'uploads', `lot_${lotId}_raw.json`);
  let sheets = {};
  if (fs.existsSync(finalJsonPath)) {
    try {
      sheets = JSON.parse(fs.readFileSync(finalJsonPath, 'utf8'));
    } catch (e) {
      console.error(e);
    }
  }

  let edits = [];
  try {
    if (isFallback()) {
      edits = memoryDb.tables.cell_edits.filter(e => e.lot_id === lotId);
    } else {
      const dbRes = await pool.query('SELECT * FROM cell_edits WHERE lot_id = $1', [lotId]);
      edits = dbRes.rows;
    }
  } catch (err) {
    console.error(err);
  }

  let scanLogs = [];
  try {
    if (isFallback()) {
      scanLogs = memoryDb.tables.scan_logs
        .filter(e => e.lot_id === lotId)
        .map(e => ({
          ...e,
          timestamp: formatLocalTime(e.timestamp)
        }));
    } else {
      const scansRes = await pool.query(
        "SELECT timestamp, dummy_sr_no, actual_serial_no, mfg_year, scrap, scanned_by, session_export_batch, sheet_name, row_idx FROM scan_logs WHERE lot_id = $1 ORDER BY timestamp ASC",
        [lotId]
      );
      scanLogs = scansRes.rows.map(s => ({
        ...s,
        timestamp: formatLocalTime(s.timestamp)
      }));
    }
  } catch (err) {
    console.error(err);
  }

  let lot = null;
  try {
    lot = await Lot.findById(lotId);
  } catch (err) {
    console.error(err);
  }

  const processedSheets = processSheets(sheets, scanLogs);
  res.json({ sheets: processedSheets, edits, lot });
};

export const saveCellEdit = async (req, res) => {
  const { id } = req.params;
  const lotId = parseInt(id, 10);
  const { sheet_name, row_idx, col_idx, value } = req.body;

  if (isNaN(lotId) || !sheet_name || row_idx === undefined || col_idx === undefined) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    if (isFallback()) {
      const existingIdx = memoryDb.tables.cell_edits.findIndex(e => 
        e.lot_id === lotId && e.sheet_name === sheet_name && e.row_idx === row_idx && String(e.col_idx) === String(col_idx)
      );
      const editObj = { lot_id: lotId, sheet_name, row_idx, col_idx: String(col_idx), value };
      if (existingIdx !== -1) {
        memoryDb.tables.cell_edits[existingIdx] = editObj;
      } else {
        memoryDb.tables.cell_edits.push(editObj);
      }
    } else {
      const existing = await pool.query(
        'SELECT id FROM cell_edits WHERE lot_id = $1 AND sheet_name = $2 AND row_idx = $3 AND col_idx = $4',
        [lotId, sheet_name, parseInt(row_idx, 10), String(col_idx)]
      );
      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE cell_edits SET value = $1 WHERE id = $2',
          [value, existing.rows[0].id]
        );
      } else {
        await pool.query(
          'INSERT INTO cell_edits (lot_id, sheet_name, row_idx, col_idx, value) VALUES ($1, $2, $3, $4, $5)',
          [lotId, sheet_name, parseInt(row_idx, 10), String(col_idx), value]
        );
      }
    }

    const finalJsonPath = path.join(process.cwd(), 'uploads', `lot_${lotId}_raw.json`);
    if (fs.existsSync(finalJsonPath)) {
      const sheets = JSON.parse(fs.readFileSync(finalJsonPath, 'utf8'));
      const rows = sheets[sheet_name] || [];
      const { dummyColIdx, barcodeColIdx, partCodeColIdx, modelColIdx } = findColumnIndices(rows);
      const srNo = parseInt(row_idx, 10) + 1;

      let updateField = null;
      let updateValue = value;

      if (String(col_idx) === String(dummyColIdx)) {
        updateField = 'dummy_sr_no';
      } else if (String(col_idx) === String(barcodeColIdx) || String(col_idx) === 'actual_serial_no') {
        updateField = 'real_sr_no';
      } else if (String(col_idx) === String(partCodeColIdx)) {
        updateField = 'part_code';
      } else if (String(col_idx) === String(modelColIdx)) {
        updateField = 'model';
      } else if (String(col_idx) === 'box_no') {
        updateField = 'box_no';
      } else if (String(col_idx) === 'repairable') {
        updateField = 'repairable';
        updateValue = (value === 'true');
      }

      if (updateField) {
        const fields = { [updateField]: updateValue };
        if (updateField === 'real_sr_no') {
          fields.barcode = updateValue;
          const mfgYear = extractMfgYear(updateValue);
          fields.mfg_year = mfgYear;
          if (mfgYear && mfgYear <= 2022) {
            fields.status = 'Scrap';
            fields.scrap_reason = `Manufacturing Year (${mfgYear}) <= 2022`;
          } else {
            fields.status = 'Repairable';
            fields.scrap_reason = null;
          }
        }

        if (isFallback()) {
          const p = memoryDb.tables.panels.find(p => p.lot_id === lotId && p.sr_no === srNo);
          if (p) {
            Object.assign(p, fields);
          }
        } else {
          const check = await pool.query('SELECT id FROM panels WHERE lot_id = $1 AND sr_no = $2', [lotId, srNo]);
          if (check.rows.length > 0) {
            const pId = check.rows[0].id;
            const keys = Object.keys(fields);
            const vals = Object.values(fields);
            const setClause = keys.map((k, idx) => `${k} = $${idx + 1}`).join(', ');
            await pool.query(`UPDATE panels SET ${setClause} WHERE id = $${keys.length + 1}`, [...vals, pId]);
          }
        }

      }

      // Update or Insert scan log timestamp when ANY cell in the row is edited
      const dummySrNo = rows[row_idx] && dummyColIdx !== -1 ? rows[row_idx][dummyColIdx] : '';

      // Resolve actual serial value for this row
      let actualSerialVal = '';
      if (isFallback()) {
        const editsList = memoryDb.tables.cell_edits || [];
        const barcodeEdit = editsList.find(e => 
          e.lot_id === lotId && e.sheet_name === sheet_name && Number(e.row_idx) === Number(row_idx) && String(e.col_idx) === 'actual_serial_no'
        );
        if (barcodeEdit) {
          actualSerialVal = barcodeEdit.value;
        } else if (barcodeColIdx !== -1 && rows[row_idx]) {
          actualSerialVal = rows[row_idx][barcodeColIdx] || '';
        }
      } else {
        const editRes = await pool.query(
          "SELECT value FROM cell_edits WHERE lot_id = $1 AND sheet_name = $2 AND row_idx = $3 AND col_idx = 'actual_serial_no'",
          [lotId, sheet_name, parseInt(row_idx, 10)]
        );
        if (editRes.rows.length > 0) {
          actualSerialVal = editRes.rows[0].value;
        } else if (barcodeColIdx !== -1 && rows[row_idx]) {
          actualSerialVal = rows[row_idx][barcodeColIdx] || '';
        }
      }

      const mfgYear = extractMfgYear(actualSerialVal);
      const scrapVal = mfgYear && mfgYear <= 2022 ? 'Yes' : 'No';

      // Check if a scan log already exists for this row
      let existingLog = null;
      if (isFallback()) {
        const logsList = memoryDb.tables.scan_logs || [];
        existingLog = logsList.find(log => 
          log.lot_id === lotId && log.sheet_name === sheet_name && Number(log.row_idx) === Number(row_idx)
        );
      } else {
        const logRes = await pool.query(
          "SELECT id FROM scan_logs WHERE lot_id = $1 AND sheet_name = $2 AND row_idx = $3",
          [lotId, sheet_name, parseInt(row_idx, 10)]
        );
        if (logRes.rows.length > 0) {
          existingLog = logRes.rows[0];
        }
      }

      let nextBatchNum = 1;
      if (isFallback()) {
        const lotExports = (memoryDb.tables.export_history || []).filter(e => e.lot_id === lotId);
        if (lotExports.length > 0) {
          nextBatchNum = Math.max(...lotExports.map(e => e.export_number)) + 1;
        }
      } else {
        const maxExportRes = await pool.query(
          'SELECT COALESCE(MAX(export_number), 0) as max_val FROM export_history WHERE lot_id = $1',
          [lotId]
        );
        nextBatchNum = parseInt(maxExportRes.rows[0].max_val, 10) + 1;
      }

      if (existingLog) {
        if (isFallback()) {
          existingLog.timestamp = new Date();
          existingLog.actual_serial_no = actualSerialVal;
          existingLog.mfg_year = mfgYear;
          existingLog.scrap = scrapVal;
          existingLog.scanned_by = (req.user && req.user.name) || 'Unknown';
        } else {
          await pool.query(
            "UPDATE scan_logs SET timestamp = CURRENT_TIMESTAMP, actual_serial_no = $1, mfg_year = $2, scrap = $3, scanned_by = $4 WHERE id = $5",
            [actualSerialVal, mfgYear, scrapVal, (req.user && req.user.name) || 'Unknown', existingLog.id]
          );
        }
      } else {
        if (isFallback()) {
          memoryDb.tables.scan_logs.push({
            lot_id: lotId,
            sheet_name,
            row_idx: parseInt(row_idx, 10),
            dummy_sr_no: dummySrNo,
            actual_serial_no: actualSerialVal,
            mfg_year: mfgYear,
            scrap: scrapVal,
            scanned_by: (req.user && req.user.name) || 'Unknown',
            session_export_batch: nextBatchNum,
            timestamp: new Date()
          });
        } else {
          await pool.query(`
            INSERT INTO scan_logs (lot_id, sheet_name, row_idx, dummy_sr_no, actual_serial_no, mfg_year, scrap, scanned_by, session_export_batch, timestamp)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
          `, [
            lotId,
            sheet_name,
            parseInt(row_idx, 10),
            dummySrNo,
            actualSerialVal,
            mfgYear,
            scrapVal,
            (req.user && req.user.name) || 'Unknown',
            nextBatchNum
          ]);
        }
      }
    }

    await initializeLotBaselines(lotId);

    res.json({ success: true, message: "Cell edit saved successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save cell edit." });
  }
};

export const exportExcel = async (req, res) => {
  const { id } = req.params;
  const lotId = parseInt(id, 10);

  if (isNaN(lotId)) {
    return res.status(400).json({ error: "Invalid lot ID." });
  }

  try {
    const finalJsonPath = path.join(process.cwd(), 'uploads', `lot_${lotId}_raw.json`);
    let rawSheets = null;
    if (fs.existsSync(finalJsonPath)) {
      rawSheets = JSON.parse(fs.readFileSync(finalJsonPath, 'utf8'));
    } else {
      if (isFallback()) {
        const entry = (memoryDb.tables.lot_raw_sheets || []).find(s => s.lot_id === lotId);
        if (entry) {
          rawSheets = JSON.parse(entry.raw_json);
        }
      } else {
        const dbRes = await pool.query('SELECT raw_json FROM lot_raw_sheets WHERE lot_id = $1', [lotId]);
        if (dbRes.rows.length > 0) {
          rawSheets = JSON.parse(dbRes.rows[0].raw_json);
        }
      }
    }

    if (!rawSheets) {
      return res.status(400).json({ error: "No spreadsheet uploaded for this lot yet." });
    }

    // 1. Fetch Lot Info
    let lot = null;
    if (isFallback()) {
      lot = memoryDb.tables.lots.find(l => l.id === lotId);
    } else {
      const lotRes = await pool.query('SELECT * FROM lots WHERE id = $1', [lotId]);
      if (lotRes.rows.length > 0) {
        lot = lotRes.rows[0];
      }
    }
    const lotNo = lot ? lot.lot_no : lotId;

    // 2. Fetch Cell Edits
    let cellEdits = [];
    if (isFallback()) {
      cellEdits = memoryDb.tables.cell_edits.filter(e => e.lot_id === lotId);
    } else {
      const editsRes = await pool.query(
        'SELECT sheet_name, row_idx, col_idx, value FROM cell_edits WHERE lot_id = $1',
        [lotId]
      );
      cellEdits = editsRes.rows;
    }

    const formatLocalTime = (dateInput) => {
      if (!dateInput) return '';
      const dObj = new Date(dateInput);
      if (isNaN(dObj.getTime())) return String(dateInput);
      const pad = (num) => String(num).padStart(2, '0');
      return `${dObj.getFullYear()}-${pad(dObj.getMonth() + 1)}-${pad(dObj.getDate())} ${pad(dObj.getHours())}:${pad(dObj.getMinutes())}:${pad(dObj.getSeconds())}`;
    };

    // 3. Fetch Scan Logs
    let scanLogs = [];
    if (isFallback()) {
      scanLogs = memoryDb.tables.scan_logs
        .filter(e => e.lot_id === lotId)
        .map(e => ({
          ...e,
          timestamp: formatLocalTime(e.timestamp)
        }));
    } else {
      const scansRes = await pool.query(
        "SELECT timestamp, dummy_sr_no, actual_serial_no, mfg_year, scrap, scanned_by, session_export_batch, sheet_name, row_idx FROM scan_logs WHERE lot_id = $1 ORDER BY timestamp ASC",
        [lotId]
      );
      scanLogs = scansRes.rows.map(s => ({
        ...s,
        timestamp: formatLocalTime(s.timestamp)
      }));
    }

    // 4. Fetch Export History
    let exportHistory = [];
    if (isFallback()) {
      exportHistory = memoryDb.tables.export_history
        .filter(e => e.lot_id === lotId)
        .map(e => ({
          ...e,
          timestamp: formatLocalTime(e.timestamp)
        }));
    } else {
      const histRes = await pool.query(
        "SELECT export_number, timestamp, exported_by, total_rows, scanned_count, unscanned_count, scrap_count, file_name FROM export_history WHERE lot_id = $1 ORDER BY export_number ASC",
        [lotId]
      );
      exportHistory = histRes.rows.map(e => ({
        ...e,
        timestamp: formatLocalTime(e.timestamp)
      }));
    }

    const processSheets = (sheetsObj, logsList) => {
      if (!sheetsObj) return {};
      const processed = {};
      Object.keys(sheetsObj).forEach(sheetName => {
        const rows = sheetsObj[sheetName] || [];
        if (rows.length === 0) {
          processed[sheetName] = rows;
          return;
        }

        const header = rows[0] || [];
        let dateColIdx = -1;
        let monthColIdx = -1;
        for (let c = 0; c < header.length; c++) {
          const val = String(header[c] || '').trim().toLowerCase();
          if (val === 'date') dateColIdx = c;
          if (val === 'month') monthColIdx = c;
        }

        const appendTime = (monthColIdx === -1);
        const appendDate = (dateColIdx === -1);

        const newRows = [];
        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          const row = [...rows[rIdx]];
          if (rIdx === 0) {
            if (monthColIdx !== -1) {
              row[monthColIdx] = 'Time';
            } else {
              row.push('Time');
            }
            if (dateColIdx !== -1) {
              row[dateColIdx] = 'Date';
            } else {
              row.push('Date');
            }
          } else {
            const log = logsList.find(l => l.sheet_name === sheetName && Number(l.row_idx) === rIdx);
            let scanDateStr = '';
            let scanTimeStr = '';
            if (log && log.timestamp) {
              const parts = String(log.timestamp).split(' ');
              if (parts.length === 2) {
                scanDateStr = parts[0];
                scanTimeStr = parts[1];
              } else {
                const dObj = new Date(log.timestamp);
                if (!isNaN(dObj.getTime())) {
                  const pad = (num) => String(num).padStart(2, '0');
                  scanDateStr = `${dObj.getFullYear()}-${pad(dObj.getMonth() + 1)}-${pad(dObj.getDate())}`;
                  scanTimeStr = `${pad(dObj.getHours())}:${pad(dObj.getMinutes())}:${pad(dObj.getSeconds())}`;
                }
              }
            }

            if (monthColIdx !== -1) {
              row[monthColIdx] = scanTimeStr || '-';
            }
            if (dateColIdx !== -1) {
              if (scanDateStr) {
                row[dateColIdx] = scanDateStr;
              }
            }

            if (appendTime) {
              row.push(scanTimeStr || '-');
            }
            if (appendDate) {
              row.push(scanDateStr || '');
            }
          }
          newRows.push(row);
        }
        processed[sheetName] = newRows;
      });
      return processed;
    };

    const processedSheets = processSheets(rawSheets, scanLogs);

    // 5. Compute Stats (Rule 3)
    let totalRows = 0;
    Object.keys(processedSheets).forEach(sheetName => {
      const rows = processedSheets[sheetName] || [];
      if (rows.length > 1) {
        totalRows += (rows.length - 1); // exclude header row
      }
    });

    const scannedCount = scanLogs.length;

    // Count scrap count from scanLogs
    let scrapCount = 0;
    scanLogs.forEach(log => {
      const mfgYear = log.mfg_year || extractMfgYear(log.actual_serial_no);
      const scrapThreshold = lot && lot.scrap_year_threshold !== null ? lot.scrap_year_threshold : 2022;
      if (mfgYear && mfgYear <= scrapThreshold) {
        scrapCount++;
      }
    });

    const unscannedCount = totalRows - scannedCount;

    // 6. Get Next Export Number (Rule 3)
    const nextExportNum = exportHistory.length > 0 
      ? Math.max(...exportHistory.map(e => parseInt(e.export_number, 10))) + 1 
      : 1;

    // 7. Formulate Filename (Rule 5)
    const d = new Date();
    const YYYYMMDD = d.getFullYear().toString() + (d.getMonth() + 1).toString().padStart(2, '0') + d.getDate().toString().padStart(2, '0');
    const HHMM = d.getHours().toString().padStart(2, '0') + d.getMinutes().toString().padStart(2, '0');
    const filename = `LotNo${lotNo}_Export${nextExportNum}_${YYYYMMDD}_${HHMM}.xlsx`;

    const localTimestampStr = formatLocalTime(d);

    // 8. Log the new export entry (Rule 3)
    const newExportLog = {
      lot_id: lotId,
      export_number: nextExportNum,
      timestamp: d,
      exported_by: (req.user && req.user.name) || 'Unknown',
      total_rows: totalRows,
      scanned_count: scannedCount,
      unscanned_count: unscannedCount,
      scrap_count: scrapCount,
      file_name: filename
    };

    if (isFallback()) {
      memoryDb.tables.export_history.push(newExportLog);
    } else {
      await pool.query(`
        INSERT INTO export_history (lot_id, export_number, exported_by, total_rows, scanned_count, unscanned_count, scrap_count, file_name, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      `, [
        lotId,
        nextExportNum,
        newExportLog.exported_by,
        totalRows,
        scannedCount,
        unscannedCount,
        scrapCount,
        filename
      ]);
    }

    // Append current export to the history list for python script sheet creation
    const currentExportFormatted = {
      ...newExportLog,
      timestamp: localTimestampStr
    };
    exportHistory.push(currentExportFormatted);

    // 9. Run ExcelJS native export
    const pyOutputPath = path.join(process.cwd(), 'uploads', filename);

    // Fetch Audit checkpoint details if completed
    const results6 = await Audit.getResults(lotId, 6);
    const results10 = await Audit.getResults(lotId, 10);

    let mismatches6 = [];
    let mismatches10 = [];
    let allMissing = [];
    let allMismatches = [];

    if (results6 || results10) {
      // Helper function to dynamically compute mismatches
      const computeMismatchesForExcel = async (lId, stepNo) => {
        const inScopeSteps = stepNo === 6 ? [1, 2, 3, 4, 5] : [7, 8, 9];
        const scans = await Audit.getScans(lId, stepNo);
        let allPanels = [];
        if (isFallback()) {
          allPanels = (memoryDb.tables.panels || []).filter(p => p.lot_id === lId);
        } else {
          const panelRes = await pool.query('SELECT * FROM panels WHERE lot_id = $1', [lId]);
          allPanels = panelRes.rows;
        }
        const panelMap = new Map(allPanels.map(p => [p.id, p]));

        let panelLogs = [];
        if (isFallback()) {
          panelLogs = (memoryDb.tables.panel_logs || []).filter(log => {
            const p = panelMap.get(log.panel_id);
            if (!p) return false;
            const stepObj = (memoryDb.tables.repair_steps || []).find(rs => rs.id === log.step_id || rs.step_no === log.step_id);
            const stepNoVal = stepObj ? stepObj.step_no : null;
            return inScopeSteps.includes(stepNoVal);
          }).map(log => {
            const stepObj = (memoryDb.tables.repair_steps || []).find(rs => rs.id === log.step_id || rs.step_no === log.step_id);
            return {
              ...log,
              step_no: stepObj ? stepObj.step_no : null,
              step_name: stepObj ? stepObj.name : 'Unknown',
              engineer_name: (memoryDb.tables.users || []).find(u => u.id === log.engineer_id)?.name || 'Unknown'
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
            [lId, inScopeSteps]
          );
          panelLogs = logRes.rows;
        }

        const partCodeExpectedMap = new Map();
        const partCodeScannedMap = new Map();

        panelLogs.forEach(l => {
          const panel = panelMap.get(l.panel_id);
          if (panel && panel.part_code) {
            if (!partCodeExpectedMap.has(panel.part_code)) partCodeExpectedMap.set(panel.part_code, new Set());
            partCodeExpectedMap.get(panel.part_code).add(l.panel_id);
          }
        });

        scans.forEach(s => {
          if (!s.is_unknown && s.panel_id) {
            const panel = panelMap.get(s.panel_id);
            if (panel && panel.part_code) {
              if (!partCodeScannedMap.has(panel.part_code)) partCodeScannedMap.set(panel.part_code, new Set());
              partCodeScannedMap.get(panel.part_code).add(s.panel_id);
            }
          }
        });

        let stepsList = [];
        if (isFallback()) {
          stepsList = (memoryDb.tables.repair_steps || []).filter(rs => inScopeSteps.includes(rs.step_no));
        } else {
          const stepsRes = await pool.query('SELECT * FROM repair_steps WHERE step_no = ANY($1) ORDER BY step_no', [inScopeSteps]);
          stepsList = stepsRes.rows;
        }

        const mismatchesList = [];
        const allPartCodes = new Set([...partCodeExpectedMap.keys(), ...partCodeScannedMap.keys()]);

        for (const partCode of allPartCodes) {
          const expected = (partCodeExpectedMap.get(partCode) || new Set()).size;
          const scanned = (partCodeScannedMap.get(partCode) || new Set()).size;

          if (expected !== scanned) {
            const stepsBreakdown = [];
            let firstStepDropped = null;
            let lastStepCount = null;

            for (const st of stepsList) {
              const stepLogs = panelLogs.filter(l => {
                const panel = panelMap.get(l.panel_id);
                return panel && panel.part_code === partCode && l.step_no === st.step_no;
              });
              const stepCount = new Set(stepLogs.map(l => l.panel_id)).size;

              const opsMap = {};
              stepLogs.forEach(l => { opsMap[l.engineer_name] = (opsMap[l.engineer_name] || 0) + 1; });
              const loggedByStr = Object.entries(opsMap).map(([name, c]) => `${name} (${c})`).join(', ') || 'No logs';

              stepsBreakdown.push(`${st.name}: ${stepCount} logged by [${loggedByStr}]`);

              if (lastStepCount !== null && stepCount < lastStepCount && !firstStepDropped) {
                firstStepDropped = st.name;
              }
              lastStepCount = stepCount;
            }

            mismatchesList.push({
              part_code: partCode,
              expected,
              scanned,
              delta: expected - scanned,
              steps_breakdown: stepsBreakdown.join(' | '),
              first_step_dropped: firstStepDropped || 'N/A'
            });
          }
        }
        return mismatchesList;
      };

      mismatches6 = await computeMismatchesForExcel(lotId, 6);
      mismatches10 = await computeMismatchesForExcel(lotId, 10);
      allMismatches = [
        ...mismatches6.map(m => ({ ...m, step: 6 })),
        ...mismatches10.map(m => ({ ...m, step: 10 }))
      ];

      const missing6 = await Audit.getMissing(lotId, 6);
      const missing10 = await Audit.getMissing(lotId, 10);
      allMissing = [...missing6, ...missing10];
    }

    const workbook = await buildExportWorkbook(
      lotId,
      rawSheets,
      lot,
      cellEdits,
      scanLogs,
      allMissing,
      mismatches6,
      mismatches10,
      allMismatches,
      exportHistory
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error during Excel export." });
  }
};

export const saveLotRules = async (req, res) => {
  const { id } = req.params;
  const lotId = parseInt(id, 10);
  const { scrap_year_threshold, separate_year_threshold, checkbox_year_threshold } = req.body;

  if (isNaN(lotId)) {
    return res.status(400).json({ error: "Invalid lot ID." });
  }

  try {
    const lot = await Lot.findById(lotId);
    if (!lot) {
      return res.status(404).json({ error: "Lot not found." });
    }



    const updated = await Lot.updateRules(lotId, {
      scrap_year_threshold: scrap_year_threshold !== undefined && scrap_year_threshold !== '' ? parseInt(scrap_year_threshold, 10) : null,
      separate_year_threshold: separate_year_threshold !== undefined && separate_year_threshold !== '' ? parseInt(separate_year_threshold, 10) : null,
      checkbox_year_threshold: checkbox_year_threshold !== undefined && checkbox_year_threshold !== '' ? parseInt(checkbox_year_threshold, 10) : null
    });

    res.json(updated);
  } catch (err) {
    console.error('Error saving lot rules:', err);
    res.status(500).json({ error: "Failed to save lot rules." });
  }
};

export const saveLotStatus = async (req, res) => {
  const { id } = req.params;
  const lotId = parseInt(id, 10);
  const { status } = req.body;

  if (isNaN(lotId) || !status) {
    return res.status(400).json({ error: "Invalid lot ID or status." });
  }

  try {
    const lot = await Lot.findById(lotId);
    if (!lot) {
      return res.status(404).json({ error: "Lot not found." });
    }

    const updated = await Lot.updateStatus(lotId, status);
    if (status === 'Active') {
      await initializeLotBaselines(lotId);
    }
    res.json(updated);
  } catch (err) {
    console.error('Error saving lot status:', err);
    res.status(500).json({ error: "Failed to update lot status." });
  }
};

