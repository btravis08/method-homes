import { icons } from "@sanity/icons";
import { defineField, defineType } from "sanity";

/*
  Inbound form submissions (newsletter signups, contact messages).
  Created by POST /api/forms — never authored in the Studio, so every
  field except `read` is readOnly. The desk's Inbox view filters on
  `read` for an unread queue.
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
      description: "Which form sent this (newsletter, contact, …).",
    }),
    defineField({ name: "name", title: "Name", type: "string", readOnly: true }),
    defineField({ name: "email", title: "Email", type: "string", readOnly: true }),
    defineField({ name: "message", title: "Message", type: "text", rows: 6, readOnly: true }),
    defineField({
      name: "fields",
      title: "Extra fields",
      type: "array",
      readOnly: true,
      of: [
        {
          type: "object",
          name: "submissionField",
          fields: [
            defineField({ name: "key", type: "string" }),
            defineField({ name: "value", type: "string" }),
          ],
          preview: {
            select: { title: "key", subtitle: "value" },
          },
        },
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
    select: { email: "email", name: "name", form: "form", submittedAt: "submittedAt", read: "read" },
    prepare: ({ email, name, form, submittedAt, read }) => ({
      title: `${read ? "" : "● "}${email || name || "Submission"}`,
      subtitle: `${form ?? "form"} — ${submittedAt ? new Date(submittedAt).toLocaleString() : ""}`,
    }),
  },
});
