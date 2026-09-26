import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { ResumePayload } from "../types";

/*
  Finish-later links. The visitor's answers travel INSIDE the link as
  an AES-256-GCM ciphertext, so nothing is stored server-side, the link
  works on any device, and the answers (which include their email and
  phone) are unreadable to anyone who sees the URL without the key.

  Token = base64url( iv(12) | ciphertext | tag(16) ). The key is derived
  from the same secret the time-trap tokens use, with its own label so
  the two can never be confused for each other.

  Server-only (node:crypto).
*/

export const RESUME_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TOKEN_CHARS = 12_000;

function key(): Buffer | null {
  const base = process.env.FORMS_SECRET ?? (process.env.SANITY_API_WRITE_TOKEN ? `forms:${process.env.SANITY_API_WRITE_TOKEN}` : null);
  return base ? createHash("sha256").update(`resume:${base}`).digest() : null;
}

export const resumeEnabled = () => key() !== null;

export function sealResume(payload: ResumePayload, now = Date.now()): string | null {
  const k = key();
  if (!k) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const plain = Buffer.from(JSON.stringify({ ...payload, exp: now + RESUME_TTL_MS }), "utf8");
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString("base64url");
}

export type ResumeCheck =
  | { ok: true; payload: ResumePayload }
  | { ok: false; reason: "disabled" | "invalid" | "expired" };

export function openResume(token: unknown, now = Date.now()): ResumeCheck {
  const k = key();
  if (!k) return { ok: false, reason: "disabled" };
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN_CHARS) return { ok: false, reason: "invalid" };
  try {
    const buf = Buffer.from(token, "base64url");
    if (buf.length < 12 + 16 + 2) return { ok: false, reason: "invalid" };
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(buf.length - 16);
    const ct = buf.subarray(12, buf.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", k, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    const data = JSON.parse(plain) as ResumePayload & { exp?: number };
    if (!data || typeof data !== "object" || typeof data.form !== "string") return { ok: false, reason: "invalid" };
    if (typeof data.exp !== "number" || data.exp < now) return { ok: false, reason: "expired" };
    const answers = data.answers && typeof data.answers === "object" && !Array.isArray(data.answers) ? data.answers : {};
    return { ok: true, payload: { form: data.form, answers, stepId: typeof data.stepId === "string" ? data.stepId : undefined } };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
