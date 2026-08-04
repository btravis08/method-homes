import { icons } from "@sanity/icons";
import { defineField, defineType } from "sanity";

/* Store-wide commerce settings (Shopify's Settings → Store details) */
export const storeSettings = defineType({
  name: "storeSettings",
  icon: icons["cog"],
  title: "Store settings",
  type: "document",
  fields: [
    defineField({
      name: "currency",
      title: "Store currency",
      type: "string",
      options: {
        list: ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"],
      },
      initialValue: "USD",
    }),
    defineField({
      name: "locale",
      title: "Price format locale",
      type: "string",
      description: "BCP 47 locale used to format prices, e.g. en-US.",
      initialValue: "en-US",
    }),
    defineField({
      name: "showCompareAt",
      title: "Show compare-at (sale) prices on cards",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "searchSynonyms",
      title: "Search synonyms",
      type: "array",
      description:
        'Groups of terms treated as equivalent in site search (e.g. "tee, t-shirt, tshirt"). A search for any term in a group also matches the others.',
      of: [
        {
          type: "object",
          name: "synonymGroup",
          fields: [
            defineField({
              name: "terms",
              title: "Terms",
              type: "array",
              of: [{ type: "string" }],
              options: { layout: "tags" },
              validation: (rule) => rule.min(2),
            }),
          ],
          preview: {
            select: { terms: "terms" },
            prepare: ({ terms }) => ({ title: (terms ?? []).join(" · ") }),
          },
        },
      ],
    }),
    defineField({
      name: "applyAutomaticDiscounts",
      title: "Apply active automatic discounts to displayed prices",
      type: "boolean",
      initialValue: true,
    }),
  ],
  preview: {
    prepare: () => ({ title: "Store settings" }),
  },
});
