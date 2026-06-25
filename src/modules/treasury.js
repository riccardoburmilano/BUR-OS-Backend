// ============================================================
// treasury.js — BUR Treasury Engine
// Il cuore economico di BUR: accumula, distribuisce, ricicla
// Formula: Costo BUR = costo energetico reale + 33%
// ============================================================

const { sql } = require('./db');
const bde = require('./bde');

// ── COSTANTI ECONOMICHE ───────────────────────────────────────
const TREASURY_CONFIG = {
  margin: 0.33,              // +33% margine del pianeta
  recycling_interval_ms: 2 * 60 * 60 * 1000, // ogni 2 ore
  min_withdrawal: 1.0,       // minimo 1 BUR Credit per prelievo
  energy_cost_per_cpu_hour: 0.00015, // €/ora CPU (media europea)
  bur_credit_to_eur: 0.01,   // 1 BUR Credit = 0.01€
};

// ── ENSURE TABLES ─────────────────────────────────────────────
async function ensureTreasuryTables() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS bur_treasury (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        balance_eur FLOAT DEFAULT 0,
        balance_bur_credits FLOAT DEFAULT 0,
        total_generated_eur FLOAT DEFAULT 0,
        total_distributed_eur FLOAT DEFAULT 0,
        total_to_users_eur FLOAT DEFAULT 0,
        total_to_platform_eur FLOAT DEFAULT 0,
        last_recycling TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS bur_treasury_transactions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        type TEXT NOT NULL,
        amount_eur FLOAT NOT NULL,
        amount_credits FLOAT NOT NULL,
        source TEXT,
        destination TEXT,
        device_fingerprint TEXT,
        description TEXT,
        energy_cost_eur FLOAT DEFAULT 0,
        margin_eur FLOAT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS bur_recycling_cycles (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        cycle_number INTEGER,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        total_value_eur FLOAT DEFAULT 0,
        to_users_eur FLOAT DEFAULT 0,
        to_treasury_eur FLOAT DEFAULT 0,
        to_platform_eur FLOAT DEFAULT 0,
        devices_rewarded INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending'
      )
    `;

    // Crea treasury se non esiste
    const existing = await sql`SELECT id FROM bur_treasury LIMIT 1`;
    if (existing.length === 0) {
      await sql`INSERT INTO bur_treasury (balance_eur, balance_bur_credits) VALUES (0, 0)`;
    }

    console.log('[Treasury] Tabelle pronte');
  } catch (err) {
    console.error('[Treasury] Errore tabelle:', err.message);
  }
}

// ── FORMULA BUR ───────────────────────────────────────────────
function calculateBurValue(energyCostEur) {
  const margin = energyCostEur * TREASURY_CONFIG.margin;
  const total = energyCostEur + margin;
  const burCredits = total / TREASURY_CONFIG.bur_credit_to_eur;
  return {
    energyCostEur,
    marginEur: margin,
    totalEur: total,
    burCredits,
    formula: `€${energyCostEur.toFixed(6)} + 33% = €${total.toFixed(6)} = ${burCredits.toFixed(4)} BUR`,
  };
}

// ── DEPOSITA NEL TREASURY ─────────────────────────────────────
async function deposit(amountEur, source, deviceFingerprint = null, description = '') {
  try {
    const burValue = calculateBurValue(amountEur);
    const toUsers = amountEur * 0.67;      // 67% agli utenti
    const toTreasury = amountEur * 0.33;   // 33% al treasury

    await sql`
      UPDATE bur_treasury SET
        balance_eur = balance_eur + ${toTreasury},
        balance_bur_credits = balance_bur_credits + ${burValue.burCredits * 0.33},
        total_generated_eur = total_generated_eur + ${amountEur}
      WHERE id = (SELECT id FROM bur_treasury LIMIT 1)
    `;

    await sql`
      INSERT INTO bur_treasury_transactions
        (type, amount_eur, amount_credits, source, device_fingerprint, description, energy_cost_eur, margin_eur)
      VALUES
        ('deposit', ${amountEur}, ${burValue.burCredits}, ${source}, ${deviceFingerprint},
         ${description}, ${amountEur}, ${burValue.marginEur})
    `;

    return {
      success: true,
      deposited: amountEur,
      toUsers,
      toTreasury,
      burCredits: burValue.burCredits,
      formula: burValue.formula,
    };
  } catch (err) {
    console.error('[Treasury] deposit error:', err.message);
    return { success: false, reason: err.message };
  }
}

// ── CICLO DI RECYCLING (ogni 2-4 ore) ────────────────────────
async function runRecyclingCycle() {
  try {
    console.log('[Treasury] 🔄 Avvio ciclo recycling...');

    // Conta ciclo
    const lastCycle = await sql`
      SELECT cycle_number FROM bur_recycling_cycles ORDER BY started_at DESC LIMIT 1
    `.catch(() => [{ cycle_number: 0 }]);
    const cycleNumber = (lastCycle[0]?.cycle_number || 0) + 1;

    // Crea record ciclo
    const cycleRows = await sql`
      INSERT INTO bur_recycling_cycles (cycle_number, status)
      VALUES (${cycleNumber}, 'running')
      RETURNING id
    `;
    const cycleId = cycleRows[0]?.id;

    // Calcola valore generato nelle ultime 2h
    const networkStats = await bde.getNetworkBdeStats();
    const totalGenerated = networkStats?.last24h?.total_value_generated || 0;
    const cycleValue = totalGenerated / 12; // 24h / 12 cicli da 2h

    if (cycleValue < 0.001) {
      await sql`
        UPDATE bur_recycling_cycles SET status = 'completed', completed_at = NOW(),
        total_value_eur = 0 WHERE id = ${cycleId}
      `.catch(() => {});
      console.log('[Treasury] Ciclo completato — valore insufficiente per distribuzione');
      return;
    }

    const toUsers = cycleValue * 0.67;
    const toTreasury = cycleValue * 0.20;
    const toPlatform = cycleValue * 0.13;

    // Prendi dispositivi attivi nelle ultime 2h
    const activeDevices = await sql`
      SELECT DISTINCT device_fingerprint FROM bde_events
      WHERE created_at > NOW() - INTERVAL '2 hours' AND verified = TRUE
    `.catch(() => []);

    let devicesRewarded = 0;

    if (activeDevices.length > 0) {
      const perDevice = toUsers / activeDevices.length;

      for (const d of activeDevices) {
        try {
          const device = await sql`
            SELECT level FROM bur_devices WHERE device_fingerprint = ${d.device_fingerprint} LIMIT 1
          `.catch(() => [{ level: 0 }]);

          const { BDE_LEVELS } = require('./reputation');
          const multiplier = BDE_LEVELS[device[0]?.level || 0].multiplier;
          const deviceReward = perDevice * multiplier;

          await sql`
            UPDATE bur_devices SET bur_credits_earned = bur_credits_earned + ${deviceReward * 100}
            WHERE device_fingerprint = ${d.device_fingerprint}
          `.catch(() => {});

          devicesRewarded++;
        } catch {}
      }
    }

    // Aggiorna treasury
    await sql`
      UPDATE bur_treasury SET
        balance_eur = balance_eur + ${toTreasury},
        total_distributed_eur = total_distributed_eur + ${cycleValue},
        total_to_users_eur = total_to_users_eur + ${toUsers},
        total_to_platform_eur = total_to_platform_eur + ${toPlatform},
        last_recycling = NOW()
      WHERE id = (SELECT id FROM bur_treasury LIMIT 1)
    `.catch(() => {});

    // Completa ciclo
    await sql`
      UPDATE bur_recycling_cycles SET
        status = 'completed',
        completed_at = NOW(),
        total_value_eur = ${cycleValue},
        to_users_eur = ${toUsers},
        to_treasury_eur = ${toTreasury},
        to_platform_eur = ${toPlatform},
        devices_rewarded = ${devicesRewarded}
      WHERE id = ${cycleId}
    `.catch(() => {});

    console.log(`[Treasury] ✅ Ciclo ${cycleNumber} completato — €${cycleValue.toFixed(4)} distribuiti a ${devicesRewarded} device`);

    return {
      cycleNumber,
      totalValue: cycleValue,
      toUsers,
      toTreasury,
      toPlatform,
      devicesRewarded,
    };
  } catch (err) {
    console.error('[Treasury] runRecyclingCycle error:', err.message);
  }
}

// ── GET TREASURY STATUS ───────────────────────────────────────
async function getTreasuryStatus() {
  try {
    const treasury = await sql`SELECT * FROM bur_treasury LIMIT 1`;
    const lastCycles = await sql`
      SELECT * FROM bur_recycling_cycles ORDER BY started_at DESC LIMIT 5
    `.catch(() => []);

    const t = treasury[0] || {};
    return {
      balance: {
        eur: t.balance_eur || 0,
        burCredits: t.balance_bur_credits || 0,
      },
      lifetime: {
        totalGenerated: t.total_generated_eur || 0,
        totalDistributed: t.total_distributed_eur || 0,
        toUsers: t.total_to_users_eur || 0,
        toPlatform: t.total_to_platform_eur || 0,
      },
      lastRecycling: t.last_recycling,
      nextRecycling: new Date(Date.now() + TREASURY_CONFIG.recycling_interval_ms),
      recentCycles: lastCycles,
    };
  } catch { return null; }
}

// ── BUR CREDIT EXCHANGE ───────────────────────────────────────
function burToEur(burCredits) {
  return burCredits * TREASURY_CONFIG.bur_credit_to_eur;
}

function eurToBur(eur) {
  return eur / TREASURY_CONFIG.bur_credit_to_eur;
}

// Init
ensureTreasuryTables();

// Recycling ogni 2 ore
setInterval(runRecyclingCycle, TREASURY_CONFIG.recycling_interval_ms);

// Primo recycling dopo 5 minuti dall'avvio
setTimeout(runRecyclingCycle, 5 * 60 * 1000);

module.exports = {
  deposit,
  runRecyclingCycle,
  getTreasuryStatus,
  calculateBurValue,
  burToEur,
  eurToBur,
  TREASURY_CONFIG,
};
