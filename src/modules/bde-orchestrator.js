// ============================================================
// bde-orchestrator.js — BUR Device Economy Orchestrator
// Pipeline: Reputation → BDE → Treasury → Reward → AI Buffer
// È il cervello che coordina tutto il ciclo economico BUR
// ============================================================

const reputation = require('./reputation');
const bde = require('./bde');
const treasury = require('./treasury');

// ── CONFIGURAZIONE ORCHESTRATOR ───────────────────────────────
const ORCH_CONFIG = {
  min_score_storage:    10,   // score minimo per modulo storage
  min_score_routing:    50,   // score minimo per routing
  min_score_federated:  100,  // score minimo per federated learning
  suspension_hours:     24,   // ore blocco per device flaggato
  ai_buffer_ratio:      0.10, // 10% dei crediti va all'AI buffer
  max_events_per_cycle: {
    storage:   500,
    routing:   2000,
    federated: 50,
    uptime:    1,
  },
  pipeline_log: true,
};

// ── AI BUFFER ─────────────────────────────────────────────────
// Accumula BUR Credits per finanziare l'AI server (NOVA/BUR)
let aiBuffer = { credits: 0, eur: 0 };

function addToAiBuffer(burCredits) {
  const portion = burCredits * ORCH_CONFIG.ai_buffer_ratio;
  aiBuffer.credits += portion;
  aiBuffer.eur += portion * 0.01;
  return portion;
}

function getAiBuffer() {
  return { ...aiBuffer };
}

function drainAiBuffer() {
  const drained = { ...aiBuffer };
  aiBuffer = { credits: 0, eur: 0 };
  return drained;
}

// ── PIPELINE PRINCIPALE ───────────────────────────────────────
// Ogni evento BDE passa attraverso questa pipeline
async function processPipeline(fingerprint, module, eventData) {
  const log = [];
  const pushLog = (step, result) => {
    if (ORCH_CONFIG.pipeline_log) log.push({ step, result, ts: Date.now() });
  };

  try {
    // ── STEP 1: REPUTATION GATE ───────────────────────────────
    const device = await reputation.getDevice(fingerprint);

    if (!device) {
      // Auto-registra device nuovo
      await reputation.registerDevice(fingerprint);
      pushLog('reputation_gate', 'new_device_registered');
    }

    if (device?.suspended) {
      pushLog('reputation_gate', 'BLOCKED_suspended');
      return { success: false, reason: 'device sospeso', pipeline: log };
    }

    const score = device?.reputation_score || 0;
    const minScore = ORCH_CONFIG[`min_score_${module}`] || 0;

    if (score < minScore) {
      pushLog('reputation_gate', `BLOCKED_score_${score}_min_${minScore}`);
      return {
        success: false,
        reason: `score insufficiente (${score}/${minScore}) — continua ad usare BUR per salire di livello`,
        currentScore: score,
        requiredScore: minScore,
        pipeline: log,
      };
    }

    pushLog('reputation_gate', `PASSED_score_${score}`);

    // ── STEP 2: CONTROLLO FREQUENZA ───────────────────────────
    // Già gestito dentro ogni modulo BDE — doppio check qui
    const level = reputation.getLevel(score);
    const multiplier = reputation.BDE_LEVELS[level].multiplier;
    pushLog('multiplier', `level_${level}_x${multiplier}`);

    // ── STEP 3: ESECUZIONE MODULO BDE ─────────────────────────
    let bdeResult;

    switch (module) {
      case 'storage':
        bdeResult = await bde.processStorageEvent(
          fingerprint,
          eventData.chunkHash,
          eventData.sizeKb
        );
        break;
      case 'routing':
        bdeResult = await bde.processRoutingEvent(
          fingerprint,
          eventData.packetId,
          eventData.latencyMs
        );
        break;
      case 'federated':
        bdeResult = await bde.processFederatedEvent(
          fingerprint,
          eventData.gradientHash,
          eventData.coherenceScore
        );
        break;
      case 'uptime':
        bdeResult = await bde.processUptimeEvent(fingerprint);
        break;
      default:
        return { success: false, reason: `modulo sconosciuto: ${module}`, pipeline: log };
    }

    if (!bdeResult.success) {
      pushLog('bde_module', `FAILED_${bdeResult.reason}`);
      return { success: false, reason: bdeResult.reason, pipeline: log };
    }

    pushLog('bde_module', `OK_credits_${bdeResult.burCredits?.toFixed(4)}`);

    // ── STEP 4: DEPOSITO TREASURY ─────────────────────────────
    const treasuryResult = await treasury.deposit(
      bdeResult.valueEur,
      `bde_${module}`,
      fingerprint,
      `${module} event — device level ${level}`
    );

    pushLog('treasury', `deposited_€${bdeResult.valueEur?.toFixed(6)}_formula_${treasuryResult.formula}`);

    // ── STEP 5: AI BUFFER ─────────────────────────────────────
    const aiPortion = addToAiBuffer(bdeResult.burCredits || 0);
    pushLog('ai_buffer', `added_${aiPortion.toFixed(4)}_credits_buffer_${aiBuffer.credits.toFixed(2)}`);

    // ── STEP 6: AGGIORNA LIVELLO REPUTATION ──────────────────
    const newRep = await reputation.updateReputation(fingerprint, `task_completed`, {
      module,
      credits: bdeResult.burCredits,
    });

    if (newRep && newRep.level > level) {
      pushLog('level_up', `${reputation.BDE_LEVELS[level].name} → ${newRep.levelName}`);
    }

    pushLog('pipeline', 'COMPLETED');

    return {
      success: true,
      module,
      burCredits: bdeResult.burCredits,
      valueEur: bdeResult.valueEur,
      multiplier,
      level,
      levelName: reputation.BDE_LEVELS[level].name,
      treasury: {
        toUsers: treasuryResult.toUsers,
        toTreasury: treasuryResult.toTreasury,
      },
      aiBuffer: aiPortion,
      pipeline: log,
    };

  } catch (err) {
    pushLog('ERROR', err.message);
    console.error('[Orchestrator] pipeline error:', err.message);
    return { success: false, reason: err.message, pipeline: log };
  }
}

