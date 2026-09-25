"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { readAttribution } from "@/lib/forms/attribution";
import {
  clearDraft,
  fetchFormToken,
  loadDraft,
  newSubmissionId,
  postSubmission,
  saveDraft,
} from "@/lib/forms/client";
import type { Answers, FormDef, StepDef } from "@/lib/forms/types";
import {
  describeAnswer,
  validateAnswers,
  validateStep,
  visibleFields,
  visibleSteps,
} from "@/lib/forms/validation";

import { Field } from "./Field";
import { TURNSTILE_ENABLED, useTurnstile } from "./useTurnstile";

/*
  The multi-step form engine. Renders any FormDef (lib/forms): one
  step at a time, branching on answers, validating each step with the
  same rules the server re-applies, and submitting through the hardened
  /api/forms path.

  Guards built in:
  - double clicks / double Enter: a ref lock (synchronous, unlike state)
    on both Next and Send, plus a disabled + busy button;
  - retries: network failures retry automatically with the SAME
    submissionId, and the server drops duplicates — one lead, one email;
    a new id is minted only when the answers change;
  - spam: honeypot field, time-trap token fetched on open, optional
    Turnstile on the last step;
  - lost work: answers + position persist to sessionStorage, so closing
    the modal or reloading resumes where the visitor left off.

  Page context: pass initialValues (e.g. { project_type: "residential",
  build_type: "predesigned", series: "annata" } from a series page) and
  steps fully answered by it are skipped going forward — still
  reachable with Back or from the review's Edit links.

  Analytics: every step view and the final outcome dispatch an
  "mh:form" CustomEvent on window ({ form, step, index, event }) for
  whatever tracking the site adopts; nothing is sent anywhere by this
  component.

  Load it lazily (LazyMultiStepForm) — it pulls react-hook-form + zod,
  which no visitor should download until a form actually opens.
*/

type Status = "idle" | "sending" | "success" | "error";

const BTN =
  "label inline-flex h-12 items-center justify-center rounded-xs px-[1.125rem] font-medium transition-opacity disabled:opacity-60";
const BTN_PRIMARY = `${BTN} bg-btn text-btn-fg hover:opacity-80`;
const BTN_SECONDARY = `${BTN} border border-line text-ink hover:border-ink-3`;

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function emit(detail: Record<string, unknown>) {
  try {
    window.dispatchEvent(new CustomEvent("mh:form", { detail }));
  } catch {
    /* ignore */
  }
}

export interface MultiStepFormProps {
  def: FormDef;
  initialValues?: Answers;
  /* keep answers in sessionStorage between opens (default true) */
  persist?: boolean;
  onComplete?: (submissionId: string) => void;
  success?: ReactNode;
  className?: string;
}

