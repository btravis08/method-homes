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
  | "address" // free text with place autocomplete when a geocoder token is configured
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
  /* address fields: the answer keys the geocoder fills alongside the
     formatted address (each must also be declared as a hidden field so
     the server keeps and validates it) */
  addressParts?: Partial<Record<AddressPart, string>>;
}

export type AddressPart = "street" | "city" | "state" | "postal" | "country" | "lat" | "lng";

export interface StepDef {
  id: string;
  title: string;
  description?: string;
  fields: FieldDef[];
  /* skip the whole step unless this returns true (branching) */
  showIf?: (answers: Answers) => boolean;
  /* a terminal step ends the form early: it is submitted from here and
     every later step is dropped (a soft exit such as "we don't build
     there yet"). Its `outcome` is stored on the submission. */
  terminal?: boolean;
  outcome?: string;
  /* button label on a terminal step (defaults to the form's submitLabel) */
  submitLabel?: string;
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
  /* lets the visitor email themselves a link that restores the answers */
  resumable?: boolean;
  /* leads that pass go straight to a booking embed on the thank-you
     screen (NEXT_PUBLIC_BOOKING_URL); the rest get the standard copy */
  qualify?: (answers: Answers) => boolean;
  /* lead scoring, stored on the submission for the inbox */
  score?: (answers: Answers) => LeadScore;
}

/* result of the lead scoring in lib/forms/score.ts */
export type LeadTier = "hot" | "warm" | "cool";
export interface LeadScore {
  score: number; // 0–100
  tier: LeadTier;
  /* what earned the points, for the inbox ("Budget $1M–$2M · Building 2026 · Owns land") */
  reasons: string[];
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

/* what the client posts to /api/forms/resume to get a finish-later link */
export interface ResumeRequest {
  form: string;
  email: string;
  answers: Answers;
  stepId?: string;
  /* path the form lives on — the link reopens it there */
  page?: string;
  token?: string;
  website?: string;
}

/* what a resume token unseals to */
export interface ResumePayload {
  form: string;
  answers: Answers;
  stepId?: string;
}

/* server → client error shape (422) */
export interface SubmissionErrorBody {
  error: string;
  fieldErrors?: Record<string, string>;
}
