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
  /* still for image layouts (a public/ path); rendered lazily */
  image?: string;
  /* small print under the label in the "media" layout */
  meta?: string;
  /* tiny uppercase label above the title in the "media" layout */
  eyebrow?: string;
  /* consecutive options with the same group render under one heading
     ("Fit your size and budget" / "The rest of the series") */
  group?: string;
}

/* how a radio/checkbox group draws its options:
   list  — stacked bordered rows (default); short labels wrap to two columns
   cards — image-background cards, label and control over a bottom scrim
   media — thumbnail rows: image left, eyebrow/title/meta, control right */
export type OptionLayout = "list" | "cards" | "media";

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
  /* options that depend on earlier answers (e.g. the series that fit
     the chosen size and budget). Resolved with optionsOf() on both
     sides, so validation always checks against what was shown. */
  optionsFor?: (answers: Answers) => FieldOption[];
  /* text rules */
  minLength?: number;
  maxLength?: number;
  pattern?: { regex: string; message: string };
  /* checkbox rules */
  minSelected?: number;
  maxSelected?: number;
  autoComplete?: string;
  /* radio/checkbox presentation (see OptionLayout) */
  layout?: OptionLayout;
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
  /* "interstitial": a pause between questions — a quote or a line of
     reassurance with a Continue button and no fields;
     "review": a read-back of every answer with Edit links, the step
     the form is sent from */
  kind?: "question" | "interstitial" | "review";
  quote?: string;
  attribution?: { name: string; role?: string };
  /* the label in the sheet header ("Get started", "About you") */
  section?: string;
  /* shown for a beat before the step appears, for steps whose content
     is computed from earlier answers ("Finding the series that fit…") */
  loading?: string;
  /* skip the whole step unless this returns true (branching) */
  showIf?: (answers: Answers) => boolean;
  /* a step whose only visible question is one required radio advances
     on tap (default). Set false to keep the Next button as the only way on. */
  autoAdvance?: boolean;
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
  /* preloader line shown while the submission is in flight and the
     recommendations are prepared ("Sending your responses…") */
  submittingLabel?: string;
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
  /* thank-you screen: what to read next, built from the answers */
  recommendations?: (answers: Answers) => Recommendation[];
}

export interface Recommendation {
  eyebrow: string;
  title: string;
  meta?: string;
  href: string;
  image?: string;
  /* "feature": big image card; "row": thumbnail row */
  size?: "feature" | "row";
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
