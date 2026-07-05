// ============================================================
// BUR API — chiamate dirette al backend Render
// Zero Supabase, zero intermediari
// ============================================================

const BASE = "https://god-core-backend.onrender.com/api/v2/operantis";
const INTERNAL_FP = "bur-hive-dashboard-internal-v1";

async function get<T>(path: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...headers },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Tipi ─────────────────────────────────────────────────────

export interface NetworkStats {
  treasury: {
    balance: { eur: number; burCredits: number };
    lifetime: { totalGenerated: number; totalDistributed: number; toUsers: number; toPlatform: number };
    lastRecycling: string;
    nextRecycling: string;
    recentCycles: Array<{
      id: string;
      cycle_number: number;
      started_at: string;
      completed_at: string;
      total_value_eur: number;
      devices_rewarded: number;
      status: string;
    }>;
  };
  reputation: {
    total_devices: string;
    active_24h: string;
    suspended: string;
    avg_score: string | null;
    total_credits_issued: string | null;
  };
  bde: {
    last24h: {
      active_devices: string;
      total_value_generated: string | null;
      total_credits_issued: string | null;
      total_events: string;
    };
    byModule: Array<{ module: string; events: string; value_eur: number }>;
    projectedMonthly: string;
  };
  aiBuffer: { credits: number; eur: number };
  pipeline: {
    status: string;
    modules: string[];
    config: Record<string, unknown>;
  };
}

export interface SignalsData {
  period_days: number;
  generated_at: string;
  summary: {
    total_intent_signals: number;
    unique_keywords: number;
    estimated_dataset_value_eur: number;
  };
  categories: Record<string, number>;
  top_keywords: Array<{ keyword: string; volume: number; unique_devices: number; commercial_value: number }>;
}

export interface LedgerData {
  ledger: Array<{
    id: string;
    source: string;
    period: string;
    amount_eur: number;
    to_users_eur: number;
    to_treasury_eur: number;
    to_platform_eur: number;
    bur_credits_issued: number;
    devices_rewarded: number;
    injected_at: string;
  }>;
  total_injected: number;
}

export interface BurLevels {
  levels: Array<{ name: string; min: number; max: number; multiplier: number }>;
  rates: Record<string, number>;
  config: Record<string, string>;
}

// ── API calls ────────────────────────────────────────────────

export const api = {
  // Hub — stats rete
  getNetworkStats: () =>
    get<NetworkStats>("/bde/network"),

  // Signals — intenti aggregati
  getSignals: (days = 7) =>
    get<SignalsData>(`/bde/signals/aggregate?days=${days}`, {
      "x-device-fingerprint": INTERNAL_FP,
    }),

  // Ledger — storico revenue
  getLedger: () =>
    get<LedgerData>("/bde/treasury/ledger", {
      "x-device-fingerprint": INTERNAL_FP,
    }),

  // Livelli BDE
  getLevels: () =>
    get<BurLevels>("/bde/levels"),

  // Health check
  health: () =>
    get<{ status: string; version: string; mode: string }>("/health".replace("/operantis", "")),
};

// ── Formatter utilities ──────────────────────────────────────

export function fmt(n: number | string | null | undefined, decimals = 2): string {
  if (n === null || n === undefined) return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  return num.toFixed(decimals);
}

export function fmtEur(n: number | string | null | undefined): string {
  return `€${fmt(n, 2)}`;
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
