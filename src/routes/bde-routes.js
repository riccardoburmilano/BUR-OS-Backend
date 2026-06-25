// ============================================================
// bde-routes.js — API Routes per BDE + Treasury + Reputation
// Aggiungere in src/routes/auth.js o come router separato
// ============================================================

const express = require('express');
const router = express.Router();
const orchestrator = require('../modules/bde-orchestrator');
const reputation = require('../modules/reputation');
const treasury = require('../modules/treasury');
const bde = require('../modules/bde');
const { requireStaff } = require('../modules/authMiddleware');

// ── MIDDLEWARE: verifica fingerprint ─────────────────────────
function requireFingerprint(req, res, next) {
  const fp = req.headers['x-device-fingerprint'] || req.body?.fingerprint;
  if (!fp || fp.length < 16) return res.status(400).json({ error: 'fingerprint dispositivo mancante' });
  req.fingerprint = fp;
  next();
}

// ── REGISTRA DEVICE ──────────────────────────────────────────
// POST /bde/register
router.post('/bde/register', requireFingerprint, async (req, res) => {
  try {
    const { userId, clinicId } = req.body;
    const device = await reputation.registerDevice(req.fingerprint, userId, clinicId);
    const stats = await reputation.getDeviceStats(req.fingerprint);
    res.json({ success: true, device: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PIPELINE EVENTO BDE ───────────────────────────────────────
// POST /bde/event
// Body: { module: 'storage'|'routing'|'federated'|'uptime', ...eventData }
router.post('/bde/event', requireFingerprint, async (req, res) => {
  try {
    const { module, ...eventData } = req.body;
    if (!module) return res.status(400).json({ error: 'module obbligatorio' });

    const result = await orchestrator.processPipeline(req.fingerprint, module, eventData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STATS DEVICE ──────────────────────────────────────────────
// GET /bde/device/stats
router.get('/bde/device/stats', requireFingerprint, async (req, res) => {
  try {
    const stats = await bde.getDeviceBdeStats(req.fingerprint);
    if (!stats) return res.status(404).json({ error: 'device non trovato' });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NETWORK STATS (pubblico) ──────────────────────────────────
// GET /bde/network
router.get('/bde/network', async (req, res) => {
  try {
    const stats = await orchestrator.getSystemStatus();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TREASURY STATUS (staff only) ─────────────────────────────
// GET /bde/treasury
router.get('/bde/treasury', requireStaff, async (req, res) => {
  try {
    const status = await treasury.getTreasuryStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI BUFFER STATUS ──────────────────────────────────────────
// GET /bde/ai-buffer
router.get('/bde/ai-buffer', requireStaff, async (req, res) => {
  try {
    const buffer = orchestrator.getAiBuffer();
    res.json({
      credits: buffer.credits,
      eur: buffer.eur,
      canSupportRequests: Math.floor(buffer.credits / 0.5), // ~0.5 credit per richiesta NOVA
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LIVELLI BDE ───────────────────────────────────────────────
// GET /bde/levels
router.get('/bde/levels', (req, res) => {
  res.json({
    levels: reputation.BDE_LEVELS,
    rates: bde.BDE_RATES,
    config: {
      recyclingInterval: '2 ore',
      decayRate: '2%/giorno',
      treasuryMargin: '33%',
      split: '67% utenti / 20% treasury / 13% platform',
    },
  });
});

// ── FORCE RECYCLING (admin) ───────────────────────────────────
// POST /bde/treasury/recycle
router.post('/bde/treasury/recycle', requireStaff, async (req, res) => {
  try {
    const result = await treasury.runRecyclingCycle();
    res.json({ success: true, cycle: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
