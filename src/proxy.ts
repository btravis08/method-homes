import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

import designops from "../designops.config.json";

/*
  AEO measurement at the edge — the two signals Webflow's AEO analytics
  reports that a page can't see about itself:

  1. LLM bot insights — which answer-engine crawlers (designops
     aeo.bots) read which pages, counted per day.
  2. AI-referred visitors — sessions that arrive from ChatGPT,
     Perplexity, Claude, Gemini… (aeo.aiReferrers). The first hit sets
     a session cookie (mh_ai=<source>) so the session is counted once
     and later pages (and the intake form) can attribute to it.

  Both are recorded fire-and-forget through /api/aeo/hit, which does
  the Sanity write; the response is never delayed. Nothing here runs
  for static assets, the Studio, the API or the section library.
*/

const BOTS = designops.aeo.bots.map((b) => b.toLowerCase());
const REFERRERS = designops.aeo.aiReferrers as { source: string; hosts: string[] }[];
const COOKIE = "mh_ai";

function botFor(ua: string): string | null {
  const lower = ua.toLowerCase();
  const i = BOTS.findIndex((b) => lower.includes(b));
  return i >= 0 ? designops.aeo.bots[i] : null;
}

function sourceFor(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).host.replace(/^www\./, "");
    return REFERRERS.find((r) => r.hosts.some((h) => host === h || host.endsWith(`.${h}`)))?.source ?? null;
  } catch {
    return null;
  }
}

function record(request: NextRequest, event: NextFetchEvent, body: { kind: "bot" | "ai"; name: string; path: string }) {
  const key = process.env.AEO_HIT_KEY || process.env.FORMS_SECRET;
  if (!key) return; // measurement not configured — the site is unaffected
  event.waitUntil(
    fetch(new URL("/api/aeo/hit", request.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-aeo-key": key },
      body: JSON.stringify(body),
    }).catch(() => undefined),
  );
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const path = request.nextUrl.pathname;
  const bot = botFor(request.headers.get("user-agent") ?? "");
  if (bot) {
    record(request, event, { kind: "bot", name: bot, path });
    return NextResponse.next();
  }
  const source = sourceFor(request.headers.get("referer"));
  if (source && !request.cookies.get(COOKIE)) {
    record(request, event, { kind: "ai", name: source, path });
    const res = NextResponse.next();
    res.cookies.set(COOKIE, source, { path: "/", sameSite: "lax", httpOnly: false, maxAge: 60 * 60 * 6 });
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    /* pages only: skip Next internals, static files, the API, the Studio and the section library */
    "/((?!_next/|api/|studio|library|favicon|.*\\.(?:png|jpg|jpeg|webp|avif|gif|svg|ico|css|js|map|txt|xml|woff2?|ttf|mp4|webm|json)$).*)",
  ],
};
