import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/*
  Time-trap tokens. GET /api/forms hands the form a signed timestamp
  when it opens; the submission must carry it back. Bots that post
  straight to the endpoint have no token, and scripts that fetch one
  and post immediately fail the minimum fill time — a person cannot
  finish a form in under MIN_FILL_MS.

  The key is FORMS_SECRET, or (so nothing new has to be configured)
  a hash derived from SANITY_API_WRITE_TOKEN. With neither set the
  check is skipped — the endpoint can't store anything then anyway.

  Server-only (node:crypto): import from route handlers, never from
  client components.
*/

export const MIN_FILL_MS = 3_000;
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function secret(): Buffer | null {
  if (process.env.FORMS_SECRET) return Buffer.from(process.env.FORMS_SECRET);
  const t = process.env.SANITY_API_WRITE_TOKEN;
  return t ? createHash("sha256").update(`forms:${t}`).digest() : null;
}

const sign = (key: Buffer, payload: string) =>
  createHmac("sha256", key).update(payload).digest("base64url");

export function issueToken(now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const payload = `${now}.${randomBytes(9).toString("base64url")}`;
  return `${payload}.${sign(key, payload)}`;
}

export type TokenCheck = { ok: true } | { ok: false; reason: "missing" | "invalid" | "too-fast" | "expired" };

export function checkToken(token: unknown, now = Date.now()): TokenCheck | null {
  const key = secret();
  if (!key) return null; // not configured — caller skips the check
  if (typeof token !== "string" || !token) return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "invalid" };
  const [issued, nonce, mac] = parts;
  const expected = Buffer.from(sign(key, `${issued}.${nonce}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return { ok: false, reason: "invalid" };
  const age = now - Number(issued);
  if (!Number.isFinite(age) || age < 0) return { ok: false, reason: "invalid" };
  if (age < MIN_FILL_MS) return { ok: false, reason: "too-fast" };
  if (age > MAX_AGE_MS) return { ok: false, reason: "expired" };
  return { ok: true };
}
