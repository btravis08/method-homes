import { qualifiesForBooking, scoreIntake } from "../score";
import { ALL_SERIES_OPTION, SERIES, seriesOptions } from "../series";
import type { Answers, FormDef } from "../types";

/*
  "Get Started" intake — one modal flow replacing /get-started and the
  separate residential + commercial surveys (Figma: Get Started —
  Intake Flow row on the IA page). Questions and options are carried
  over from the live surveys (captured 2026-09-25); the branch,
  series, commercial type and organization questions are new.

  Answer keys are stable: they are what the Studio inbox and any CRM
  mapping read. Rename a label freely; rename a key only with a
  migration in mind.
*/

const isHome = (a: Answers) => a.project_type === "residential";
const isCommercial = (a: Answers) => a.project_type === "commercial";

const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

/* Timeline years roll with the calendar: this year, next year, then an
   open-ended bucket — in 2027 the choices read 2027 / 2028 / 2029 or
   later without a code change. Evaluated at module load on both the
   client and the server, so validation sees the same set. The values
   are the year itself (a stable, sortable answer) and "later". */
const thisYear = new Date().getFullYear();
const yearOpts = (later: (firstLaterYear: number) => string) =>
  opts(
    [String(thisYear), String(thisYear)],
    [String(thisYear + 1), String(thisYear + 1)],
    ["later", later(thisYear + 2)],
  );

