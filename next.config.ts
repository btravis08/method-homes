import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

/*
  Legacy URL redirects (SEO-PLAN Phase 1 / LAUNCH-PLAN E1): the map in
  design/redirects/legacy-map.json is generated from the old site's
  crawl by scripts/build-redirect-map.mjs. Only entries marked `live`
  are emitted — a destination whose route has not shipped yet stays
  out so nothing 301s into a 404. Verified end to end by
  scripts/check-redirects.mjs (redirects.yml). One hop, always.
*/
type MapEntry = { from: string; action: string; to?: string; live?: boolean };
const legacy = JSON.parse(readFileSync(new URL("./design/redirects/legacy-map.json", import.meta.url), "utf8")) as { entries: MapEntry[] };
const legacyRedirects = legacy.entries
  .filter((e) => e.action === "redirect" && e.live && e.to && e.to !== e.from)
  .map((e) => ({ source: e.from, destination: e.to!, permanent: true }));

const nextConfig: NextConfig = {
  /* React Compiler: build-time auto-memoization — cuts re-render
     work across the motion-heavy component tree (INP/TBT) */
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
    ],
  },
  async redirects() {
    return [
      /* the template's journal route became /blog (URL scheme decision
         2026-10-03) — staging links and any indexed staging URLs follow */
      { source: "/journal", destination: "/blog", permanent: true },
      { source: "/journal/:path*", destination: "/blog/:path*", permanent: true },
      ...legacyRedirects,
    ];
  },
};

export default nextConfig;
