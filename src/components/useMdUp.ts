"use client";

import { useEffect, useState } from "react";

/* md-and-up media query as state — SSR assumes desktop, corrected on
   hydration (before any user interaction can open a panel) */
export function useMdUp() {
  const [mdUp, setMdUp] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setMdUp(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mdUp;
}
