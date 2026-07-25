import pool, { isFallback } from '../config/db.js';
import * as memoryDb from '../services/memoryDb.js';

export const Lot = {
  async findById(id, clientTransaction = null) {
    const db = clientTransaction || pool;
    if (isFallback()) {
      return memoryDb.findLotById(Number(id));
    }
    const res = await db.query('SELECT * FROM lots WHERE id = $1', [id]);
    return res.rows[0] || null;
  },

  async findByLotNo(lotNo, clientTransaction = null) {
    const db = clientTransaction || pool;
    if (isFallback()) {
      return memoryDb.findLotByLotNo(Number(lotNo));
    }
    const res = await db.query('SELECT * FROM lots WHERE lot_no = $1', [lotNo]);
    return res.rows[0] || null;
  },

  async getAll(filters = {}) {
    if (isFallback()) {
      const list = memoryDb.getAllLots(filters);
      return list.sort((a, b) => b.lot_no - a.lot_no);
    }

    let queryText = 'SELECT * FROM lots';
    const params = [];
    const conditions = [];

    if (filters.client_id) {
      params.push(filters.client_id);
      conditions.push(`client_id = $${params.length}`);
    }

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`(CAST(lot_no AS VARCHAR) LIKE $${params.length} OR batch_no ILIKE $${params.length})`);
    }

    if (filters.start_date) {
      params.push(filters.start_date);
      conditions.push(`received_date >= $${params.length}`);
    }

    if (filters.end_date) {
      params.push(filters.end_date);
      conditions.push(`received_date <= $${params.length}`);
    }

    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }

    queryText += ' ORDER BY lot_no DESC';

    const res = await pool.query(queryText, params);
    return res.rows;
  },

  async create(lot, clientTransaction = null) {
    const db = clientTransaction || pool;
    if (isFallback()) {
      return memoryDb.createLot(lot);
    }
    const res = await db.query(
      `INSERT INTO lots (lot_no, batch_no, pixel_pitch, client_id, qty_sent, received_qty, remarks, scrap_year_threshold, separate_year_threshold, checkbox_year_threshold, created_by, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING *`,
      [
        lot.lot_no, 
        lot.batch_no, 
        lot.pixel_pitch, 
        lot.client_id, 
        lot.qty_sent, 
        lot.received_qty, 
        lot.remarks,
        lot.scrap_year_threshold || null,
        lot.separate_year_threshold || null,
        lot.checkbox_year_threshold || null,
        lot.created_by || null,
        lot.status || 'Draft'
      ]
    );
    return res.rows[0];
  },

  async updateRules(id, rules, clientTransaction = null) {
    const db = clientTransaction || pool;
    if (isFallback()) {
      return memoryDb.updateLotRules(Number(id), rules);
    }
    const res = await db.query(
      `UPDATE lots 
       SET scrap_year_threshold = $1, 
           separate_year_threshold = $2, 
           checkbox_year_threshold = $3 
       WHERE id = $4 
       RETURNING *`,
      [rules.scrap_year_threshold, rules.separate_year_threshold, rules.checkbox_year_threshold, id]
    );
    return res.rows[0];
  },

  async updateStatus(id, status, clientTransaction = null) {
    const db = clientTransaction || pool;
    if (isFallback()) {
      return memoryDb.updateLotStatus(Number(id), status);
    }
    const res = await db.query('UPDATE lots SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    return res.rows[0];
  },

  async incrementDispatched(id, qty, clientTransaction = null) {
    const db = clientTransaction || pool;
    if (isFallback()) {
      return memoryDb.incrementLotDispatchedQty(Number(id), Number(qty));
    }
    const res = await db.query(
      'UPDATE lots SET dispatched_qty = dispatched_qty + $1 WHERE id = $2 RETURNING *',
      [qty, id]
    );
    return res.rows[0];
  },

  async incrementReturn(id, qty, clientTransaction = null) {
    const db = clientTransaction || pool;
    if (isFallback()) {
      return memoryDb.incrementLotReturnQty(Number(id), Number(qty));
    }
    const res = await db.query(
      'UPDATE lots SET return_qty = return_qty + $1 WHERE id = $2 RETURNING *',
      [qty, id]
    );
    return res.rows[0];
  },

  async incrementRedispatch(id, qty, clientTransaction = null) {
    const db = clientTransaction || pool;
    if (isFallback()) {
      return memoryDb.incrementLotRedispatchQty(Number(id), Number(qty));
    }
    const res = await db.query(
      'UPDATE lots SET redispatch_qty = redispatch_qty + $1 WHERE id = $2 RETURNING *',
      [qty, id]
    );
    return res.rows[0];
  }
};
