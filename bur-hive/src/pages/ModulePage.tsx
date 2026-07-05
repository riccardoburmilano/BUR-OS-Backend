import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getModule, MODULES } from "@/lib/modules";
import { ModuleLayout, Stat, Card, Row, LoadingPulse } from "@/components/bur/ModuleLayout";
import { api, fmtEur, fmtDate, fmt, type NetworkStats, type SignalsData, type LedgerData } from "@/lib/api";

export default function ModulePage() {
  const { slug } = useParams<{ slug: string }>();
  const module = getModule(slug ?? "");

  if (!module || module.name === "") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <div className="text-center">
          <div>Cell not found.</div>
          <Link to="/" className="mt-4 inline-block text-foreground underline">Return to the hive</Link>
        </div>
      </div>
    );
  }

  const Body = MODULE_BODIES[module.slug] ?? DefaultModule;

  return (
    <ModuleLayout name={module.name} tagline={module.tagline}>
      <Body description={module.description} />
    </ModuleLayout>
  );
}

// ── Shared hook ───────────────────────────────────────────────
function useNetworkStats() {
  const [data, setData] = useState<NetworkStats | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getNetworkStats().then(d => { setData(d); setLoading(false); });
  }, []);
  return { data, loading };
}

// ── Module bodies ─────────────────────────────────────────────

function DefaultModule({ description }: { description: string }) {
  return <p className="text-sm text-muted-foreground max-w-prose">{description}</p>;
}

