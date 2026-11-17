// The MintMath symbol and wordmark (from the "MintMath Logo" design; source
// brand/mark.svg). Drawn in currentColor so it follows the light/dark theme.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="5" />
      <rect x="62" y="52" width="11" height="96" fill="currentColor" />
      <rect x="127" y="52" width="11" height="96" fill="currentColor" />
      <g stroke="currentColor" fill="none">
        <line x1="67.5" y1="52" x2="100" y2="112" strokeWidth="4" />
        <line x1="100" y1="112" x2="132.5" y2="52" strokeWidth="4" />
        <line x1="56" y1="52" x2="79" y2="52" strokeWidth="3" />
        <line x1="121" y1="52" x2="144" y2="52" strokeWidth="3" />
        <line x1="56" y1="148" x2="79" y2="148" strokeWidth="3" />
        <line x1="121" y1="148" x2="144" y2="148" strokeWidth="3" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <span className="brand" role="img" aria-label="MintMath">
      <LogoMark />
      <span className="brand-word" aria-hidden="true">
        Mint<i>Math</i>
      </span>
    </span>
  );
}
