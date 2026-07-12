import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { connectToMongoDB } from './config/database.js';

import healthRouter   from './routes/health.js';
import historyRouter  from './routes/history.js';
import authRouter     from './routes/auth.js';
import generateRouter from './routes/generate.js';
import coursesRouter  from './routes/courses.js';
import apiKeysRouter  from './routes/apiKeys.js';
import formatsRouter  from './routes/formats.js';
import plannersRouter from './routes/planners.js';
import mcpRouter      from './routes/mcp.js';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ── Database ──────────────────────────────────────────────────────────────────
await connectToMongoDB();
mongoose.connection.on('error', err => console.error('MongoDB runtime error:', err));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/health',   healthRouter);
app.use('/api/history',  historyRouter);
app.use('/api',          authRouter);          // /api/users, /api/login, /api/me
app.use('/api/generate', generateRouter);
app.use('/api/courses',  coursesRouter);
app.use('/api/user',     apiKeysRouter);       // /api/user/api-keys, /api/user/api-key, /api/user/token-usage
app.use('/api/formats',  formatsRouter);
app.use('/api/planner',  plannersRouter);      // /api/planner/parse-excel, /api/planner/generate-week
app.use('/api/planners', plannersRouter);      // /api/planners CRUD
app.use('/api/mcp',      mcpRouter);

// ── Static / Vite ─────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  const distPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*all', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Express error]', err?.message || err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));
