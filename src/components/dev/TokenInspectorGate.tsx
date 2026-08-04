"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/* The inspector is dev tooling: ordinary visitors must never pay for
   it. An ssr:false dynamic inside this client gate is the only import
   form Next withholds until it actually renders (same pattern as the
   cart flyout) — the chunk loads the first time inspection is
   switched on, and never otherwise. */
const TokenInspector = dynamic(() => import("@/components/dev/TokenInspector"), {
  ssr: false,
});

const KEY = "sdr:inspect";

export function TokenInspectorGate() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("inspect") === "1" || sessionStorage.getItem(KEY) === "1") {
      setOn(true);
    }
    /* Alt+T anywhere toggles it */
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "t" || e.key === "T" || e.code === "KeyT")) {
        e.preventDefault();
        setOn((v) => {
          sessionStorage.setItem(KEY, v ? "0" : "1");
          return !v;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!on) return null;
  return (
    <TokenInspector
      onExit={() => {
        sessionStorage.setItem(KEY, "0");
        setOn(false);
      }}
    />
  );
}
