import app from '../backend/src/app.js';
import { initializeMemoryDb } from '../backend/src/services/memoryDb.js';
import { testDbConnection } from '../backend/src/config/db.js';

try {
  initializeMemoryDb();
  testDbConnection().catch(err => {
    console.warn("Vercel DB connection check failed:", err.message);
  });
} catch (e) {
  console.error("Vercel memoryDb init error:", e);
}

export default app;
