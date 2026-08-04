import { icons } from "@sanity/icons";
import { defineField, defineType } from "sanity";

/* The people page roster: name, role, portrait, short bio. Ordered
   by the orderRank field so the Studio list drag-order carries to
   the site. */
export const teamMember = defineType({
  name: "teamMember",
  icon: icons["users"],
  title: "Team member",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({ name: "role", title: "Role / title", type: "string" }),
    defineField({
      name: "photo",
      title: "Photo",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({ name: "bio", title: "Bio", type: "text", rows: 4 }),
    defineField({
      name: "order",
      title: "Sort order",
      description: "Lower numbers list first.",
      type: "number",
      initialValue: 100,
    }),
  ],
  orderings: [
    {
      title: "Sort order",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
  preview: { select: { title: "name", subtitle: "role", media: "photo" } },
});
