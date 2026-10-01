import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { createClient } from "next-sanity";

import { apiVersion, dataset, projectId } from "@/sanity/env";

import designops from "../../../../../designops.config.json";

/*
  AEO traffic counters, written by src/proxy.ts (never by browsers):
  one aeoBotHit document per day × crawler × path and one aeoAiSession
  per day × AI source × landing path, each with an atomic `hits`
  counter (createIfNotExists + inc in one transaction). The nightly
  aeo workflow reads them back for the LLM bot insights and AI-referred
  visitor panels. Needs SANITY_API_WRITE_TOKEN (as /api/forms) and the
  shared key the proxy sends (AEO_HIT_KEY, falling back to
  FORMS_SECRET); without either it answers 503 and nothing else changes.
*/

const writeToken = process.env.SANITY_API_WRITE_TOKEN;
const writeClient = writeToken ? createClient({ projectId, dataset, apiVersion, token: writeToken, useCdn: false }) : null;
const KEY = process.env.AEO_HIT_KEY || process.env.FORMS_SECRET;

const BOTS = new Set<string>(designops.aeo.bots);
const SOURCES = new Set<string>((designops.aeo.aiReferrers as { source: string }[]).map((r) => r.source));

/* nuisance brake, per instance */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 600;
let windowStart = Date.now();
let count = 0;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 10);

export async function POST(request: Request) {
  if (!KEY || request.headers.get("x-aeo-key") !== KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!writeClient) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    count = 0;
  }
  if (++count > MAX_PER_WINDOW) return NextResponse.json({ ok: true, dropped: true });

  let body: { kind?: unknown; name?: unknown; path?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const kind = body.kind === "bot" || body.kind === "ai" ? body.kind : null;
  const name = typeof body.name === "string" ? body.name : "";
  const rawPath = typeof body.path === "string" ? body.path : "";
  const path = (rawPath.split("?")[0] || "/").slice(0, 160);
  if (!kind || !path.startsWith("/") || (kind === "bot" ? !BOTS.has(name) : !SOURCES.has(name))) {
    return NextResponse.json({ error: "invalid fields" }, { status: 400 });
  }

  const day = new Date().toISOString().slice(0, 10);
  const type = kind === "bot" ? "aeoBotHit" : "aeoAiSession";
  const id = `${type}-${day}-${slug(name)}-${hash(path)}`;
  const stub: { _id: string; _type: string; [key: string]: unknown } = { _id: id, _type: type, day, path, hits: 0, [kind === "bot" ? "bot" : "source"]: name };
  try {
    await writeClient
      .transaction()
      .createIfNotExists(stub)
      .patch(id, (p) => p.inc({ hits: 1 }))
      .commit({ visibility: "async" });
  } catch (error) {
    console.error("aeo hit write failed:", error);
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
