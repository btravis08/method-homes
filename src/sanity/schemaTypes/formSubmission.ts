import { icons } from "@sanity/icons";
import { defineField, defineType } from "sanity";

/*
  Inbound form submissions (newsletter signups, contact messages, the
  multi-step Get Started intake). Created by POST /api/forms — never
  authored in the Studio, so every field except `read` and `status` is
  readOnly. The desk's Inbox filters on `read` for an unread queue and
  on `status` to keep flagged spam out of it (a false positive can be
  moved back by setting status to New).
*/
export const formSubmission = defineType({
  name: "formSubmission",
  title: "Form submission",
  icon: icons["envelope"],
  type: "document",
  readOnly: ({ currentUser }) => !currentUser,
  fields: [
    defineField({
      name: "form",
      title: "Form",
      type: "string",
      readOnly: true,
      description: "Which form sent this (newsletter, intake, …).",
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      initialValue: "new",
      options: {
        list: [
          { title: "New", value: "new" },
          { title: "Spam", value: "spam" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      description: "Spam is flagged automatically; set back to New if it was a real lead.",
    }),
    defineField({
      name: "spamReasons",
      title: "Why it was flagged",
      type: "array",
      of: [{ type: "string" }],
      readOnly: true,
      hidden: ({ document }) => !(document?.spamReasons as unknown[] | undefined)?.length,
    }),
    defineField({
      name: "summary",
      title: "Summary",
      type: "string",
      readOnly: true,
      description: "One-line read of the key answers.",
    }),
    defineField({
      name: "tier",
      title: "Lead tier",
      type: "string",
      readOnly: true,
      options: {
        list: [
          { title: "Hot", value: "hot" },
          { title: "Warm", value: "warm" },
          { title: "Cool", value: "cool" },
        ],
      },
      description: "Scored on submit from budget, timeline, land and location (src/lib/forms/score.ts).",
    }),
    defineField({
      name: "score",
      title: "Lead score",
      type: "number",
      readOnly: true,
      description: "0–100. Hot ≥ 65, warm ≥ 40.",
    }),
    defineField({
      name: "scoreReasons",
      title: "What earned the score",
      type: "array",
      of: [{ type: "string" }],
      readOnly: true,
      hidden: ({ document }) => !(document?.scoreReasons as unknown[] | undefined)?.length,
    }),
    defineField({
      name: "outcome",
      title: "Outcome",
      type: "string",
      readOnly: true,
      description: "Set when the form ended early, e.g. out-of-area (an email capture, not a project lead).",
      hidden: ({ document }) => !document?.outcome,
    }),
    defineField({ name: "name", title: "Name", type: "string", readOnly: true }),
    defineField({ name: "email", title: "Email", type: "string", readOnly: true }),
    defineField({ name: "message", title: "Message", type: "text", rows: 6, readOnly: true }),
    defineField({
      name: "fields",
      title: "Answers",
      type: "array",
      readOnly: true,
      of: [
        {
          type: "object",
          name: "submissionField",
          fields: [
            defineField({ name: "key", type: "string" }),
            defineField({ name: "label", type: "string" }),
            defineField({ name: "value", type: "string" }),
          ],
          preview: {
            select: { key: "key", label: "label", value: "value" },
            prepare: ({ key, label, value }) => ({ title: value, subtitle: label || key }),
          },
        },
      ],
    }),
    defineField({
      name: "attribution",
      title: "Source",
      type: "object",
      readOnly: true,
      description: "First-touch campaign tags and referrer for the visit.",
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({ name: "utmSource", title: "UTM source", type: "string" }),
        defineField({ name: "utmMedium", title: "UTM medium", type: "string" }),
        defineField({ name: "utmCampaign", title: "UTM campaign", type: "string" }),
        defineField({ name: "utmTerm", title: "UTM term", type: "string" }),
        defineField({ name: "utmContent", title: "UTM content", type: "string" }),
        defineField({ name: "referrer", title: "Referrer", type: "string" }),
        defineField({ name: "landingPage", title: "Landing page", type: "string" }),
      ],
    }),
    defineField({
      name: "page",
      title: "Submitted from",
      type: "string",
      readOnly: true,
      description: "Path of the page the form was on.",
    }),
    defineField({
      name: "submittedAt",
      title: "Submitted at",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "read",
      title: "Read",
      type: "boolean",
      initialValue: false,
      description: "Mark handled submissions read to clear the Unread view.",
    }),
  ],
  orderings: [
    {
      title: "Newest",
      name: "submittedAtDesc",
      by: [{ field: "submittedAt", direction: "desc" }],
    },
  ],
  preview: {
    select: {
      email: "email",
      name: "name",
      form: "form",
      summary: "summary",
      submittedAt: "submittedAt",
      read: "read",
      status: "status",
      tier: "tier",
      score: "score",
      outcome: "outcome",
    },
    prepare: ({ email, name, form, summary, submittedAt, read, status, tier, score, outcome }) => ({
      title: `${status === "spam" ? "⚠ " : read ? "" : "● "}${tier === "hot" ? "🔥 " : ""}${name || email || "Submission"}`,
      subtitle: [
        form ?? "form",
        outcome ? outcome.replace(/-/g, " ") : tier ? `${tier} ${score ?? ""}`.trim() : "",
        summary,
        submittedAt ? new Date(submittedAt).toLocaleString() : "",
      ]
        .filter(Boolean)
        .join(" — "),
    }),
  },
});
