import { icons } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const project = defineType({
  name: "project",
  icon: icons["case"],
  title: "Project",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "category",
      title: "Category",
      type: "string",
      options: {
        list: [
          { title: "Custom residential", value: "residential" },
          { title: "Predesigned", value: "predesigned" },
          { title: "Commercial", value: "commercial" },
        ],
        layout: "radio",
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "featured",
      title: "Featured on home page",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "summary",
      title: "Summary",
      description: "Short description shown on project cards.",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "mainImage",
      title: "Main image",
      type: "image",
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          title: "Alternative text",
          type: "string",
        }),
      ],
    }),
    defineField({
      name: "gallery",
      title: "Photo gallery",
      type: "array",
      of: [
        {
          type: "image",
          options: { hotspot: true },
          fields: [
            defineField({
              name: "alt",
              title: "Alternative text",
              type: "string",
            }),
          ],
        },
      ],
    }),
    defineField({
      name: "location",
      title: "Location",
      description: "City / region, e.g. “Bend, OR”.",
      type: "string",
    }),
    defineField({
      name: "squareFeet",
      title: "Square feet",
      type: "number",
    }),
    defineField({
      name: "bedrooms",
      title: "Bedrooms",
      description: "Residential projects only.",
      type: "number",
      hidden: ({ document }) => document?.category !== "residential",
    }),
    defineField({
      name: "bathrooms",
      title: "Bathrooms",
      description: "Residential projects only.",
      type: "number",
      hidden: ({ document }) => document?.category !== "residential",
    }),
    defineField({
      name: "plans",
      title: "Floor plans & documents",
      description: "PDFs: floor plans, spec sheets.",
      type: "array",
      of: [
        {
          type: "file",
          options: { accept: "application/pdf" },
          fields: [defineField({ name: "label", title: "Label", type: "string" })],
        },
      ],
    }),
    defineField({
      name: "completedYear",
      title: "Year completed",
      type: "number",
    }),
    /* ── case-study facts (AEO play 7) ─────────────────────────────
       A project page that states series, modules, timeline, cost band
       and location is a citable case study; one with a photo and a
       paragraph is a gallery item. The facts render as the stats
       strip and feed House JSON-LD (geo, additionalProperty). */
    defineField({
      name: "series",
      title: "Series / design",
      description: "The predesigned series it was built from (e.g. Elemental, Cabin) or “Custom”.",
      type: "string",
    }),
    defineField({
      name: "modules",
      title: "Modules",
      description: "Number of factory modules set on site.",
      type: "number",
      validation: (rule) => rule.min(1).integer(),
    }),
    defineField({
      name: "timelineMonths",
      title: "Contract to keys (months)",
      description: "Whole months from signed contract to move-in.",
      type: "number",
      validation: (rule) => rule.min(1).max(60),
    }),
    defineField({
      name: "costBand",
      title: "Cost band",
      description: "Optional, with the client's consent: a range like “$650–750k all-in” or “$410/sq ft modules”. Shown as published; never a precise figure.",
      type: "string",
    }),
    defineField({
      name: "geo",
      title: "Site coordinates",
      description: "Drop the pin on the town, not the house — emitted as House.geo so engines place the project on a map.",
      type: "geopoint",
    }),
    defineField({
      name: "challenge",
      title: "The brief / challenge",
      description: "Two or three sentences: what the site, budget or schedule demanded.",
      type: "text",
      rows: 4,
    }),
    defineField({
      name: "approach",
      title: "What we did",
      description: "Two or three sentences: the design and construction decisions that answered it.",
      type: "text",
      rows: 4,
    }),
    defineField({
      name: "testimonial",
      title: "Client testimonial",
      description: "A named review (AEO play 4): quoted on the page and emitted as a Review on the House; ratings roll up into the site's AggregateRating.",
      type: "object",
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({ name: "quote", title: "Quote", type: "text", rows: 4 }),
        defineField({ name: "clientName", title: "Client name", description: "First name + last initial is fine (“Dana R.”).", type: "string" }),
        defineField({ name: "clientDetail", title: "Detail", description: "e.g. “Owner, Hood River OR” or “Set March 2025”.", type: "string" }),
        defineField({ name: "date", title: "Date", type: "date" }),
        defineField({ name: "rating", title: "Rating (1–5)", type: "number", validation: (rule) => rule.min(1).max(5) }),
      ],
    }),
    defineField({
      name: "body",
      title: "Full description",
      type: "blockContent",
    }),
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "category",
      media: "mainImage",
    },
  },
});
