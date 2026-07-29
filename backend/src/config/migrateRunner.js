import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const runMigrations = async () => {
  console.log('Starting sequential migration runner...');
  const client = await pool.connect();
  
  try {
    // 1. Create schema_migrations table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Read migration files
    const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.error(`Migrations directory not found at ${migrationsDir}`);
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Sorts numerically/alphabetically

    console.log(`Found ${files.length} migration files in migrations directory.`);

    // 3. Fetch already executed migrations
    const { rows } = await client.query('SELECT migration_name FROM schema_migrations');
    const appliedMigrations = new Set(rows.map(r => r.migration_name));

    // 4. Run pending migrations in sequence
    for (const file of files) {
      if (appliedMigrations.has(file)) {
        continue;
      }

      console.log(`Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute inside transaction
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (migration_name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Successfully applied migration ${file}.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error applying migration ${file}:`, err);
        throw err;
      }
    }

    console.log('All migrations completed successfully.');
  } catch (err) {
    console.error('Migration runner failed:', err);
    throw err;
  } finally {
    client.release();
  }
};