function HubModule() {
  const { data, loading } = useNetworkStats();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<NetworkStats | null>(null);

  useEffect(() => { if (data) setStats(data); }, [data]);

  const refresh = async () => {
    setRefreshing(true);
    const fresh = await api.getNetworkStats();
    if (fresh) setStats(fresh);
    setRefreshing(false);
  };

  if (loading) return <LoadingPulse />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-[0.2em]">Live data · Backend Render</p>
        <button onClick={refresh} disabled={refreshing}
          className="text-[11px] border border-[var(--bur-line)] px-3 py-1.5 rounded hover:border-[var(--bur-gold)] transition-colors">
          {refreshing ? "…" : "↻ Refresh"}
        </button>
      </div>

      {stats ? (
        <>
          <section>
            <h3 className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Treasury</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Balance EUR" value={fmtEur(stats.treasury.balance.eur)} />
              <Stat label="BUR Credits" value={fmt(stats.treasury.balance.burCredits, 2)} />
              <Stat label="Ultimo recycling" value={fmtDate(stats.treasury.lastRecycling)} />
              <Stat label="Prossimo recycling" value={fmtDate(stats.treasury.nextRecycling)} />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Rete</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Device totali" value={stats.reputation.total_devices} />
              <Stat label="Attivi 24h" value={stats.reputation.active_24h} />
              <Stat label="Score medio" value={fmt(stats.reputation.avg_score, 1)} />
              <Stat label="Sospesi" value={stats.reputation.suspended} />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">BDE oggi</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Device attivi" value={stats.bde.last24h.active_devices} />
              <Stat label="Events totali" value={stats.bde.last24h.total_events} />
              <Stat label="Revenue stimata" value={fmtEur(stats.bde.projectedMonthly) + "/mese"} />
              <Stat label="AI Buffer" value={fmt(stats.aiBuffer.credits, 4) + " cr"} />
            </div>
          </section>

          {stats.treasury.recentCycles.length > 0 && (
            <section>
              <h3 className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Ultimi cicli treasury</h3>
              <div className="overflow-hidden rounded-lg border border-[var(--bur-line)]">
                <Row cols={["Ciclo", "Data", "Valore €", "Device", "Stato"]} />
                {stats.treasury.recentCycles.slice(0, 5).map(c => (
                  <Row key={c.id} cols={[
                    `#${c.cycle_number}`,
                    fmtDate(c.started_at),
                    fmtEur(c.total_value_eur),
                    String(c.devices_rewarded),
                    c.status
                  ]} />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <Card title="Nessun dato" meta="Render potrebbe essere in cold start">
          Il server si sveglia in 30-50 secondi. Riprova il refresh.
        </Card>
      )}
    </div>
  );
}

function RevenueModule() {
  const { data, loading } = useNetworkStats();
  if (loading) return <LoadingPulse />;
  if (!data) return <DefaultModule description="Dati non disponibili — il backend potrebbe essere in cold start." />;

  const split = { users: 0.60, treasury: 0.20, platform: 0.20 };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Split 60/20/20</h3>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Utenti" value="60%" sub="proporzionale energia" />
          <Stat label="Treasury" value="20%" sub="riserve sistema" />
          <Stat label="Platform" value="20%" sub="operativo + sviluppo" />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Lifetime</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Generato totale" value={fmtEur(data.treasury.lifetime.totalGenerated)} />
          <Stat label="Distribuito" value={fmtEur(data.treasury.lifetime.totalDistributed)} />
          <Stat label="Agli utenti" value={fmtEur(data.treasury.lifetime.toUsers)} />
          <Stat label="Platform" value={fmtEur(data.treasury.lifetime.toPlatform)} />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Moduli BDE attivi</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {data.pipeline.modules.map(m => (
            <Card key={m} title={m}>
              <span className="text-[var(--bur-gold)]">●</span> Attivo
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function TreasuryModule() {
  const { data, loading } = useNetworkStats();
  const [ledger, setLedger] = useState<LedgerData | null>(null);

  useEffect(() => {
    api.getLedger().then(d => { if (d) setLedger(d); });
  }, []);

  if (loading) return <LoadingPulse />;

  return (
    <div className="space-y-8">
      {data && (
        <section>
          <h3 className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Stato attuale</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Balance EUR" value={fmtEur(data.treasury.balance.eur)} />
            <Stat label="BUR Credits" value={fmt(data.treasury.balance.burCredits)} />
            <Stat label="Prossimo ciclo" value={fmtDate(data.treasury.nextRecycling)} />
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Revenue Ledger {ledger ? `— Totale iniettato: ${fmtEur(ledger.total_injected)}` : ""}
        </h3>
        {ledger && ledger.ledger.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-[var(--bur-line)]">
            <Row cols={["Source", "Periodo", "Importo", "Utenti", "Platform", "Data"]} />
            {ledger.ledger.map(r => (
              <Row key={r.id} cols={[
                r.source, r.period,
                fmtEur(r.amount_eur),
                fmtEur(r.to_users_eur),
                fmtEur(r.to_platform_eur),
                fmtDate(r.injected_at)
              ]} />
            ))}
          </div>
        ) : (
          <Card title="Nessuna iniezione revenue" meta="Gap 1">
            Quando Amazon Associates paga il bonifico mensile, iniettalo tramite POST /bde/treasury/inject-revenue
          </Card>
        )}
      </section>
    </div>
  );
}

function SignalsModule() {
  const [data, setData] = useState<SignalsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSignals(7).then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading) return <LoadingPulse />;
  if (!data) return <DefaultModule description="Segnali non disponibili — verifica che Gap 2 sia deployato." />;

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Sommario ultimi 7 giorni</h3>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Intent signals" value={String(data.summary.total_intent_signals)} />
          <Stat label="Keyword uniche" value={String(data.summary.unique_keywords)} />
          <Stat label="Valore dataset" value={fmtEur(data.summary.estimated_dataset_value_eur)} />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Categorie</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Object.entries(data.categories).map(([cat, vol]) => (
            <Stat key={cat} label={cat} value={String(vol)} />
          ))}
        </div>
      </section>

      {data.top_keywords.length > 0 && (
        <section>
          <h3 className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Top keyword</h3>
          <div className="overflow-hidden rounded-lg border border-[var(--bur-line)]">
            <Row cols={["Keyword", "Volume", "Device unici", "Valore commerciale"]} />
            {data.top_keywords.slice(0, 15).map(k => (
              <Row key={k.keyword} cols={[
                k.keyword,
                String(k.volume),
                String(k.unique_devices),
                fmtEur(k.commercial_value)
              ]} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function WalletModule() {
  const { data, loading } = useNetworkStats();
  if (loading) return <LoadingPulse />;
  if (!data) return <DefaultModule description="Wallet non disponibile." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="BUR Credits" value={fmt(data.treasury.balance.burCredits)} />
        <Stat label="EUR equivalente" value={fmtEur(data.treasury.balance.eur)} />
        <Stat label="AI Buffer" value={fmt(data.aiBuffer.credits, 4) + " cr"} />
      </div>
      <Card title="Conversione" meta="1 BUR = €0.01">
        Raggiungi €10 di BUR Credits per richiedere il pagamento via Wise/SEPA.
      </Card>
      <Card title="Split distribuzione">
        60% utenti · 20% treasury · 20% platform
      </Card>
    </div>
  );
}

function IdentityModule() {
  const { data, loading } = useNetworkStats();
  if (loading) return <LoadingPulse />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Device registrati" value={data?.reputation.total_devices ?? "—"} />
        <Stat label="Attivi 24h" value={data?.reputation.active_24h ?? "—"} />
        <Stat label="Sospesi" value={data?.reputation.suspended ?? "—"} />
      </div>
      <Card title="Reputation Engine">
        Ogni device ha uno score 0-100. Decay −2%/giorno. Boost +1%/ora uptime stabile.
        Livelli: Neutrino → Orbiter → Photon → Quasar → Singolarità.
      </Card>
    </div>
  );
}

function PayoutsModule() {
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  useEffect(() => { api.getLedger().then(d => { if (d) setLedger(d); }); }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Totale iniettato" value={fmtEur(ledger?.total_injected ?? 0)} />
        <Stat label="Iniezioni" value={String(ledger?.ledger.length ?? 0)} />
      </div>
      <Card title="Metodo pagamento" meta="Wise Business">
        Bonifici SEPA batch mensili. Fee €0.41 per bonifico. Soglia minima €10.
      </Card>
      <Card title="Fonti revenue" meta="Attive">
        Amazon Associates (burbrowser-21) · Awin (ID 2970857 — in attesa approvazione)
      </Card>
    </div>
  );
}

function LedgerModule() {
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.getLedger().then(d => { setLedger(d); setLoading(false); }); }, []);

  if (loading) return <LoadingPulse />;

  return (
    <div className="space-y-6">
      <Stat label="Totale revenue iniettata" value={fmtEur(ledger?.total_injected ?? 0)} />
      {ledger && ledger.ledger.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-[var(--bur-line)]">
          <Row cols={["Source", "Periodo", "Importo", "Utenti (60%)", "Treasury (20%)", "Platform (20%)"]} />
          {ledger.ledger.map(r => (
            <Row key={r.id} cols={[
              r.source, r.period,
              fmtEur(r.amount_eur),
              fmtEur(r.to_users_eur),
              fmtEur(r.to_treasury_eur),
              fmtEur(r.to_platform_eur)
            ]} />
          ))}
        </div>
      ) : (
        <Card title="Ledger vuoto" meta="Gap 1">
          Nessuna revenue iniettata ancora. Quando Amazon Associates paga, usa POST /bde/treasury/inject-revenue
        </Card>
      )}
    </div>
  );
}

function MarketModule() {
  const [signals, setSignals] = useState<SignalsData | null>(null);
  useEffect(() => { api.getSignals(30).then(d => { if (d) setSignals(d); }); }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Amazon Associates" value="burbrowser-21" sub="Attivo" />
        <Stat label="Awin" value="ID 2970857" sub="In attesa approvazione" />
        <Stat label="Tradedoubler" value="In registrazione" sub="—" />
      </div>
      {signals && (
        <Card title="Mercato più richiesto (30gg)" meta={`${signals.summary.total_intent_signals} signal`}>
          {Object.entries(signals.categories)
            .sort(([,a],[,b]) => b-a)
            .slice(0, 3)
            .map(([cat, vol]) => `${cat}: ${vol} intent`)
            .join(" · ")}
        </Card>
      )}
    </div>
  );
}

function VaultModule() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Backend" value="Render" sub="god-core-backend" />
        <Stat label="Database" value="Neon" sub="PostgreSQL serverless" />
        <Stat label="Estensione" value="Chrome" sub="v1.3.0" />
      </div>
      <Card title="Cold storage">
        Asset a lungo termine del sistema BUR. Include crediti non distribuiti, riserve treasury e configurazioni critiche.
      </Card>
    </div>
  );
}

function RulesModule() {
  const [levels, setLevels] = useState<any>(null);
  useEffect(() => { api.getLevels().then(d => { if (d) setLevels(d); }); }, []);

  return (
    <div className="space-y-6">
      <Card title="Split economico" meta="Definitivo">
        60% utenti · 20% treasury · 20% platform
      </Card>
      <Card title="Reputation Engine" meta="Attivo">
        Decay: −2%/giorno · Boost: +1%/ora · Cap: +5%/giorno · Flag: 24h freeze
      </Card>
      {levels && (
        <Card title="BDE Rates" meta="Per evento">
          {Object.entries(levels.rates).map(([k, v]) => `${k}: €${v}`).join(' · ')}
        </Card>
      )}
      <Card title="Treasury" meta="Ogni 2 ore">
        Formula: energia × 1.33. Recycling automatico. AI Buffer: 10% dei crediti generati.
      </Card>
    </div>
  );
}

function SettingsModule() {
  return (
    <div className="max-w-xl space-y-4">
      <Card title="Workspace">BUR Browser — Browser for Universal Revenue</Card>
      <Card title="Appearance">White · Minimal · Geometric</Card>
      <Card title="Modules">{MODULES.filter((m) => m.name).length} registered</Card>
      <Card title="Backend">https://god-core-backend.onrender.com</Card>
      <Card title="Split">60% utenti · 20% treasury · 20% platform</Card>
    </div>
  );
}

// ── Module registry ───────────────────────────────────────────
const MODULE_BODIES: Record<string, React.FC<{ description: string }>> = {
  hub: HubModule,
  "revenue-engine": RevenueModule,
  treasury: TreasuryModule,
  signals: SignalsModule,
  wallet: WalletModule,
  identity: IdentityModule,
  payouts: PayoutsModule,
  ledger: LedgerModule,
  market: MarketModule,
  vault: VaultModule,
  rules: RulesModule,
  settings: SettingsModule,
};
