import { icons } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

/*
  Shopify-modeled product document.

  Parity map:
  - status (Active / Draft / Archived) — only Active products render on
    the site
  - organization: vendor, product type, tags, gender (SDR-specific)
  - pricing: price, compare-at price (sale strikethrough), cost per
    item, charge-tax toggle — product-level defaults that variants can
    override
  - options (up to 3, e.g. Color / Size) whose values describe the
    variant matrix; variants pick their combination via selectedOptions
  - variants: per-variant price override, SKU, barcode, tracked
    inventory with quantity + oversell toggle, and the SDR colorway
    fields (swatch, product shot, hover image) that drive the cards
  - shipping: physical toggle + weight
  - SEO: title/description overrides
*/

const money = (name: string, title: string, description?: string, group?: string) =>
  defineField({
    name,
    title,
    type: "number",
    description,
    ...(group ? { group } : {}),
    validation: (rule) => rule.min(0),
  });

export const product = defineType({
  name: "product",
  icon: icons["package"],
  title: "Product",
  type: "document",
  groups: [
    { name: "content", title: "Product", default: true },
    { name: "pricing", title: "Pricing" },
    { name: "variants", title: "Variants" },
    { name: "page", title: "Product page" },
    { name: "shipping", title: "Shipping" },
    { name: "seo", title: "SEO" },
  ],
  fields: [
    /* ---------- content ---------- */
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      group: "content",
      options: {
        list: [
          { title: "Active", value: "active" },
          { title: "Draft", value: "draft" },
          { title: "Archived", value: "archived" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      initialValue: "active",
      description: "Only Active products appear on the site.",
    }),
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      group: "content",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Handle",
      type: "slug",
      group: "content",
      options: { source: "title", maxLength: 96 },
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "blockContent",
      group: "content",
    }),
    defineField({
      name: "detailLinks",
      title: "Detail links",
      description:
        "Links under the product description (e.g. The Details, Fabric & Tech, Product Care); each opens a drawer with its content.",
      type: "array",
      group: "content",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({ name: "label", title: "Label", type: "string" }),
            defineField({ name: "body", title: "Drawer content", type: "blockContent" }),
          ],
          preview: { select: { title: "label" } },
        }),
      ],
    }),
    defineField({
      name: "images",
      title: "Media",
      description: "Up to 6. The first image is the card thumbnail.",
      type: "array",
      group: "content",
      of: [defineArrayMember({ type: "image", options: { hotspot: true } })],
      validation: (rule) => rule.max(6),
    }),
    defineField({
      name: "vendor",
      title: "Vendor",
      type: "string",
      group: "content",
      initialValue: "Sun Day Red",
    }),
    defineField({
      name: "productType",
      title: "Product type",
      type: "string",
      group: "content",
      description: "Freeform category, e.g. Footwear.",
    }),
    defineField({
      name: "gender",
      title: "Gender",
      type: "string",
      group: "content",
      options: {
        list: [
          { title: "Mens", value: "mens" },
          { title: "Womens", value: "womens" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "tags",
      title: "Tags",
      description:
        "Categories this product belongs to — sliders and smart collections pull products by these.",
      type: "array",
      group: "content",
      of: [defineArrayMember({ type: "string" })],
      options: {
        list: [
          { title: "Footwear", value: "footwear" },
          { title: "Pants", value: "pants" },
          { title: "Polos", value: "polos" },
          { title: "Headwear", value: "headwear" },
          { title: "T-Shirts", value: "tshirts" },
          { title: "Sweaters", value: "sweaters" },
          { title: "Hoodies & Pullovers", value: "hoodies" },
          { title: "Outerwear", value: "outerwear" },
          { title: "Shorts", value: "shorts" },
          { title: "Accessories", value: "accessories" },
        ],
        layout: "grid",
      },
    }),
    defineField({
      name: "postedAt",
      title: "Post date",
      description: "Used to sort sliders newest-first (new arrivals).",
      type: "datetime",
      group: "content",
      initialValue: () => new Date().toISOString(),
    }),

    /* ---------- product page (PDP) ---------- */
    defineField({
      name: "pairsWellWith",
      title: "Pairs well with",
      description:
        "Products shown in the carousel beside the description on the product page. Topped up to at least four with products sharing this product's first tag.",
      type: "array",
      group: "page",
      of: [defineArrayMember({ type: "reference", to: [{ type: "product" }] })],
      validation: (rule) => rule.max(6),
    }),
    defineField({
      name: "sections",
      title: "Page sections",
      description:
        "The adjustable middle of the product page. The hero carousel, description + pairs-well-with, and the bottom shopping module are always rendered around these.",
      type: "array",
      group: "page",
      of: [
        defineArrayMember({ type: "sectionFullWidth" }),
        defineArrayMember({ type: "sectionInfoSlider" }),
        defineArrayMember({ type: "sectionCarousel" }),
        defineArrayMember({ type: "sectionFiftyFifty" }),
        defineArrayMember({ type: "sectionProductSlider" }),
        defineArrayMember({ type: "sectionRichText" }),
        defineArrayMember({ type: "sectionTechSpecs" }),
        defineArrayMember({ type: "sectionGallery" }),
        defineArrayMember({ type: "sectionReviews" }),
        defineArrayMember({ type: "sectionThreeD" }),
      ],
    }),
    defineField({
      name: "showFooterTagline",
      title: "Show footer tagline",
      description:
        "Shows the “Earned Never Given” art above the footer links on this product's page. Off by default.",
      type: "boolean",
      group: "page",
      initialValue: false,
    }),

    /* ---------- pricing ---------- */
    defineField({
      name: "pricing",
      title: "Pricing",
      type: "object",
      group: "pricing",
      options: { columns: 2 },
      fields: [
        money("price", "Price"),
        money(
          "compareAtPrice",
          "Compare-at price",
          "Set higher than the price to show a sale strikethrough.",
        ),
        money(
          "costPerItem",
          "Cost per item",
          "Internal — used for margin, never shown to customers.",
        ),
        defineField({
          name: "chargeTax",
          title: "Charge tax on this product",
          type: "boolean",
          initialValue: true,
        }),
      ],
    }),

    /* ---------- variants ---------- */
    defineField({
      name: "options",
      title: "Options",
      description:
        "Up to 3 options (like Color or Size). Variants pick a value per option.",
      type: "array",
      group: "variants",
      validation: (rule) => rule.max(3),
      of: [
        defineArrayMember({
          type: "object",
          name: "productOption",
          fields: [
            defineField({ name: "name", type: "string", initialValue: "Color" }),
            defineField({
              name: "values",
              type: "array",
              of: [defineArrayMember({ type: "string" })],
              options: { layout: "tags" },
            }),
          ],
          preview: {
            select: { title: "name", values: "values" },
            prepare: ({ title, values }) => ({
              title: title || "Option",
              subtitle: (values ?? []).join(" · "),
            }),
          },
        }),
      ],
    }),
    defineField({
      name: "variants",
      title: "Variants",
      description:
        "First variant is the card default; the rest show as swatches on hover. Pricing and inventory here override the product-level defaults.",
      type: "array",
      group: "variants",
      of: [
        defineArrayMember({
          type: "object",
          name: "productVariant",
          groups: [
            { name: "look", title: "Appearance", default: true },
            { name: "commerce", title: "Pricing & inventory" },
          ],
          fields: [
            defineField({
              name: "name",
              type: "string",
              group: "look",
              initialValue: "Lorem / Ipsum",
            }),
            defineField({
              name: "color",
              title: "Swatch color",
              type: "string",
              group: "look",
              description: "Hex value, e.g. #232c3b",
              initialValue: "#9d9e9b",
            }),
            defineField({
              name: "image",
              type: "image",
              group: "look",
              options: { hotspot: true },
            }),
            defineField({
              name: "hoverImage",
              title: "Hover image",
              description:
                "Full-bleed image shown while the card is hovered, for this colorway. Falls back to the product's second image.",
              type: "image",
              group: "look",
              options: { hotspot: true },
            }),
            defineField({
              name: "selectedOptions",
              title: "Option values",
              description: "Which value of each product option this variant is.",
              type: "array",
              group: "look",
              of: [
                defineArrayMember({
                  type: "object",
                  name: "selectedOption",
                  fields: [
                    defineField({ name: "option", type: "string" }),
                    defineField({ name: "value", type: "string" }),
                  ],
                  preview: {
                    select: { title: "option", subtitle: "value" },
                  },
                }),
              ],
            }),
            money("price", "Price (override)", undefined, "commerce"),
            money("compareAtPrice", "Compare-at price (override)", undefined, "commerce"),
            defineField({ name: "sku", title: "SKU", type: "string", group: "commerce" }),
            defineField({
              name: "barcode",
              title: "Barcode (ISBN, UPC, GTIN)",
              type: "string",
              group: "commerce",
            }),
            defineField({
              name: "inventory",
              title: "Inventory",
              type: "object",
              group: "commerce",
              options: { columns: 2 },
              fields: [
                defineField({
                  name: "track",
                  title: "Track quantity",
                  type: "boolean",
                  initialValue: true,
                }),
                defineField({
                  name: "quantity",
                  title: "Quantity",
                  type: "number",
                  initialValue: 0,
                  validation: (rule) => rule.min(0),
                }),
                defineField({
                  name: "continueSelling",
                  title: "Continue selling when out of stock",
                  type: "boolean",
                  initialValue: false,
                }),
              ],
            }),
          ],
          preview: {
            select: {
              title: "name",
              sku: "sku",
              quantity: "inventory.quantity",
              media: "image",
            },
            prepare: ({ title, sku, quantity, media }) => ({
              title: title || "Variant",
              subtitle: [sku, quantity != null ? `${quantity} in stock` : null]
                .filter(Boolean)
                .join(" · "),
              media,
            }),
          },
        }),
      ],
    }),

    /* ---------- shipping ---------- */
    defineField({
      name: "shipping",
      title: "Shipping",
      type: "object",
      group: "shipping",
      fields: [
        defineField({
          name: "physical",
          title: "This is a physical product",
          type: "boolean",
          initialValue: true,
        }),
        defineField({
          name: "weight",
          title: "Weight",
          type: "number",
          validation: (rule) => rule.min(0),
          hidden: ({ parent }) => parent?.physical === false,
        }),
        defineField({
          name: "weightUnit",
          title: "Unit",
          type: "string",
          options: { list: ["g", "kg", "oz", "lb"] },
          initialValue: "g",
          hidden: ({ parent }) => parent?.physical === false,
        }),
      ],
    }),

    /* ---------- seo (shared object w/ live Google preview) ---------- */
    defineField({
      name: "seo",
      title: "Search engine listing",
      type: "seo",
      group: "seo",
    }),

    /* legacy display price from the first content model; superseded by
       Pricing → price. Kept so old documents keep rendering. */
    defineField({
      name: "price",
      title: "Legacy price label",
      type: "string",
      hidden: true,
    }),
  ],
  preview: {
    select: {
      title: "title",
      status: "status",
      gender: "gender",
      price: "pricing.price",
      legacy: "price",
      media: "images.0",
    },
    prepare: ({ title, status, gender, price, legacy, media }) => ({
      title,
      subtitle: [
        status && status !== "active" ? status.toUpperCase() : null,
        gender,
        price != null ? `$${price.toFixed(2)}` : legacy,
      ]
        .filter(Boolean)
        .join(" · "),
      media,
    }),
  },
});
