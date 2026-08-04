"use client";

import { useEffect, useRef } from "react";

/*
  Experiment telemetry island: one "view" per pageview when the picked
  variant is actually seen (30% in view), one "convert" on the first
  link/button click inside it. sendBeacon so navigation is never
  blocked; silent no-op if the endpoint is absent or errors.
*/

export function AbTracker({ exKey }: { exKey: string }) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = anchor.current?.parentElement;
    if (!root) return;
    const pick = root.getAttribute("data-ab-pick");
    if (!pick) return;
    const variant = root.querySelector<HTMLElement>(
      `[data-ab-variant="${CSS.escape(pick)}"]`,
    );
    if (!variant) return;

    const send = (event: "view" | "convert") => {
      try {
        navigator.sendBeacon(
          "/api/ab",
          new Blob(
            [JSON.stringify({ experiment: exKey, variant: pick, event })],
            { type: "application/json" },
          ),
        );
      } catch {
        /* telemetry never breaks the page */
      }
    };

    let viewed = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!viewed && entries.some((e) => e.isIntersecting)) {
          viewed = true;
          io.disconnect();
          send("view");
        }
      },
      { threshold: 0.3 },
    );
    io.observe(variant);

    let converted = false;
    const onClick = (e: MouseEvent) => {
      if (converted) return;
      if ((e.target as Element | null)?.closest("a,button")) {
        converted = true;
        send("convert");
      }
    };
    variant.addEventListener("click", onClick);

    return () => {
      io.disconnect();
      variant.removeEventListener("click", onClick);
    };
  }, [exKey]);

  return <span ref={anchor} hidden />;
}
