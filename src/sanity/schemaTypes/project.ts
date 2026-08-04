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
          { title: "Residential", value: "residential" },
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
      name: "completedYear",
      title: "Year completed",
      type: "number",
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
