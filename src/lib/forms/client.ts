import type { Answers, ResumePayload, ResumeRequest, SubmissionErrorBody, SubmissionPayload } from "./types";

/*
  Browser-side plumbing for the form engine: submission ids, the
  time-trap token, resilient posting, and draft persistence. No React
  here — MultiStepForm composes these.
*/

export { newSubmissionId } from "./ids";

export async function fetchFormToken(): Promise<string | undefined> {
  try {
    const res = await fetch("/api/forms", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { token?: string | null };
    return data.token ?? undefined;
  } catch {
    return undefined;
  }
}

export type PostResult =
  | { ok: true; id?: string }
  | { ok: false; kind: "validation"; fieldErrors: Record<string, string> }
  | { ok: false; kind: "rate-limit" | "verification" | "server" | "network"; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* POST with a timeout; network failures and 5xx retry (same payload,
   same submissionId — the server dedupes), 4xx never retry */
export async function postSubmission(payload: SubmissionPayload, retries = 2): Promise<PostResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { id?: string };
        return { ok: true, id: data.id };
      }
      const body = (await res.json().catch(() => ({}))) as SubmissionErrorBody;
      if (res.status === 422 && body.fieldErrors)
        return { ok: false, kind: "validation", fieldErrors: body.fieldErrors };
      if (res.status === 429)
        return { ok: false, kind: "rate-limit", message: "Too many attempts. Please wait a minute and try again." };
      if (res.status === 400 && body.error === "verification failed")
        return { ok: false, kind: "verification", message: "We couldn’t verify this browser. Please try again." };
      if (res.status < 500 || attempt >= retries)
        return { ok: false, kind: "server", message: "Something went wrong sending this. Please try again." };
    } catch {
      if (attempt >= retries)
        return { ok: false, kind: "network", message: "We couldn’t reach the server. Check your connection and try again." };
    }
    await sleep(attempt === 0 ? 800 : 2000);
  }
}

/* ── finish later ──────────────────────────────────────────────── */

export type ResumeLinkResult =
  | { ok: true; emailed: true }
  | { ok: true; emailed: false; link: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/* ask the server to email a link that restores these answers */
export async function requestResumeLink(req: ResumeRequest): Promise<ResumeLinkResult> {
  try {
    const res = await fetch("/api/forms/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      emailed?: boolean;
      link?: string;
      fieldErrors?: Record<string, string>;
    };
    if (res.ok) return data.emailed || !data.link ? { ok: true, emailed: true } : { ok: true, emailed: false, link: data.link };
    if (res.status === 422) return { ok: false, message: "Please check your email address.", fieldErrors: data.fieldErrors };
    if (res.status === 429) return { ok: false, message: "Too many requests. Please wait a minute and try again." };
    if (res.status === 503) return { ok: false, message: "Saving for later isn’t available right now." };
    return { ok: false, message: "We couldn’t save this. Please try again." };
  } catch {
    return { ok: false, message: "We couldn’t reach the server. Check your connection and try again." };
  }
}

export const RESUME_PARAM = "resume";

export const hasResumeParam = () => {
  try {
    return new URL(window.location.href).searchParams.has(RESUME_PARAM);
  } catch {
    return false;
  }
};

/* a ?resume= token in the current URL → the saved answers. The token is
   removed from the address bar so a reload doesn't re-apply it over
   newer answers. */
export async function openResumeFromUrl(formId: string): Promise<ResumePayload | undefined> {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get(RESUME_PARAM);
    if (!token) return undefined;
    url.searchParams.delete(RESUME_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());
    const res = await fetch(`/api/forms/resume?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as ResumePayload;
    return data.form === formId ? data : undefined;
  } catch {
    return undefined;
  }
}

/* drafts survive a closed modal or a reload within the tab session */
const draftKey = (formId: string) => `mh:form-draft:${formId}`;

export interface Draft {
  answers: Answers;
  stepId?: string;
}

export function loadDraft(formId: string): Draft | undefined {
  try {
    const raw = sessionStorage.getItem(draftKey(formId));
    return raw ? (JSON.parse(raw) as Draft) : undefined;
  } catch {
    return undefined;
  }
}

export function saveDraft(formId: string, draft: Draft) {
  try {
    sessionStorage.setItem(draftKey(formId), JSON.stringify(draft));
  } catch {
    /* storage full or blocked — drafts are a convenience */
  }
}

export function clearDraft(formId: string) {
  try {
    sessionStorage.removeItem(draftKey(formId));
  } catch {
    /* ignore */
  }
}
