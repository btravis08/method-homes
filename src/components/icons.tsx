/* 10–20px stroke icons matching the library's icon set */

function Base({
  children,
  size = 10,
  className = "",
}: {
  children: React.ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="square"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function ArrowLeft({ size, className }: { size?: number; className?: string }) {
  return (
    <Base size={size} className={className}>
      <path d="M20 12H4m0 0l6-6m-6 6l6 6" />
    </Base>
  );
}

export function ArrowRight({ size, className }: { size?: number; className?: string }) {
  return (
    <Base size={size} className={className}>
      <path d="M4 12h16m0 0l-6-6m6 6l-6 6" />
    </Base>
  );
}

export function ArrowUp({ size, className }: { size?: number; className?: string }) {
  return (
    <Base size={size} className={className}>
      <path d="M12 20V4m0 0l-6 6m6-6l6 6" />
    </Base>
  );
}

export function CurrencyDollar({ size, className }: { size?: number; className?: string }) {
  return (
    <Base size={size} className={className}>
      <path d="M6 16c0 2.21 2.686 4 6 4s6-1.79 6-4-2.686-4-6-4-6-1.79-6-4 2.686-4 6-4 6 1.79 6 4M12 2v20" />
    </Base>
  );
}

export function ArrowUpRight({ size, className }: { size?: number; className?: string }) {
  return (
    <Base size={size} className={className}>
      <path d="M7 17L17 7m0 0H7m10 0v10" />
    </Base>
  );
}

export function ChevronRight({ size, className }: { size?: number; className?: string }) {
  return (
    <Base size={size} className={className}>
      <path d="M9 18l6-6-6-6" />
    </Base>
  );
}

export function ChevronDown({ size, className }: { size?: number; className?: string }) {
  return (
    <Base size={size} className={className}>
      <path d="M6 9l6 6 6-6" />
    </Base>
  );
}

export function Plus({ size, className }: { size?: number; className?: string }) {
  return (
    <Base size={size} className={className}>
      <path d="M12 4v16M4 12h16" />
    </Base>
  );
}

export function Minus({ size, className }: { size?: number; className?: string }) {
  return (
    <Base size={size} className={className}>
      <path d="M4 12h16" />
    </Base>
  );
}

export function FilterLines({ size, className }: { size?: number; className?: string }) {
  return (
    <Base size={size} className={className}>
      <path d="M3 6h18M7 12h10M10 18h4" />
    </Base>
  );
}

export function Ruler({ size, className }: { size?: number; className?: string }) {
  return (
    <Base size={size} className={className}>
      <path d="M3 21L21 3M7 17l1.5 1.5M10.5 13.5L12 15M14 10l1.5 1.5M17.5 6.5L19 8" />
    </Base>
  );
}

export function SearchMd({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export function Pause({ className }: { className?: string }) {
  return (
    <svg style={{ width: "0.5rem", height: "0.5rem" }} viewBox="0 0 8 8" fill="currentColor" className={className} aria-hidden>
      <rect x="1.4" y="0" width="1.4" height="8" />
      <rect x="5.1" y="0" width="1.4" height="8" />
    </svg>
  );
}

export function Play({ className }: { className?: string }) {
  return (
    <svg style={{ width: "0.5rem", height: "0.5rem" }} viewBox="0 0 8 8" fill="currentColor" className={className} aria-hidden>
      <path d="M1.5 0.5l6 3.5-6 3.5z" />
    </svg>
  );
}

export function Bag({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="miter"
      className={className}
      aria-hidden
    >
      <path d="M5 8h14l-1.2 13H6.2L5 8z" />
      <path d="M9 11V6a3 3 0 0 1 6 0v5" />
    </svg>
  );
}

export function Close({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <Base size={size} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Base>
  );
}

export function Menu({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      className={className}
      aria-hidden
    >
      <path d="M3 9h18M3 15h18" />
    </svg>
  );
}
