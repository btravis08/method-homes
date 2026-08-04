import { icons } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

import designops from "../../../designops.config.json";

/* commerce off = no collection/product types; those references must
   vanish with the flag or schema validation fails */
const COMMERCE = designops.features.commerce;

/*
  Navigation singleton, modeled on Shopify's menu methodology: a menu
  of items, each item optionally opening a dropdown. Links can carry a
  plain URL or point at a collection (the collection also supplies
  titles/images where used).

  Dropdown layouts (from the Figma library):
  - columns:  link columns + an image card (fed by a collection, with
              optional overrides) — Men / Women / Gear
  - products: one link column + a grid of product tiles with
              MEN'S / WOMEN'S links — Footwear
  - cards:    large image cards with serif titles — Explore
*/

const link = defineArrayMember({
  type: "object",
  name: "navLink",
  fields: [
    defineField({ name: "label", type: "string" }),
    defineField({
      name: "url",
      title: "URL",
      type: "string",
      initialValue: "#",
    }),
    ...(COMMERCE
      ? [
          defineField({
            name: "collection",
            title: "Or link a collection",
            description: "Takes over the label (if empty) and destination.",
            type: "reference",
            to: [{ type: "collection" }],
          }),
        ]
      : []),
  ],
  preview: {
    select: { title: "label", subtitle: "url", collection: "collection.title" },
    prepare: ({ title, subtitle, collection }) => ({
      title: title || collection || "Link",
      subtitle: collection ? `→ ${collection}` : subtitle,
    }),
  },
});

export const navigation = defineType({
  name: "navigation",
  icon: icons["menu"],
  title: "Navigation",
  type: "document",
  fields: [
    defineField({
      name: "items",
      title: "Menu items",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "navItem",
          fields: [
            defineField({
              name: "title",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "layout",
              title: "Dropdown layout",
              type: "string",
              options: {
                list: [
                  { title: "Link columns + image card", value: "columns" },
                  { title: "Link column + product grid", value: "products" },
                  { title: "Image cards", value: "cards" },
                  { title: "No dropdown (plain link)", value: "none" },
                ],
                layout: "radio",
              },
              initialValue: "columns",
            }),
            defineField({
              name: "columns",
              title: "Link columns",
              description:
                "The first column becomes the expandable group on mobile.",
              type: "array",
              hidden: ({ parent }) =>
                parent?.layout === "cards" || parent?.layout === "none",
              of: [
                defineArrayMember({
                  type: "object",
                  name: "navColumn",
                  fields: [
                    defineField({ name: "title", type: "string" }),
                    defineField({ name: "links", type: "array", of: [link] }),
                  ],
                  preview: {
                    select: { title: "title", links: "links" },
                    prepare: ({ title, links }) => ({
                      title: title || "Column",
                      subtitle: `${links?.length ?? 0} links`,
                    }),
                  },
                }),
              ],
            }),
            ...(COMMERCE
              ? [
                  defineField({
                    name: "products",
                    title: "Product grid",
                    description: "Products shown as tiles with MEN'S / WOMEN'S links.",
                    type: "array",
                    of: [defineArrayMember({ type: "reference", to: [{ type: "product" }] })],
                    hidden: ({ parent }) => parent?.layout !== "products",
                  }),
                ]
              : []),
            defineField({
              name: "cards",
              title: "Image cards",
              type: "array",
              hidden: ({ parent }) => parent?.layout !== "cards",
              of: [
                defineArrayMember({
                  type: "object",
                  name: "navCard",
                  fields: [
                    defineField({ name: "title", type: "string" }),
                    defineField({
                      name: "image",
                      type: "image",
                      options: { hotspot: true },
                    }),
                    defineField({ name: "url", title: "URL", type: "string", initialValue: "#" }),
                  ],
                  preview: { select: { title: "title", media: "image" } },
                }),
              ],
            }),
            ...(COMMERCE
              ? [
                  defineField({
                    name: "imageCollection",
                    title: "Image card — collection",
                    description:
                      "The dropdown's image card takes this collection's title and image.",
                    type: "reference",
                    to: [{ type: "collection" }],
                    hidden: ({ parent }) => parent?.layout !== "columns",
                  }),
                ]
              : []),
            defineField({
              name: "imageTitle",
              title: "Image card — title override",
              type: "string",
              hidden: ({ parent }) => parent?.layout !== "columns",
            }),
            defineField({
              name: "image",
              title: "Image card — image override",
              type: "image",
              options: { hotspot: true },
              hidden: ({ parent }) => parent?.layout !== "columns",
            }),
          ],
          preview: {
            select: { title: "title", layout: "layout" },
            prepare: ({ title, layout }) => ({
              title,
              subtitle:
                layout === "none"
                  ? "Plain link"
                  : `Dropdown — ${layout ?? "columns"}`,
            }),
          },
        }),
      ],
    }),
    defineField({
      name: "companyLinks",
      title: "Company links (mobile menu)",
      type: "array",
      of: [link],
    }),
  ],
  preview: { prepare: () => ({ title: "Navigation" }) },
});
