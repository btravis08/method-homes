import { icons } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

import { faqItems, imageWithAlt, sources } from "./shared";

/*
  Where we build and what we build for whom:

  - `market` = a state/province lander (WA, OR, CA, ID, MT, CO, UT,
    BC): delivery, permitting and factory-distance facts, the map
    pin, the projects set there (auto: project.state), FAQ. Figma
    template 37511:7208; route `/where-we-build/<slug>` proposed.
    Emits Service with areaServed + Place.
  - `commercialType` = a service page per building type (schools,
    multifamily, hospitality, workforce housing) with the
    "Scale, simply" configurations. Figma 37510:5513 etc.; route
    `/commercial/<slug>` proposed. Emits Service.
*/

export const market = defineType({
  name: "market",
  icon: icons["pin"],
  title: "Market (where we build)",
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "facts", title: "Delivery facts" },
    { name: "faq", title: "FAQ & sources" },
    { name: "meta", title: "SEO" },
  ],
  fields: [
    defineField({ name: "name", title: "Name", type: "string", group: "content", validation: (rule) => rule.required(), description: "“Washington”, “British Columbia”." }),
    defineField({ name: "slug", title: "Slug", type: "slug", group: "content", options: { source: "name", maxLength: 64 }, validation: (rule) => rule.required() }),
    defineField({
      name: "code",
      title: "State / province code",
      type: "string",
      group: "content",
      description: "Two letters (WA, OR, BC). Projects whose State matches list here automatically.",
      validation: (rule) => rule.required().uppercase().length(2),
    }),
    defineField({ name: "country", title: "Country", type: "string", group: "content", options: { list: ["US", "CA"] }, initialValue: "US" }),
    defineField({ name: "lede", title: "Lede", type: "text", rows: 4, group: "content", description: "Answer first: do we deliver here, from where, what does delivery add, what is different about permitting." }),
    imageWithAlt("heroImage", "Hero photograph", "A home set in this market."),
    defineField({ name: "body", title: "Body", type: "blockContent", group: "content" }),
    defineField({ name: "order", title: "Sort order", type: "number", group: "content", initialValue: 100 }),

    defineField({ name: "geo", title: "Map pin", type: "geopoint", group: "facts", description: "Centre of the market for the delivery map." }),
    defineField({ name: "factoryDistanceMiles", title: "Distance from the factory (miles)", type: "number", group: "facts", description: "Ferndale, WA to the market centre." }),
    defineField({ name: "deliveryDays", title: "Typical delivery (days)", type: "number", group: "facts" }),
    defineField({ name: "deliveryNotes", title: "Delivery notes", type: "text", rows: 3, group: "facts", description: "Route limits, escorts, seasonal windows." }),
    defineField({ name: "permittingNotes", title: "Permitting notes", type: "text", rows: 3, group: "facts", description: "State modular program, inspections, typical durations." }),
    defineField({ name: "regionsServed", title: "Regions served", type: "array", of: [{ type: "string" }], options: { layout: "tags" }, group: "facts", description: "Named areas inside the market (Methow Valley, San Juan Islands…) — emitted as areaServed." }),
    defineField({
      name: "localPartners",
      title: "Local partners",
      type: "array",
      group: "facts",
      of: [
        defineArrayMember({
          type: "object",
          name: "partner",
          fields: [
            defineField({ name: "name", type: "string" }),
            defineField({ name: "role", type: "string", description: "General contractor, crane, foundation…" }),
            defineField({ name: "url", type: "url" }),
          ],
          preview: { select: { title: "name", subtitle: "role" } },
        }),
      ],
    }),

    faqItems(),
    sources(),
    defineField({ name: "seo", title: "Search engine listing", type: "seo", group: "meta" }),
  ],
  orderings: [{ title: "Sort order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] }],
  preview: { select: { title: "name", subtitle: "code", media: "heroImage" } },
});

export const commercialType = defineType({
  name: "commercialType",
  icon: icons["block-content"],
  title: "Commercial type",
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "configs", title: "Configurations" },
    { name: "faq", title: "FAQ & sources" },
    { name: "meta", title: "SEO" },
  ],
  fields: [
    defineField({ name: "name", title: "Name", type: "string", group: "content", validation: (rule) => rule.required(), description: "“Schools”, “Multifamily”, “Hospitality”, “Workforce housing”." }),
    defineField({ name: "slug", title: "Slug", type: "slug", group: "content", options: { source: "name", maxLength: 64 }, validation: (rule) => rule.required() }),
    defineField({ name: "lede", title: "Lede", type: "text", rows: 4, group: "content", description: "Answer first: what we build for this client, at what scale, how fast, and the cost logic." }),
    imageWithAlt("heroImage", "Hero photograph"),
    defineField({ name: "body", title: "Body", type: "blockContent", group: "content" }),
    defineField({ name: "caseStudies", title: "Case studies", type: "array", of: [{ type: "reference", to: [{ type: "project" }] }], group: "content" }),
    defineField({ name: "order", title: "Sort order", type: "number", group: "content", initialValue: 100 }),

    defineField({
      name: "configurations",
      title: "Configurations (Scale, simply)",
      type: "array",
      group: "configs",
      description: "The toggle states: a label and the numbers it shows.",
      of: [
        defineArrayMember({
          type: "object",
          name: "configuration",
          fields: [
            defineField({ name: "label", title: "Label", type: "string", description: "“24 units”, “48 units”." }),
            defineField({ name: "units", title: "Units / rooms / classrooms", type: "number" }),
            defineField({ name: "modules", title: "Modules", type: "number" }),
            defineField({ name: "sqft", title: "Square feet", type: "number" }),
            defineField({ name: "months", title: "Months to occupancy", type: "number" }),
            defineField({ name: "note", title: "Note", type: "string" }),
          ],
          preview: { select: { title: "label", subtitle: "note" } },
        }),
      ],
    }),

    faqItems(),
    sources(),
    defineField({ name: "seo", title: "Search engine listing", type: "seo", group: "meta" }),
  ],
  orderings: [{ title: "Sort order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] }],
  preview: { select: { title: "name", media: "heroImage" } },
});
