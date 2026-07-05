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
// ============================================================
// GAP 1 — REVENUE INJECTION (Amazon/Awin → Treasury)
// POST /bde/treasury/inject-revenue
// Chiamato da admin quando arriva bonifico esterno
// ============================================================
router.post('/bde/treasury/inject-revenue', requireStaff, async (req, res) => {
  try {
    const { amount_eur, source, period, proof } = req.body;

    if (!amount_eur || amount_eur <= 0) return res.status(400).json({ error: 'amount_eur obbligatorio e > 0' });
    if (!source) return res.status(400).json({ error: 'source obbligatorio (es: amazon_associates, awin)' });
    if (!period) return res.status(400).json({ error: 'period obbligatorio (es: 2026-07)' });

    // Split 60/20/20
    const toUsers     = parseFloat((amount_eur * 0.60).toFixed(4));
    const toTreasury  = parseFloat((amount_eur * 0.20).toFixed(4));
    const toPlatform  = parseFloat((amount_eur * 0.20).toFixed(4));
    const burCredits  = parseFloat((amount_eur * 100).toFixed(2)); // 1€ = 100 BUR Credits

    // Device attivi nel periodo per distribuzione pro-quota
    const activeDevices = await sql`
      SELECT device_fingerprint, reputation_score, bur_user_id
      FROM bur_devices
      WHERE last_seen >= NOW() - INTERVAL '30 days'
        AND suspended = FALSE
      ORDER BY reputation_score DESC
    `;

    if (activeDevices.length === 0) {
      return res.status(400).json({ error: 'Nessun device attivo nel periodo — impossibile distribuire' });
    }

    // Distribuzione pro-quota basata su reputation_score
    const totalScore = activeDevices.reduce((s, d) => s + parseFloat(d.reputation_score || 1), 0);
    const distributions = activeDevices.map(d => ({
      fingerprint: d.device_fingerprint,
      user_id: d.bur_user_id,
      score: parseFloat(d.reputation_score || 1),
      quota: parseFloat(d.reputation_score || 1) / totalScore,
      eur_share: parseFloat(((parseFloat(d.reputation_score || 1) / totalScore) * toUsers).toFixed(6)),
      credits_share: parseFloat(((parseFloat(d.reputation_score || 1) / totalScore) * burCredits * 0.60).toFixed(4))
    }));

    // Aggiorna treasury
    await sql`
      UPDATE bur_treasury
      SET balance_eur = balance_eur + ${toTreasury},
          total_distributed = total_distributed + ${toUsers},
          total_generated = total_generated + ${amount_eur}
      WHERE id = (SELECT id FROM bur_treasury LIMIT 1)
    `;

    // Aggiorna BUR Credits per ogni device proporzionalmente
    for (const d of distributions) {
      if (d.credits_share > 0) {
        await sql`
          UPDATE bur_devices
          SET bur_credits_earned = bur_credits_earned + ${d.credits_share}
          WHERE device_fingerprint = ${d.fingerprint}
        `.catch(() => {});
      }
    }

    // Registra nel ledger
    await sql`
      INSERT INTO bur_revenue_ledger (
        source, period, amount_eur, to_users_eur,
        to_treasury_eur, to_platform_eur, bur_credits_issued,
        devices_rewarded, proof, injected_at
      ) VALUES (
        ${source}, ${period}, ${amount_eur}, ${toUsers},
        ${toTreasury}, ${toPlatform}, ${burCredits},
        ${activeDevices.length}, ${proof || null}, NOW()
      )
    `.catch(async () => {
      // Crea tabella se non esiste
      await sql`
        CREATE TABLE IF NOT EXISTS bur_revenue_ledger (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          source TEXT NOT NULL,
          period TEXT NOT NULL,
          amount_eur FLOAT NOT NULL,
          to_users_eur FLOAT,
          to_treasury_eur FLOAT,
          to_platform_eur FLOAT,
          bur_credits_issued FLOAT,
          devices_rewarded INTEGER,
          proof TEXT,
          injected_at TIMESTAMP DEFAULT NOW()
        )
      `;
      await sql`
        INSERT INTO bur_revenue_ledger (
          source, period, amount_eur, to_users_eur,
          to_treasury_eur, to_platform_eur, bur_credits_issued,
          devices_rewarded, proof, injected_at
        ) VALUES (
          ${source}, ${period}, ${amount_eur}, ${toUsers},
          ${toTreasury}, ${toPlatform}, ${burCredits},
          ${activeDevices.length}, ${proof || null}, NOW()
        )
      `;
    });

    res.json({
      success: true,
      injection: {
        source,
        period,
        amount_eur,
        split: { to_users: toUsers, to_treasury: toTreasury, to_platform: toPlatform },
        bur_credits_issued: burCredits,
        devices_rewarded: activeDevices.length,
        avg_per_device_eur: parseFloat((toUsers / activeDevices.length).toFixed(6)),
        avg_per_device_credits: parseFloat((burCredits * 0.60 / activeDevices.length).toFixed(4))
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WISE CSV IMPORT (semi-automatico) ─────────────────────────
// POST /bde/treasury/import-wise-csv
// Body: { csv_text: "...", source: "amazon_associates" }
router.post('/bde/treasury/import-wise-csv', requireStaff, async (req, res) => {
  try {
    const { csv_text, source } = req.body;
    if (!csv_text) return res.status(400).json({ error: 'csv_text obbligatorio' });

    // Parse CSV Wise — formato: Date,Amount,Currency,Description
    const lines = csv_text.split('\n').filter(l => l.trim());
    const header = lines[0].toLowerCase();

    if (!header.includes('amount') || !header.includes('date')) {
      return res.status(400).json({ error: 'Formato CSV non riconosciuto — usa export Wise standard' });
    }

    const rows = lines.slice(1).map(line => {
      const cols = line.split(',');
      return {
        date: cols[0]?.trim(),
        amount: parseFloat(cols[1]?.trim() || '0'),
        currency: cols[2]?.trim(),
        description: cols[3]?.trim() || ''
      };
    }).filter(r => r.amount > 0 && r.currency === 'EUR');

    const total = rows.reduce((s, r) => s + r.amount, 0);
    const period = rows[0]?.date?.slice(0, 7) || new Date().toISOString().slice(0, 7);

    if (total === 0) return res.status(400).json({ error: 'Nessuna transazione EUR positiva trovata nel CSV' });

    // Inietta automaticamente
    const injectRes = await fetch(`${req.protocol}://${req.get('host')}/api/v2/operantis/bde/treasury/inject-revenue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.authorization },
      body: JSON.stringify({
        amount_eur: parseFloat(total.toFixed(2)),
        source: source || 'wise_import',
        period,
        proof: `Wise CSV — ${rows.length} transazioni — totale €${total.toFixed(2)}`
      })
    });
    const result = await injectRes.json();
    res.json({ success: true, rows_parsed: rows.length, total_eur: total.toFixed(2), ...result });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STORICO REVENUE LEDGER ────────────────────────────────────
// GET /bde/treasury/ledger
router.get('/bde/treasury/ledger', requireStaff, async (req, res) => {
  try {
    const rows = await sql`
      SELECT * FROM bur_revenue_ledger
      ORDER BY injected_at DESC
      LIMIT 50
    `.catch(() => []);
    res.json({ ledger: rows, total_injected: rows.reduce((s, r) => s + r.amount_eur, 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GAP 2 — SIGNALS AGGREGATE (routing events → market intelligence)
// GET /bde/signals/aggregate
// Dati vendibili a buyer esterni — zero PII
// ============================================================
router.get('/bde/signals/aggregate', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7');
    const limit = parseInt(req.query.limit || '100');

    // Top keyword dal campo keyword degli eventi routing
    const keywordRows = await sql`
      SELECT
        event_data->>'keyword' AS keyword,
        COUNT(*) AS volume,
        COUNT(DISTINCT device_fingerprint) AS unique_devices,
        AVG(value_eur) AS avg_value_eur,
        DATE_TRUNC('day', created_at) AS day
      FROM bde_events
      WHERE module = 'routing'
        AND created_at >= NOW() - (${days} || ' days')::INTERVAL
        AND event_data->>'keyword' IS NOT NULL
        AND event_data->>'keyword' != ''
      GROUP BY event_data->>'keyword', DATE_TRUNC('day', created_at)
      ORDER BY volume DESC
      LIMIT ${limit}
    `.catch(() => []);

    // Aggregazione per categoria (basata su keyword matching semplice)
    const categories = {
      tech: ['iphone', 'samsung', 'laptop', 'pc', 'smartphone', 'vpn', 'software'],
      travel: ['hotel', 'volo', 'viaggio', 'vacanza', 'booking', 'airbnb'],
      fashion: ['scarpe', 'abbigliamento', 'vestiti', 'borsa', 'nike', 'adidas'],
      finance: ['mutuo', 'prestito', 'assicurazione', 'conto', 'investimento'],
      food: ['ristorante', 'ricetta', 'pizza', 'delivery', 'deliveroo'],
    };

    const categoryVolumes = {};
    for (const [cat, terms] of Object.entries(categories)) {
      const vol = keywordRows.filter(r =>
        terms.some(t => r.keyword?.toLowerCase().includes(t))
      ).reduce((s, r) => s + parseInt(r.volume), 0);
      categoryVolumes[cat] = vol;
    }

    // Trend (keyword che crescono più velocemente)
    const topKeywords = keywordRows.slice(0, 20).map(r => ({
      keyword: r.keyword,
      volume: parseInt(r.volume),
      unique_devices: parseInt(r.unique_devices),
      commercial_value: parseFloat((r.avg_value_eur * r.volume * 0.001).toFixed(4))
    }));

    // Stima valore del dataset per buyer
    const totalVolume = keywordRows.reduce((s, r) => s + parseInt(r.volume), 0);
    const estimatedDatasetValue = parseFloat((totalVolume * 0.000001 * 5000).toFixed(2));

    res.json({
      period_days: days,
      generated_at: new Date().toISOString(),
      summary: {
        total_intent_signals: totalVolume,
        unique_keywords: keywordRows.length,
        estimated_dataset_value_eur: estimatedDatasetValue,
        note: 'Dati aggregati anonimi — zero PII — GDPR compliant'
      },
      categories: categoryVolumes,
      top_keywords: topKeywords,
      monetization: {
        available_for_licensing: true,
        contact: 'burbrowser@gmail.com',
        formats: ['JSON API', 'CSV weekly', 'Real-time webhook'],
        pricing: 'Su richiesta — base €500/mese per accesso API'
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SIGNALS TREND (ultimi N giorni per keyword specifica) ────
// GET /bde/signals/trend?keyword=vpn&days=30
router.get('/bde/signals/trend', async (req, res) => {
  try {
    const keyword = req.query.keyword;
    const days = parseInt(req.query.days || '30');
    if (!keyword) return res.status(400).json({ error: 'keyword obbligatoria' });

    const trend = await sql`
      SELECT
        DATE_TRUNC('day', created_at) AS day,
        COUNT(*) AS volume,
        COUNT(DISTINCT device_fingerprint) AS unique_devices
      FROM bde_events
      WHERE module = 'routing'
        AND created_at >= NOW() - (${days} || ' days')::INTERVAL
        AND event_data->>'keyword' ILIKE ${'%' + keyword + '%'}
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day ASC
    `.catch(() => []);

    res.json({
      keyword,
      period_days: days,
      trend: trend.map(r => ({
        day: r.day,
        volume: parseInt(r.volume),
        unique_devices: parseInt(r.unique_devices)
      }))
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
