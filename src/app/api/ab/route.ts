import { NextResponse } from "next/server";
import { createClient } from "next-sanity";

import { apiVersion, dataset, projectId } from "@/sanity/env";

/*
  Experiment telemetry endpoint (D1): increments running counters on
  one abResult document per experiment. Counter keys are flat
  (views_<variantKey> / converts_<variantKey>) so the Overview pane
  can read them without knowing variant shapes. Writes are atomic
  (setIfMissing + inc in one transaction) — concurrent beacons never
  lose counts. Needs SANITY_API_WRITE_TOKEN, same as /api/forms;
  without it the endpoint answers 503 and the site is unaffected.
*/

const writeToken = process.env.SANITY_API_WRITE_TOKEN;
const writeClient = writeToken
  ? createClient({ projectId, dataset, apiVersion, token: writeToken, useCdn: false })
  : null;

/* nuisance brake, per instance (beacons are 2/pageview at most) */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;
const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 1000) {
    for (const [k, v] of hits)
      if (now - (v[v.length - 1] ?? 0) > WINDOW_MS) hits.delete(k);
  }
  return recent.length > MAX_PER_WINDOW;
}

const ID_RE = /^[a-zA-Z0-9-]{1,60}$/;

export async function POST(request: Request) {
  if (!writeClient)
    return NextResponse.json({ error: "not configured" }, { status: 503 });

  let body: { experiment?: unknown; variant?: unknown; event?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const experiment = typeof body.experiment === "string" ? body.experiment : "";
  const variant = typeof body.variant === "string" ? body.variant : "";
  const event = body.event === "view" || body.event === "convert" ? body.event : null;
  if (!ID_RE.test(experiment) || !ID_RE.test(variant) || !event)
    return NextResponse.json({ error: "invalid fields" }, { status: 400 });

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return NextResponse.json({ ok: true });

  const id = `abres-${experiment}`;
  const counter = `counters.${event === "view" ? "views" : "converts"}_${variant}`;
  try {
    await writeClient
      .transaction()
      .createIfNotExists({ _id: id, _type: "abResult", experiment })
      .patch(id, (p) =>
        /* deep setIfMissing auto-creates the counters object */
        p.setIfMissing({ [counter]: 0 }).inc({ [counter]: 1 }),
      )
      .commit();
  } catch (error) {
    console.error("ab counter write failed:", error);
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
