import { icons } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

import { faqItems, galleryWithAlt, imageWithAlt, sources } from "./shared";

/*
  The predesigned catalog: a `series` (Elemental, Option, Cabin, M,
  Paradigm, Method One, Annata) and its `plan`s (each floor plan).

  Figma: Hero / Series (37525:15367), Lineup (37525:15056), Finish
  levels (37525:15191), Walk the plan (37521:15819), Size it up
  (37525:15330); page templates 37513:9343 (series) and 37509:5006
  (plan). Routes are decided in LAUNCH-PLAN §4 C4 (`/series/<slug>`
  and `/series/<slug>/<plan>` proposed).

  AEO: a series emits Product (+ Offer per finish level when a price
  is published) and an ItemList of its plans; a plan emits a Product
  variant with its PDF as a crawlable document. Every number on the
  page points at a source (footnotes).
*/

const range = (name: string, title: string, unit?: string) =>
  defineField({
    name,
    title,
    type: "object",
    options: { columns: 2 },
    fields: [
      defineField({ name: "min", title: `Min${unit ? ` (${unit})` : ""}`, type: "number" }),
      defineField({ name: "max", title: `Max${unit ? ` (${unit})` : ""}`, type: "number" }),
    ],
  });

export const series = defineType({
  name: "series",
  icon: icons["home"],
  title: "Series",
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "facts", title: "Facts & pricing" },
    { name: "finish", title: "Finish levels" },
    { name: "faq", title: "FAQ & sources" },
    { name: "meta", title: "SEO" },
  ],
  fields: [
    defineField({ name: "name", title: "Name", type: "string", group: "content", validation: (rule) => rule.required() }),
    defineField({ name: "slug", title: "Slug", type: "slug", group: "content", options: { source: "name", maxLength: 64 }, validation: (rule) => rule.required() }),
    defineField({ name: "tagline", title: "Tagline", type: "string", group: "content", description: "One sentence under the wordmark (Hero / Series)." }),
    defineField({
      name: "lede",
      title: "Lede",
      type: "text",
      rows: 4,
      group: "content",
      description: "The answer-first paragraph (≤120 words): who the series is for, what it is, what it costs and how long it takes.",
    }),
    imageWithAlt("heroImage", "Hero photograph", "One large photograph; the LCP image of the page."),
    defineField({ name: "body", title: "Story", type: "blockContent", group: "content" }),
    galleryWithAlt(),
    defineField({ name: "architect", title: "Architect / design credit", type: "string", group: "content" }),
    defineField({ name: "featured", title: "Featured in the Lineup", type: "boolean", group: "content", initialValue: true }),
    defineField({ name: "order", title: "Sort order", type: "number", group: "content", initialValue: 100 }),

    range("beds", "Bedrooms"),
    range("baths", "Bathrooms"),
    range("sqft", "Size", "sq ft"),
    range("modules", "Modules"),
    defineField({ name: "storiesMax", title: "Stories (max)", type: "number", group: "facts" }),
    range("factoryWeeks", "Weeks in the factory"),
    defineField({
      name: "bestFor",
      title: "Best for",
      type: "string",
      group: "facts",
      description: "≤8 words for the Compare table's “Best for” column (e.g. “Retreats and rural sites”). Falls back to the tagline.",
    }),
    defineField({
      name: "palette",
      title: "Exterior palette",
      type: "array",
      group: "facts",
      description: "The exterior finish colors shown as swatches on the Lineup (4–6). Name + hex.",
      validation: (rule) => rule.max(6),
      of: [
        defineArrayMember({
          type: "object",
          name: "swatch",
          options: { columns: 2 },
          fields: [
            defineField({ name: "name", title: "Name", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "color", title: "Hex", type: "string", validation: (rule) => rule.required().regex(/^#[0-9a-fA-F]{6}$/, { name: "hex color like #8a6a4b" }) }),
          ],
          preview: { select: { title: "name", subtitle: "color" } },
        }),
      ],
    }),
    defineField({
      name: "priceFrom",
      title: "Starting price (USD)",
      type: "number",
      group: "facts",
      description: "Exact “from” price for the base finish level. Leave empty if Method publishes bands only (then fill Price band).",
    }),
    defineField({ name: "priceBand", title: "Price band", type: "string", group: "facts", description: "e.g. “$550–750k modules delivered”. Used when no exact starting price is published." }),
    defineField({
      name: "priceNote",
      title: "What the price includes",
      type: "text",
      rows: 3,
      group: "facts",
      description: "One or two sentences: what is in the module price and what site work adds. Emitted next to the Offer.",
    }),
    defineField({
      name: "timelineMonths",
      title: "Typical contract to keys (months)",
      type: "object",
      group: "facts",
      options: { columns: 2 },
      fields: [
        defineField({ name: "min", title: "Min", type: "number" }),
        defineField({ name: "max", title: "Max", type: "number" }),
      ],
    }),
    defineField({
      name: "specs",
      title: "Specification rows",
      type: "array",
      group: "facts",
      description: "Label/value rows for the Spec table (structure, envelope, systems, certifications…).",
      of: [
        defineArrayMember({
          type: "object",
          name: "specRow",
          options: { columns: 2 },
          fields: [
            defineField({ name: "label", type: "string" }),
            defineField({ name: "value", type: "text", rows: 2 }),
          ],
          preview: { select: { title: "label", subtitle: "value" } },
        }),
      ],
    }),

    defineField({
      name: "finishLevels",
      title: "Finish levels",
      type: "array",
      group: "finish",
      description: "The trim-style cards (Figma Finish levels): name, tagline, From price, three numbers, what is included, what is optional. Order = ascending price.",
      of: [
        defineArrayMember({
          type: "object",
          name: "finishLevel",
          fields: [
            defineField({ name: "name", title: "Name", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "tagline", title: "Tagline", type: "string" }),
            defineField({ name: "from", title: "From (USD)", type: "number" }),
            defineField({
              name: "numbers",
              title: "Three numbers",
              type: "array",
              validation: (rule) => rule.max(3),
              of: [
                defineArrayMember({
                  type: "object",
                  name: "stat",
                  options: { columns: 2 },
                  fields: [
                    defineField({ name: "value", title: "Value", type: "string" }),
                    defineField({ name: "label", title: "Label", type: "string" }),
                  ],
                  preview: { select: { title: "value", subtitle: "label" } },
                }),
              ],
            }),
            defineField({ name: "includes", title: "Includes", type: "array", of: [{ type: "string" }] }),
            defineField({ name: "optional", title: "Optional", type: "array", of: [{ type: "string" }] }),
          ],
          preview: { select: { title: "name", subtitle: "tagline" } },
        }),
      ],
    }),

    faqItems(),
    sources(),
    defineField({ name: "seo", title: "Search engine listing", type: "seo", group: "meta" }),
  ],
  orderings: [{ title: "Sort order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] }],
  preview: {
    select: { title: "name", subtitle: "tagline", media: "heroImage" },
  },
});

export const plan = defineType({
  name: "plan",
  icon: icons["block-element"],
  title: "Floor plan",
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "facts", title: "Facts & dimensions" },
    { name: "files", title: "Drawings & files" },
    { name: "meta", title: "SEO" },
  ],
  fields: [
    defineField({ name: "name", title: "Name", type: "string", group: "content", validation: (rule) => rule.required(), description: "e.g. “Elemental 2+”, “Cabin 1 Bed Loft”." }),
    defineField({ name: "slug", title: "Slug", type: "slug", group: "content", options: { source: "name", maxLength: 64 }, validation: (rule) => rule.required() }),
    defineField({ name: "series", title: "Series", type: "reference", to: [{ type: "series" }], group: "content", validation: (rule) => rule.required() }),
    defineField({ name: "lede", title: "Lede", type: "text", rows: 3, group: "content", description: "Two sentences: who this plan suits and what makes it different from its siblings." }),
    defineField({ name: "body", title: "Description", type: "blockContent", group: "content" }),
    imageWithAlt("heroImage", "Photograph"),
    galleryWithAlt("photos", "Photos"),

    defineField({ name: "beds", title: "Bedrooms", type: "number", group: "facts" }),
    defineField({ name: "baths", title: "Bathrooms", type: "number", group: "facts" }),
    defineField({ name: "sqft", title: "Square feet", type: "number", group: "facts" }),
    defineField({ name: "modules", title: "Modules", type: "number", group: "facts" }),
    defineField({ name: "stories", title: "Stories", type: "number", group: "facts" }),
    defineField({ name: "priceFrom", title: "Starting price (USD)", type: "number", group: "facts", description: "Overrides the series starting price when this plan has its own." }),
    defineField({
      name: "dimensions",
      title: "Dimensions (Size it up)",
      type: "array",
      group: "facts",
      description: "Lettered A–H to match the line diagram: label + value (“Overall length”, “64 ft 2 in”).",
      validation: (rule) => rule.max(8),
      of: [
        defineArrayMember({
          type: "object",
          name: "dimension",
          options: { columns: 2 },
          fields: [
            defineField({ name: "label", title: "Label", type: "string" }),
            defineField({ name: "value", title: "Value", type: "string" }),
          ],
          preview: { select: { title: "label", subtitle: "value" } },
        }),
      ],
    }),

    imageWithAlt("planImage", "Plan drawing (image)", "The floor plan as an image for Walk the plan / Size it up."),
    defineField({
      name: "moduleImage",
      title: "Module diagram (image)",
      type: "image",
      group: "files",
      description: "Optional: the plan with module seams marked (Walk the plan → Modules).",
    }),
    defineField({
      name: "model",
      title: "3D model (GLB)",
      type: "file",
      group: "files",
      options: { accept: ".glb,model/gltf-binary" },
      description: "The web model from the IFC pipeline (scripts/model/ifc-to-glb.py → gltf-transform). Under 2 MB. Powers the 3D / Floor plan viewer; the drawing and photo stay the fallback.",
    }),
    defineField({ name: "northDeg", title: "North rotation (°)", type: "number", group: "files", description: "Override for the model's stored TrueNorth: degrees to turn the model so plan view is north-up." }),
    defineField({
      name: "pdf",
      title: "Plan PDF",
      type: "file",
      group: "files",
      options: { accept: "application/pdf" },
      description: "Public, crawlable. Name the file as it should be found: “method-homes-elemental-2-plus-floor-plan.pdf”.",
    }),
    defineField({ name: "seo", title: "Search engine listing", type: "seo", group: "meta" }),
  ],
  preview: {
    select: { title: "name", series: "series.name", beds: "beds", sqft: "sqft", media: "planImage" },
    prepare: ({ title, series, beds, sqft, media }) => ({
      title,
      subtitle: [series, beds != null ? `${beds} bd` : null, sqft ? `${sqft.toLocaleString()} sf` : null].filter(Boolean).join(" · "),
      media,
    }),
  },
});
