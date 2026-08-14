import pool, { isFallback, query } from '../config/db.js';
import * as memoryDb from '../services/memoryDb.js';

export const Panel = {
  async countForLot(lotId, criteria = {}) {
    if (isFallback()) {
      return memoryDb.countPanelsForLot(lotId, criteria);
    }
    
    let sql = 'SELECT COUNT(*) FROM panels WHERE lot_id = $1';
    const params = [lotId];
    
    if (criteria.current_step !== undefined) {
      params.push(criteria.current_step);
      sql += ` AND current_step = $${params.length}`;
    }
    if (criteria.status !== undefined) {
      params.push(criteria.status);
      sql += ` AND status = $${params.length}`;
    }
    if (criteria.notStatus !== undefined) {
      params.push(criteria.notStatus);
      sql += ` AND status != $${params.length}`;
    }
    
    const res = await pool.query(sql, params);
    return parseInt(res.rows[0].count);
  },

  async countAtStep(stepNo, lotNo = null) {
    if (isFallback()) {
      let panels = memoryDb.tables.panels || [];
      if (lotNo) {
        const lot = (memoryDb.tables.lots || []).find(l => l.lot_no === Number(lotNo) || l.id === Number(lotNo));
        const lotId = lot ? lot.id : Number(lotNo);
        panels = panels.filter(p => p.lot_id === lotId || p.lot_id === Number(lotNo));
      }
      return panels.filter(p => p.current_step === Number(stepNo) && p.status !== 'Scrap').length;
    }
    
    let sql = "SELECT COUNT(*) FROM panels WHERE current_step = $1 AND status != 'Scrap'";
    const params = [stepNo];
    
    if (lotNo) {
      params.push(lotNo);
      sql += ` AND lot_id = (SELECT id FROM lots WHERE lot_no = $${params.length})`;
    }
    
    const res = await pool.query(sql, params);
    return parseInt(res.rows[0].count);
  },

  async getAll(filters = {}, userContext = null) {
    if (isFallback()) {
      return memoryDb.getAllPanels(filters);
    }
    
    let sql = `
      SELECT p.*, l.lot_no, l.batch_no, l.pixel_pitch, e.name as engineer_name 
      FROM panels p
      JOIN lots l ON p.lot_id = l.id
      LEFT JOIN users e ON p.assigned_engineer_id = e.id
    `;
    const params = [];
    const conditions = [];
    
    if (filters.step_no !== undefined) {
      params.push(filters.step_no);
      conditions.push(`p.current_step = $${params.length}`);
    }
    if (filters.lot_id !== undefined) {
      params.push(filters.lot_id);
      conditions.push(`p.lot_id = $${params.length}`);
    }
    if (filters.notStatus !== undefined) {
      params.push(filters.notStatus);
      conditions.push(`p.status != $${params.length}`);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY l.lot_no ASC, p.sr_no ASC';
    
    const res = await query(sql, params, userContext);
    return res.rows;
  },

  async getLogs(panelId, userContext = null) {
    if (isFallback()) {
      return memoryDb.getPanelLogs(Number(panelId));
    }
    
    const sql = `
      SELECT a.*, s.name as step_name, e.name as engineer_name 
      FROM panel_logs a
      JOIN repair_steps s ON a.step_id = s.id
      LEFT JOIN users e ON a.engineer_id = e.id
      WHERE a.panel_id = $1
      ORDER BY a.id DESC
    `;
    
    const res = await query(sql, [panelId], userContext);
    return res.rows;
  },

  async getAllLogs(userContext = null) {
    if (isFallback()) {
      return memoryDb.getAllPanelLogs();
    }
    
    const sql = `
      SELECT pl.*, u.name as engineer_name 
      FROM panel_logs pl
      LEFT JOIN users u ON pl.engineer_id = u.id
    `;
    
    const res = await query(sql, [], userContext);
    return res.rows;
  },

  async findByBarcode(barcode) {
    if (isFallback()) {
      return memoryDb.findPanelByBarcode(barcode);
    }
    const res = await pool.query('SELECT * FROM panels WHERE barcode = $1', [barcode.trim()]);
    return res.rows[0] || null;
  },

  async findByLotAndSrNo(lotId, srNo) {
    if (isFallback()) {
      return memoryDb.findPanelByLotAndSrNo(Number(lotId), Number(srNo));
    }
    const res = await pool.query('SELECT * FROM panels WHERE lot_id = $1 AND sr_no = $2', [lotId, srNo]);
    return res.rows[0] || null;
  },

  async create(panel, clientTransaction = null) {
    const db = clientTransaction || pool;
    if (isFallback()) {
      return memoryDb.createPanel(panel);
    }
    const res = await db.query(
      `INSERT INTO panels (lot_id, sr_no, side, barcode, status, current_step, assigned_engineer_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [panel.lot_id, panel.sr_no, panel.side, panel.barcode, panel.status || 'Repairable', panel.current_step || 1, panel.assigned_engineer_id || null]
    );
    return res.rows[0];
  },

  async createLog(log, clientTransaction = null) {
    const db = clientTransaction || pool;
    if (isFallback()) {
      return memoryDb.createPanelLog(log);
    }
    
    let stepQuery = log.step_id 
      ? '$2' 
      : '(SELECT id FROM repair_steps WHERE step_no = $2)';
    
    const stepVal = log.step_id || log.step_no || 1;
    
    const res = await db.query(
      `INSERT INTO panel_logs (panel_id, step_id, engineer_id, status, remark) 
       VALUES ($1, ${stepQuery}, $3, $4, $5) 
       RETURNING *`,
      [log.panel_id, stepVal, log.engineer_id, log.status, log.remark]
    );
    return res.rows[0];
  },

  async findById(id) {
    if (isFallback()) {
      return memoryDb.findPanelById(Number(id));
    }
    const res = await pool.query('SELECT * FROM panels WHERE id = $1', [id]);
    return res.rows[0] || null;
  },

  async update(id, status, currentStep, assignedEngineerId) {
    if (isFallback()) {
      return memoryDb.updatePanel(Number(id), status, Number(currentStep), assignedEngineerId ? Number(assignedEngineerId) : null);
    }
    const res = await pool.query(
      `UPDATE panels 
       SET status = $1, current_step = $2, assigned_engineer_id = $3, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4 
       RETURNING *`,
      [status, currentStep, assignedEngineerId, id]
    );
    return res.rows[0];
  },

  async updatePanelFields(id, fields) {
    if (isFallback()) {
      return memoryDb.updatePanelFields(Number(id), fields);
    }

    const setClauses = [];
    const params = [];

    Object.keys(fields).forEach((key) => {
      params.push(fields[key]);
      setClauses.push(`${key} = $${params.length}`);
    });

    if (setClauses.length === 0) return null;

    params.push(id);
    const sql = `UPDATE panels SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length} RETURNING *`;
    const res = await pool.query(sql, params);
    return res.rows[0];
  },

  async delete(id) {
    if (isFallback()) {
      return memoryDb.deletePanel(Number(id));
    }
    const res = await pool.query('DELETE FROM panels WHERE id = $1 RETURNING *', [id]);
    return res.rows[0];
  },

  async getDailyActivityTrend(userContext = null) {
    if (isFallback()) {
      return memoryDb.getDailyActivityTrend();
    }
    const sql = `
      SELECT 
        TO_CHAR(pl.timestamp, 'YYYY-MM-DD') as date,
        s.name as step_name,
        COUNT(*)::integer as count
      FROM panel_logs pl
      JOIN repair_steps s ON pl.step_id = s.id
      GROUP BY TO_CHAR(pl.timestamp, 'YYYY-MM-DD'), s.name
      ORDER BY date DESC, count DESC
      LIMIT 30
    `;
    const res = await query(sql, [], userContext);
    return res.rows;
  }
};
