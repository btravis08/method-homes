"use client";

import { useEffect, useState } from "react";

import AeoPane from "./AeoPane";
import PerformancePane from "./PerformancePane";
import TrafficPane from "./TrafficPane";

/*
  Analytics — one Studio tool for the three measurement views, the way
  Webflow keeps AEO analytics inside Analyze beside traffic:
    Performance  nightly Lighthouse per page (PerformancePane)
    AEO          maturity grade + prompt insights (AeoPane)
    Traffic      LLM bot visits + AI-referred sessions (TrafficPane)
  Deep links: /studio/analytics#aeo, #traffic, #performance.
*/

const VIEWS = [
  { id: "aeo", label: "AEO" },
  { id: "traffic", label: "Traffic" },
  { id: "performance", label: "Performance" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const fromHash = (): View => {
  const h = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
  return (VIEWS.find((v) => v.id === h)?.id ?? "aeo") as View;
};

export default function AnalyticsPane() {
  const [view, setView] = useState<View>("aeo");
  useEffect(() => {
    const sync = () => setView(fromHash());
    const t = setTimeout(sync, 0);
    window.addEventListener("hashchange", sync);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  const pick = (id: View) => {
    window.history.replaceState(window.history.state, "", `#${id}`);
    setView(id);
  };

  return (
    <div data-mode="light" className="flex h-full min-h-0 flex-col bg-surface font-sans text-ink">
      <nav aria-label="Analytics views" className="flex shrink-0 items-center gap-xs border-b border-line px-2xl pt-lg">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => pick(v.id)}
            aria-current={view === v.id ? "page" : undefined}
            className={`label -mb-px border-b-2 px-lg pb-md pt-sm transition-colors ${view === v.id ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1">
        {view === "aeo" ? <AeoPane /> : view === "traffic" ? <TrafficPane /> : <PerformancePane />}
      </div>
    </div>
  );
}
