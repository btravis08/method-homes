import { icons } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

/*
  The Legacy page ("A New Legacy") as a singleton document. Every
  editable surface on /legacy lives here: the hero words + campaign
  image, the two mantra text blocks, the pinned gallery's imagery and
  captions, the full-bleed carousel slides, the mark block, and the
  closing product swirl.

  The page's choreography and geometry (card positions, sizes, timing)
  are code-owned — the CMS supplies content, and any field left empty
  falls back to the built-in design content.
*/

const textBlockFields = [
  defineField({ name: "eyebrow", title: "Eyebrow", type: "string" }),
  defineField({ name: "copy", title: "Copy", type: "text", rows: 4 }),
  defineField({
    name: "cta",
    title: "Button label",
    type: "string",
    description: "The black button under the copy",
  }),
];

export const legacyPage = defineType({
  name: "legacyPage",
  title: "Legacy page",
  icon: icons["document"],
  type: "document",
  groups: [
    { name: "hero", title: "Hero" },
    { name: "mantra", title: "Mantra blocks" },
    { name: "gallery", title: "Gallery" },
    { name: "carousel", title: "Carousel" },
    { name: "closing", title: "Mark & swirl" },
  ],
  fields: [
    defineField({
      name: "hero",
      title: "Hero",
      type: "object",
      group: "hero",
      options: { collapsible: true, collapsed: false },
      fields: [
        defineField({
          name: "wordLeft",
          title: "Left words",
          type: "string",
          description: 'Pushed to the left edge as the image expands ("A New")',
        }),
        defineField({
          name: "wordRight",
          title: "Right word",
          type: "string",
          description: 'Pushed to the right edge ("Legacy")',
        }),
        defineField({
          name: "image",
          title: "Campaign image",
          type: "image",
          description: "Expands between the words to full screen",
          options: { hotspot: true },
        }),
      ],
    }),
    defineField({
      name: "mantraTop",
      title: "Mantra (above the gallery)",
      type: "object",
      group: "mantra",
      options: { collapsible: true, collapsed: true },
      fields: textBlockFields,
    }),
    defineField({
      name: "gallery",
      title: "Pinned gallery",
      type: "object",
      group: "gallery",
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({
          name: "cards",
          title: "Cards",
          type: "array",
          description:
            "Up to 10 images, left to right along the ride. Positions and sizes are fixed by the design — cards fill the layout slots in order, and empty slots keep the built-in imagery.",
          validation: (rule) => rule.max(10),
          of: [
            defineArrayMember({
              type: "object",
              name: "galleryCard",
              fields: [
                defineField({
                  name: "image",
                  title: "Image",
                  type: "image",
                  options: { hotspot: true },
                }),
                defineField({
                  name: "meta",
                  title: "Caption",
                  type: "string",
                  description: 'Small label above the image ("St Andrews, 2022")',
                }),
              ],
              preview: {
                select: { title: "meta", media: "image" },
              },
            }),
          ],
        }),
        defineField({
          name: "textLeft",
          title: "First paragraph",
          type: "text",
          rows: 3,
          description: "Seated by the first large card",
        }),
        defineField({
          name: "textRight",
          title: "Second paragraph",
          type: "text",
          rows: 3,
          description: "Seated by the second large card",
        }),
      ],
    }),
    defineField({
      name: "mantraBottom",
      title: "Mantra (below the gallery)",
      type: "object",
      group: "mantra",
      options: { collapsible: true, collapsed: true },
      fields: textBlockFields,
    }),
    defineField({
      name: "slides",
      title: "Carousel slides",
      type: "array",
      group: "carousel",
      description:
        "The timed full-bleed carousel. Slides fill the built-in five by position — set only what you want to change, and empty fields keep the design content. Fully-filled slides beyond the fifth extend the deck.",
      validation: (rule) => rule.min(0).max(8),
      of: [
        defineArrayMember({
          type: "object",
          name: "legacySlide",
          fields: [
            defineField({ name: "title", title: "Headline", type: "string" }),
            defineField({
              name: "background",
              title: "Background image",
              type: "image",
              description: "Full-viewport, under a dark scrim",
              options: { hotspot: true },
            }),
            defineField({
              name: "media",
              title: "Portrait image",
              type: "image",
              description: "The small portrait well below the headline",
              options: { hotspot: true },
            }),
            defineField({ name: "body", title: "Body copy", type: "text", rows: 3 }),
          ],
          preview: {
            select: { title: "title", media: "background" },
          },
        }),
      ],
    }),
    defineField({
      name: "mark",
      title: "Our Mark block",
      type: "object",
      group: "closing",
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({ name: "eyebrow", title: "Eyebrow", type: "string" }),
        defineField({ name: "copy", title: "Copy", type: "text", rows: 4 }),
        defineField({
          name: "image",
          title: "Mark image",
          type: "image",
          description:
            "The embossed tiger mark (SVG works). Leave empty to keep the built-in mark.",
        }),
      ],
    }),
    defineField({
      name: "swirl",
      title: "Product swirl",
      type: "object",
      group: "closing",
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({
          name: "centerImage",
          title: "Center card image",
          type: "image",
          description: "The flat campaign card at the center of the swirl",
          options: { hotspot: true },
        }),
        defineField({ name: "cta", title: "Button label", type: "string" }),
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "A New Legacy", subtitle: "/legacy" }),
  },
});
