"use client";

import { ReactLenis } from "lenis/react";

/*
  Site-wide scroll easing (Locomotive-style) via Lenis. `root` drives
  the native window scroll position — no transform hijacking — so
  position: sticky (story tiles), fixed (nav, footer reveal), and the
  nav's scroll listeners all keep working, and touch devices keep
  native scrolling (smooth wheel only).
*/
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis root options={{ lerp: 0.1, smoothWheel: true, anchors: true }}>
      {children}
    </ReactLenis>
  );
}
