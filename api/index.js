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
    try {
      initializeMemoryDb();
    } catch (memErr) {}
  }
}

export default async (req, res) => {
  try {
    await initServerless();
    return app(req, res);
  } catch (err) {
    console.error("Vercel serverless error:", err);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ error: "Serverless execution error", details: String(err?.message || err) });
  }
};
