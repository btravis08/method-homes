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
  review: true,
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
          options: opts(["residential", "A home: custom or predesigned"], ["commercial", "A commercial project"]),
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
    {
      id: "series",
      title: "Which series are you interested in?",
      showIf: (a) => isHome(a) && a.build_type === "predesigned",
      fields: [
        {
          name: "series",
          label: "Series",
          type: "radio",
          required: true,
          options: opts(
            ["method-one", "Method One"],
            ["annata", "Annata"],
            ["cabin", "Cabin"],
            ["elemental", "Elemental"],
            ["m", "M Series"],
            ["option", "Option"],
            ["paradigm", "Paradigm"],
            ["not-sure", "Not sure yet"],
          ),
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
    {
      id: "review",
      title: "Review and send",
      fields: [{ name: "newsletter", label: "Add me to the Method Homes newsletter", type: "consent" }],
    },
  ],
};
