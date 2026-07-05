import { Link } from "react-router-dom";
import type { BurModule } from "@/lib/modules";

export function HiveCell({ module, x, y, size }: { module: BurModule; x: number; y: number; size: number }) {
  const isEmpty = module.name === "";
  const isSoon = module.status === "soon";

  const style: React.CSSProperties = {
    position: "absolute",
    left: x,
    top: y,
    width: size,
    height: size * 1.1547,
  };

  const inner = (
    <div
      className={[
        "hive-cell group relative flex h-full w-full flex-col items-center justify-center px-4 text-center transition-all duration-300",
        isEmpty ? "hive-cell--ghost" : "hive-cell--active",
        isSoon && !isEmpty ? "hive-cell--soon" : "",
      ].join(" ")}
    >
      {!isEmpty && (
        <>
          {module.glyph && (
            <div className="mb-1 text-lg font-light text-[var(--bur-ink)]/70 transition-colors group-hover:text-[var(--bur-gold)]">
              {module.glyph}
            </div>
          )}
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
            {module.name}
          </div>
          <div className="mt-1 max-w-[85%] text-[9px] leading-tight text-muted-foreground">
            {isSoon ? "Soon" : module.tagline}
          </div>
        </>
      )}
    </div>
  );

  if (isEmpty || isSoon) {
    return <div style={style}>{inner}</div>;
  }

  return (
    <Link to={`/module/${module.slug}`} style={style} aria-label={module.name}>
      {inner}
    </Link>
  );
}
