import pool, { isFallback } from '../config/db.js';
import { tables } from '../services/memoryDb.js';

export const Audit = {
  // Checkpoint Scans
  async getScans(lotId, step) {
    if (isFallback()) {
      const scans = (tables.checkpoint_scans || []).filter(
        s => s.lot_id === Number(lotId) && s.checkpoint_step === Number(step)
      );
      return scans.map(s => {
        const panel = s.panel_id ? (tables.panels || []).find(p => p.id === s.panel_id) : null;
        const scanner = s.scanner_id ? (tables.users || []).find(u => u.id === s.scanner_id) : null;
        return {
          ...s,
          pcb_sr_no: panel ? panel.dummy_sr_no : null,
          barcode: panel ? panel.barcode : null,
          scanner_name: scanner ? scanner.name : 'Unknown'
        };
      });
    }

    const queryStr = `
      SELECT cs.*, p.dummy_sr_no as pcb_sr_no, p.barcode, u.name as scanner_name
      FROM checkpoint_scans cs
      LEFT JOIN panels p ON cs.panel_id = p.id
      LEFT JOIN users u ON cs.scanner_id = u.id
      WHERE cs.lot_id = $1 AND cs.checkpoint_step = $2
      ORDER BY cs.timestamp DESC
    `;
    const res = await pool.query(queryStr, [lotId, step]);
    return res.rows;
  },

  async insertScan({ lot_id, panel_id, checkpoint_step, scanned_value, matched_by, scanner_id, is_unknown }) {
    if (isFallback()) {
      const newId = (tables.checkpoint_scans || []).reduce((max, s) => Math.max(max, s.id || 0), 0) + 1;
      const newScan = {
        id: newId,
        lot_id: Number(lot_id),
        panel_id: panel_id ? Number(panel_id) : null,
        checkpoint_step: Number(checkpoint_step),
        scanned_value,
        matched_by,
        scanner_id: scanner_id ? Number(scanner_id) : null,
        is_unknown: !!is_unknown,
        timestamp: new Date()
      };
      tables.checkpoint_scans.push(newScan);

      if (panel_id) {
        const panel = (tables.panels || []).find(p => p.id === Number(panel_id));
        if (panel) {
          panel.last_checkpoint_seen = Number(checkpoint_step);
        }
      }
      return newScan;
    }

    const queryStr = `
      INSERT INTO checkpoint_scans (lot_id, panel_id, checkpoint_step, scanned_value, matched_by, scanner_id, is_unknown)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const res = await pool.query(queryStr, [
      lot_id,
      panel_id,
      checkpoint_step,
      scanned_value,
      matched_by,
      scanner_id,
      is_unknown
    ]);

    if (panel_id) {
      await pool.query(
        'UPDATE panels SET last_checkpoint_seen = $1 WHERE id = $2',
        [checkpoint_step, panel_id]
      );
    }
    return res.rows[0];
  },

  // Checkpoint Results
  async getResults(lotId, step) {
    if (isFallback()) {
      return (tables.checkpoint_results || []).find(
        r => r.lot_id === Number(lotId) && r.checkpoint_step === Number(step)
      ) || null;
    }

    const res = await pool.query(
      'SELECT * FROM checkpoint_results WHERE lot_id = $1 AND checkpoint_step = $2',
      [lotId, step]
    );
    return res.rows[0] || null;
  },

  async upsertResults({ lot_id, checkpoint_step, total_in_scope, total_scanned, total_missing, total_never_touched }) {
    if (isFallback()) {
      const resultsList = tables.checkpoint_results || [];
      const idx = resultsList.findIndex(
        r => r.lot_id === Number(lot_id) && r.checkpoint_step === Number(checkpoint_step)
      );
      const resObj = {
        lot_id: Number(lot_id),
        checkpoint_step: Number(checkpoint_step),
        total_in_scope: Number(total_in_scope),
        total_scanned: Number(total_scanned),
        total_missing: Number(total_missing),
        total_never_touched: Number(total_never_touched),
        computed_at: new Date()
      };
      if (idx !== -1) {
        resultsList[idx] = { ...resultsList[idx], ...resObj };
      } else {
        resObj.id = resultsList.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1;
        resultsList.push(resObj);
      }
      return resObj;
    }

    const queryStr = `
      INSERT INTO checkpoint_results (lot_id, checkpoint_step, total_in_scope, total_scanned, total_missing, total_never_touched)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (lot_id, checkpoint_step) DO UPDATE
      SET total_in_scope = EXCLUDED.total_in_scope,
          total_scanned = EXCLUDED.total_scanned,
          total_missing = EXCLUDED.total_missing,
          total_never_touched = EXCLUDED.total_never_touched,
          computed_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const res = await pool.query(queryStr, [
      lot_id,
      checkpoint_step,
      total_in_scope,
      total_scanned,
      total_missing,
      total_never_touched
    ]);
    return res.rows[0];
  },

  // Missing PCBs
  async getMissing(lotId, step) {
    if (isFallback()) {
      const missing = (tables.missing_pcbs || []).filter(
        m => m.lot_id === Number(lotId) && m.checkpoint_step === Number(step)
      );
      return missing.map(m => {
        const panel = (tables.panels || []).find(p => p.id === m.panel_id);
        const user = m.last_logged_by ? (tables.users || []).find(u => u.id === m.last_logged_by) : null;
        const stepName = m.last_step_id ? (tables.repair_steps || []).find(s => s.step_no === m.last_step_id)?.name : 'Unknown';
        const resolver = m.resolved_by ? (tables.users || []).find(u => u.id === m.resolved_by) : null;
        return {
          ...m,
          pcb_sr_no: panel ? panel.dummy_sr_no : null,
          barcode: panel ? panel.barcode : null,
          part_code: panel ? panel.part_code : null,
          model: panel ? panel.model : null,
          mfg_year: panel ? panel.mfg_year : null,
          action: panel ? panel.status : null,
          last_step_name: stepName,
          last_logged_by_name: user ? user.name : 'Unknown',
          resolved_by_name: resolver ? resolver.name : null
        };
      });
    }

    const queryStr = `
      SELECT m.*, p.dummy_sr_no as pcb_sr_no, p.barcode, p.part_code, p.model, p.mfg_year, p.status as action,
             rs.name as last_step_name, u.name as last_logged_by_name, ru.name as resolved_by_name
      FROM missing_pcbs m
      LEFT JOIN panels p ON m.panel_id = p.id
      LEFT JOIN repair_steps rs ON m.last_step_id = rs.step_no
      LEFT JOIN users u ON m.last_logged_by = u.id
      LEFT JOIN users ru ON m.resolved_by = ru.id
      WHERE m.lot_id = $1 AND m.checkpoint_step = $2
    `;
    const res = await pool.query(queryStr, [lotId, step]);
    return res.rows;
  },

  async clearMissing(lotId, step) {
    if (isFallback()) {
      tables.missing_pcbs = (tables.missing_pcbs || []).filter(
        m => !(m.lot_id === Number(lotId) && m.checkpoint_step === Number(step))
      );
      return;
    }
    await pool.query('DELETE FROM missing_pcbs WHERE lot_id = $1 AND checkpoint_step = $2', [lotId, step]);
  },

  async insertMissing({ lot_id, checkpoint_step, panel_id, last_step_id, last_logged_by, last_logged_at, missing_type }) {
    if (isFallback()) {
      const missingList = tables.missing_pcbs || [];
      const newId = missingList.reduce((max, m) => Math.max(max, m.id || 0), 0) + 1;
      const newMissing = {
        id: newId,
        lot_id: Number(lot_id),
        checkpoint_step: Number(checkpoint_step),
        panel_id: Number(panel_id),
        last_step_id: last_step_id ? Number(last_step_id) : null,
        last_logged_by: last_logged_by ? Number(last_logged_by) : null,
        last_logged_at: last_logged_at ? new Date(last_logged_at) : null,
        missing_type,
        resolution_action: null,
        resolution_note: null,
        resolved_by: null,
        resolved_at: null
      };
      missingList.push(newMissing);
      return newMissing;
    }

    const queryStr = `
      INSERT INTO missing_pcbs (lot_id, checkpoint_step, panel_id, last_step_id, last_logged_by, last_logged_at, missing_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (lot_id, checkpoint_step, panel_id) DO UPDATE
      SET last_step_id = EXCLUDED.last_step_id,
          last_logged_by = EXCLUDED.last_logged_by,
          last_logged_at = EXCLUDED.last_logged_at,
          missing_type = EXCLUDED.missing_type
      RETURNING *
    `;
    const res = await pool.query(queryStr, [
      lot_id,
      checkpoint_step,
      panel_id,
      last_step_id,
      last_logged_by,
      last_logged_at,
      missing_type
    ]);
    return res.rows[0];
  },

  // Checkpoint Acknowledgements
  async getAcknowledgement(lotId, step) {
    if (isFallback()) {
      const ack = (tables.checkpoint_acknowledgements || []).find(
        a => a.lot_id === Number(lotId) && a.checkpoint_step === Number(step)
      );
      if (!ack) return null;
      const user = ack.acknowledged_by ? (tables.users || []).find(u => u.id === ack.acknowledged_by) : null;
      return {
        ...ack,
        acknowledged_by_name: user ? user.name : 'Unknown'
      };
    }

    const queryStr = `
      SELECT ca.*, u.name as acknowledged_by_name
      FROM checkpoint_acknowledgements ca
      LEFT JOIN users u ON ca.acknowledged_by = u.id
      WHERE ca.lot_id = $1 AND ca.checkpoint_step = $2
    `;
    const res = await pool.query(queryStr, [lotId, step]);
    return res.rows[0] || null;
  },

  async acknowledgeCheckpoint(lotId, step, userId) {
    if (isFallback()) {
      const acksList = tables.checkpoint_acknowledgements || [];
      const idx = acksList.findIndex(
        a => a.lot_id === Number(lotId) && a.checkpoint_step === Number(step)
      );
      const ackObj = {
        lot_id: Number(lotId),
        checkpoint_step: Number(step),
        acknowledged_by: Number(userId),
        acknowledged_at: new Date()
      };
      if (idx !== -1) {
        acksList[idx] = { ...acksList[idx], ...ackObj };
      } else {
        ackObj.id = acksList.reduce((max, a) => Math.max(max, a.id || 0), 0) + 1;
        acksList.push(ackObj);
      }
      return ackObj;
    }

    const queryStr = `
      INSERT INTO checkpoint_acknowledgements (lot_id, checkpoint_step, acknowledged_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (lot_id, checkpoint_step) DO UPDATE
      SET acknowledged_by = EXCLUDED.acknowledged_by,
          acknowledged_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const res = await pool.query(queryStr, [lotId, step, userId]);
    return res.rows[0];
  },

  // Resolve Missing PCBs
  async resolveMissingPCB(missingId, action, note, userId) {
    if (isFallback()) {
      const missing = (tables.missing_pcbs || []).find(m => m.id === Number(missingId));
      if (!missing) throw new Error('Missing PCB record not found');
      missing.resolution_action = action;
      missing.resolution_note = note;
      missing.resolved_by = Number(userId);
      missing.resolved_at = new Date();

      if (action === 'Reassigned' && note) {
        const panel = (tables.panels || []).find(p => p.id === missing.panel_id);
        if (panel) {
          panel.lot_id = Number(note); // reassigned to lot id
        }
      }
      return missing;
    }

    const queryStr = `
      UPDATE missing_pcbs
      SET resolution_action = $1,
          resolution_note = $2,
          resolved_by = $3,
          resolved_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;
    const res = await pool.query(queryStr, [action, note, userId, missingId]);
    const updated = res.rows[0];

    if (action === 'Reassigned' && note && updated) {
      await pool.query(
        'UPDATE panels SET lot_id = $1 WHERE id = $2',
        [Number(note), updated.panel_id]
      );
    }
    return updated;
  }
};
