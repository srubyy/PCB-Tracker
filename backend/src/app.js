import express from 'express';
import cors from 'cors';
import apiRouter from './routes/index.js';

const app = express();

app.use(cors());
app.use(express.json());

// Log HTTP requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Mount unified routing under both /api prefix and root / for serverless compatibility
app.use('/api', apiRouter);
app.use('/', apiRouter);

export default app;
