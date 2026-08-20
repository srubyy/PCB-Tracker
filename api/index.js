import app from '../backend/src/app.js';
import { initializeMemoryDb } from '../backend/src/services/memoryDb.js';
import { testDbConnection } from '../backend/src/config/db.js';

let initialized = false;

async function initServerless() {
  if (initialized) return;
  initialized = true;
  try {
    const connected = await testDbConnection();
    if (!connected) {
      initializeMemoryDb();
    }
  } catch (e) {
    initializeMemoryDb();
  }
}

export default async (req, res) => {
  await initServerless();
  return app(req, res);
};
