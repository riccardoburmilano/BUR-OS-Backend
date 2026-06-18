// ============================================================
// LAZARUS-9 v1.2 — Groq Only (Gemini disabled)
// ============================================================

const Groq = require('groq-sdk');
const { logWrite, uuid, now } = require('./state');

const PROVIDERS = {
  groq_fast: {
    name: 'Groq Fast',
    model: 'llama-3.1-8b-instant',
    tier: 'FAST',
    cost_per_token: 0.0001,
    rpm_limit: 30,
    tpm_limit: 14400,
    rpm_used: 0, tpm_used: 0,
    status: 'ACTIVE',
    reset_at: null,
    total_tokens: 0, total_calls: 0, errors: 0,
  },
  groq_power: {
    name: 'Groq Power',
    model: 'llama-3.3-70b-versatile',
    tier: 'POWER',
    cost_per_token: 0.0003,
    rpm_limit: 30,
    tpm_limit: 6000,
    rpm_used: 0, tpm_used: 0,
    status: 'ACTIVE',
    reset_at: null,
    total_tokens: 0, total_calls: 0, errors: 0,
  },
  groq_nova: {
    name: 'Groq Nova',
    model: 'llama-3.1-70b-versatile',
    tier: 'FAST',
    cost_per_token: 0.0002,
    rpm_limit: 30,
    tpm_limit: 6000,
    rpm_used: 0, tpm_used: 0,
    status: 'ACTIVE',
    reset_at: null,
    total_tokens: 0, total_calls: 0, errors: 0,
  },
};

// ── CACHE ─────────────────────────────────────────────────────
const CACHE = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;
let cache_hits = 0;
let cache_misses = 0;

function cacheKey(system, user) {
  const str = system.slice(0, 100) + '||' + user.slice(0, 200);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'lz9_' + Math.abs(hash).toString(36);
}

function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) { cache_misses++; return null; }
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) { CACHE.delete(key); cache_misses++; return null; }
  cache_hits++;
  return entry.value;
}

function cacheSet(key, value) {
  if (CACHE.size > 500) {
    const keys = [...CACHE.keys()].slice(0, 100);
    keys.forEach(k => CACHE.delete(k));
  }
  CACHE.set(key, { value, timestamp: Date.now() });
}

// ── RATE LIMIT ────────────────────────────────────────────────
function canUse(providerId) {
  const p = PROVIDERS[providerId];
  if (!p || p.status !== 'ACTIVE') return false;
  const now_ms = Date.now();
  if (p.reset_at && now_ms > p.reset_at) {
    p.rpm_used = 0; p.tpm_used = 0;
    p.reset_at = now_ms + 60000;
  }
  if (!p.reset_at) p.reset_at = now_ms + 60000;
  return p.rpm_used < p.rpm_limit * 0.85 && p.tpm_used < p.tpm_limit * 0.85;
}

function recordUsage(providerId, tokens) {
  const p = PROVIDERS[providerId];
  if (!p) return;
  p.rpm_used++;
  p.tpm_used += tokens;
  p.total_tokens += tokens;
  p.total_calls++;
}

function selectProvider(tier) {
  const fastOrder  = ['groq_fast', 'groq_nova', 'groq_power'];
  const powerOrder = ['groq_power', 'groq_nova', 'groq_fast'];
  const order = tier === 'FAST' ? fastOrder : powerOrder;
  for (const id of order) {
    if (canUse(id)) return id;
  }
  return null;
}

// ── GROQ CALLER ───────────────────────────────────────────────
async function callGroq(providerId, systemPrompt, userMsg, maxTokens) {
  const p = PROVIDERS[providerId];
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Per NOVA: tronca il system prompt per non superare TPM
  const truncatedSystem = systemPrompt.length > 3000
    ? systemPrompt.slice(0, 3000) + '\n[Knowledge base troncata per limite token]'
    : systemPrompt;

  const response = await client.chat.completions.create({
    model: p.model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: truncatedSystem },
      { role: 'user', content: userMsg }
    ]
  });

  const text = response.choices[0]?.message?.content || '';
  const tokens = (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0);

  if (!text) throw new Error(`Groq (${p.model}) testo vuoto. finish_reason: ${response.choices[0]?.finish_reason}`);

  return { text, tokens };
}

