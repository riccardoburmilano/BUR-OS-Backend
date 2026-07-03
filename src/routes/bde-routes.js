// ============================================================
// bde-routes.js — BDE + Treasury + Reputation + BUR User Auth
// ============================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql } = require('../modules/db');

const orchestrator = require('../modules/bde-orchestrator');
const reputation = require('../modules/reputation');
const treasury = require('../modules/treasury');
const bde = require('../modules/bde');
const { requireStaff } = require('../modules/authMiddleware');

const BUR_JWT_SECRET = process.env.JWT_SECRET || 'god-os-jwt-secret-change-in-prod';

// ── Crea tabelle utenti BUR e sponsor ─────────────────────────
async function ensureBurUserTables() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS bur_users (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      )
    `;
    await sql`
      ALTER TABLE bur_devices
      ADD COLUMN IF NOT EXISTS bur_user_id UUID REFERENCES bur_users(id)
    `.catch(() => {});
    await sql`
      CREATE TABLE IF NOT EXISTS bur_sponsors (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        url TEXT NOT NULL,
        keyword_tags TEXT[] DEFAULT '{}',
        priority INTEGER DEFAULT 0,
        active BOOLEAN DEFAULT TRUE,
        monthly_budget_eur FLOAT DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('[BUR Auth] Tabelle bur_users e bur_sponsors pronte');
  } catch (err) {
    console.error('[BUR Auth] Errore tabelle:', err.message);
  }
}
ensureBurUserTables();

// ── MIDDLEWARE: verifica fingerprint ─────────────────────────
function requireFingerprint(req, res, next) {
  const fp = req.headers['x-device-fingerprint'] || req.body?.fingerprint;
  if (!fp || fp.length < 16) return res.status(400).json({ error: 'fingerprint dispositivo mancante' });
  req.fingerprint = fp;
  next();
}

// ============================================================
// BUR USER AUTH
// ============================================================

