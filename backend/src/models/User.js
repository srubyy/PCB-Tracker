import pool, { isFallback } from '../config/db.js';
import * as memoryDb from '../services/memoryDb.js';
import { formatUser } from '../utils/avatar.js';

export const User = {
  async findByEmail(email) {
    if (isFallback()) {
      return formatUser(memoryDb.findUserByEmail(email));
    }
    try {
      const res = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = TRUE', [email.trim().toLowerCase()]);
      if (res.rows[0]) return formatUser(res.rows[0]);
    } catch (err) {
      console.warn('DB findByEmail error, falling back:', err.message);
    }
    return formatUser(memoryDb.findUserByEmail(email));
  },

  async findByIdAndRefreshToken(id, token) {
    if (isFallback()) {
      return formatUser(memoryDb.findUserByIdAndRefreshToken(Number(id), token));
    }
    try {
      const res = await pool.query('SELECT * FROM users WHERE id = $1 AND refresh_token = $2 AND is_active = TRUE', [id, token]);
      if (res.rows[0]) return formatUser(res.rows[0]);
    } catch (err) {
      console.warn('DB findByIdAndRefreshToken error, falling back:', err.message);
    }
    return formatUser(memoryDb.findUserByIdAndRefreshToken(Number(id), token));
  },

  async updateRefreshToken(id, token) {
    if (isFallback()) {
      return memoryDb.updateUserRefreshToken(Number(id), token);
    }
    try {
      await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [token, id]);
      return true;
    } catch (err) {
      console.warn('DB updateRefreshToken error, falling back:', err.message);
    }
    return memoryDb.updateUserRefreshToken(Number(id), token);
  },

  async clearRefreshToken(id) {
    if (isFallback()) {
      return memoryDb.updateUserRefreshToken(Number(id), null);
    }
    await pool.query('UPDATE users SET refresh_token = NULL WHERE id = $1', [id]);
    return true;
  },

  async getEmployees() {
    if (isFallback()) {
      const list = memoryDb.getEmployees().map(formatUser);
      return list.sort((a, b) => a.name.localeCompare(b.name));
    }
    const res = await pool.query("SELECT id, name, role, attendance_rate, avatar FROM users WHERE role = 'Employee' ORDER BY name ASC");
    return res.rows.map(formatUser);
  },

  async getAll() {
    if (isFallback()) {
      return memoryDb.getAllUsers().map(formatUser);
    }
    const res = await pool.query("SELECT id, name, email, role, attendance_rate, avatar, is_active FROM users ORDER BY id ASC");
    return res.rows.map(formatUser);
  },

  async create(user) {
    if (isFallback()) {
      return formatUser(memoryDb.createUser(user));
    }
    const res = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, attendance_rate, avatar) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, name, email, role, attendance_rate, avatar, is_active`,
      [user.name, user.email, user.password_hash, user.role, user.attendance_rate, user.avatar]
    );
    return formatUser(res.rows[0]);
  },

  async toggleStatus(id) {
    if (isFallback()) {
      return formatUser(memoryDb.toggleUserStatus(Number(id)));
    }
    const checkRes = await pool.query('SELECT is_active FROM users WHERE id = $1', [id]);
    if (checkRes.rowCount === 0) return null;
    
    const newStatus = checkRes.rows[0].is_active ? false : true;
    const res = await pool.query('UPDATE users SET is_active = $1 WHERE id = $2 RETURNING *', [newStatus, id]);
    return formatUser(res.rows[0]);
  }
};
