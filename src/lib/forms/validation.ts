import { z } from "zod";

import type { Answers, FieldDef, FormDef, StepDef } from "./types";

/*
  Validation built from a FormDef. The client validates one step at a
  time with stepSchema(); /api/forms validates the whole submission
  with validateAnswers(). Both go through the same field rules, so the
  two sides can never disagree about what a valid answer is.

  Branching is resolved against the answers themselves: a hidden step
  or field is neither validated nor kept — answers to questions the
  visitor can no longer see (they went back and changed a branch) are
  dropped instead of leaking into the inbox.
*/

const TEXT_MAX = 200;
const TEXTAREA_MAX = 2000;
const MAX_CHECKBOX = 30;

/* strip control characters, trim, collapse runs of spaces; textareas
   keep single line breaks but lose runs of blank lines */
export function normalizeText(value: unknown, multiline = false): string {
  if (typeof value !== "string") return "";
  let s = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  if (multiline) {
    s = s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  } else {
    s = s.replace(/\s+/g, " ");
  }
  return s.trim();
}

export const isFieldVisible = (field: FieldDef, answers: Answers) =>
  !field.showIf || field.showIf(answers);

export const isStepVisible = (step: StepDef, answers: Answers) =>
  !step.showIf || step.showIf(answers);

export const visibleSteps = (def: FormDef, answers: Answers) =>
  def.steps.filter((s) => isStepVisible(s, answers));

export const visibleFields = (step: StepDef, answers: Answers) =>
  step.fields.filter((f) => isFieldVisible(f, answers));

const TEL_RE = /^\+?[\d\s().-]{7,25}$/;

const requiredMessage = (field: FieldDef) =>
  field.type === "checkbox" || field.type === "radio" || field.type === "select"
    ? "Please choose an option."
    : field.type === "consent"
      ? "Please confirm to continue."
      : `Please enter your ${field.label.toLowerCase()}.`;

/* the zod schema for ONE field's value */
export function fieldSchema(field: FieldDef): z.ZodType {
  const req = requiredMessage(field);

  switch (field.type) {
    case "hidden":
    case "text":
    case "email":
    case "tel":
    case "textarea": {
      const multiline = field.type === "textarea";
      const max = field.maxLength ?? (multiline ? TEXTAREA_MAX : TEXT_MAX);
      const pattern = field.pattern ? new RegExp(field.pattern.regex) : null;
      return z.preprocess(
        (v) => normalizeText(v, multiline),
        z.string().superRefine((s, ctx) => {
          if (!s) {
            if (field.required) ctx.addIssue({ code: "custom", message: req });
            return;
          }
          if (field.minLength && s.length < field.minLength)
            ctx.addIssue({ code: "custom", message: `Please use at least ${field.minLength} characters.` });
          if (s.length > max)
            ctx.addIssue({ code: "custom", message: `Please keep this under ${max} characters.` });
          if (field.type === "email" && !z.email().safeParse(s).success)
            ctx.addIssue({ code: "custom", message: "Please enter a valid email address." });
          if (field.type === "tel" && (!TEL_RE.test(s) || s.replace(/\D/g, "").length < 7))
            ctx.addIssue({ code: "custom", message: "Please enter a valid phone number." });
          if (pattern && !pattern.test(s))
            ctx.addIssue({ code: "custom", message: field.pattern!.message });
        }),
      );
    }

    case "select":
    case "radio": {
      const values = new Set((field.options ?? []).map((o) => o.value));
      return z.preprocess(
        (v) => (typeof v === "string" ? v : ""),
        z.string().superRefine((s, ctx) => {
          if (!s) {
            if (field.required) ctx.addIssue({ code: "custom", message: req });
            return;
          }
          if (!values.has(s)) ctx.addIssue({ code: "custom", message: "Please choose one of the options." });
        }),
      );
    }

    case "checkbox": {
      const values = new Set((field.options ?? []).map((o) => o.value));
      const min = field.minSelected ?? (field.required ? 1 : 0);
      const max = Math.min(field.maxSelected ?? MAX_CHECKBOX, MAX_CHECKBOX);
      return z.preprocess(
        (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []),
        z.array(z.string()).superRefine((arr, ctx) => {
          const unique = [...new Set(arr)];
          if (unique.some((x) => !values.has(x)))
            ctx.addIssue({ code: "custom", message: "Please choose from the options shown." });
          if (unique.length < min)
            ctx.addIssue({ code: "custom", message: min === 1 ? req : `Please choose at least ${min}.` });
          if (unique.length > max)
            ctx.addIssue({ code: "custom", message: `Please choose at most ${max}.` });
        }).transform((arr) => [...new Set(arr)]),
      );
    }

    case "consent":
      return z.preprocess(
        (v) => (v === true || v === "yes" ? "yes" : ""),
        z.string().superRefine((s, ctx) => {
          if (!s && field.required) ctx.addIssue({ code: "custom", message: req });
        }),
      );
  }
}

export type FieldErrors = Record<string, string>;

function collectErrors(fields: FieldDef[], answers: Answers) {
  const data: Answers = {};
  const errors: FieldErrors = {};
  for (const field of fields) {
    const res = fieldSchema(field).safeParse(answers[field.name]);
    if (res.success) {
      const v = res.data as string | string[];
      if (Array.isArray(v) ? v.length : v) data[field.name] = v;
    } else {
      errors[field.name] = res.error.issues[0]?.message ?? "Please check this answer.";
    }
  }
  return { data, errors };
}

/* validate one step (client, on Next) */
export function validateStep(step: StepDef, answers: Answers) {
  return collectErrors(visibleFields(step, answers), answers);
}

/* validate a whole submission (server). Visibility is decided on the
   submitted answers, re-checked after cleaning so a branch answer that
   fails validation can't open questions it shouldn't. */
export function validateAnswers(def: FormDef, raw: Answers) {
  const known = new Set(def.steps.flatMap((s) => s.fields.map((f) => f.name)));
  const answers: Answers = {};
  for (const [k, v] of Object.entries(raw ?? {})) if (known.has(k)) answers[k] = v;

  const fields = visibleSteps(def, answers).flatMap((s) => visibleFields(s, answers));
  const { data, errors } = collectErrors(fields, answers);
  return Object.keys(errors).length
    ? ({ success: false, errors } as const)
    : ({ success: true, data } as const);
}

/* label lookup for the inbox: "home_use" → "Which best describes …",
   "adu" → "In-law cottage / ADU" */
export function describeAnswer(def: FormDef, name: string, value: string | string[]) {
  const field = def.steps.flatMap((s) => s.fields).find((f) => f.name === name);
  const labelOf = (v: string) => field?.options?.find((o) => o.value === v)?.label ?? v;
  return {
    label: field?.label ?? name,
    value: Array.isArray(value) ? value.map(labelOf).join(", ") : labelOf(value),
  };
}
