import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_POSTGRES_URL || process.env.STORAGE_POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
const isLocalhost = !dbUrl || dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

// Automatically activate in-memory fallback if no database connection string or host is defined in Vercel/Production
let useFallback = !dbUrl && (!!process.env.VERCEL || process.env.NODE_ENV === 'production' || !process.env.DB_HOST);

const pool = dbUrl
  ? new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      ssl: isLocalhost ? false : { rejectUnauthorized: false }
    })
  : new Pool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'electrolyte_db',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      ssl: isLocalhost ? false : { rejectUnauthorized: false }
    });

// Handle pool background errors gracefully to prevent crashing process
pool.on('error', (err) => {
  console.warn('⚠️ PostgreSQL pool connection error. Switching to in-memory DB fallback:', err.message);
  useFallback = true;
});

export const isFallback = () => useFallback;
export const setFallback = (val) => {
  useFallback = val;
};

export const testDbConnection = async () => {
  if (!dbUrl && (process.env.VERCEL || !process.env.DB_HOST)) {
    console.warn('⚠️ No PostgreSQL database configuration detected. Using in-memory database fallback.');
    useFallback = true;
    return false;
  }
  try {
    const client = await pool.connect();
    useFallback = false;
    client.release();
    console.log('✅ Connected to PostgreSQL database successfully.');
    return true;
  } catch (err) {
    console.warn('⚠️ PostgreSQL connection failed. Activating in-memory SQL database fallback:', err.message);
    useFallback = true;
    return false;
  }
};

// Parameterized RLS Context Query Runner
export const query = async (text, params = [], userContext = null) => {
  if (useFallback) {
    throw new Error('Database pool running in fallback mode');
  }

  try {
    if (!userContext) {
      return await pool.query(text, params);
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
  } catch (err) {
    console.warn('DB query error, enabling in-memory fallback mode:', err.message);
    useFallback = true;
    throw err;
  }
};

export default pool;
