import { after, NextResponse } from "next/server";
import { createClient } from "next-sanity";

import { FORMS } from "@/lib/forms/registry";
import { notify } from "@/lib/forms/server/notify";
import { spamSignals } from "@/lib/forms/server/spam";
import { checkToken, issueToken } from "@/lib/forms/server/token";
import { verifyTurnstile } from "@/lib/forms/server/turnstile";
import type { Answers, FormDef } from "@/lib/forms/types";
import { describeAnswer, validateAnswers } from "@/lib/forms/validation";
import { apiVersion, dataset, projectId } from "@/sanity/env";

/*
  Form submission endpoint: writes formSubmission documents to the
  dataset. Needs SANITY_API_WRITE_TOKEN (an Editor-role token, set in
  Vercel env) — without it the endpoint answers 503 and the client
  shows its error state, so the published site never breaks for
  missing config.

  Two paths share the guards below:
  - REGISTERED forms (lib/forms/registry — the multi-step engine):
    answers are re-validated against the same definition the browser
    used, then stored with labels, a summary line and first-touch
    attribution.
  - SIMPLE forms (newsletter, one-off contact rows): email / name /
    message / up to 20 extra key-value fields, as before.

  Layered spam defence, cheapest first:
    same-origin + body-size check → honeypot (silently dropped) →
    per-IP rate limit → Turnstile (optional) → schema validation →
    signed time-trap token + content heuristics (FLAGGED as spam, kept
    out of the Unread queue and never emailed, but recoverable).

  Double clicks and retries: the client sends one submissionId per
  attempt-set and the document _id is derived from it, so a second
  write with the same id conflicts (409) and is answered as a success
  without storing or notifying twice.

  GET issues the time-trap token; the engine fetches it when a form
  opens.
*/
const writeToken = process.env.SANITY_API_WRITE_TOKEN;
const writeClient = writeToken
  ? createClient({ projectId, dataset, apiVersion, token: writeToken, useCdn: false })
  : null;

const MAX_BODY_BYTES = 32_000;

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
/* document ids must never contain a dot (published-perspective rule) */
const SUBMISSION_ID_RE = /^[a-zA-Z0-9-]{16,64}$/;

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/* browsers always send Origin on a cross-site POST; a mismatch means
   another site is posting into our inbox */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const isConflict = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { statusCode?: number }).statusCode === 409;

export async function GET(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  return json({ token: issueToken() });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: "too large" }, 413);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "too large" }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return json({ error: "invalid body" }, 400);
  }

  /* honeypot: bots fill the hidden "website" field — pretend success */
  if (str(body.website, 10)) return json({ ok: true });

  const form = str(body.form, 40);
  if (!form) return json({ error: "missing form" }, 400);

  const ip = clientIp(request);
  if (rateLimited(ip)) return json({ error: "too many requests" }, 429, { "Retry-After": "60" });

  const submissionId = str(body.submissionId, 64);
  if (submissionId && !SUBMISSION_ID_RE.test(submissionId))
    return json({ error: "invalid submission id" }, 400);

  const def = FORMS[form];
  return def
    ? registered(def, body, submissionId, ip)
    : simple(form, body, submissionId);
}

async function registered(
  def: FormDef,
  body: Record<string, unknown>,
  submissionId: string | undefined,
  ip: string,
) {
  if (!submissionId) return json({ error: "missing submission id" }, 400);

  if (!(await verifyTurnstile(body.turnstile, ip)))
    return json({ error: "verification failed" }, 400);

  const answersIn = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
    ? (body.answers as Answers)
    : {};
  const result = validateAnswers(def, answersIn);
  if (!result.success)
    return json({ error: "invalid", fieldErrors: result.errors }, 422);
  const answers = result.data;

  if (!writeClient) return json({ error: "form backend not configured" }, 503);

  const spamReasons: string[] = [];
  const token = checkToken(body.token);
  if (token && !token.ok) spamReasons.push(`token: ${token.reason}`);
  spamReasons.push(...spamSignals(answers));
  const status = spamReasons.length ? "spam" : "new";

  /* answers in definition order, with human labels for the inbox */
  const described = def.steps
    .flatMap((s) => s.fields)
    .filter((f) => answers[f.name] !== undefined)
    .map((f) => ({ key: f.name, ...describeAnswer(def, f.name, answers[f.name]!) }));
  const summary = (def.summaryFields ?? [])
    .filter((k) => answers[k] !== undefined)
    .map((k) => describeAnswer(def, k, answers[k]!).value)
    .join(" · ");

  const email = typeof answers.email === "string" ? answers.email : undefined;
  const name = [answers.first_name, answers.last_name].filter((x) => typeof x === "string").join(" ") || undefined;

  const a = (body.attribution ?? {}) as Record<string, unknown>;
  const attribution = Object.fromEntries(
    ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "referrer", "landingPage"]
      .map((k) => [k, str(a[k], 300)])
      .filter(([, v]) => v),
  ) as Record<string, string>;

  const id = `formSubmission-${submissionId}`;
  const submittedAt = new Date().toISOString();
  const page = str(body.page, 200);
  try {
    await writeClient.create({
      _id: id,
      _type: "formSubmission",
      form: def.id,
      status,
      ...(spamReasons.length ? { spamReasons } : {}),
      ...(summary ? { summary } : {}),
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      fields: described.map((d) => ({ _type: "submissionField", _key: d.key, ...d })),
      ...(Object.keys(attribution).length ? { attribution } : {}),
      page,
      submittedAt,
      read: false,
    });
  } catch (err) {
    /* same submissionId already stored: a double click or a retry
       after a dropped response — the first write won */
    if (isConflict(err)) return json({ ok: true, id, duplicate: true });
    return json({ error: "could not save" }, 500);
  }

  if (status !== "spam") {
    after(() =>
      notify({
        id,
        form: def.id,
        formTitle: def.title,
        summary,
        email,
        name,
        page,
        submittedAt,
        answers: described,
        attribution,
      }),
    );
  }
  /* spam gets the same answer as a real lead — never tell a bot
     which layer caught it */
  return json({ ok: true, id });
}

async function simple(form: string, body: Record<string, unknown>, submissionId: string | undefined) {
  const email = str(body.email, 200);
  const name = str(body.name, 200);
  const message = str(body.message, 5000);
  if (email && !EMAIL_RE.test(email)) return json({ error: "invalid email" }, 400);
  if (!email && !message) return json({ error: "empty submission" }, 400);

  if (!writeClient) return json({ error: "form backend not configured" }, 503);

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

  const spamReasons = spamSignals({ name, message });
  try {
    await writeClient.create({
      ...(submissionId ? { _id: `formSubmission-${submissionId}` } : {}),
      _type: "formSubmission",
      form,
      status: spamReasons.length ? "spam" : "new",
      ...(spamReasons.length ? { spamReasons } : {}),
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(message ? { message } : {}),
      ...(extra?.length ? { fields: extra } : {}),
      page: str(body.page, 200),
      submittedAt: new Date().toISOString(),
      read: false,
    });
  } catch (err) {
    if (isConflict(err)) return json({ ok: true, duplicate: true });
    return json({ error: "could not save" }, 500);
  }
  return json({ ok: true });
}
