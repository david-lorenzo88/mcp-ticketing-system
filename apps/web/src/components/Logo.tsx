/**
 * Baltic Summit mark: a summit peak rising out of Baltic waves.
 *
 * NOTE: the official logo could not be downloaded from balticsummit.pl in this
 * environment, so this is a stand-in drawn in the brand colours. Replacing this
 * component (and the palette in index.css) with the official asset is the only
 * change needed to make the UI fully on-brand.
 */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Baltic Summit">
      <rect width="32" height="32" rx="7" className="fill-baltic-950" />
      <path d="M16 7.5 24.5 20H19L16 15.2 13 20H7.5L16 7.5Z" className="fill-baltic-400" />
      <path
        d="M6 23.2c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"
        className="stroke-accent-500"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function LogoLockup() {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-[0.18em] text-white uppercase">
          Baltic Summit
        </div>
        <div className="text-xs text-baltic-300">Ticketing &amp; admission</div>
      </div>
    </div>
  );
}
