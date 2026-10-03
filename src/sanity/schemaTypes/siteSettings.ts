import { icons } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const siteSettings = defineType({
  name: "siteSettings",
  icon: icons["controls"],
  title: "Site settings",
  type: "document",
  fields: [
    defineField({
      name: "companyName",
      title: "Company name",
      type: "string",
    }),
    defineField({
      name: "tagline",
      title: "Tagline",
      type: "string",
    }),
    defineField({
      name: "phone",
      title: "Phone",
      type: "string",
    }),
    defineField({
      name: "email",
      title: "Email",
      type: "string",
    }),
    defineField({
      name: "address",
      title: "Street address",
      description: "Street and suite only — city, state and ZIP have their own fields so the PostalAddress schema is exact.",
      type: "text",
      rows: 2,
    }),
    defineField({ name: "city", title: "City", type: "string" }),
    defineField({ name: "region", title: "State / province", description: "Two-letter code, e.g. WA.", type: "string" }),
    defineField({ name: "postalCode", title: "ZIP / postal code", type: "string" }),
    defineField({
      name: "sameAs",
      title: "Official profiles",
      description:
        "The company's other homes on the web — Google Business Profile, LinkedIn, Instagram, Houzz, Wikipedia/Wikidata if any. These let answer engines resolve “Method Homes” to one entity (Organization.sameAs). Name, address and phone must read identically on every one of them.",
      type: "array",
      of: [{ type: "url" }],
    }),
    defineField({
      name: "announcement",
      title: "Announcement bar",
      description:
        "A strip above the navigation (sale messaging, shipping cutoffs). Schedule it with the start/end fields or leave them empty to run indefinitely.",
      type: "object",
      fields: [
        defineField({
          name: "enabled",
          title: "Show the bar",
          type: "boolean",
          initialValue: false,
        }),
        defineField({ name: "text", title: "Text", type: "string" }),
        defineField({
          name: "url",
          title: "Link (optional)",
          type: "string",
          description: "The whole bar becomes a link, e.g. /collections/shop-all.",
        }),
        defineField({
          name: "colorMode",
          title: "Color mode",
          type: "string",
          options: { list: ["light", "dark"], layout: "radio" },
          initialValue: "dark",
        }),
        defineField({
          name: "dismissible",
          title: "Visitors can dismiss it",
          type: "boolean",
          initialValue: true,
        }),
        defineField({ name: "startsAt", title: "Starts", type: "datetime" }),
        defineField({ name: "endsAt", title: "Ends", type: "datetime" }),
      ],
    }),
  ],
});
