import { defineField, defineType } from "sanity";

import { SeoInput } from "../components/SeoInput";

/*
  Shared SEO object (the Yoast panel): title/description overrides
  with a live Google-result preview (SeoInput), a social share image
  override, and the noindex/canonical controls. Field names `title` /
  `description` deliberately match the product schema's original
  inline seo object, so existing documents carry over untouched.
*/
export const seo = defineType({
  name: "seo",
  title: "Search engine listing",
  type: "object",
  components: { input: SeoInput },
  fields: [
    defineField({
      name: "title",
      title: "Page title",
      type: "string",
      description: "Defaults to the document title. Aim for ≤ 60 characters.",
    }),
    defineField({
      name: "description",
      title: "Meta description",
      type: "text",
      rows: 3,
      description: "The search-result snippet and share text. Aim for ≤ 160 characters.",
      validation: (rule) => rule.max(320),
    }),
    defineField({
      name: "ogImage",
      title: "Social share image",
      type: "image",
      description:
        "Override for link previews (1200×630 works everywhere). Falls back to the page's own imagery.",
    }),
    defineField({
      name: "noindex",
      title: "Hide from search engines",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "canonical",
      title: "Canonical URL",
      type: "url",
      description: "Only when this page is a copy of content that lives at another URL.",
    }),
  ],
});
