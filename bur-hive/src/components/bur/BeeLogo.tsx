export function BeeLogo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-label="BUR Browser">
      <path d="M16 5 L26 10.5 L26 21.5 L16 27 L6 21.5 L6 10.5 Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M10.5 13 H21.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 19 H21.5" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="9" cy="9" rx="3" ry="1.6" stroke="currentColor" strokeWidth="1.2" fill="none" transform="rotate(-25 9 9)" />
      <ellipse cx="23" cy="9" rx="3" ry="1.6" stroke="currentColor" strokeWidth="1.2" fill="none" transform="rotate(25 23 9)" />
    </svg>
  );
}
