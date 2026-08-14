import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const isLocalhost = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocalhost ? false : { rejectUnauthorized: false }
    })
  : new Pool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'electrolyte_db',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      ssl: isLocalhost ? false : { rejectUnauthorized: false }
    });

let useFallback = false;

export const isFallback = () => useFallback;
export const setFallback = (val) => {
  useFallback = val;
};

export const testDbConnection = async () => {
  try {
    const client = await pool.connect();
    useFallback = false;
    client.release();
    console.log('✅ Connected to local PostgreSQL database successfully.');
    return true;
  } catch (err) {
    console.warn('⚠️ PostgreSQL connection failed. Activating in-memory SQL database fallback.');
    useFallback = true;
    return false;
  }
};

// Parameterized RLS Context Query Runner
export const query = async (text, params = [], userContext = null) => {
  if (!userContext) {
    return pool.query(text, params);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Set RLS variables securely via parameterized queries
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [String(userContext.id || '')]);
    await client.query(`SELECT set_config('app.current_user_role', $1, true)`, [String(userContext.role || '')]);
    
    const res = await client.query(text, params);
    await client.query('COMMIT');
    return res;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default pool;
