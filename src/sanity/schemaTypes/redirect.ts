import { icons } from "@sanity/icons";
import { defineField, defineType } from "sanity";

/*
  CMS-managed redirects: when a product is renamed, a collection is
  retired, or a campaign needs a vanity path, editors add a redirect
  here instead of filing a ticket. The site checks these before
  serving a 404 (see src/sanity/lib/redirects.ts).
*/
export const redirect = defineType({
  name: "redirect",
  title: "Redirect",
  icon: icons["arrow-right"],
  type: "document",
  fields: [
    defineField({
      name: "from",
      title: "From path",
      type: "string",
      description:
        'The old path, starting with "/" (e.g. /products/old-name). Exact match.',
      validation: (rule) =>
        rule
          .required()
          .custom((value) =>
            value && !value.startsWith("/")
              ? 'Must start with "/"'
              : true,
          ),
    }),
    defineField({
      name: "to",
      title: "To",
      type: "string",
      description:
        'Destination: a site path ("/collections/polos") or a full URL.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "permanent",
      title: "Permanent (308)",
      type: "boolean",
      description:
        "On = search engines transfer ranking to the new URL. Leave off for temporary campaigns.",
      initialValue: true,
    }),
  ],
  preview: {
    select: { title: "from", subtitle: "to" },
  },
});
