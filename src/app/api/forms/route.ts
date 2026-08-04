import { NextResponse } from "next/server";
import { createClient } from "next-sanity";

import { apiVersion, dataset, projectId } from "@/sanity/env";

/*
  Form submission endpoint: writes formSubmission documents to the
  dataset. Needs SANITY_API_WRITE_TOKEN (an Editor-role token, set in
  Vercel env) — without it the endpoint answers 503 and the client
  shows its error state, so the published site never breaks for
  missing config.
*/
const writeToken = process.env.SANITY_API_WRITE_TOKEN;
const writeClient = writeToken
  ? createClient({ projectId, dataset, apiVersion, token: writeToken, useCdn: false })
  : null;

/* per-instance sliding-window rate limit — serverless instances don't
   share it, which is fine as a nuisance brake (5/min per IP) */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 1000) {
    for (const [k, v] of hits) if (now - (v[v.length - 1] ?? 0) > WINDOW_MS) hits.delete(k);
  }
  return recent.length > MAX_PER_WINDOW;
}

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : undefined;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  /* honeypot: bots fill the hidden "website" field — pretend success */
  if (str(body.website, 10)) return NextResponse.json({ ok: true });

  const form = str(body.form, 40);
  if (!form) return NextResponse.json({ error: "missing form" }, { status: 400 });

  const email = str(body.email, 200);
  const name = str(body.name, 200);
  const message = str(body.message, 5000);
  if (email && !EMAIL_RE.test(email))
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  if (!email && !message)
    return NextResponse.json({ error: "empty submission" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip))
    return NextResponse.json({ error: "too many requests" }, { status: 429 });

  if (!writeClient)
    return NextResponse.json(
      { error: "form backend not configured" },
      { status: 503 },
    );

  const extra = Array.isArray(body.fields)
    ? body.fields
        .slice(0, 20)
        .map((f: Record<string, unknown>, i: number) => ({
          _type: "submissionField",
          _key: `f${i}`,
          key: str(f?.key, 60) ?? "",
          value: str(f?.value, 500) ?? "",
        }))
        .filter((f) => f.key)
    : undefined;

  try {
    await writeClient.create({
      _type: "formSubmission",
      form,
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(message ? { message } : {}),
      ...(extra?.length ? { fields: extra } : {}),
      page: str(body.page, 200),
      submittedAt: new Date().toISOString(),
      read: false,
    });
  } catch {
    return NextResponse.json({ error: "could not save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
