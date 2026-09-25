import { createHmac } from "node:crypto";

/*
  Post-submit notifications, run from after() so the visitor's
  response never waits on them. Each channel is off until configured:

  - Email via Resend's HTTP API (no SDK):
      RESEND_API_KEY, FORMS_NOTIFY_TO (comma-separated),
      FORMS_NOTIFY_FROM (a sender on a Resend-verified domain).
  - Webhook (CRM / Zapier / Make): FORMS_WEBHOOK_URL, with the JSON
    body signed as X-Forms-Signature: sha256=<hex> when
    FORMS_WEBHOOK_SECRET is set.

  Failures are logged, never thrown — the submission is already safe
  in the dataset.
*/

export interface NotifyPayload {
  id: string;
  form: string;
  formTitle: string;
  summary?: string;
  email?: string;
  name?: string;
  page?: string;
  submittedAt: string;
  answers: { key: string; label: string; value: string }[];
  attribution?: Record<string, string | undefined>;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function withTimeout(url: string, init: RequestInit, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function sendEmail(p: NotifyPayload) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.FORMS_NOTIFY_TO;
  const from = process.env.FORMS_NOTIFY_FROM;
  if (!key || !to || !from) return;

  const rows = p.answers
    .map((a) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${esc(a.label)}</td><td style="padding:4px 0">${esc(a.value)}</td></tr>`)
    .join("");
  const attribution = Object.entries(p.attribution ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  const subject = `New ${p.formTitle} submission${p.summary ? ` — ${p.summary}` : ""}`;
  const html = `<p>${esc(subject)}</p><table>${rows}</table>
<p style="color:#666">Page: ${esc(p.page ?? "—")}${attribution ? `<br>Source: ${esc(attribution)}` : ""}<br>ID: ${esc(p.id)}</p>`;
  const text = `${subject}\n\n${p.answers.map((a) => `${a.label}: ${a.value}`).join("\n")}\n\nPage: ${p.page ?? "—"}${attribution ? `\nSource: ${attribution}` : ""}\nID: ${p.id}`;

  const res = await withTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: to.split(",").map((s) => s.trim()).filter(Boolean),
      subject: subject.slice(0, 200),
      html,
      text,
      ...(p.email ? { reply_to: p.email } : {}),
    }),
  });
  if (!res.ok) console.error("[forms] email failed", res.status, await res.text().catch(() => ""));
}

async function sendWebhook(p: NotifyPayload) {
  const url = process.env.FORMS_WEBHOOK_URL;
  if (!url) return;
  const body = JSON.stringify(p);
  const secret = process.env.FORMS_WEBHOOK_SECRET;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["X-Forms-Signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const res = await withTimeout(url, { method: "POST", headers, body });
  if (!res.ok) console.error("[forms] webhook failed", res.status);
}

export async function notify(p: NotifyPayload) {
  const results = await Promise.allSettled([sendEmail(p), sendWebhook(p)]);
  for (const r of results) if (r.status === "rejected") console.error("[forms] notify error", r.reason);
}