// POST /bde/user/register
router.post('/bde/user/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email e password obbligatori' });
    if (password.length < 6) return res.status(400).json({ error: 'Password minimo 6 caratteri' });
    if (!email.includes('@')) return res.status(400).json({ error: 'Email non valida' });

    const hash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO bur_users (email, password_hash, display_name)
      VALUES (${email.toLowerCase().trim()}, ${hash}, ${displayName || email.split('@')[0]})
      RETURNING id, email, display_name, created_at
    `;
    const user = rows[0];
    const token = jwt.sign({ bur_user_id: user.id, email: user.email }, BUR_JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ success: true, token, user: {
      id: user.id, email: user.email,
      displayName: user.display_name, createdAt: user.created_at
    }});
  } catch (err) {
    if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
      return res.status(409).json({ error: 'Email già registrata' });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /bde/user/login
router.post('/bde/user/login', async (req, res) => {
  try {
    const { email, password, fingerprint } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email e password obbligatori' });

    const rows = await sql`SELECT * FROM bur_users WHERE email = ${email.toLowerCase().trim()} LIMIT 1`;
    if (!rows[0]) return res.status(401).json({ error: 'Credenziali non valide' });

    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenziali non valide' });

    await sql`UPDATE bur_users SET last_login = NOW() WHERE id = ${rows[0].id}`;

    if (fingerprint && fingerprint.length >= 16) {
      await sql`
        UPDATE bur_devices SET bur_user_id = ${rows[0].id}
        WHERE device_fingerprint = ${fingerprint}
      `.catch(() => {});
    }

    const statsRows = await sql`
      SELECT
        COALESCE(SUM(bur_credits_earned), 0) as total_credits,
        COALESCE(MAX(reputation_score), 0) as best_score,
        COALESCE(MAX(level), 0) as best_level,
        COUNT(id) as total_devices
      FROM bur_devices WHERE bur_user_id = ${rows[0].id}
    `;

    const token = jwt.sign({ bur_user_id: rows[0].id, email: rows[0].email }, BUR_JWT_SECRET, { expiresIn: '30d' });

    res.json({ success: true, token, user: {
      id: rows[0].id, email: rows[0].email,
      displayName: rows[0].display_name, stats: statsRows[0]
    }});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /bde/user/profile
router.get('/bde/user/profile', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token mancante' });

    let payload;
    try { payload = jwt.verify(auth.slice(7), BUR_JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Token scaduto — effettua di nuovo il login' }); }

    const userRows = await sql`
      SELECT id, email, display_name, created_at, last_login
      FROM bur_users WHERE id = ${payload.bur_user_id} LIMIT 1
    `;
    if (!userRows[0]) return res.status(404).json({ error: 'Utente non trovato' });

    const statsRows = await sql`
      SELECT
        COALESCE(SUM(bur_credits_earned), 0) as total_credits,
        COALESCE(MAX(reputation_score), 0) as best_score,
        COALESCE(MAX(level), 0) as best_level,
        COUNT(id) as total_devices
      FROM bur_devices WHERE bur_user_id = ${payload.bur_user_id}
    `;

    const earningsRows = await sql`
      SELECT e.module, COUNT(*) as events, SUM(e.value_eur) as total_eur, SUM(e.bur_credits) as total_credits
      FROM bde_events e
      JOIN bur_devices d ON d.device_fingerprint = e.device_fingerprint
      WHERE d.bur_user_id = ${payload.bur_user_id}
      GROUP BY e.module
    `;

    res.json({
      user: {
        id: userRows[0].id, email: userRows[0].email,
        displayName: userRows[0].display_name,
        createdAt: userRows[0].created_at, lastLogin: userRows[0].last_login
      },
      stats: statsRows[0],
      earnings: earningsRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// BDE CORE ROUTES
// ============================================================

// POST /bde/register
router.post('/bde/register', requireFingerprint, async (req, res) => {
  try {
    const { userId, clinicId } = req.body;
    await reputation.registerDevice(req.fingerprint, userId, clinicId);
    const stats = await reputation.getDeviceStats(req.fingerprint);
    res.json({ success: true, device: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /bde/event
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

// GET /bde/network
router.get('/bde/network', async (req, res) => {
  try {
    const stats = await orchestrator.getSystemStatus();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /bde/search?keyword=bicicletta
router.get('/bde/search', requireFingerprint, async (req, res) => {
  try {
    const keyword = (req.query.keyword || '').toLowerCase().trim();
    if (!keyword) return res.json({ results: [], creditsEarned: 0 });

    const routingResult = await orchestrator.processPipeline(
      req.fingerprint, 'routing',
      { packetId: 'search-' + Date.now(), latencyMs: 35 }
    );

    let sponsors = [];
    try {
      sponsors = await sql`
        SELECT name, description, url, keyword_tags
        FROM bur_sponsors
        WHERE active = TRUE
          AND (keyword_tags && ARRAY[${keyword}]::text[]
            OR name ILIKE ${'%' + keyword + '%'}
            OR description ILIKE ${'%' + keyword + '%'})
        ORDER BY priority DESC LIMIT 3
      `;
    } catch { sponsors = []; }

    res.json({
      keyword, results: sponsors,
      creditsEarned: routingResult?.burCredits || 0,
      sponsored: sponsors.length > 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /bde/treasury (staff only)
router.get('/bde/treasury', requireStaff, async (req, res) => {
  try {
    const status = await treasury.getTreasuryStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /bde/ai-buffer (staff only)
router.get('/bde/ai-buffer', requireStaff, async (req, res) => {
  try {
    const buffer = orchestrator.getAiBuffer();
    res.json({
      credits: buffer.credits, eur: buffer.eur,
      canSupportRequests: Math.floor(buffer.credits / 0.5),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /bde/levels
router.get('/bde/levels', (req, res) => {
  res.json({
    levels: reputation.BDE_LEVELS,
    rates: bde.BDE_RATES,
    config: {
      recyclingInterval: '2 ore', decayRate: '2%/giorno',
      treasuryMargin: '33%', split: '67% utenti / 20% treasury / 13% platform',
    },
  });
});

// POST /bde/treasury/recycle (staff only)
router.post('/bde/treasury/recycle', requireStaff, async (req, res) => {
  try {
    const result = await treasury.runRecyclingCycle();
    res.json({ success: true, cycle: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
