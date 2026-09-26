import { FORMS } from "@/lib/forms/registry";
import { clientIp, EMAIL_RE, json, publicOrigin, rateLimiter, readJsonBody, sameOrigin, str } from "@/lib/forms/server/http";
import { sendResumeEmail } from "@/lib/forms/server/notify";
import { openResume, resumeEnabled, sealResume } from "@/lib/forms/server/resume";
import { checkToken } from "@/lib/forms/server/token";
import type { Answers } from "@/lib/forms/types";
import { validateAnswers, visibleSteps } from "@/lib/forms/validation";

/*
  Finish-later links.

  POST { form, email, answers, stepId, page, token } → seals the answers
  into an encrypted token (server/resume.ts), emails the visitor a link
  that reopens the form at that step, and answers { ok, emailed }. With
  no email channel configured the link comes back in the response
  instead so the form can show it to copy — it only ever goes to the
  person who is holding those answers.

  GET ?token= → unseals it: { form, answers, stepId }. The engine calls
  this when a page opens with ?resume=, then restores the answers.

  Abuse brakes: same-origin, 32KB cap, honeypot, 3 links/min/IP, the
  form's time-trap token must be valid (so a script can't fire this the
  instant it fetches a token), and the answers are re-checked against
  the definition so a link can't smuggle in arbitrary keys.
*/
const limited = rateLimiter(3);
const MAX_ANSWERS_CHARS = 8_000;

export async function GET(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const token = new URL(request.url).searchParams.get("token");
  const res = openResume(token);
  if (!res.ok) return json({ error: res.reason }, res.reason === "disabled" ? 503 : 400);
  const def = FORMS[res.payload.form];
  if (!def) return json({ error: "invalid" }, 400);
  /* keep only keys the definition knows; a link is not a way in */
  const known = new Set(def.steps.flatMap((s) => s.fields.map((f) => f.name)));
  const answers: Answers = {};
  for (const [k, v] of Object.entries(res.payload.answers)) if (known.has(k)) answers[k] = v;
  const stepId = def.steps.some((s) => s.id === res.payload.stepId) ? res.payload.stepId : undefined;
  return json({ form: def.id, answers, stepId });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const body = await readJsonBody(request);
  if (!body) return json({ error: "invalid body" }, 400);
  if (str(body.website, 10)) return json({ ok: true, emailed: true }); // honeypot

  const form = str(body.form, 40);
  const def = form ? FORMS[form] : undefined;
  if (!def || !def.resumable) return json({ error: "unknown form" }, 400);
  if (!resumeEnabled()) return json({ error: "not configured" }, 503);

  const ip = clientIp(request);
  if (limited(ip)) return json({ error: "too many requests" }, 429, { "Retry-After": "60" });

  const token = checkToken(body.token);
  if (token && !token.ok) return json({ error: "verification failed" }, 400);

  const email = str(body.email, 200)?.toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return json({ error: "invalid", fieldErrors: { email: "Please enter a valid email address." } }, 422);

  const rawAnswers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? (body.answers as Answers) : {};
  if (JSON.stringify(rawAnswers).length > MAX_ANSWERS_CHARS) return json({ error: "too large" }, 413);
  /* partial answers are expected mid-form: keep known keys, drop values
     that fail their own field rule, never reject the whole request */
  const known = new Set(def.steps.flatMap((s) => s.fields.map((f) => f.name)));
  const answers: Answers = {};
  for (const [k, v] of Object.entries(rawAnswers)) if (known.has(k) && (typeof v === "string" || Array.isArray(v))) answers[k] = v;
  const check = validateAnswers(def, answers);
  if (!check.success) for (const k of Object.keys(check.errors)) if (k !== "email") delete answers[k];
  answers.email = answers.email ?? email;

  const stepId = str(body.stepId, 60);
  const validStep = stepId && visibleSteps(def, answers).some((s) => s.id === stepId) ? stepId : undefined;

  const sealed = sealResume({ form: def.id, answers, stepId: validStep });
  if (!sealed) return json({ error: "not configured" }, 503);

  let page = str(body.page, 200) ?? "/";
  if (!page.startsWith("/") || page.startsWith("//")) page = "/";
  const link = `${publicOrigin(request)}${page}${page.includes("?") ? "&" : "?"}resume=${sealed}`;

  const firstName = typeof answers.first_name === "string" ? answers.first_name : undefined;
  const emailed = await sendResumeEmail({ to: email, link, formTitle: def.title, firstName });
  return json(emailed ? { ok: true, emailed: true } : { ok: true, emailed: false, link });
}
