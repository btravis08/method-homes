import { icons } from "@sanity/icons";
import { defineField, defineType } from "sanity";

/*
  Press & citations (AEO play 8): one document per clipping. Powers
  /press (Figma 37513:8922, Press list 37508:4175) and Logo rows, and
  is the record of who has already cited Method — the outreach list
  starts from what is missing here. Emits NewsArticle references in
  an ItemList; a clipping tied to a project adds `citation` to that
  project's House node.
*/
export const press = defineType({
  name: "press",
  icon: icons["bookmark"],
  title: "Press",
  type: "document",
  fields: [
    defineField({ name: "publication", title: "Publication", type: "string", validation: (rule) => rule.required(), description: "“Dwell”, “The Oregonian”." }),
    defineField({ name: "title", title: "Headline", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "url", title: "URL", type: "url", validation: (rule) => rule.required(), description: "The article as published (not a PDF scan)." }),
    defineField({ name: "date", title: "Published", type: "date", validation: (rule) => rule.required() }),
    defineField({ name: "author", title: "Journalist", type: "string" }),
    defineField({ name: "excerpt", title: "Pull quote", type: "text", rows: 3, description: "One or two sentences we are allowed to quote." }),
    defineField({ name: "logo", title: "Publication logo", type: "image", description: "Monochrome SVG/PNG for the Logo row." }),
    defineField({ name: "project", title: "About project", type: "reference", to: [{ type: "project" }] }),
    defineField({ name: "series", title: "About series", type: "reference", to: [{ type: "series" }] }),
    defineField({ name: "featured", title: "Show in Logo rows", type: "boolean", initialValue: false }),
    defineField({ name: "kind", title: "Kind", type: "string", options: { list: ["article", "award", "video", "podcast", "mention"], layout: "radio", direction: "horizontal" }, initialValue: "article" }),
  ],
  orderings: [{ title: "Newest", name: "dateDesc", by: [{ field: "date", direction: "desc" }] }],
  preview: {
    select: { title: "title", publication: "publication", date: "date", media: "logo" },
    prepare: ({ title, publication, date, media }) => ({ title, subtitle: [publication, date].filter(Boolean).join(" · "), media }),
  },
});
