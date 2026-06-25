// ============================================================
// reputation.js — BUR Network Reputation (Proof-of-Trust)
// Ogni device accumula reputazione non farmabile
// ============================================================

const { sql } = require('./db');

// ── LIVELLI BDE ───────────────────────────────────────────────
const BDE_LEVELS = {
  0: { name: 'Neutrino',    min: 0,    max: 99,   multiplier: 1.0, tasks: ['storage_min'] },
  1: { name: 'Orbiter',     min: 100,  max: 299,  multiplier: 1.2, tasks: ['storage', 'routing_min'] },
  2: { name: 'Pulsar',      min: 300,  max: 699,  multiplier: 1.5, tasks: ['storage', 'routing', 'federated'] },
  3: { name: 'Quasar',      min: 700,  max: 1499, multiplier: 2.0, tasks: ['storage_adv', 'routing_premium', 'federated'] },
  4: { name: 'Singolarità', min: 1500, max: Infinity, multiplier: 3.0, tasks: ['all', 'premium'] }
};

// ── PESI REPUTAZIONE ─────────────────────────────────────────
const REP_WEIGHTS = {
  uptime_hour:        0.5,   // +0.5 per ora online stabile
  task_completed:     2.0,   // +2.0 per task completato correttamente
  task_failed:       -5.0,   // -5.0 per task fallito o incoerente
  storage_served:     1.0,   // +1.0 per chunk servito
  routing_packet:     0.3,   // +0.3 per pacchetto instradato
  federated_valid:    3.0,   // +3.0 per gradiente valido
  suspicious_behavior: -20.0, // -20 per comportamento sospetto
  decay_daily:       -0.02,  // decay naturale 2% al giorno
};

// ── ENSURE TABLES ─────────────────────────────────────────────
async function ensureReputationTables() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS bur_devices (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        device_fingerprint TEXT UNIQUE NOT NULL,
        user_id TEXT,
        clinic_id UUID,
        reputation_score FLOAT DEFAULT 0,
        level INTEGER DEFAULT 0,
        total_tasks INTEGER DEFAULT 0,
        failed_tasks INTEGER DEFAULT 0,
        uptime_hours FLOAT DEFAULT 0,
        bur_credits_earned FLOAT DEFAULT 0,
        last_seen TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        suspended BOOLEAN DEFAULT FALSE,
        suspension_reason TEXT
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS bur_reputation_events (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        device_fingerprint TEXT NOT NULL,
        event_type TEXT NOT NULL,
        delta FLOAT NOT NULL,
        score_after FLOAT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('[BUR Reputation] Tabelle pronte');
  } catch (err) {
    console.error('[BUR Reputation] Errore creazione tabelle:', err.message);
  }
}

// ── GET DEVICE ────────────────────────────────────────────────
async function getDevice(fingerprint) {
  try {
    const rows = await sql`
      SELECT * FROM bur_devices WHERE device_fingerprint = ${fingerprint} LIMIT 1
    `;
    return rows[0] || null;
  } catch { return null; }
}

// ── REGISTER DEVICE ───────────────────────────────────────────
async function registerDevice(fingerprint, userId = null, clinicId = null) {
  try {
    const existing = await getDevice(fingerprint);
    if (existing) return existing;

    const rows = await sql`
      INSERT INTO bur_devices (device_fingerprint, user_id, clinic_id)
      VALUES (${fingerprint}, ${userId}, ${clinicId})
      RETURNING *
    `;
    return rows[0];
  } catch (err) {
    console.error('[BUR Reputation] registerDevice error:', err.message);
    return null;
  }
}

// ── UPDATE REPUTATION ─────────────────────────────────────────
async function updateReputation(fingerprint, eventType, metadata = {}) {
  try {
    const device = await getDevice(fingerprint);
    if (!device || device.suspended) return null;

    const delta = REP_WEIGHTS[eventType] || 0;
    if (delta === 0) return device;

    // Antifrode: limite massimo guadagno per ora
    if (delta > 0 && metadata.hourly_gain > 50) {
      await flagSuspicious(fingerprint, 'guadagno_anomalo_orario');
      return null;
    }

    const newScore = Math.max(0, device.reputation_score + delta);
    const newLevel = getLevel(newScore);

    await sql`
      UPDATE bur_devices SET
        reputation_score = ${newScore},
        level = ${newLevel},
        last_seen = NOW(),
        total_tasks = total_tasks + ${delta > 0 ? 1 : 0},
        failed_tasks = failed_tasks + ${eventType === 'task_failed' ? 1 : 0}
      WHERE device_fingerprint = ${fingerprint}
    `;

    await sql`
      INSERT INTO bur_reputation_events (device_fingerprint, event_type, delta, score_after, metadata)
      VALUES (${fingerprint}, ${eventType}, ${delta}, ${newScore}, ${JSON.stringify(metadata)})
    `;

    return { score: newScore, level: newLevel, levelName: BDE_LEVELS[newLevel].name };
  } catch (err) {
    console.error('[BUR Reputation] updateReputation error:', err.message);
    return null;
  }
}

