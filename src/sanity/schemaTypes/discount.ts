import { icons } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

/*
  Shopify-modeled discount. Method mirrors Shopify's two entry points
  (discount code vs automatic); type mirrors the four discount types.
  Automatic percentage / fixed-amount discounts are applied to product
  prices on the site (best discount wins); the rest are stored for the
  future cart/checkout to enforce.
*/

export const discount = defineType({
  name: "discount",
  icon: icons["tag"],
  title: "Discount",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      description: "Internal name, e.g. Summer Sale.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: {
        list: [
          { title: "Active", value: "active" },
          { title: "Draft", value: "draft" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      initialValue: "draft",
    }),
    defineField({
      name: "method",
      title: "Method",
      type: "string",
      options: {
        list: [
          { title: "Discount code — customers enter it at checkout", value: "code" },
          { title: "Automatic — applies without a code", value: "automatic" },
        ],
        layout: "radio",
      },
      initialValue: "code",
    }),
    defineField({
      name: "code",
      title: "Discount code",
      type: "string",
      description: "What customers type, e.g. WELCOME10.",
      hidden: ({ parent }) => parent?.method !== "code",
      validation: (rule) =>
        rule.custom((value, context) => {
          const parent = context.parent as { method?: string } | undefined;
          if (parent?.method === "code" && !value) return "A code is required";
          if (value && value !== value.toUpperCase().replace(/\s/g, ""))
            return "Use uppercase with no spaces";
          return true;
        }),
    }),
    defineField({
      name: "type",
      title: "Type",
      type: "string",
      options: {
        list: [
          { title: "Percentage off", value: "percentage" },
          { title: "Fixed amount off", value: "fixedAmount" },
          { title: "Buy X get Y", value: "buyXGetY" },
          { title: "Free shipping", value: "freeShipping" },
        ],
        layout: "radio",
      },
      initialValue: "percentage",
    }),
    defineField({
      name: "value",
      title: "Value",
      type: "number",
      description: "Percentage (e.g. 20 for 20%) or fixed amount off.",
      hidden: ({ parent }) =>
        parent?.type !== "percentage" && parent?.type !== "fixedAmount",
      validation: (rule) =>
        rule.min(0).custom((value, context) => {
          const parent = context.parent as { type?: string } | undefined;
          if (
            (parent?.type === "percentage" || parent?.type === "fixedAmount") &&
            value == null
          )
            return "A value is required";
          if (parent?.type === "percentage" && value != null && value > 100)
            return "Percentage cannot exceed 100";
          return true;
        }),
    }),
    defineField({
      name: "buyXGetY",
      title: "Buy X get Y",
      type: "object",
      hidden: ({ parent }) => parent?.type !== "buyXGetY",
      fields: [
        defineField({
          name: "buyQuantity",
          title: "Customer buys (quantity)",
          type: "number",
          initialValue: 2,
          validation: (rule) => rule.min(1),
        }),
        defineField({
          name: "buyProducts",
          title: "From products",
          description: "Empty = any product.",
          type: "array",
          of: [defineArrayMember({ type: "reference", to: [{ type: "product" }] })],
        }),
        defineField({
          name: "getQuantity",
          title: "Customer gets (quantity)",
          type: "number",
          initialValue: 1,
          validation: (rule) => rule.min(1),
        }),
        defineField({
          name: "getProducts",
          title: "Of products",
          description: "Empty = same as the bought products.",
          type: "array",
          of: [defineArrayMember({ type: "reference", to: [{ type: "product" }] })],
        }),
        defineField({
          name: "discountPercent",
          title: "At a discount of (%)",
          description: "100 = free.",
          type: "number",
          initialValue: 100,
          validation: (rule) => rule.min(0).max(100),
        }),
      ],
    }),
    defineField({
      name: "appliesTo",
      title: "Applies to",
      type: "string",
      options: {
        list: [
          { title: "All products", value: "all" },
          { title: "Specific collections", value: "collections" },
          { title: "Specific products", value: "products" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      initialValue: "all",
      hidden: ({ parent }) =>
        parent?.type === "buyXGetY" || parent?.type === "freeShipping",
    }),
    defineField({
      name: "collections",
      title: "Collections",
      type: "array",
      of: [defineArrayMember({ type: "reference", to: [{ type: "collection" }] })],
      hidden: ({ parent }) => parent?.appliesTo !== "collections",
    }),
    defineField({
      name: "products",
      title: "Products",
      type: "array",
      of: [defineArrayMember({ type: "reference", to: [{ type: "product" }] })],
      hidden: ({ parent }) => parent?.appliesTo !== "products",
    }),
    defineField({
      name: "minimumRequirement",
      title: "Minimum purchase requirement",
      type: "object",
      options: { columns: 2 },
      fields: [
        defineField({
          name: "type",
          title: "Requirement",
          type: "string",
          options: {
            list: [
              { title: "None", value: "none" },
              { title: "Minimum purchase amount", value: "amount" },
              { title: "Minimum quantity of items", value: "quantity" },
            ],
          },
          initialValue: "none",
        }),
        defineField({
          name: "value",
          title: "Value",
          type: "number",
          validation: (rule) => rule.min(0),
          hidden: ({ parent }) => !parent?.type || parent.type === "none",
        }),
      ],
    }),
    defineField({
      name: "usageLimit",
      title: "Total usage limit",
      description: "Empty = unlimited.",
      type: "number",
      validation: (rule) => rule.min(1),
      hidden: ({ parent }) => parent?.method !== "code",
    }),
    defineField({
      name: "oncePerCustomer",
      title: "Limit to one use per customer",
      type: "boolean",
      initialValue: false,
      hidden: ({ parent }) => parent?.method !== "code",
    }),
    defineField({
      name: "combinesWith",
      title: "Combinations",
      description: "Which other discount classes this can stack with.",
      type: "object",
      options: { columns: 2 },
      fields: [
        defineField({
          name: "productDiscounts",
          title: "Product discounts",
          type: "boolean",
          initialValue: false,
        }),
        defineField({
          name: "shippingDiscounts",
          title: "Shipping discounts",
          type: "boolean",
          initialValue: false,
        }),
      ],
    }),
    defineField({
      name: "startsAt",
      title: "Start date",
      type: "datetime",
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: "endsAt",
      title: "End date",
      description: "Empty = no end date.",
      type: "datetime",
      validation: (rule) =>
        rule.custom((value, context) => {
          const parent = context.parent as { startsAt?: string } | undefined;
          if (value && parent?.startsAt && value <= parent.startsAt)
            return "End date must be after the start date";
          return true;
        }),
    }),
  ],
  preview: {
    select: {
      title: "title",
      status: "status",
      method: "method",
      code: "code",
      type: "type",
      value: "value",
    },
    prepare: ({ title, status, method, code, type, value }) => {
      const what =
        type === "percentage"
          ? `${value ?? "?"}% off`
          : type === "fixedAmount"
            ? `$${value ?? "?"} off`
            : type === "buyXGetY"
              ? "Buy X get Y"
              : "Free shipping";
      return {
        title,
        subtitle: [
          status === "draft" ? "DRAFT" : null,
          what,
          method === "code" ? `Code ${code ?? "—"}` : "Automatic",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    },
  },
});
