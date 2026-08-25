/* Workspace icon for the Studio navbar chip and workspace switcher —
   replaces the auto-generated "MH" initials. Drawn inline in
   currentColor so it stays legible on both Studio themes. */
export function StudioIcon() {
  return (
    <svg
      viewBox="0 0 100 100"
      width="1em"
      height="1em"
      style={{ display: "block" }}
      aria-label="Method Homes"
    >
      <g stroke="currentColor" strokeWidth="20" strokeLinecap="round" fill="none">
        <line x1="26" y1="75" x2="40" y2="32" />
        <line x1="60" y1="30" x2="74" y2="75" />
      </g>
      <circle cx="86" cy="19" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <text
        x="86"
        y="22"
        fontFamily="Arial, sans-serif"
        fontSize="8"
        textAnchor="middle"
        fill="currentColor"
      >
        R
      </text>
    </svg>
  );
}