// ── LAZARUS CORE ──────────────────────────────────────────────
async function lazarusCall(systemPrompt, userMsg, options = {}) {
  const maxTokens = options.maxTokens || 800;
  const forceTier = options.tier || 'FAST';
  const skipCache = options.skipCache || false;

  const ck = cacheKey(systemPrompt, userMsg);
  if (!skipCache) {
    const cached = cacheGet(ck);
    if (cached) return { ...cached, from_cache: true, provider: 'CACHE', tokens: 0, cost: 0 };
  }

  const tier = forceTier;
  const providerId = selectProvider(tier);

  if (!providerId) {
    throw new Error('Tutti i provider Groq temporaneamente esauriti. Riprova tra 60 secondi.');
  }

  const p = PROVIDERS[providerId];
  let text, tokens, actualProviderId = providerId;

  try {
    ({ text, tokens } = await callGroq(providerId, systemPrompt, userMsg, maxTokens));
    p.errors = Math.max(0, p.errors - 1);
  } catch (err) {
    p.errors++;
    if (p.errors > 3) {
      p.status = 'PAUSED';
      setTimeout(() => { p.status = 'ACTIVE'; p.errors = 0; }, 60000);
    }

    logWrite('LAZARUS-9', 'provider_error', { provider: providerId }, { error: err.message }, 'WARN');

    const fallbackTier = tier === 'FAST' ? 'POWER' : 'FAST';
    const fallbackId = selectProvider(fallbackTier) || selectProvider(tier);

    if (fallbackId && fallbackId !== providerId) {
      actualProviderId = fallbackId;
      try {
        ({ text, tokens } = await callGroq(fallbackId, systemPrompt, userMsg, maxTokens));
        PROVIDERS[fallbackId].errors = Math.max(0, PROVIDERS[fallbackId].errors - 1);
        recordUsage(fallbackId, tokens);
      } catch (fallbackErr) {
        PROVIDERS[fallbackId].errors++;
        throw new Error(`Tutti i provider falliti. Primo: ${err.message} | Fallback: ${fallbackErr.message}`);
      }
    } else {
      throw err;
    }
  }

  recordUsage(providerId, tokens);

  const actualProvider = PROVIDERS[actualProviderId];
  const result = {
    text, tokens,
    provider: actualProvider.name,
    model: actualProvider.model,
    tier,
    cost: tokens * actualProvider.cost_per_token
  };

  if (!skipCache && text.length > 50) cacheSet(ck, result);
  logWrite('LAZARUS-9', 'call', { provider: actualProviderId, tier }, { tokens, cost: result.cost.toFixed(6) }, 'SUCCESS');

  return { ...result, from_cache: false };
}

function getStatus() {
  const totalTokens = Object.values(PROVIDERS).reduce((a, p) => a + p.total_tokens, 0);
  const totalCost = Object.values(PROVIDERS).reduce((a, p) => a + p.total_tokens * p.cost_per_token, 0);
  const efficiency = cache_hits + cache_misses > 0 ? Math.round(cache_hits / (cache_hits + cache_misses) * 100) : 0;
  return {
    lazarus_state: 'ACTIVE',
    providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, model: p.model, tier: p.tier, status: p.status, can_use: canUse(id), total_calls: p.total_calls, total_tokens: p.total_tokens, errors: p.errors })),
    cache: { hits: cache_hits, misses: cache_misses, size: CACHE.size, efficiency_pct: efficiency },
    totals: { tokens: totalTokens, cost_estimated: totalCost.toFixed(6) },
    timestamp: now()
  };
}

function clearCache() { CACHE.clear(); cache_hits = 0; cache_misses = 0; }

module.exports = { lazarusCall, getStatus, clearCache, PROVIDERS, classifyTask: () => 'FAST' };
