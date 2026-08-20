import app from '../backend/src/app.js';
import { initializeMemoryDb } from '../backend/src/services/memoryDb.js';

// Initialize memory DB for Vercel serverless environment
try {
  initializeMemoryDb();
} catch (e) {
  console.error("Vercel memoryDb init error:", e);
}

export default app;
