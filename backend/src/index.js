import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import datasetsRouter from './routes/datasets.js';
import dashboardRouter from './routes/dashboard.js';
import reconciliationRouter from './routes/reconciliation.js';
import exceptionsRouter from './routes/exceptions.js';
import auditRouter from './routes/audit.js';
import evaluationRouter from './routes/evaluation.js';
import aiRouter from './routes/ai.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');

// CORS
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = ['https://razorpay-buildathon-track-04.vercel.app', 'http://localhost:3000', 'http://localhost:8080'];
    if (CORS_ORIGIN === '*' || allowed.some(a => origin.includes(a))) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all in dev
    }
  },
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

// API Routes
app.use('/api/datasets', datasetsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reconciliation', reconciliationRouter);
app.use('/api/exceptions', exceptionsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/evaluation', evaluationRouter);
app.use('/api/ai', aiRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    gemini: process.env.GEMINI_API_KEY ? 'configured' : 'NOT configured',
    supabase: process.env.SUPABASE_URL ? 'configured' : 'NOT configured',
  });
});

// Frontend static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

app.use(express.static(FRONTEND_DIR, {
  index: 'login.html',
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath);
    if (MIME_TYPES[ext]) {
      res.setHeader('Content-Type', MIME_TYPES[ext]);
    }
  },
}));

// SPA fallback: serve index.html for non-API, non-file routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(FRONTEND_DIR, 'login.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Only start a listening server when this file is run directly
// (e.g. `node backend/src/index.js` for local dev / Render).
// When imported by the Vercel serverless entrypoint (api/index.js),
// we just export the Express app and let the platform handle the socket.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  app.listen(PORT, () => {
    console.log(`ReconAI running on http://localhost:${PORT}`);
  });
}

export default app;
