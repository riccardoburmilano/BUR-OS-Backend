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
const authRoutes = require('./routes/auth');
const bdeRoutes = require('./routes/bde-routes');
const modoNewsRoutes = require('./routes/modo-news');

const PORT = parseInt(process.env.PORT) || 3000;
const BUR_VERSION = process.env.GOD_VERSION || '2.0.0';
const app = express();

// ── CORS ─────────────────────────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-fingerprint']
}));

// ── Body parsing — DEVE stare PRIMA delle route ───────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logger ────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/v2', apiRoutes);
app.use('/api/v2/operantis', authRoutes);
app.use('/api/v2/operantis', bdeRoutes);
app.use('/api/v2/modo', modoNewsRoutes);

// ── Root ─────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const s = stateRead();
  res.json({
    name: 'BUR OS Backend',
    version: BUR_VERSION,
    status: s.system?.status || 'IDLE',
    mode: s.system?.mode || 'NORMAL',
    daemon: daemon.isRunning() ? 'RUNNING' : 'STOPPED',
    uptime: s.metrics?.uptime_start,
    modules: ['operantis', 'bde', 'treasury', 'reputation', 'nova', 'modo-news']
  });
});

// ── Health ───────────────────────────────────────────────────
app.get('/api/v2/health', (req, res) => {
  res.json({ status: 'ok', version: BUR_VERSION, ts: new Date().toISOString() });
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

  if (process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY) {
    daemon.start();
    console.log('[BUR OS] VALUE_DAEMON avviato');
  } else {
    console.warn('[BUR OS] API KEY mancante — daemon non avviato');
  }

  console.log('[BUR OS] BDE Economy Engine attivo');
  console.log('[BUR OS] MODO News Aggregator attivo');
});

process.on('SIGTERM', () => { daemon.stop(); process.exit(0); });
process.on('SIGINT', () => { daemon.stop(); process.exit(0); });

module.exports = app;
