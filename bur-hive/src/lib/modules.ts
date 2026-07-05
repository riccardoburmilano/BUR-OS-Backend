export interface BurModule {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  status: "live" | "soon";
  glyph?: string;
  domain?: "core" | "capital" | "flow" | "market" | "trust";
}

export const MODULES: BurModule[] = [
  {
    slug: "hub",
    name: "BUR Hub",
    tagline: "The center of the hive.",
    description: "Central control surface. Live pulse of the economy — capital, flows, signals and trust in one glance.",
    status: "live",
    glyph: "◎",
    domain: "core",
  },
  {
    slug: "revenue-engine",
    name: "Revenue Engine",
    tagline: "Universal revenue, orchestrated.",
    description: "Pipelines, flows and rules that turn signal into revenue. Composable primitives for building your own money surface.",
    status: "live",
    glyph: "⟁",
    domain: "flow",
  },
  {
    slug: "wallet",
    name: "Wallet",
    tagline: "Hold and move value.",
    description: "Multi-asset balances, transfers and allowances. The user-facing edge of the economy.",
    status: "live",
    glyph: "◈",
    domain: "capital",
  },
  {
    slug: "ledger",
    name: "Ledger",
    tagline: "Every entry, immutable.",
    description: "Double-entry ledger recording every debit and credit across the hive.",
    status: "live",
    glyph: "≣",
    domain: "capital",
  },
  {
    slug: "market",
    name: "Market",
    tagline: "Prices meet demand.",
    description: "Order book, quotes and matching for internal and external instruments.",
    status: "live",
    glyph: "⇅",
    domain: "market",
  },
  {
    slug: "treasury",
    name: "Treasury",
    tagline: "Reserves and yield.",
    description: "Manage reserves, allocations, hedges and yield strategies for the workspace.",
    status: "live",
    glyph: "◇",
    domain: "capital",
  },
  {
    slug: "signals",
    name: "Signals",
    tagline: "Inbound truth.",
    description: "Streaming events from every source, normalized and ready to be turned into revenue.",
    status: "live",
    glyph: "∿",
    domain: "flow",
  },
  {
    slug: "payouts",
    name: "Payouts",
    tagline: "Value out.",
    description: "Scheduled and rules-based distributions across partners, contributors and treasuries.",
    status: "live",
    glyph: "→",
    domain: "flow",
  },
  {
    slug: "identity",
    name: "Identity",
    tagline: "Who transacts.",
    description: "Actors, keys and roles. Every transaction has a signer.",
    status: "live",
    glyph: "◐",
    domain: "trust",
  },
  {
    slug: "vault",
    name: "Vault",
    tagline: "Cold storage.",
    description: "Custody of long-horizon assets, secrets and quorum-signed operations.",
    status: "live",
    glyph: "▣",
    domain: "trust",
  },
  {
    slug: "rules",
    name: "Rules",
    tagline: "Policy as code.",
    description: "Guardrails, limits and compliance policies applied to every flow.",
    status: "live",
    glyph: "⊞",
    domain: "trust",
  },
  {
    slug: "quota",
    name: "Quota",
    tagline: "Your share of the flow.",
    description: "Allocations, entitlements and share-of-revenue accounting.",
    status: "soon",
    glyph: "◔",
    domain: "capital",
  },
  {
    slug: "match",
    name: "Match",
    tagline: "Counterparty discovery.",
    description: "Discover, score and route counterparties across the hive graph.",
    status: "soon",
    glyph: "◑",
    domain: "market",
  },
  {
    slug: "settings",
    name: "Settings",
    tagline: "Tune the hive.",
    description: "Workspace configuration, identity, appearance and module-level preferences.",
    status: "live",
    glyph: "⚙",
    domain: "core",
  },
];

export const getModule = (slug: string) => MODULES.find((m) => m.slug === slug);
