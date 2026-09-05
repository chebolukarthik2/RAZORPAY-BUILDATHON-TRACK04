import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import datasetsRouter from './routes/datasets.js';
import dashboardRouter from './routes/dashboard.js';
import reconciliationRouter from './routes/reconciliation.js';
import exceptionsRouter from './routes/exceptions.js';
import auditRouter from './routes/audit.js';
import evaluationRouter from './routes/evaluation.js';
import aiRouter from './routes/ai.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:8080';

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.method !== 'OPTIONS') {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Routes
app.use('/api/datasets', datasetsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reconciliation', reconciliationRouter);
app.use('/api/exceptions', exceptionsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/evaluation', evaluationRouter);
app.use('/api/ai', aiRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`ReconAI Backend running on http://localhost:${PORT}`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
});

export default app;
