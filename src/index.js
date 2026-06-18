// ============================================================
// GOD CORE v2.0 — Backend Runtime
// General Operative Director — Node.js + Express
// Deploy target: Railway / Render
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { stateRead, stateWrite, logWrite, now } = require('./modules/state');
const daemon = require('./daemon/valueDaemon');
const apiRoutes = require('./routes/api');

const PORT = parseInt(process.env.PORT) || 3000;
const GOD_VERSION = process.env.GOD_VERSION || '2.0.0';

const app = express();

// ── CORS ─────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: ['https://operantis.pages.dev', 'https://peaceful-crepe-4757e9.netlify.app', 'http://localhost:5173'],
  credentials: true
}));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logger ────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/v2', apiRoutes);

const authRoutes = require('./routes/auth');
app.use('/api/v2/operantis', authRoutes);

// ── Root ─────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const s = stateRead();
  res.json({
    name: 'GOD Core Backend',
    version: GOD_VERSION,
    status: s.system?.status || 'IDLE',
    mode: s.system?.mode || 'NORMAL',
    daemon: daemon.isRunning() ? 'RUNNING' : 'STOPPED',
    uptime: s.metrics?.uptime_start,
    endpoints: [
      'GET  /api/v2/health',
      'GET  /api/v2/state',
      'GET  /api/v2/tasks',
      'POST /api/v2/tasks',
      'POST /api/v2/tasks/:id/run',
      'GET  /api/v2/scores',
      'GET  /api/v2/credits',
      'POST /api/v2/credits/topup',
      'GET  /api/v2/diagnoses',
      'GET  /api/v2/memory',
      'GET  /api/v2/verdicts',
      'GET  /api/v2/routes',
      'POST /api/v2/pipeline/auto',
      'GET  /api/v2/daemon/status',
      'POST /api/v2/daemon/start',
      'POST /api/v2/daemon/stop',
      'POST /api/v2/daemon/tick',
      'GET  /api/v2/apps',
      'POST /api/v2/system/reset',
      'POST /api/v2/system/mode',
    ]
  });
});

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[GOD ERROR]', err.message);
  logWrite('SYSTEM', 'http_error', { path: req.path }, { error: err.message }, 'ERROR');
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Boot ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║     GOD CORE v${GOD_VERSION} — BACKEND RUNTIME         ║
║     General Operative Director                   ║
╠══════════════════════════════════════════════════╣
║  Port:    ${PORT}                                  ║
║  Model:   ${(process.env.GOD_MODEL || 'claude-sonnet-4-20250514').slice(0,30)}  ║
║  Daemon:  AUTO-START                             ║
║ ║  API Key: ${process.env.GROQ_API_KEY ? '✓ CONFIGURED' : '✗ MISSING — set GROQ_API_KEY'}  ║
╚══════════════════════════════════════════════════╝
  `);

  // Auto-start VALUE_DAEMON
  stateWrite('SYSTEM', { system: { status: 'IDLE', mode: 'NORMAL' } });
  logWrite('SYSTEM', 'boot', { version: GOD_VERSION }, { port: PORT }, 'SUCCESS');

  if (process.env.GROQ_API_KEY) {
    daemon.start();
    console.log('[GOD] VALUE_DAEMON avviato automaticamente');
  } else {
    console.warn('[GOD] ⚠ GROQ_API_KEY mancante — VALUE_DAEMON non avviato');
  }
});

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[GOD] SIGTERM ricevuto — shutdown graceful');
  daemon.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[GOD] SIGINT ricevuto — shutdown graceful');
  daemon.stop();
  process.exit(0);
});

module.exports = app;