// ── DECAY GIORNALIERO ─────────────────────────────────────────
async function applyDailyDecay() {
  try {
    // Decay naturale: -2% al giorno per device non attivi nelle ultime 48h
    await sql`
      UPDATE bur_devices SET
        reputation_score = GREATEST(0, reputation_score * 0.98)
      WHERE last_seen < NOW() - INTERVAL '48 hours'
        AND suspended = FALSE
    `;

    // Aggiorna livelli dopo decay
    const devices = await sql`SELECT device_fingerprint, reputation_score FROM bur_devices`;
    for (const d of devices) {
      const level = getLevel(d.reputation_score);
      await sql`UPDATE bur_devices SET level = ${level} WHERE device_fingerprint = ${d.device_fingerprint}`;
    }

    console.log('[BUR Reputation] Decay giornaliero applicato');
  } catch (err) {
    console.error('[BUR Reputation] applyDailyDecay error:', err.message);
  }
}

// ── FLAG SUSPICIOUS ───────────────────────────────────────────
async function flagSuspicious(fingerprint, reason) {
  try {
    await sql`
      UPDATE bur_devices SET
        suspended = TRUE,
        suspension_reason = ${reason},
        reputation_score = 0
      WHERE device_fingerprint = ${fingerprint}
    `;
    await sql`
      INSERT INTO bur_reputation_events (device_fingerprint, event_type, delta, score_after, metadata)
      VALUES (${fingerprint}, 'suspicious_behavior', ${REP_WEIGHTS.suspicious_behavior}, 0, ${JSON.stringify({ reason })})
    `;
    console.log(`[BUR Reputation] Device sospeso: ${fingerprint} — ${reason}`);
  } catch {}
}

// ── GET LEVEL ─────────────────────────────────────────────────
function getLevel(score) {
  for (let i = 4; i >= 0; i--) {
    if (score >= BDE_LEVELS[i].min) return i;
  }
  return 0;
}

// ── GET STATS ─────────────────────────────────────────────────
async function getDeviceStats(fingerprint) {
  try {
    const device = await getDevice(fingerprint);
    if (!device) return null;

    const level = BDE_LEVELS[device.level];
    const nextLevel = BDE_LEVELS[device.level + 1];
    const progressToNext = nextLevel
      ? ((device.reputation_score - level.min) / (nextLevel.min - level.min) * 100).toFixed(1)
      : 100;

    return {
      fingerprint,
      score: device.reputation_score,
      level: device.level,
      levelName: level.name,
      multiplier: level.multiplier,
      progressToNext: parseFloat(progressToNext),
      nextLevelName: nextLevel?.name || 'MAX',
      pointsToNext: nextLevel ? Math.max(0, nextLevel.min - device.reputation_score) : 0,
      totalTasks: device.total_tasks,
      failedTasks: device.failed_tasks,
      burCreditsEarned: device.bur_credits_earned,
      suspended: device.suspended,
      lastSeen: device.last_seen,
    };
  } catch { return null; }
}

// ── NETWORK STATS ─────────────────────────────────────────────
async function getNetworkStats() {
  try {
    const stats = await sql`
      SELECT
        COUNT(*) as total_devices,
        COUNT(CASE WHEN last_seen > NOW() - INTERVAL '24 hours' THEN 1 END) as active_24h,
        COUNT(CASE WHEN suspended = TRUE THEN 1 END) as suspended,
        AVG(reputation_score) as avg_score,
        SUM(bur_credits_earned) as total_credits_issued,
        COUNT(CASE WHEN level = 4 THEN 1 END) as singolarita_nodes
      FROM bur_devices
    `;
    return stats[0];
  } catch { return null; }
}

// Init tabelle
ensureReputationTables();

// Decay ogni 24h
setInterval(applyDailyDecay, 24 * 60 * 60 * 1000);

module.exports = {
  registerDevice, getDevice, updateReputation,
  flagSuspicious, getDeviceStats, getNetworkStats,
  BDE_LEVELS, getLevel
};
