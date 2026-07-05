import { Link } from "react-router-dom";
import { BeeLogo } from "./BeeLogo";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--bur-line)] bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-6">
        <Link to="/" className="flex items-center gap-2.5 text-foreground">
          <BeeLogo size={22} className="text-foreground" />
          <div className="leading-none">
            <div className="text-[13px] font-medium tracking-[0.12em]">BUR BROWSER</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Browser for Universal Revenue
            </div>
          </div>
        </Link>

        <div className="flex-1">
          <div className="mx-auto flex h-9 max-w-md items-center gap-2 rounded-full border border-[var(--bur-line)] bg-white px-4 text-sm text-muted-foreground transition-colors focus-within:border-[var(--bur-gold)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              placeholder="Search the hive…"
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <nav className="flex items-center gap-4 text-muted-foreground">
          <IconBtn label="Modules" href="/modules">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </IconBtn>
          <IconBtn label="Settings" href="/module/settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </IconBtn>
        </nav>
      </div>
    </header>
  );
}

function IconBtn({ children, href, label }: { children: React.ReactNode; href: string; label: string }) {
  return (
    <Link
      to={href}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--bur-gold-soft)]/40 hover:text-foreground"
    >
      {children}
    </Link>
  );
}
