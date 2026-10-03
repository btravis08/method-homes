import { icons } from "@sanity/icons";
import { defineField, defineType } from "sanity";

/*
  Prefab vocabulary (Figma Glossary 37508:4131) for /prefab-101: a
  term, a one-paragraph definition that can be quoted whole, and the
  page that goes deeper. Emitted as a DefinedTermSet; each term's
  definition is written to be the answer to "what is <term>?".
*/
export const glossary = defineType({
  name: "glossary",
  icon: icons["bookmark-filled"],
  title: "Glossary term",
  type: "document",
  fields: [
    defineField({ name: "term", title: "Term", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "slug", title: "Slug", type: "slug", options: { source: "term", maxLength: 64 }, validation: (rule) => rule.required(), description: "Anchor on /prefab-101 (#<slug>)." }),
    defineField({
      name: "definition",
      title: "Definition",
      type: "text",
      rows: 4,
      validation: (rule) => rule.required().max(600),
      description: "One paragraph, 40–90 words, that answers “what is <term>?” on its own. No marketing.",
    }),
    defineField({ name: "aliases", title: "Also called", type: "array", of: [{ type: "string" }], options: { layout: "tags" } }),
    defineField({ name: "related", title: "Read more", type: "reference", to: [{ type: "page" }, { type: "post" }], description: "The page or post that goes deeper." }),
    defineField({ name: "order", title: "Sort order", type: "number", initialValue: 100 }),
  ],
  orderings: [
    { title: "A–Z", name: "termAsc", by: [{ field: "term", direction: "asc" }] },
    { title: "Sort order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] },
  ],
  preview: { select: { title: "term", subtitle: "definition" } },
});
