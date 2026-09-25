/*
  Declarative form definitions — the single description of a form that
  BOTH sides read: the client engine renders and validates steps from
  it, and /api/forms re-validates the submission against the same
  definition (never trust the browser). Keep this file dependency-free
  and client-safe.

  A definition is data, not components: adding a question means adding
  an object here, not writing JSX.
*/

export type Answers = Record<string, string | string[] | undefined>;

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "textarea"
  | "select" // dropdown, one value
  | "radio" // visible options, one value
  | "checkbox" // visible options, many values
  | "consent" // single yes/no checkbox that must be ticked when required
  | "hidden"; // never rendered; carries page context (e.g. the plan a CTA sat on)

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  /* answer key — stable, snake_case; it is what lands in the inbox */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /* short helper under the label */
  hint?: string;
  placeholder?: string;
  options?: FieldOption[];
  /* text rules */
  minLength?: number;
  maxLength?: number;
  pattern?: { regex: string; message: string };
  /* checkbox rules */
  minSelected?: number;
  maxSelected?: number;
  autoComplete?: string;
  /* hide the field unless this returns true (branching inside a step) */
  showIf?: (answers: Answers) => boolean;
}

export interface StepDef {
  id: string;
  title: string;
  description?: string;
  fields: FieldDef[];
  /* skip the whole step unless this returns true (branching) */
  showIf?: (answers: Answers) => boolean;
}

export interface FormDef {
  /* matches the `form` key posted to /api/forms (max 40 chars) */
  id: string;
  title: string;
  steps: StepDef[];
  /* label on the final button */
  submitLabel?: string;
  /* answers whose labels make the one-line inbox summary
     ("Residential · Predesigned · Annata · Washington") */
  summaryFields?: string[];
  /* show a read-back of every answer (with Edit links) on the last step */
  review?: boolean;
}

/* what the client posts for a registered multi-step form */
export interface SubmissionPayload {
  form: string;
  answers: Answers;
  /* client-generated, reused across retries — the server dedupes on it */
  submissionId: string;
  /* signed time-trap token from GET /api/forms */
  token?: string;
  /* Cloudflare Turnstile response, when the site key is configured */
  turnstile?: string;
  /* honeypot — must stay empty */
  website?: string;
  page?: string;
  attribution?: Attribution;
}

export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
  landingPage?: string;
}

/* server → client error shape (422) */
export interface SubmissionErrorBody {
  error: string;
  fieldErrors?: Record<string, string>;
}
