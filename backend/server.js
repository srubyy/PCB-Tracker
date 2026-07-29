import dotenv from 'dotenv';
import app from './src/app.js';
import pool, { testDbConnection, isFallback } from './src/config/db.js';
import * as memoryDb from './src/services/memoryDb.js';

dotenv.config();

const port = process.env.PORT || 3001;

const startServer = async () => {
  // Test connection to local Postgres
  const dbConnected = await testDbConnection();
  
  if (dbConnected && !isFallback()) {
    try {
      const { runMigrations } = await import('./src/config/migrateRunner.js');
      await runMigrations();
    } catch (migErr) {
      console.error('Failed to run migrations on startup:', migErr);
    }
  } else {
    // If PG is unreachable, seed the memory database fallback
    memoryDb.initializeMemoryDb();
  }

  app.listen(port, () => {
    console.log(`Electrolyte Solutions API server listening at http://localhost:${port}`);
  });
};

startServer();
