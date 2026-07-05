import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TopBar } from "./TopBar";

export function ModuleLayout({ name, tagline, children }: { name: string; tagline: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[1200px] px-6 py-14">
        <div className="mb-10">
          <Link to="/" className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
            ← Hive
          </Link>
          <h1 className="mt-4 text-4xl font-light tracking-tight">{name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{tagline}</p>
          <div className="mt-6 h-px w-16 bg-[var(--bur-gold)]" />
        </div>
        <div>{children}</div>
      </main>
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--bur-line)] bg-white p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-light tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Card({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--bur-line)] bg-white p-5">
      <div className="flex items-baseline justify-between gap-4 border-b border-[var(--bur-line)] pb-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.2em]">{title}</div>
        {meta && <div className="text-[11px] text-muted-foreground">{meta}</div>}
      </div>
      <div className="pt-4 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export function Row({ cols }: { cols: (string | ReactNode)[] }) {
  return (
    <div className="grid gap-4 border-b border-[var(--bur-line)] py-3 text-[12px]"
      style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
      {cols.map((c, i) => (
        <div key={i} className={i === 0 ? "text-foreground" : "text-muted-foreground"}>{c}</div>
      ))}
    </div>
  );
}

export function LoadingPulse() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-12 rounded-lg bg-[var(--bur-line)]" />
      ))}
    </div>
  );
}
