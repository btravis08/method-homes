"use client";

/* Hamburger that morphs into an X: the two bars glide to the center
   and rotate about their own midpoints (inverse on close), on the
   nav's 300ms curve. Plain HTML bars — SVG transform-origin resolves
   against the path's own box on iOS and mangles the X. */
export function MenuX({ open, className }: { open: boolean; className?: string }) {
  const bar = (top: number, openTf: string): React.CSSProperties => ({
    position: "absolute",
    left: 3,
    width: 10,
    height: 1.5,
    top,
    backgroundColor: "currentColor",
    transform: open ? openTf : "none",
    transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
  });
  return (
    <span
      aria-hidden
      className={`relative block ${className ?? ""}`}
      style={{ width: "1rem", height: "1rem" }}
    >
      <span style={bar(5.25, "translateY(2px) rotate(45deg)")} />
      <span style={bar(9.25, "translateY(-2px) rotate(-45deg)")} />
    </span>
  );
}
