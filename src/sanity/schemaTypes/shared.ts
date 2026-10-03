import { defineArrayMember, defineField } from "sanity";

/*
  Field helpers shared by the Method content types so every document
  carries the same AEO furniture in the same shape:

  - faqItems(): question/answer pairs → the route pools them into one
    FAQPage node (same shape as sectionFaq.items).
  - sources(): dated, linked sources behind the numbers a page states
    → rendered as the footnote line under a section (the Rivian
    pattern: every claim traces to a date and a place).
  - imageWithAlt(): an image whose alt is required (gate G5).
*/

export const faqItems = (description = "4–8 real questions, phrased the way a buyer asks them. Each answer stands alone (40–120 words).") =>
  defineField({
    name: "faq",
    title: "FAQ",
    type: "array",
    description,
    of: [
      defineArrayMember({
        type: "object",
        name: "faqItem",
        fields: [
          defineField({ name: "question", type: "string", validation: (rule) => rule.required() }),
          defineField({ name: "answer", type: "text", rows: 4, validation: (rule) => rule.required() }),
        ],
        preview: { select: { title: "question", subtitle: "answer" } },
      }),
    ],
  });

export const sources = () =>
  defineField({
    name: "sources",
    title: "Sources (footnotes)",
    type: "array",
    description: "Where each number on this page comes from. Rendered as the dated sources line; every stat on the page should point at one of these.",
    of: [
      defineArrayMember({
        type: "object",
        name: "source",
        fields: [
          defineField({ name: "label", title: "Label", type: "string", validation: (rule) => rule.required() }),
          defineField({ name: "url", title: "URL", type: "url" }),
          defineField({ name: "date", title: "As of", type: "date" }),
        ],
        preview: { select: { title: "label", subtitle: "date" } },
      }),
    ],
  });

export const imageWithAlt = (name: string, title: string, description?: string) =>
  defineField({
    name,
    title,
    type: "image",
    description,
    options: { hotspot: true },
    fields: [
      defineField({
        name: "alt",
        title: "Alternative text",
        type: "string",
        description: "What is in the picture, for readers and search engines (“Elemental series home at dusk, Hood River OR”).",
        validation: (rule) => rule.required(),
      }),
    ],
  });

export const galleryWithAlt = (name = "gallery", title = "Gallery") =>
  defineField({
    name,
    title,
    type: "array",
    of: [
      defineArrayMember({
        type: "image",
        options: { hotspot: true },
        fields: [
          defineField({ name: "alt", title: "Alternative text", type: "string", validation: (rule) => rule.required() }),
          defineField({ name: "caption", title: "Caption", type: "string" }),
        ],
      }),
    ],
  });
