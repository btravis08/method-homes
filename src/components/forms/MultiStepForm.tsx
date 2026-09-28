"use client";

import { AnimatePresence, m } from "motion/react";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useForm, useWatch } from "react-hook-form";

import { readAttribution } from "@/lib/forms/attribution";
import { DUR, EASE_OUT } from "@/lib/motion";
import {
  clearDraft,
  fetchFormToken,
  loadDraft,
  newSubmissionId,
  postSubmission,
  saveDraft,
} from "@/lib/forms/client";
import type {
  Answers,
  FormDef,
  Recommendation,
  ResumePayload,
  StepDef,
} from "@/lib/forms/types";
import {
  describeAnswer,
  optionsOf,
  validateAnswers,
  validateStep,
  visibleFields,
  visibleSteps,
} from "@/lib/forms/validation";

import { BOOKING_ENABLED, BookingEmbed } from "./BookingEmbed";
import { Field } from "./Field";
import { ArrowLeft, XClose } from "./icons";
import { TURNSTILE_ENABLED, useTurnstile } from "./useTurnstile";

/*
  The multi-step form engine, laid out as the Figma intake sheet: a
  header (Back · section label · Close), a 3px progress bar, a scrolling
  content area with the question centered, and a footer pinned to the
  bottom of the sheet (Next fills the width on phones, hugs on desktop)
  (none on tap-to-advance steps). It renders any FormDef
  (lib/forms): one step at a time, branching on answers, validating each
  step with the same rules the server re-applies, and submitting
  through the hardened /api/forms path. The parent (GetStartedTray)
  supplies the fixed positioning, scrim and scroll lock.

  Guards built in:
  - double clicks / double Enter: a ref lock (synchronous, unlike state)
    on both Next and Send, plus a disabled + busy button;
  - retries: network failures retry automatically with the SAME
    submissionId, and the server drops duplicates — one lead, one email;
    a new id is minted only when the answers change;
  - spam: honeypot field, time-trap token fetched on open, optional
    Turnstile on the last step;
  - lost work: answers + position persist to sessionStorage, so closing
    the sheet or reloading resumes where the visitor left off; a
    finish-later link (resume prop) restores them on another device.

  Steps of kind "interstitial" show a quote and a Continue button.
  Single required radio steps advance on tap. A terminal step submits
  early (soft exit). The thank-you shows the definition's
  recommendations, or the booking embed for qualified leads.

  Page context: pass initialValues (e.g. { project_type: "residential",
  build_type: "predesigned", series: "annata" } from a series page) and
  steps fully answered by it are skipped going forward — still
  reachable with Back.

  Analytics: every step view and the final outcome dispatch an
  "mh:form" CustomEvent on window ({ form, step, index, event }) for
  whatever tracking the site adopts; nothing is sent anywhere by this
  component.

  Load it lazily (LazyGetStarted / LazyIntakeForm) — it pulls
  react-hook-form + zod, which no visitor should download until a form
  actually opens.
*/

type Status = "idle" | "sending" | "success" | "error";

/* step crossfade: the outgoing screen lifts and fades, then the next
   settles in (seconds) */
const STEP_OUT = 0.3;
const STEP_IN = 0.55;

const BTN =
  "label inline-flex h-14 items-center justify-center rounded-md px-2xl font-medium transition-[background-color,color,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:opacity-60";
const BTN_PRIMARY = `${BTN} bg-btn text-btn-fg hover:opacity-80`;
/* the library button's Disabled state: wash fill, tertiary ink */
const BTN_DISABLED = `${BTN} cursor-not-allowed bg-wash text-ink-3 disabled:opacity-100`;
const ICON_BTN =
  "inline-flex size-10 items-center justify-center rounded-md text-ink transition-opacity hover:opacity-70 disabled:opacity-40";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function emit(detail: Record<string, unknown>) {
  try {
    window.dispatchEvent(new CustomEvent("mh:form", { detail }));
  } catch {
    /* ignore */
  }
}

export interface SuccessContext {
  answers: Answers;
  submissionId: string;
  /* the definition's qualify() verdict (false when it has none) */
  qualified: boolean;
  /* a terminal step ended the form early (its outcome id) */
  outcome?: string;
}

