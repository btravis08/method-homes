import { icons } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

export const page = defineType({
  name: "page",
  icon: icons["documents"],
  title: "Page",
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
      description:
        "The page URL, e.g. “about” becomes /about. Use “home” for the homepage. Avoid “projects” and “studio”, which are reserved.",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "showFooterTagline",
      title: "Show footer tagline",
      description:
        "Shows the “Earned Never Given” art above the footer links on this page. Off by default.",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "sections",
      title: "Sections",
      description:
        "The page is built from these sections, top to bottom. Drag to reorder; each section has its own color mode.",
      type: "array",
      of: [
        defineArrayMember({ type: "sectionHero" }),
        defineArrayMember({ type: "sectionInfoSlider" }),
        defineArrayMember({ type: "sectionFullWidth" }),
        defineArrayMember({ type: "sectionCarousel" }),
        defineArrayMember({ type: "sectionFiftyFifty" }),
        defineArrayMember({ type: "sectionProductSlider" }),
        defineArrayMember({ type: "sectionRichText" }),
        defineArrayMember({ type: "sectionTechSpecs" }),
        defineArrayMember({ type: "sectionGallery" }),
        defineArrayMember({ type: "sectionReviews" }),
        defineArrayMember({ type: "sectionThreeD" }),
        defineArrayMember({ type: "sectionExperiment" }),
      ],
    }),
    defineField({
      name: "protected",
      title: "Password protection",
      description:
        "Visitors must enter the passphrase below before this page renders. Protected pages are also kept out of search engines and the sitemap.",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "passphrase",
      title: "Passphrase",
      description:
        "Shared with everyone who should see the page. Changing it signs every visitor out of the page.",
      type: "string",
      hidden: ({ document }) => !document?.protected,
      validation: (rule) =>
        rule.custom((value, context) =>
          (context.document as { protected?: boolean } | undefined)?.protected &&
          !value?.trim()
            ? "A protected page needs a passphrase"
            : true,
        ),
    }),
    defineField({
      name: "seo",
      title: "Search engine listing",
      type: "seo",
    }),
    // Legacy fields, kept so pre-section documents still render
    defineField({
      name: "heroImage",
      title: "Hero image (legacy)",
      type: "image",
      options: { hotspot: true },
      hidden: ({ document }) => Boolean(document?.sections),
      fields: [
        defineField({
          name: "alt",
          title: "Alternative text",
          type: "string",
        }),
      ],
    }),
    defineField({
      name: "body",
      title: "Body (legacy)",
      type: "blockContent",
      hidden: ({ document }) => Boolean(document?.sections),
    }),
  ],
});
