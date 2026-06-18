// ============================================================
// BUR OS — Backend Runtime
// Binary Unified Runtime — Node.js + Express
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { stateRead, stateWrite, logWrite, now } = require('./modules/state');
const daemon = require('./daemon/valueDaemon');
const apiRoutes = require('./routes/api');

const PORT = parseInt(process.env.PORT) || 3000;
const BUR_VERSION = process.env.GOD_VERSION || '2.0.0';

const app = express();

// ── CORS ─────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://operantis.pages.dev',
    'https://peaceful-crepe-4757e9.netlify.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
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
    name: 'BUR OS Backend',
    version: BUR_VERSION,
    status: s.system?.status || 'IDLE',
    mode: s.system?.mode || 'NORMAL',
    daemon: daemon.isRunning() ? 'RUNNING' : 'STOPPED',
    uptime: s.metrics?.uptime_start
  });
});

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[BUR OS ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Boot ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[BUR OS] v${BUR_VERSION} — porta ${PORT}`);
  stateWrite('SYSTEM', { system: { status: 'IDLE', mode: 'NORMAL' } });
  logWrite('SYSTEM', 'boot', { version: BUR_VERSION }, { port: PORT }, 'SUCCESS');

  if (process.env.GROQ_API_KEY) {
    daemon.start();
    console.log('[BUR OS] VALUE_DAEMON avviato');
  } else {
    console.warn('[BUR OS] GROQ_API_KEY mancante — daemon non avviato');
  }
});

process.on('SIGTERM', () => { daemon.stop(); process.exit(0); });
process.on('SIGINT', () => { daemon.stop(); process.exit(0); });

module.exports = app;
