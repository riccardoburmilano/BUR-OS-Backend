import { Link } from "react-router-dom";
import { TopBar } from "@/components/bur/TopBar";
import { MODULES } from "@/lib/modules";

export default function ModulesPage() {
  const live = MODULES.filter((m) => m.status === "live" && m.name);
  const soon = MODULES.filter((m) => m.status === "soon");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[1200px] px-6 py-14">
        <div className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Index</div>
          <h1 className="mt-3 text-4xl font-light tracking-tight">All modules.</h1>
          <div className="mt-6 h-px w-16 bg-[var(--bur-gold)]" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((m) => (
            <Link key={m.slug} to={`/module/${m.slug}`}
              className="group rounded-lg border border-[var(--bur-line)] bg-white p-5 transition-all hover:border-[var(--bur-gold)] hover:shadow-[0_0_20px_color-mix(in_oklab,var(--bur-gold)_30%,transparent)]">
              <div className="mb-1 text-xl text-[var(--bur-ink)]/60 group-hover:text-[var(--bur-gold)]">{m.glyph}</div>
              <div className="text-[11px] font-medium uppercase tracking-[0.16em]">{m.name}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{m.tagline}</div>
              {m.domain && (
                <div className="mt-3 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">{m.domain}</div>
              )}
            </Link>
          ))}
        </div>

        {soon.length > 0 && (
          <div className="mt-12">
            <div className="mb-4 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Coming soon</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {soon.map((m) => (
                <div key={m.slug} className="rounded-lg border border-[var(--bur-line)] bg-[#fafafa] p-5 opacity-50">
                  <div className="mb-1 text-xl text-[var(--bur-ink)]/40">{m.glyph}</div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em]">{m.name}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Soon</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