export const intakeForm: FormDef = {
  id: "intake",
  title: "Get started",
  submitLabel: "Send",
  summaryFields: ["project_type", "build_type", "series", "commercial_type", "build_state"],
  /* no read-back step: the Figma flow sends from About you → Almost done */
  review: false,
  resumable: true,
  score: scoreIntake,
  qualify: qualifiesForBooking,
  steps: [
    {
      id: "branch",
      title: "What are you planning?",
      fields: [
        {
          name: "project_type",
          label: "What are you planning?",
          type: "radio",
          required: true,
          layout: "cards",
          options: [
            { value: "residential", label: "A home: custom or predesigned", image: "/method/intake/branch-residential.webp" },
            { value: "commercial", label: "A commercial project", image: "/method/intake/branch-commercial.webp" },
          ],
        },
        /* page context, set by the CTA that opened the form */
        { name: "source_series", label: "Series (from page)", type: "hidden" },
        { name: "source_plan", label: "Floor plan (from page)", type: "hidden" },
      ],
    },

    /* ── residential ─────────────────────────────── */
    {
      id: "build-type",
      title: "Custom architectural build or predesigned model?",
      showIf: isHome,
      fields: [
        {
          name: "build_type",
          label: "Custom or predesigned",
          type: "radio",
          required: true,
          options: opts(["custom", "Custom architectural"], ["predesigned", "Predesigned model"]),
        },
      ],
    },
    /* ── commercial ──────────────────────────────── */
    {
      id: "commercial-type",
      title: "What type of project is it?",
      showIf: isCommercial,
      fields: [
        {
          name: "commercial_type",
          label: "Project type",
          type: "radio",
          required: true,
          options: opts(
            ["workforce-housing", "Workforce housing"],
            ["schools-and-classrooms", "Schools & classrooms"],
            ["multifamily-housing", "Multifamily housing"],
            ["hospitality", "Hospitality & ski lodges"],
            ["other", "Other"],
          ),
        },
      ],
    },
    {
      id: "organization",
      title: "Tell us about your organization",
      showIf: isCommercial,
      fields: [
        { name: "organization", label: "Organization name", type: "text", autoComplete: "organization" },
        {
          name: "role",
          label: "Your role",
          type: "select",
          options: opts(
            ["owner", "Owner"],
            ["developer", "Developer"],
            ["architect", "Architect"],
            ["nonprofit", "Nonprofit"],
            ["other", "Other"],
          ),
        },
      ],
    },

    /* ── shared: where ───────────────────────────── */
    {
      id: "location",
      title: "Where is your project?",
      fields: [
        {
          name: "build_state",
          label: "State or territory",
          type: "select",
          required: true,
          options: opts(
            ["alaska", "Alaska"],
            ["arizona", "Arizona"],
            ["british-columbia", "British Columbia"],
            ["california", "California"],
            ["colorado", "Colorado"],
            ["idaho", "Idaho"],
            ["montana", "Montana"],
            ["nevada", "Nevada"],
            ["oregon", "Oregon"],
            ["utah", "Utah"],
            ["washington", "Washington"],
            ["wyoming", "Wyoming"],
            ["other", "Other"],
          ),
        },
        {
          name: "own_land",
          label: "Do you own land?",
          type: "radio",
          required: true,
          options: opts(["yes", "Yes"], ["no", "No"]),
        },
      ],
    },
    /* soft exit: outside the delivery region the form ends here with an
       email capture — no point walking someone through eight more
       questions we can't act on. Terminal: later steps are dropped. */
    {
      id: "out-of-area",
      title: "We don’t build there yet",
      description:
        "Method delivers across the western US and British Columbia. Leave your email and we’ll let you know if that changes, and share builders we trust in your area.",
      showIf: (a) => a.build_state === "other",
      terminal: true,
      outcome: "out-of-area",
      submitLabel: "Keep me posted",
      fields: [
        { name: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
        { name: "first_name", label: "First name", type: "text", autoComplete: "given-name", maxLength: 80, hint: "Optional" },
      ],
    },
    /* land follow-ups: owners tell us where the lot is (place lookup
       when a geocoder token is configured), the rest tell us where they
       are looking and whether they want help */
    {
      id: "land-owned",
      title: "Tell us about your land",
      showIf: (a) => a.own_land === "yes",
      fields: [
        {
          name: "site_address",
          label: "Lot address",
          type: "address",
          placeholder: "Street address, or the nearest town",
          hint: "Optional if you don’t have it handy.",
          maxLength: 200,
          addressParts: { city: "site_city", state: "site_state", postal: "site_postal", lat: "site_lat", lng: "site_lng" },
        },
        { name: "site_city", label: "Lot city", type: "hidden" },
        { name: "site_state", label: "Lot state", type: "hidden" },
        { name: "site_postal", label: "Lot postal code", type: "hidden" },
        { name: "site_lat", label: "Lot latitude", type: "hidden", maxLength: 24 },
        { name: "site_lng", label: "Lot longitude", type: "hidden", maxLength: 24 },
        {
          name: "lot_status",
          label: "What is on the lot today?",
          type: "radio",
          required: true,
          options: opts(
            ["cleared", "Cleared and ready to build"],
            ["raw", "Undeveloped land"],
            ["existing", "An existing structure"],
            ["not-sure", "Not sure yet"],
          ),
        },
      ],
    },
    {
      id: "land-search",
      title: "Finding land",
      showIf: (a) => a.own_land === "no",
      fields: [
        {
          name: "land_region",
          label: "Where are you looking?",
          type: "text",
          placeholder: "City, county or region",
          maxLength: 120,
          hint: "Optional",
        },
        {
          name: "land_help",
          label: "Would you like help finding land?",
          type: "radio",
          required: true,
          options: opts(["yes", "Yes, please"], ["no", "No, I have it covered"]),
        },
      ],
    },

    /* ── timeline / size / use / budget, per branch ── */
    {
      id: "timeline",
      title: "When do you plan to build?",
      fields: [
        {
          name: "res_timeline",
          label: "Timeline",
          type: "radio",
          required: true,
          showIf: isHome,
          options: yearOpts((y) => `${y} or later`),
        },
        {
          name: "com_timeline",
          label: "Timeline",
          type: "radio",
          required: true,
          showIf: isCommercial,
          options: yearOpts((y) => `Later than ${y - 1}`),
        },
      ],
    },
    {
      id: "size",
      title: "What is the size of your project?",
      fields: [
        {
          name: "res_size",
          label: "Size",
          type: "radio",
          required: true,
          showIf: isHome,
          options: opts(
            ["500", "500 sq. ft."],
            ["800", "800 sq. ft."],
            ["1000", "1,000 sq. ft."],
            ["1500", "1,500 sq. ft."],
            ["2000", "2,000 sq. ft."],
            ["2500", "2,500 sq. ft."],
            ["2500-plus", "Larger than 2,500 sq. ft."],
          ),
        },
        {
          name: "com_size",
          label: "Size",
          type: "radio",
          required: true,
          showIf: isCommercial,
          options: opts(
            ["500-1000", "500 – 1,000 sq. ft."],
            ["1000-2000", "1,000 – 2,000 sq. ft."],
            ["2000-5000", "2,000 – 5,000 sq. ft."],
            ["5000-10000", "5,000 – 10,000 sq. ft."],
            ["10000-plus", "Larger than 10,000 sq. ft."],
          ),
        },
      ],
    },
    {
      id: "use",
      title: "Which best describes the use of your home?",
      showIf: isHome,
      fields: [
        {
          name: "home_use",
          label: "Use of the home",
          type: "radio",
          required: true,
          options: opts(
            ["primary", "Primary residence"],
            ["vacation", "Vacation home"],
            ["adu", "In-law cottage / ADU"],
            ["guest-house", "Guest house"],
            ["studio", "Studio"],
            ["addition", "Add-on / addition"],
          ),
        },
      ],
    },
    {
      id: "budget",
      title: "What is your budget, excluding land?",
      fields: [
        {
          name: "res_budget",
          label: "Budget",
          type: "radio",
          required: true,
          showIf: isHome,
          options: opts(
            ["200-400k", "$200k–$400k"],
            ["400-600k", "$400k–$600k"],
            ["600-800k", "$600k–$800k"],
            ["800k-1m", "$800k–$1M"],
            ["1-2m", "$1M–$2M"],
            ["2m-plus", "Over $2M"],
          ),
        },
        {
          name: "com_budget",
          label: "Budget",
          type: "text",
          required: true,
          showIf: isCommercial,
          placeholder: "e.g. $1.25M",
          maxLength: 60,
        },
      ],
    },

    /* series come AFTER size and budget so the pick is informed, and
       several can be chosen. When the series documents carry size and
       price ranges this list narrows to the ones that fit; until then
       every series shows. */
    {
      id: "series",
      title: "Which series interest you?",
      description: "The ones that fit your size and budget come first. Pick any you’d like to hear more about.",
      showIf: (a) => isHome(a) && a.build_type === "predesigned",
      fields: [
        {
          name: "series",
          label: "Series",
          type: "checkbox",
          required: true,
          layout: "media",
          /* the fitting series for these answers (src/lib/forms/series.ts);
             the static list is the fallback for labels in the inbox */
          optionsFor: seriesOptions,
          options: [...SERIES.map((s) => ({ value: s.value, label: s.label })), ALL_SERIES_OPTION],
        },
      ],
    },

    /* ── shared finish ───────────────────────────── */
    {
      id: "about-you",
      title: "About you",
      fields: [
        { name: "first_name", label: "First name", type: "text", required: true, autoComplete: "given-name", maxLength: 80 },
        { name: "last_name", label: "Last name", type: "text", required: true, autoComplete: "family-name", maxLength: 80 },
        { name: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
        { name: "phone", label: "Phone", type: "tel", autoComplete: "tel", hint: "Optional" },
        {
          name: "current_location",
          label: "Where do you live now?",
          type: "text",
          placeholder: "City, state",
          autoComplete: "address-level2",
          hint: "Optional",
          maxLength: 120,
        },
        { name: "newsletter", label: "Add me to the Method Homes newsletter", type: "consent" },
      ],
    },
    {
      id: "more",
      title: "Almost done",
      fields: [
        {
          name: "heard_about",
          label: "How did you hear about Method Homes?",
          type: "checkbox",
          options: opts(
            ["web-search", "Web search"],
            ["news-article", "News article"],
            ["magazine", "Magazine ad"],
            ["referral", "Referral"],
            ["facebook", "Facebook"],
            ["youtube", "YouTube"],
            ["instagram", "Instagram"],
            ["other", "Other"],
          ),
        },
        { name: "notes", label: "Anything else you’d like us to know?", type: "textarea", maxLength: 2000 },
      ],
    },
  ],
};
