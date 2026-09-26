import { NextResponse } from "next/server";

/*
  Request plumbing shared by the /api/forms routes: same-origin check,
  client IP, JSON responses that never cache, a per-instance sliding
  window rate limiter and small coercion helpers. Server-only.
*/

export const MAX_BODY_BYTES = 32_000;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : undefined;

export const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/* browsers always send Origin on a cross-site POST; a mismatch means
   another site is posting into our inbox */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/* the public origin of this deployment, for links we send by email */
export function publicOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/* serverless instances don't share it, which is fine as a nuisance
   brake; `max` hits per `windowMs` per key */
export function rateLimiter(max: number, windowMs = 60_000) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 1000) {
      for (const [k, v] of hits) if (now - (v[v.length - 1] ?? 0) > windowMs) hits.delete(k);
    }
    return recent.length > max;
  };
}

/* parse a JSON object body under the size cap; undefined = reject */
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | undefined> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return undefined;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return undefined;
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
    return body as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