// ── BATCH UPTIME (chiamato ogni ora dal cron) ─────────────────
async function processBatchUptime() {
  try {
    const { sql } = require('./db');

    // Tutti i device visti nelle ultime 2h (attivi)
    const activeDevices = await sql`
      SELECT device_fingerprint FROM bur_devices
      WHERE last_seen > NOW() - INTERVAL '2 hours'
        AND suspended = FALSE
    `.catch(() => []);

    let processed = 0;
    let totalCredits = 0;

    for (const d of activeDevices) {
      const result = await processPipeline(d.device_fingerprint, 'uptime', {});
      if (result.success) {
        processed++;
        totalCredits += result.burCredits || 0;
      }
    }

    console.log(`[Orchestrator] Batch uptime: ${processed} device, ${totalCredits.toFixed(4)} BUR Credits`);
    return { processed, totalCredits };
  } catch (err) {
    console.error('[Orchestrator] batchUptime error:', err.message);
    return { processed: 0, totalCredits: 0 };
  }
}

// ── ANTIFRODE GLOBALE (pattern anomali cross-modulo) ─────────
async function runGlobalAntiFraud() {
  try {
    const { sql } = require('./db');

    // Device con troppi eventi in tutti i moduli contemporaneamente
    const suspicious = await sql`
      SELECT device_fingerprint, COUNT(DISTINCT module) as modules, COUNT(*) as events
      FROM bde_events
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY device_fingerprint
      HAVING COUNT(*) > 3000 OR COUNT(DISTINCT module) = 4 AND COUNT(*) > 1000
    `.catch(() => []);

    for (const s of suspicious) {
      await reputation.flagSuspicious(
        s.device_fingerprint,
        `pattern_anomalo_${s.events}_eventi_${s.modules}_moduli`
      );
      console.log(`[Orchestrator] 🚨 Device sospeso: ${s.device_fingerprint}`);
    }

    // Device con fail rate > 30%
    const highFailRate = await sql`
      SELECT d.device_fingerprint, d.total_tasks, d.failed_tasks
      FROM bur_devices d
      WHERE d.total_tasks > 20
        AND d.failed_tasks::float / d.total_tasks > 0.3
        AND d.suspended = FALSE
    `.catch(() => []);

    for (const d of highFailRate) {
      await reputation.flagSuspicious(
        d.device_fingerprint,
        `fail_rate_${((d.failed_tasks / d.total_tasks) * 100).toFixed(0)}pct`
      );
    }

    console.log(`[Orchestrator] AntiFreud: ${suspicious.length + highFailRate.length} device flaggati`);
    return { flagged: suspicious.length + highFailRate.length };
  } catch (err) {
    console.error('[Orchestrator] antiFraud error:', err.message);
    return { flagged: 0 };
  }
}

// ── STATUS COMPLETO SISTEMA ───────────────────────────────────
async function getSystemStatus() {
  try {
    const [treasuryStatus, networkRep, networkBde] = await Promise.all([
      treasury.getTreasuryStatus(),
      reputation.getNetworkStats(),
      bde.getNetworkBdeStats(),
    ]);

    return {
      treasury: treasuryStatus,
      reputation: networkRep,
      bde: networkBde,
      aiBuffer: getAiBuffer(),
      pipeline: {
        status: 'active',
        modules: ['storage', 'routing', 'federated', 'uptime'],
        config: ORCH_CONFIG,
      },
    };
  } catch { return null; }
}

// ── CRON JOBS ─────────────────────────────────────────────────
// Uptime batch ogni ora
setInterval(processBatchUptime, 60 * 60 * 1000);

// AntiFreud ogni 30 minuti
setInterval(runGlobalAntiFraud, 30 * 60 * 1000);

// Primo run dopo 2 minuti
setTimeout(() => {
  processBatchUptime();
  runGlobalAntiFraud();
}, 2 * 60 * 1000);

module.exports = {
  processPipeline,
  processBatchUptime,
  runGlobalAntiFraud,
  getSystemStatus,
  getAiBuffer,
  drainAiBuffer,
  ORCH_CONFIG,
};