export function MultiStepForm({
  def,
  initialValues,
  persist = true,
  onComplete,
  success,
  className,
}: MultiStepFormProps) {
  const pathname = usePathname();
  const uid = useId();
  const draft = useMemo(() => (persist ? loadDraft(def.id) : undefined), [def.id, persist]);

  const { register, control, getValues, setError, clearErrors, setFocus, formState } = useForm<Answers>({
    defaultValues: { ...draft?.answers, ...initialValues },
    shouldUnregister: false,
  });
  const values = useWatch({ control }) as Answers;
  const steps = useMemo(() => visibleSteps(def, values), [def, values]);

  /* steps the page context answered completely — skipped going forward */
  const prefilled = useMemo(() => {
    const set = new Set<string>();
    if (!initialValues) return set;
    for (const step of def.steps) {
      const shown = visibleFields(step, initialValues).filter((f) => f.type !== "hidden");
      if (
        shown.length &&
        shown.every((f) => initialValues[f.name] !== undefined) &&
        !Object.keys(validateStep(step, initialValues).errors).length
      )
        set.add(step.id);
    }
    return set;
  }, [def, initialValues]);

  const [stepId, setStepId] = useState<string>(() => {
    const first = visibleSteps(def, { ...draft?.answers, ...initialValues });
    if (draft?.stepId && first.some((s) => s.id === draft.stepId)) return draft.stepId;
    return (first.find((s) => !prefilled.has(s.id)) ?? first[0]).id;
  });
  const index = Math.max(0, steps.findIndex((s) => s.id === stepId));
  const step: StepDef = steps[index];
  const isLast = index === steps.length - 1;

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>();
  const [returnToReview, setReturnToReview] = useState(false);
  const lock = useRef(false);
  const submissionId = useRef<string>(undefined);
  const lastFingerprint = useRef<string>(undefined);
  const honeypot = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const token = useRef<{ value?: string; at: number }>({ at: 0 });
  const { container: turnstileRef, getToken: turnstileToken, reset: turnstileReset } = useTurnstile();

  /* time-trap token, fetched when the form opens */
  useEffect(() => {
    let live = true;
    fetchFormToken().then((value) => {
      if (live) token.current = { value, at: Date.now() };
    });
    return () => {
      live = false;
    };
  }, []);

  /* resume point + answers survive closing/reloading */
  useEffect(() => {
    if (!persist || status === "success") return;
    const t = setTimeout(() => saveDraft(def.id, { answers: getValues(), stepId }), 300);
    return () => clearTimeout(t);
  }, [values, stepId, persist, status, def.id, getValues]);

  /* an error clears as soon as its answer becomes valid */
  const { errors: fieldErrors } = formState;
  useEffect(() => {
    const names = Object.keys(fieldErrors);
    if (!names.length) return;
    const { errors } = validateStep(step, getValues());
    for (const n of names) if (!errors[n]) clearErrors(n);
  }, [values, fieldErrors, step, getValues, clearErrors]);

  /* move focus to the new step's heading so screen readers announce it
     (not on first render — opening the form shouldn't steal focus) */
  useEffect(() => {
    emit({ form: def.id, step: stepId, index, event: "step" });
    if (moved.current) heading.current?.focus({ preventScroll: true });
  }, [stepId, index, def.id]);

  const go = useCallback((id: string) => {
    moved.current = true;
    setMessage(undefined);
    setStepId(id);
  }, []);

  const showErrors = useCallback(
    (errors: Record<string, string>) => {
      const names = Object.keys(errors);
      for (const name of names) setError(name, { type: "validate", message: errors[name] });
      if (names[0]) setFocus(names[0]);
    },
    [setError, setFocus],
  );

  const next = useCallback(() => {
    const vals = getValues();
    const { errors } = validateStep(step, vals);
    if (Object.keys(errors).length) return showErrors(errors);
    clearErrors();

    const order = visibleSteps(def, vals);
    const here = order.findIndex((s) => s.id === step.id);
    if (returnToReview) {
      const firstInvalid = order.find((s) => Object.keys(validateStep(s, vals).errors).length);
      if (!firstInvalid || firstInvalid.id === order[order.length - 1].id) {
        setReturnToReview(false);
        return go(order[order.length - 1].id);
      }
      return go(firstInvalid.id);
    }
    let i = here + 1;
    while (
      i < order.length - 1 &&
      prefilled.has(order[i].id) &&
      !Object.keys(validateStep(order[i], vals).errors).length
    )
      i++;
    go(order[Math.min(i, order.length - 1)].id);
  }, [getValues, step, def, returnToReview, prefilled, go, clearErrors, showErrors]);

  const back = useCallback(() => {
    clearErrors();
    const order = visibleSteps(def, getValues());
    const here = order.findIndex((s) => s.id === step.id);
    if (here > 0) go(order[here - 1].id);
  }, [def, getValues, step, go, clearErrors]);

  const send = useCallback(async () => {
    const vals = getValues();
    const result = validateAnswers(def, vals);
    if (!result.success) {
      const order = visibleSteps(def, vals);
      const target = order.find((s) => s.fields.some((f) => result.errors[f.name]));
      if (target && target.id !== step.id) go(target.id);
      requestAnimationFrame(() => showErrors(result.errors));
      return;
    }

    lock.current = true;
    setStatus("sending");
    setMessage(undefined);

    /* same answers → same id (a retry); changed answers → a new lead */
    const fingerprint = JSON.stringify(result.data);
    if (!submissionId.current || fingerprint !== lastFingerprint.current) {
      submissionId.current = newSubmissionId();
      lastFingerprint.current = fingerprint;
    }
    if (!token.current.value || Date.now() - token.current.at > TOKEN_TTL_MS)
      token.current = { value: await fetchFormToken(), at: Date.now() };

    const res = await postSubmission({
      form: def.id,
      answers: result.data,
      submissionId: submissionId.current,
      token: token.current.value,
      turnstile: TURNSTILE_ENABLED ? await turnstileToken() : undefined,
      website: honeypot.current?.value ?? "",
      page: pathname,
      attribution: readAttribution(),
    });

    if (res.ok) {
      setStatus("success");
      if (persist) clearDraft(def.id);
      emit({ form: def.id, step: step.id, index, event: "submitted" });
      onComplete?.(submissionId.current);
      return; // lock stays held: the form is done
    }
    turnstileReset();
    lock.current = false;
    if (res.kind === "validation") {
      setStatus("idle");
      const order = visibleSteps(def, vals);
      const target = order.find((s) => s.fields.some((f) => res.fieldErrors[f.name]));
      if (target && target.id !== step.id) go(target.id);
      requestAnimationFrame(() => showErrors(res.fieldErrors));
      return;
    }
    setStatus("error");
    setMessage(res.message);
    emit({ form: def.id, step: step.id, index, event: "error", kind: res.kind });
  }, [getValues, def, step, index, go, showErrors, pathname, persist, onComplete, turnstileToken, turnstileReset]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lock.current) return;
    if (!isLast) {
      lock.current = true;
      try {
        next();
      } finally {
        lock.current = false;
      }
      return;
    }
    void send();
  };

  if (status === "success") {
    return (
      <div className={className} role="status">
        {success ?? (
          <div className="flex flex-col gap-lg">
            <h2 className="text-title-md text-ink">Thank you — we’ve got it.</h2>
            <p className="text-body-md text-ink-2">
              Someone from our team will be in touch within two business days.
            </p>
          </div>
        )}
      </div>
    );
  }

  const shown = visibleFields(step, values).filter((f) => f.type !== "hidden");
  const errorCount = Object.keys(fieldErrors).length;
  /* server/network problems win; otherwise summarize field errors */
  const live =
    message ??
    (errorCount === 1 ? "One answer needs a look." : errorCount > 1 ? `${errorCount} answers need a look.` : undefined);
  const progress = Math.round(((index + 1) / steps.length) * 100);
  const answered = def.review && isLast
    ? steps
        .slice(0, -1)
        .map((s) => ({
          step: s,
          rows: visibleFields(s, values)
            .filter((f) => f.type !== "hidden")
            .filter((f) => {
              const v = values[f.name];
              return Array.isArray(v) ? v.length : v;
            })
            .map((f) => describeAnswer(def, f.name, values[f.name]!)),
        }))
        .filter((g) => g.rows.length)
    : [];

  return (
    <form noValidate onSubmit={onSubmit} className={className} aria-labelledby={`${uid}-title`}>
      <div className="flex flex-col gap-2xl">
        <div className="flex flex-col gap-md">
          <p className="label text-ink-3">
            Step {index + 1} of {steps.length}
          </p>
          <div
            className="h-px w-full bg-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Progress"
          >
            <div className="h-px bg-ink transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="flex flex-col gap-md">
          <h2 id={`${uid}-title`} ref={heading} tabIndex={-1} className="text-title-md text-ink outline-none">
            {step.title}
          </h2>
          {step.description ? <p className="text-body-md text-ink-2">{step.description}</p> : null}
        </div>

        {answered.length ? (
          <dl className="flex flex-col gap-lg border-y border-line py-xl">
            {answered.map((g) => (
              <div key={g.step.id} className="flex items-start justify-between gap-xl">
                <div className="flex flex-col gap-xs">
                  {g.rows.map((r) => (
                    <div key={r.label} className="flex flex-col">
                      <dt className="text-body-sm text-ink-3">{r.label}</dt>
                      <dd className="text-body-md text-ink">{r.value}</dd>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="label shrink-0 text-ink underline underline-offset-4"
                  onClick={() => {
                    setReturnToReview(true);
                    go(g.step.id);
                  }}
                >
                  Edit<span className="sr-only"> {g.step.title}</span>
                </button>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="flex flex-col gap-xl">
          {shown.map((field) => (
            <Field
              key={field.name}
              field={field}
              register={register}
              error={fieldErrors[field.name]?.message as string | undefined}
              idPrefix={uid}
              hideLabel={shown.length === 1 && field.type !== "consent"}
            />
          ))}
        </div>

        {/* honeypot — hidden from people and assistive tech, filled by bots */}
        <input
          ref={honeypot}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />

        {isLast && TURNSTILE_ENABLED ? <div ref={turnstileRef} /> : null}

        <p aria-live="polite" className="min-h-[1lh] text-body-sm text-ink">
          {live}
        </p>

        <div className="flex items-center justify-between gap-lg">
          {index > 0 ? (
            <button type="button" onClick={back} className={BTN_SECONDARY} disabled={status === "sending"}>
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className={BTN_PRIMARY}
            disabled={status === "sending"}
            aria-busy={status === "sending" || undefined}
          >
            {isLast
              ? status === "sending"
                ? "Sending…"
                : (def.submitLabel ?? "Submit")
              : returnToReview
                ? "Back to review"
                : "Next"}
          </button>
        </div>
      </div>
    </form>
  );
}
