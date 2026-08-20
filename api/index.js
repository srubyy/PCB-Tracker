import app from '../backend/src/app.js';
import { initializeMemoryDb } from '../backend/src/services/memoryDb.js';

// Auto-initialize memory DB fallback for Vercel environment
try {
  initializeMemoryDb();
} catch (e) {
  console.error("Vercel memoryDb init error:", e);
}

export default (req, res) => {
  return app(req, res);
};
