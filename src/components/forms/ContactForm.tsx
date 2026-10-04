"use client";

import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { newSubmissionId } from "@/lib/forms/ids";

/*
  The Form block's contact form (Figma 37508:3799, fields = Intake/
  Field): name, email, phone, where, what you're planning, message.
  Posts to /api/forms as the SIMPLE form "contact" (email + name +
  message + extra key/value fields), so it inherits the honeypot, rate
  limit, time-trap and spam heuristics without a definition. Native
  inputs only — autofill, keyboard and screen readers come for free.

  Each field is the library's 64px box with the label INSIDE above the
  value (textarea 128px), radius-md, line border, ink on focus. Inputs
  never drop below 16px so iOS Safari doesn't zoom the page.
*/

const BOX = "flex min-h-16 w-full flex-col justify-center gap-xs rounded-md border border-line bg-surface-2 px-xl py-md transition-colors focus-within:border-ink";
const LABEL = "text-body-sm text-ink-3";
const INPUT = "w-full bg-transparent text-[length:max(1rem,var(--text-body-md))] font-medium leading-normal text-ink outline-none placeholder:text-ink-3";

export function ContactForm({
  options = ["Predesigned series home", "Custom home", "ADU or backyard studio", "Commercial or multifamily", "Something else"],
  submitLabel = "Send message",
  note = "We never share your details. Protected by a honeypot and rate limit, not a CAPTCHA.",
}: {
  options?: string[];
  submitLabel?: string;
  note?: string;
}) {
  const pathname = usePathname();
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const lock = useRef(false);
  const attempt = useRef<string | null>(null);

  if (status === "success") {
    return (
      <div role="status" className="flex min-h-16 flex-col justify-center gap-xs rounded-md bg-wash px-xl py-lg">
        <p className="text-body-md font-medium text-ink">Thank you — your message is in.</p>
        <p className="text-body-sm text-ink-2">We reply within two business days.</p>
      </div>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-2xl"
      noValidate={false}
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        const data = new FormData(e.currentTarget);
        const get = (k: string) => String(data.get(k) ?? "").trim();
        if (!attempt.current) attempt.current = newSubmissionId();
        setStatus("sending");
        try {
          const res = await fetch("/api/forms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              form: "contact",
              name: get("name"),
              email: get("email").toLowerCase(),
              message: get("message"),
              fields: [
                { key: "phone", value: get("phone") },
                { key: "location", value: get("location") },
                { key: "planning", value: get("planning") },
              ].filter((f) => f.value),
              website: data.get("website"),
              page: pathname,
              submissionId: attempt.current,
            }),
          });
          setStatus(res.ok ? "success" : "error");
        } catch {
          setStatus("error");
        } finally {
          lock.current = false;
        }
      }}
    >
      <div className="grid grid-cols-1 gap-2xl md:grid-cols-2">
        <label className={BOX}>
          <span className={LABEL}>Full name</span>
          <input name="name" type="text" autoComplete="name" required placeholder="Jane Doe" className={INPUT} />
        </label>
        <label className={BOX}>
          <span className={LABEL}>Email</span>
          <input name="email" type="email" autoComplete="email" required placeholder="jane@example.com" className={INPUT} />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2xl md:grid-cols-2">
        <label className={BOX}>
          <span className={LABEL}>Phone (optional)</span>
          <input name="phone" type="tel" autoComplete="tel" className={INPUT} />
        </label>
        <label className={BOX}>
          <span className={LABEL}>Where are you building?</span>
          <input name="location" type="text" autoComplete="postal-code" placeholder="City, state or ZIP" className={INPUT} />
        </label>
      </div>
      <label className={`${BOX} relative`}>
        <span className={LABEL}>What are you planning?</span>
        <select name="planning" defaultValue={options[0]} className={`${INPUT} appearance-none pr-3xl`}>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <svg aria-hidden width="12" height="7" viewBox="0 0 12 7" fill="none" stroke="currentColor" strokeWidth="1.5" className="pointer-events-none absolute right-xl top-1/2 -translate-y-1/2 text-ink">
          <path d="M1 1l5 5 5-5" />
        </svg>
      </label>
      <label className={`${BOX} min-h-32 justify-start`}>
        <span className={LABEL}>Tell us more</span>
        <textarea name="message" rows={3} placeholder="Site, timeline, budget range, questions…" className={`${INPUT} min-h-16 resize-y`} />
      </label>
      {/* honeypot — hidden from people, filled by bots */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <div className="flex flex-col items-start gap-xl md:flex-row md:items-center md:gap-3xl">
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex h-12 min-w-[9.375rem] items-center justify-center rounded-md bg-btn px-[1.125rem] text-body-sm font-medium text-btn-fg transition-opacity hover:opacity-80 disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : submitLabel}
        </button>
        <p className="label text-ink-3 normal-case tracking-normal">{status === "error" ? "Something went wrong — try again, or email us directly." : note}</p>
      </div>
    </form>
  );
}
