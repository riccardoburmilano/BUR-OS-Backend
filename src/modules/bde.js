// ============================================================
// bde.js — BUR Device Economy (4 moduli)
// Storage Distribuito + Routing + Federated Learning + Reputation
// ============================================================

const { sql } = require('./db');
const reputation = require('./reputation');

// ── TARIFFE BDE (€/evento) ────────────────────────────────────
const BDE_RATES = {
  storage_chunk_served:  0.0003,  // per chunk da 50KB servito
  routing_packet:        0.00008, // per pacchetto instradato
  federated_gradient:    0.0005,  // per gradiente valido
  uptime_hour:           0.0002,  // per ora di uptime stabile
  reputation_node:       0.0001,  // per ora come nodo affidabile
};

// ── ENSURE TABLES ─────────────────────────────────────────────
async function ensureBdeTables() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS bde_events (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        device_fingerprint TEXT NOT NULL,
        module TEXT NOT NULL,
        event_type TEXT NOT NULL,
        value_eur FLOAT DEFAULT 0,
        bur_credits FLOAT DEFAULT 0,
        metadata JSONB,
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS bde_storage_chunks (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        chunk_hash TEXT UNIQUE NOT NULL,
        stored_on TEXT[],
        size_kb FLOAT NOT NULL,
        ttl_hours INTEGER DEFAULT 24,
        encrypted BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      )
    `;
    console.log('[BDE] Tabelle pronte');
  } catch (err) {
    console.error('[BDE] Errore tabelle:', err.message);
  }
}

// ── ANTIFRODE ─────────────────────────────────────────────────
async function antiFraudCheck(fingerprint, module, eventsLastHour) {
  const limits = {
    storage: 1000,    // max 1000 chunk/ora
    routing: 5000,    // max 5000 pacchetti/ora
    federated: 100,   // max 100 gradienti/ora
    uptime: 1,        // max 1 evento uptime/ora (ovvio)
  };

  if (eventsLastHour > (limits[module] || 100)) {
    await reputation.flagSuspicious(fingerprint, `limite_${module}_superato`);
    return false;
  }

  // Controlla reputazione minima
  const device = await reputation.getDevice(fingerprint);
  if (!device || device.suspended) return false;
  if (device.reputation_score < 0) return false;

  return true;
}

// ── MODULO 1: STORAGE DISTRIBUITO LEGGERO ────────────────────
async function processStorageEvent(fingerprint, chunkHash, sizeKb) {
  try {
    // Verifica chunk non fake (deve esistere nel registro)
    const chunkExists = await sql`
      SELECT id FROM bde_storage_chunks
      WHERE chunk_hash = ${chunkHash}
        AND expires_at > NOW()
      LIMIT 1
    `.catch(() => []);

    if (chunkExists.length === 0) {
      await reputation.flagSuspicious(fingerprint, 'chunk_inesistente');
      return { success: false, reason: 'chunk non valido' };
    }

    // Conta eventi ultima ora (antifrode)
    const recentEvents = await sql`
      SELECT COUNT(*) as count FROM bde_events
      WHERE device_fingerprint = ${fingerprint}
        AND module = 'storage'
        AND created_at > NOW() - INTERVAL '1 hour'
    `.catch(() => [{ count: 0 }]);

    const isValid = await antiFraudCheck(fingerprint, 'storage', parseInt(recentEvents[0]?.count || 0));
    if (!isValid) return { success: false, reason: 'antifrode' };

    // Calcola reward
    const device = await reputation.getDevice(fingerprint);
    const multiplier = reputation.BDE_LEVELS[device?.level || 0].multiplier;
    const valueEur = BDE_RATES.storage_chunk_served * multiplier;
    const burCredits = valueEur * 100; // 1 BUR Credit = 0.01€

    // Registra evento
    await sql`
      INSERT INTO bde_events (device_fingerprint, module, event_type, value_eur, bur_credits, metadata, verified)
      VALUES (${fingerprint}, 'storage', 'chunk_served', ${valueEur}, ${burCredits},
        ${JSON.stringify({ chunkHash, sizeKb })}, TRUE)
    `;

    // Aggiorna crediti device
    await sql`
      UPDATE bur_devices SET bur_credits_earned = bur_credits_earned + ${burCredits}
      WHERE device_fingerprint = ${fingerprint}
    `.catch(() => {});

    // Aggiorna reputazione
    await reputation.updateReputation(fingerprint, 'storage_served', { chunkHash });

    return { success: true, burCredits, valueEur };
  } catch (err) {
    console.error('[BDE Storage] error:', err.message);
    return { success: false, reason: err.message };
  }
}

// ── MODULO 2: ROUTING INTELLIGENTE ───────────────────────────
async function processRoutingEvent(fingerprint, packetId, latencyMs) {
  try {
    // Latenza troppo alta = nodo inaffidabile
    if (latencyMs > 500) {
      await reputation.updateReputation(fingerprint, 'task_failed', { reason: 'latenza_alta', latencyMs });
      return { success: false, reason: 'latenza troppo alta' };
    }

    const recentEvents = await sql`
      SELECT COUNT(*) as count FROM bde_events
      WHERE device_fingerprint = ${fingerprint}
        AND module = 'routing'
        AND created_at > NOW() - INTERVAL '1 hour'
    `.catch(() => [{ count: 0 }]);

    const isValid = await antiFraudCheck(fingerprint, 'routing', parseInt(recentEvents[0]?.count || 0));
    if (!isValid) return { success: false, reason: 'antifrode' };

    const device = await reputation.getDevice(fingerprint);
    const multiplier = reputation.BDE_LEVELS[device?.level || 0].multiplier;

    // Bonus latenza bassa
    const latencyBonus = latencyMs < 50 ? 1.5 : latencyMs < 100 ? 1.2 : 1.0;
    const valueEur = BDE_RATES.routing_packet * multiplier * latencyBonus;
    const burCredits = valueEur * 100;

    await sql`
      INSERT INTO bde_events (device_fingerprint, module, event_type, value_eur, bur_credits, metadata, verified)
      VALUES (${fingerprint}, 'routing', 'packet_routed', ${valueEur}, ${burCredits},
        ${JSON.stringify({ packetId, latencyMs, latencyBonus })}, TRUE)
    `;

    await sql`
      UPDATE bur_devices SET bur_credits_earned = bur_credits_earned + ${burCredits}
      WHERE device_fingerprint = ${fingerprint}
    `.catch(() => {});

    await reputation.updateReputation(fingerprint, 'routing_packet', { latencyMs });

    return { success: true, burCredits, valueEur };
  } catch (err) {
    console.error('[BDE Routing] error:', err.message);
    return { success: false, reason: err.message };
  }
}

// ── MODULO 3: FEDERATED LEARNING LEGGERO ─────────────────────
async function processFederatedEvent(fingerprint, gradientHash, coherenceScore) {
  try {
    // Coerenza minima richiesta (0-1)
    if (coherenceScore < 0.6) {
      await reputation.updateReputation(fingerprint, 'task_failed', { reason: 'gradiente_incoerente', coherenceScore });
      return { success: false, reason: 'gradiente non coerente' };
    }

    const recentEvents = await sql`
      SELECT COUNT(*) as count FROM bde_events
      WHERE device_fingerprint = ${fingerprint}
        AND module = 'federated'
        AND created_at > NOW() - INTERVAL '1 hour'
    `.catch(() => [{ count: 0 }]);

    const isValid = await antiFraudCheck(fingerprint, 'federated', parseInt(recentEvents[0]?.count || 0));
    if (!isValid) return { success: false, reason: 'antifrode' };

    const device = await reputation.getDevice(fingerprint);
    const multiplier = reputation.BDE_LEVELS[device?.level || 0].multiplier;

    // Bonus per alta coerenza
    const coherenceBonus = coherenceScore > 0.9 ? 1.5 : coherenceScore > 0.75 ? 1.2 : 1.0;
    const valueEur = BDE_RATES.federated_gradient * multiplier * coherenceBonus;
    const burCredits = valueEur * 100;

    await sql`
      INSERT INTO bde_events (device_fingerprint, module, event_type, value_eur, bur_credits, metadata, verified)
      VALUES (${fingerprint}, 'federated', 'gradient_valid', ${valueEur}, ${burCredits},
        ${JSON.stringify({ gradientHash, coherenceScore, coherenceBonus })}, TRUE)
    `;

    await sql`
      UPDATE bur_devices SET bur_credits_earned = bur_credits_earned + ${burCredits}
      WHERE device_fingerprint = ${fingerprint}
    `.catch(() => {});

    await reputation.updateReputation(fingerprint, 'federated_valid', { coherenceScore });

    return { success: true, burCredits, valueEur };
  } catch (err) {
    console.error('[BDE Federated] error:', err.message);
    return { success: false, reason: err.message };
  }
}

// ── UPTIME TRACKING ───────────────────────────────────────────
async function processUptimeEvent(fingerprint) {
  try {
    const device = await reputation.getDevice(fingerprint);
    if (!device || device.suspended) return { success: false };

    const multiplier = reputation.BDE_LEVELS[device.level || 0].multiplier;
    const valueEur = BDE_RATES.uptime_hour * multiplier;
    const burCredits = valueEur * 100;

    await sql`
      INSERT INTO bde_events (device_fingerprint, module, event_type, value_eur, bur_credits, metadata, verified)
      VALUES (${fingerprint}, 'uptime', 'hour_online', ${valueEur}, ${burCredits},
        ${JSON.stringify({ level: device.level })}, TRUE)
    `;

    await sql`
      UPDATE bur_devices SET
        bur_credits_earned = bur_credits_earned + ${burCredits},
        uptime_hours = uptime_hours + 1,
        last_seen = NOW()
      WHERE device_fingerprint = ${fingerprint}
    `.catch(() => {});

    await reputation.updateReputation(fingerprint, 'uptime_hour', {});

    return { success: true, burCredits, valueEur };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

// ── STATS DEVICE BDE ──────────────────────────────────────────
async function getDeviceBdeStats(fingerprint) {
  try {
    const repStats = await reputation.getDeviceStats(fingerprint);
    if (!repStats) return null;

    const earnings = await sql`
      SELECT
        module,
        COUNT(*) as events,
        SUM(value_eur) as total_eur,
        SUM(bur_credits) as total_credits
      FROM bde_events
      WHERE device_fingerprint = ${fingerprint}
        AND verified = TRUE
      GROUP BY module
    `.catch(() => []);

    const today = await sql`
      SELECT SUM(value_eur) as today_eur, SUM(bur_credits) as today_credits
      FROM bde_events
      WHERE device_fingerprint = ${fingerprint}
        AND created_at > NOW() - INTERVAL '24 hours'
        AND verified = TRUE
    `.catch(() => [{ today_eur: 0, today_credits: 0 }]);

    return {
      reputation: repStats,
      earnings: earnings,
      today: today[0],
      estimatedMonthly: ((today[0]?.today_eur || 0) * 30).toFixed(4),
    };
  } catch { return null; }
}

// ── NETWORK BDE STATS ─────────────────────────────────────────
async function getNetworkBdeStats() {
  try {
    const stats = await sql`
      SELECT
        COUNT(DISTINCT device_fingerprint) as active_devices,
        SUM(value_eur) as total_value_generated,
        SUM(bur_credits) as total_credits_issued,
        COUNT(*) as total_events
      FROM bde_events
      WHERE created_at > NOW() - INTERVAL '24 hours'
        AND verified = TRUE
    `.catch(() => [{}]);

    const byModule = await sql`
      SELECT module, SUM(value_eur) as value_eur, COUNT(*) as events
      FROM bde_events
      WHERE created_at > NOW() - INTERVAL '24 hours' AND verified = TRUE
      GROUP BY module
    `.catch(() => []);

    return {
      last24h: stats[0],
      byModule,
      projectedMonthly: ((stats[0]?.total_value_generated || 0) * 30).toFixed(2),
    };
  } catch { return null; }
}

// Init
ensureBdeTables();

module.exports = {
  processStorageEvent,
  processRoutingEvent,
  processFederatedEvent,
  processUptimeEvent,
  getDeviceBdeStats,
  getNetworkBdeStats,
  BDE_RATES,
};
