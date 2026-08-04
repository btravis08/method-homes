import { icons } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

/*
  Story cards: editorial tiles interleaved in collection page grids.
  Tag them to control where they surface — "all" shows everywhere,
  "mens"/"womens" on those collections (and their subcategories),
  category tags on the matching category pages.
*/

export const STORY_TAGS = [
  { title: "All collections", value: "all" },
  { title: "Mens", value: "mens" },
  { title: "Womens", value: "womens" },
  { title: "Footwear", value: "footwear" },
  { title: "Pants", value: "pants" },
  { title: "Polos", value: "polos" },
  { title: "Headwear", value: "headwear" },
  { title: "T-Shirts", value: "tshirts" },
  { title: "Sweaters", value: "sweaters" },
  { title: "Hoodies & Pullovers", value: "hoodies" },
  { title: "Outerwear", value: "outerwear" },
  { title: "Shorts", value: "shorts" },
];

export const story = defineType({
  name: "story",
  icon: icons["book"],
  title: "Story card",
  type: "document",
  fields: [
    defineField({
      name: "title",
      type: "string",
      initialValue: "Lorem Ipsum Dolor",
      validation: (rule) => rule.required(),
    }),
    defineField({ name: "body", type: "text", rows: 4 }),
    defineField({
      name: "ctaLabel",
      title: "Button label",
      type: "string",
      initialValue: "Explore the Collection",
    }),
    defineField({ name: "url", title: "URL", type: "string", initialValue: "#" }),
    defineField({ name: "image", type: "image", options: { hotspot: true } }),
    defineField({
      name: "tags",
      title: "Show in collections",
      description:
        "Which collection pages this story appears in. A subcategory page (e.g. Mens → Pants) matches both its parts.",
      type: "array",
      of: [defineArrayMember({ type: "string" })],
      options: { list: STORY_TAGS, layout: "grid" },
      validation: (rule) => rule.min(1),
    }),
    defineField({
      name: "placement",
      title: "Desktop placement",
      type: "string",
      options: {
        list: [
          { title: "Auto — sides alternate", value: "auto" },
          { title: "Center — middle two columns", value: "center" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      initialValue: "auto",
    }),
  ],
  preview: {
    select: { title: "title", tags: "tags", media: "image" },
    prepare: ({ title, tags, media }) => ({
      title,
      subtitle: (tags ?? []).join(" · "),
      media,
    }),
  },
});