export interface MultiStepFormProps {
  def: FormDef;
  initialValues?: Answers;
  /* answers restored from a finish-later link (wins over the session draft) */
  resume?: ResumePayload;
  /* keep answers in sessionStorage between opens (default true) */
  persist?: boolean;
  onComplete?: (submissionId: string, ctx: SuccessContext) => void;
  /* shows the header Close and the Done button on the thank-you */
  onClose?: () => void;
  /* mirror steps into browser history so the device Back button steps
     back inside the sheet instead of leaving it (the tray turns this on) */
  historyNav?: boolean;
  success?: ReactNode | ((ctx: SuccessContext) => ReactNode);
  className?: string;
}

export function MultiStepForm({
  def,
  initialValues,
  resume,
  persist = true,
  onComplete,
  onClose,
  historyNav = false,
  success,
  className,
}: MultiStepFormProps) {
  const pathname = usePathname();
  const uid = useId();
  const draft = useMemo(
    () => resume ?? (persist ? loadDraft(def.id) : undefined),
    [def.id, persist, resume],
  );

  const {
    register,
    control,
    getValues,
    setValue,
    setError,
    clearErrors,
    setFocus,
    formState,
  } = useForm<Answers>({
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
      const shown = visibleFields(step, initialValues).filter(
        (f) => f.type !== "hidden",
      );
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
    if (draft?.stepId && first.some((s) => s.id === draft.stepId))
      return draft.stepId;
    return (first.find((s) => !prefilled.has(s.id)) ?? first[0]).id;
  });
  const index = Math.max(
    0,
    steps.findIndex((s) => s.id === stepId),
  );
  const step: StepDef = steps[index];
  /* a terminal step is always the last visible one (visibleSteps stops there) */
  const isLast = index === steps.length - 1;
  const interstitial = step.kind === "interstitial";
  const review = step.kind === "review";
  /* editing from the review: Next returns there instead of moving on */
  const [returnToReview, setReturnToReview] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>();
  const [done, setDone] = useState<SuccessContext>();
  /* true when the current step was entered with its single-choice
     answer already in place (Back, a restored draft, a resume link):
     that is the only time a tap step shows Next. A fresh tap keeps the
     footer hidden while the auto-advance is on its way. */
  const [revisitAnswered, setRevisitAnswered] = useState<boolean>(() => {
    const vals = { ...draft?.answers, ...initialValues };
    const first = visibleSteps(def, vals);
    const s0 =
      first.find((x) => x.id === draft?.stepId) ??
      first.find((x) => !prefilled.has(x.id)) ??
      first[0];
    return Boolean(
      s0 &&
      s0.fields.some(
        (f) =>
          f.type === "radio" &&
          f.required &&
          typeof vals[f.name] === "string" &&
          vals[f.name],
      ),
    );
  });
  /* the "thinking" preloader shown for a beat before a computed step */
  const [thinking, setThinking] = useState<string>();
  const thinkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lock = useRef(false);
  const submissionId = useRef<string>(undefined);
  const lastFingerprint = useRef<string>(undefined);
  const honeypot = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const token = useRef<{ value?: string; at: number }>({ at: 0 });
  const {
    container: turnstileRef,
    getToken: turnstileToken,
    reset: turnstileReset,
  } = useTurnstile();

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
    const t = setTimeout(
      () => saveDraft(def.id, { answers: getValues(), stepId }),
      300,
    );
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

  /* new step: scroll the content to the top and move focus to the
     heading so screen readers announce it (not on first render —
     opening the form shouldn't steal focus) */
  useEffect(() => {
    emit({ form: def.id, step: stepId, index, event: "step" });
    /* the outgoing step fades for STEP_OUT first; by then the heading
       ref points at the incoming one */
    const t = setTimeout(
      () => {
        scroller.current?.scrollTo({ top: 0 });
        if (moved.current) heading.current?.focus({ preventScroll: true });
      },
      STEP_OUT * 1000 + 20,
    );
    return () => clearTimeout(t);
  }, [stepId, index, def.id]);

  /* move to a step. Forward moves push a history entry (when historyNav
     is on) so the browser's Back walks back through the steps; `silent`
     is used when we are already reacting to a popstate. Steps that
     compute their content from earlier answers show their preloader
     first. */
  const go = useCallback(
    (id: string, opts?: { silent?: boolean }) => {
      moved.current = true;
      setMessage(undefined);
      const target = def.steps.find((s) => s.id === id);
      const vals = getValues();
      setRevisitAnswered(
        Boolean(
          target &&
          target.fields.some(
            (f) =>
              f.type === "radio" &&
              f.required &&
              typeof vals[f.name] === "string" &&
              vals[f.name],
          ),
        ),
      );
      clearTimeout(thinkTimer.current);
      if (target?.loading) {
        setThinking(target.loading);
        thinkTimer.current = setTimeout(() => setThinking(undefined), 1100);
      } else {
        setThinking(undefined);
      }
      if (historyNav && !opts?.silent && typeof window !== "undefined") {
        try {
          const depth = (window.history.state?.mhSheetDepth ?? 0) + 1;
          window.history.pushState(
            {
              ...(window.history.state ?? {}),
              mhSheet: true,
              mhStep: id,
              mhSheetDepth: depth,
            },
            "",
            window.location.href,
          );
        } catch {
          /* history unavailable — the in-sheet Back still works */
        }
      }
      setStepId(id);
    },
    [def.steps, historyNav, getValues],
  );

  /* history: stamp the opening step onto the entry the tray pushed, and
     answer the device Back button by stepping back (or, past the first
     step, letting the tray close) */
  useEffect(() => {
    if (!historyNav || typeof window === "undefined") return;
    try {
      const s = window.history.state ?? {};
      if (s.mhSheet && !s.mhStep)
        window.history.replaceState(
          { ...s, mhStep: stepId },
          "",
          window.location.href,
        );
    } catch {
      /* ignore */
    }
    const onPop = (e: PopStateEvent) => {
      const s = e.state as { mhSheet?: boolean; mhStep?: string } | null;
      if (!s?.mhSheet) return; // left the sheet — the tray closes itself
      if (status === "success") return;
      /* the tray's base entry carries no step: it means the first one */
      const target =
        s.mhStep && def.steps.some((x) => x.id === s.mhStep)
          ? s.mhStep
          : visibleSteps(def, getValues())[0]?.id;
      if (target && target !== stepId) go(target, { silent: true });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [historyNav, stepId, status, def, getValues, go]);

  useEffect(() => () => clearTimeout(thinkTimer.current), []);

  /* tap-to-advance: a step whose only visible question is one required
     radio moves on as soon as it is answered (a beat later, so the
     selection is seen). Never on the last step or a terminal step. */
  const autoAdvance = useRef<ReturnType<typeof setTimeout>>(undefined);
  const advanceKey = (() => {
    if (step.autoAdvance === false || isLast || step.terminal || interstitial)
      return undefined;
    /* came back to edit: show the question and let Next do the moving */
    if (revisitAnswered || returnToReview) return undefined;
    const shownNow = visibleFields(step, values).filter(
      (f) => f.type !== "hidden",
    );
    if (
      shownNow.length !== 1 ||
      shownNow[0].type !== "radio" ||
      !shownNow[0].required
    )
      return undefined;
    const v = values[shownNow[0].name];
    return typeof v === "string" && v ? `${step.id}:${v}` : undefined;
  })();
  /* null until the first render has been seen: a restored draft or a
     resume link that lands on an answered single-choice step must not
     auto-advance on mount — only a NEW tap does */
  const lastAdvance = useRef<string | undefined | null>(null);
  useEffect(() => {
    if (lastAdvance.current === null) {
      lastAdvance.current = advanceKey;
      return;
    }
    if (!advanceKey || advanceKey === lastAdvance.current) return;
    lastAdvance.current = advanceKey;
    clearTimeout(autoAdvance.current);
    autoAdvance.current = setTimeout(() => {
      if (lock.current) return;
      const vals = getValues();
      const order = visibleSteps(def, vals);
      const here = order.findIndex((s) => s.id === step.id);
      if (here < 0 || here >= order.length - 1) return;
      if (Object.keys(validateStep(step, vals).errors).length) return;
      go(order[here + 1].id);
    }, 260);
    return () => clearTimeout(autoAdvance.current);
  }, [advanceKey, def, step, getValues, go]);

  const showErrors = useCallback(
    (errors: Record<string, string>) => {
      const names = Object.keys(errors);
      for (const name of names)
        setError(name, { type: "validate", message: errors[name] });
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
    if (returnToReview) {
      const target = order.find((s) => s.kind === "review");
      setReturnToReview(false);
      if (target) return go(target.id);
    }
    const here = order.findIndex((s) => s.id === step.id);
    let i = here + 1;
    while (
      i < order.length - 1 &&
      prefilled.has(order[i].id) &&
      !Object.keys(validateStep(order[i], vals).errors).length
    )
      i++;
    go(order[Math.min(i, order.length - 1)].id);
  }, [
    getValues,
    step,
    def,
    prefilled,
    go,
    clearErrors,
    showErrors,
    returnToReview,
  ]);

  const back = useCallback(() => {
    clearErrors();
    const order = visibleSteps(def, getValues());
    const here = order.findIndex((s) => s.id === step.id);
    if (here <= 0) return;
    /* with history mirroring, the in-sheet Back IS a browser back so the
       two stay in step; the popstate handler moves the form */
    if (
      historyNav &&
      typeof window !== "undefined" &&
      window.history.state?.mhSheet &&
      window.history.state.mhSheetDepth > 0
    ) {
      window.history.back();
      return;
    }
    go(order[here - 1].id);
  }, [def, getValues, step, go, clearErrors, historyNav]);

  const send = useCallback(async () => {
    const vals = getValues();
    const result = validateAnswers(def, vals);
    if (!result.success) {
      const order = visibleSteps(def, vals);
      const target = order.find((s) =>
        s.fields.some((f) => result.errors[f.name]),
      );
      if (target && target.id !== step.id) go(target.id);
      requestAnimationFrame(() => showErrors(result.errors));
      return;
    }

    lock.current = true;
    setStatus("sending");
    setMessage(undefined);
    /* the calculating preloader: shown for the whole request and at
       least this long, so the thank-you never snaps in */
    const startedAt = Date.now();
    const MIN_MS = 1600;
    clearTimeout(thinkTimer.current);
    setThinking(def.submittingLabel ?? "Sending…");

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

    await new Promise((r) =>
      setTimeout(r, Math.max(0, MIN_MS - (Date.now() - startedAt))),
    );
    setThinking(undefined);
    if (res.ok) {
      const ctx: SuccessContext = {
        answers: result.data,
        submissionId: submissionId.current,
        qualified: Boolean(def.qualify?.(result.data)),
        outcome: step.terminal ? (step.outcome ?? step.id) : undefined,
      };
      setDone(ctx);
      setStatus("success");
      if (persist) clearDraft(def.id);
      emit({
        form: def.id,
        step: step.id,
        index,
        event: "submitted",
        outcome: ctx.outcome,
        qualified: ctx.qualified,
      });
      onComplete?.(submissionId.current, ctx);
      return; // lock stays held: the form is done
    }
    turnstileReset();
    lock.current = false;
    if (res.kind === "validation") {
      setStatus("idle");
      const order = visibleSteps(def, vals);
      const target = order.find((s) =>
        s.fields.some((f) => res.fieldErrors[f.name]),
      );
      if (target && target.id !== step.id) go(target.id);
      requestAnimationFrame(() => showErrors(res.fieldErrors));
      return;
    }
    setStatus("error");
    setMessage(res.message);
    emit({
      form: def.id,
      step: step.id,
      index,
      event: "error",
      kind: res.kind,
    });
  }, [
    getValues,
    def,
    step,
    index,
    go,
    showErrors,
    pathname,
    persist,
    onComplete,
    turnstileToken,
    turnstileReset,
  ]);

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

  /* ── shared chrome ─────────────────────────────────────────────── */
  const finished = status === "success" && done;
  const section = finished ? "Thank you" : (step.section ?? def.title);
  const progress = Math.round(((index + 1) / steps.length) * 100);

  const header = (
    <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-md md:h-[5.5rem] md:px-xl">
      <div className="flex items-center gap-lg">
        {!finished && index > 0 ? (
          <button
            type="button"
            onClick={back}
            className={ICON_BTN}
            disabled={status === "sending"}
            aria-label="Back"
          >
            <ArrowLeft className="size-6" />
          </button>
        ) : (
          <span className="size-10" />
        )}
        <img
          src="/method/brand/logo-nav.webp"
          alt="Method Homes"
          className="hidden h-8 w-auto md:block"
        />
      </div>
      <p className="text-body-md font-medium text-ink">{section}</p>
      <div className="flex justify-end">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={ICON_BTN}
            aria-label="Close"
          >
            <XClose className="size-5" />
          </button>
        ) : (
          <span className="size-10" />
        )}
      </div>
    </header>
  );

  const progressBar = finished ? (
    <div className="h-[3px] w-full shrink-0 bg-line" aria-hidden="true" />
  ) : (
    <div
      className="h-[3px] w-full shrink-0 bg-line"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-label="Progress"
    >
      <div
        className="h-[3px] bg-ink transition-[width] duration-300"
        style={{ width: `${progress}%` }}
      />
      <p className="sr-only">
        Step {index + 1} of {steps.length}
      </p>
    </div>
  );

  /* content area: scrolls, question top-aligned under the progress bar.
     Each screen (a step, the preloader, the thank-you) is keyed so the
     outgoing one fades and lifts away before the next fades in — one
     AnimatePresence that lives for the whole form because every branch
     renders through this same helper inside the same <form>. */
  const content = (key: string, children: ReactNode) => (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex min-h-full flex-col px-xl py-6xl md:py-8xl">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={key}
            className="mx-auto w-full max-w-[34rem]"
            initial={{ opacity: 0, y: 12 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: STEP_IN, ease: EASE_OUT },
            }}
            exit={{
              opacity: 0,
              y: -8,
              transition: { duration: STEP_OUT, ease: EASE_OUT },
            }}
          >
            {children}
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );

  /* footer pinned to the bottom of the sheet. The fade above it on
     phones belongs to the button: a long list dissolves before Next.
     Footers with no button (tap-to-advance hint, preloader) get none. */
  const footer = (children: ReactNode, opts?: { fade?: boolean }) => (
    <m.div
      key="footer"
      className="relative shrink-0 bg-surface px-xl pb-4xl pt-lg md:pb-6xl"
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        transition: { duration: DUR.fast, ease: EASE_OUT },
      }}
      exit={{ opacity: 0, transition: { duration: DUR.fast, ease: EASE_OUT } }}
    >
      {opts?.fade !== false ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-16 h-16 bg-linear-to-t from-surface to-transparent md:hidden"
        />
      ) : null}
      <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-md">
        {children}
      </div>
    </m.div>
  );

  /* one <form> for every branch so the keyed content and footer keep
     their AnimatePresence across step → preloader → thank-you */
  const shell = (inner: ReactNode, foot: ReactNode) => (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby={`${uid}-title`}
      className="contents"
    >
      <div
        className={`flex h-full min-h-0 flex-col bg-surface ${className ?? ""}`}
      >
        {header}
        {progressBar}
        {inner}
        <AnimatePresence initial={false}>{foot}</AnimatePresence>
      </div>
    </form>
  );

  /* ── thank-you ─────────────────────────────────────────────────── */
  if (finished) {
    const custom = typeof success === "function" ? success(done) : success;
    const first =
      typeof done.answers.first_name === "string"
        ? done.answers.first_name
        : undefined;
    const name =
      [done.answers.first_name, done.answers.last_name]
        .filter((x) => typeof x === "string")
        .join(" ") || undefined;
    const email =
      typeof done.answers.email === "string" ? done.answers.email : undefined;
    const recs = def.recommendations?.(done.answers) ?? [];
    const body = custom ?? (
      <div className="flex flex-col gap-2xl" role="status">
        {done.outcome ? (
          <div className="flex flex-col gap-md text-center">
            <h2 className="text-title-md text-ink">
              Thanks — you’re on the list.
            </h2>
            <p className="text-body-md text-ink-3">
              We’ll email you if that changes.
            </p>
          </div>
        ) : done.qualified && BOOKING_ENABLED ? (
          <>
            <div className="flex flex-col gap-md text-center">
              <h2 className="text-title-md text-ink">
                Thank you — let’s talk.
              </h2>
              <p className="text-body-md text-ink-3">
                Your project is a good fit. Pick a time below and we’ll come
                prepared with your answers.
              </p>
            </div>
            <BookingEmbed name={name} email={email} />
          </>
        ) : (
          <>
            <div className="flex flex-col gap-md text-center">
              <h2 className="text-title-md text-ink">
                {first ? `Thanks, ${first}.` : "Thank you — we’ve got it."}
              </h2>
              <p className="text-body-md text-ink-3">
                We’ll be in touch within two business days.
                {recs.length
                  ? " While you wait, here’s what fits what you told us."
                  : ""}
              </p>
            </div>
            {recs.map((r) => (
              <RecommendationCard key={r.href + r.title} rec={r} />
            ))}
          </>
        )}
      </div>
    );
    return shell(
      content("done", body),
      onClose
        ? footer(
            <button
              type="button"
              onClick={onClose}
              className={`${BTN_PRIMARY} w-full md:w-auto md:self-end`}
            >
              Done
            </button>,
          )
        : null,
    );
  }

  /* ── thinking: a beat before a computed step ───────────────────── */
  if (thinking) {
    return shell(
      content(
        "thinking",
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-xl py-8xl text-center"
        >
          <span aria-hidden="true" className="flex items-center gap-md">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="mh-dot size-2 rounded-full bg-ink"
                style={{ animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </span>
          <p className="text-body-md text-ink-3">{thinking}</p>
        </div>,
      ),
      footer(<div className="h-14" aria-hidden="true" />, { fade: false }),
    );
  }

  /* ── a step ─────────────────────────────────────────────────────── */
  const shown = visibleFields(step, values).filter((f) => f.type !== "hidden");
  const errorCount = Object.keys(fieldErrors).length;
  /* server/network problems win; otherwise summarize field errors */
  const live =
    message ??
    (errorCount === 1
      ? "One answer needs a look."
      : errorCount > 1
        ? `${errorCount} answers need a look.`
        : undefined);
  const primaryLabel = isLast
    ? status === "sending"
      ? "Sending…"
      : (step.submitLabel ?? def.submitLabel ?? "Submit")
    : interstitial
      ? "Continue"
      : returnToReview
        ? "Back to review"
        : "Next";
  /* Next stays grayed until the step's required answers are in;
     interstitials are always ready */
  const ready =
    interstitial ||
    (review
      ? validateAnswers(def, values).success
      : !Object.keys(validateStep(step, values).errors).length);
  /* a single-choice step needs no Next at all: the tap advances. The
     button comes back only when the visitor returns to a step already
     answered (Back), so they can move on without changing it. */
  const tapStep = (() => {
    if (step.autoAdvance === false || isLast || step.terminal || interstitial)
      return false;
    const shownNow = shown;
    return (
      shownNow.length === 1 &&
      shownNow[0].type === "radio" &&
      Boolean(shownNow[0].required)
    );
  })();
  /* no footer on a tap step until it has been answered AND that answer
     has already been used to advance (a revisit). A fresh tap is on
     its way to the next step, so Next must not flash in the meantime. */
  const tapPending = tapStep && !revisitAnswered && !returnToReview;

  return shell(
    content(
      step.id,
      <div className="flex flex-col gap-2xl">
        {interstitial ? (
          <div className="flex flex-col gap-2xl">
            <p
              aria-hidden="true"
              className="text-headline-lg leading-none text-ink"
            >
              “
            </p>
            <h2
              id={`${uid}-title`}
              ref={heading}
              tabIndex={-1}
              className="text-title-md text-ink outline-none"
            >
              {step.quote ?? step.title}
            </h2>
            {step.attribution ? (
              <div className="flex items-center gap-lg">
                <span
                  aria-hidden="true"
                  className="size-12 shrink-0 rounded-full bg-surface-2"
                />
                <div className="flex flex-col">
                  <p className="text-body-md font-medium text-ink">
                    {step.attribution.name}
                  </p>
                  {step.attribution.role ? (
                    <p className="text-body-sm text-ink-3">
                      {step.attribution.role}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-md text-center">
              <h2
                id={`${uid}-title`}
                ref={heading}
                tabIndex={-1}
                className="text-title-md text-ink outline-none"
              >
                {step.title}
              </h2>
              {step.description ? (
                <p className="text-body-md text-ink-3">{step.description}</p>
              ) : null}
            </div>
            {review ? (
              <div className="flex flex-col gap-lg">
                {visibleSteps(def, values)
                  .filter(
                    (s) => s.kind !== "review" && s.kind !== "interstitial",
                  )
                  .map((s) => ({
                    step: s,
                    rows: visibleFields(s, values)
                      .filter((f) => f.type !== "hidden")
                      .filter((f) => {
                        const v = values[f.name];
                        return Array.isArray(v) ? v.length : v;
                      })
                      .map((f) =>
                        describeAnswer(def, f.name, values[f.name]!, values),
                      ),
                  }))
                  .filter((g) => g.rows.length)
                  .map((g) => (
                    <div
                      key={g.step.id}
                      className="flex items-start justify-between gap-xl rounded-md border border-line p-xl"
                    >
                      <dl className="flex min-w-0 flex-1 flex-col gap-md">
                        {g.rows.map((r) => (
                          <div key={r.label} className="flex flex-col gap-xs">
                            <dt className="text-body-sm text-ink-3">
                              {r.label}
                            </dt>
                            <dd className="text-body-md text-ink">{r.value}</dd>
                          </div>
                        ))}
                      </dl>
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
              </div>
            ) : null}
            <div className="flex flex-col gap-lg">
              {shown.map((field) => (
                <Field
                  key={field.name}
                  field={field}
                  register={register}
                  setValue={setValue}
                  options={optionsOf(field, values)}
                  error={fieldErrors[field.name]?.message as string | undefined}
                  idPrefix={uid}
                  hideLabel={shown.length === 1 && field.type !== "consent"}
                />
              ))}
            </div>
          </>
        )}

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
        {live ? (
          <p aria-live="polite" className="text-center text-body-sm text-ink">
            {live}
          </p>
        ) : (
          <p aria-live="polite" className="sr-only" />
        )}
      </div>,
    ),
    tapPending
      ? null
      : footer(
          <button
            type="submit"
            className={`${ready ? BTN_PRIMARY : BTN_DISABLED} w-full md:w-auto md:self-end`}
            disabled={status === "sending" || !ready}
            aria-busy={status === "sending" || undefined}
          >
            {primaryLabel}
          </button>,
        ),
  );
}

/* thank-you "what to read next" cards: a big image card or a row */
function RecommendationCard({ rec }: { rec: Recommendation }) {
  const arrow = (
    <span aria-hidden="true" className="shrink-0 text-body-md text-ink">
      →
    </span>
  );
  if (rec.size === "feature") {
    return (
      <a
        href={rec.href}
        className="group flex flex-col overflow-hidden rounded-md border border-line bg-surface transition-colors hover:border-ink-3"
      >
        {rec.image ? (
          <img
            src={rec.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-[16/10] w-full bg-surface-2 object-cover"
          />
        ) : null}
        <span className="flex items-center gap-lg px-xl py-lg">
          <span className="flex min-w-0 flex-1 flex-col gap-xs">
            <span className="label text-ink-3">{rec.eyebrow}</span>
            <span className="text-title-sm text-ink">{rec.title}</span>
            {rec.meta ? (
              <span className="text-body-sm text-ink-3">{rec.meta}</span>
            ) : null}
          </span>
          {arrow}
        </span>
      </a>
    );
  }
  return (
    <a
      href={rec.href}
      className="group flex items-center gap-lg rounded-md border border-line bg-surface p-lg transition-colors hover:border-ink-3"
    >
      {rec.image ? (
        <img
          src={rec.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-[4.5rem] w-24 shrink-0 bg-surface-2 object-cover"
        />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-xs">
        <span className="label text-ink-3">{rec.eyebrow}</span>
        <span className="text-body-md font-medium text-ink">{rec.title}</span>
        {rec.meta ? (
          <span className="text-body-sm text-ink-3">{rec.meta}</span>
        ) : null}
      </span>
      {arrow}
    </a>
  );
}
