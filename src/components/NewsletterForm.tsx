"use client";

import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { newSubmissionId } from "@/lib/forms/ids";

/*
  Footer newsletter signup, wired to /api/forms. Markup and tokens
  match the original static form exactly; success swaps the row for a
  confirmation line at the same height (no CLS), errors surface under
  the row without moving it.
*/
export function NewsletterForm() {
  const pathname = usePathname();
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  /* sync lock (state updates too late to stop a double click) + one id
     per email so a retry after a dropped response isn't stored twice */
  const lock = useRef(false);
  const attempt = useRef<{ email: string; id: string } | null>(null);

  if (status === "success") {
    return (
      <div className="flex w-full flex-col items-stretch gap-3 p-4 sm:flex-row sm:gap-0 md:p-6">
        <p className="label flex h-[2.875rem] items-center rounded-xs bg-wash pl-4 pr-3 font-medium text-ink md:h-10">
          THANK YOU — YOU&rsquo;RE ON THE LIST
        </p>
      </div>
    );
  }

  return (
    <form
      className="flex w-full flex-col items-stretch gap-3 p-4 sm:flex-row sm:gap-0 md:p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        const data = new FormData(e.currentTarget);
        const email = String(data.get("email") ?? "").trim().toLowerCase();
        if (attempt.current?.email !== email) attempt.current = { email, id: newSubmissionId() };
        setStatus("sending");
        try {
          const res = await fetch("/api/forms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              form: "newsletter",
              email,
              website: data.get("website"),
              page: pathname,
              submissionId: attempt.current.id,
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
      {/* flex-1 only in the sm+ row layout — in the stacked mobile
          column it would become the vertical basis and squash the
          46px heights */}
      <label className="flex h-[2.875rem] items-center rounded-xs bg-wash pl-4 pr-3 backdrop-blur-[12px] sm:flex-1 md:h-10">
        <span className="sr-only">Email address</span>
        <input
          type="email"
          name="email"
          required
          placeholder="EMAIL ADDRESS"
          className="label w-full bg-transparent font-medium text-ink outline-none placeholder:text-ink-3"
        />
      </label>
      {/* honeypot — hidden from people, filled by bots */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="label flex h-[2.875rem] items-center justify-center rounded-xs bg-btn px-3.5 font-medium text-btn-fg transition-opacity hover:opacity-80 disabled:opacity-60 sm:min-w-[9.375rem] sm:flex-1 md:h-10"
      >
        {status === "sending" ? "SUBMITTING…" : "Submit"}
      </button>
      {status === "error" && (
        <p className="label self-center font-medium text-ink-2 sm:pl-3">
          SOMETHING WENT WRONG — TRY AGAIN
        </p>
      )}
    </form>
  );
}
