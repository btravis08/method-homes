import { icons } from "@sanity/icons";

import designops from "../../../designops.config.json";
import { defineArrayMember, defineField, defineType } from "sanity";
import type { SanityClient } from "sanity";

import { sources } from "./shared";

/*
  Page-builder sections mirroring the Figma "[i] Design Library — SDR"
  components. Every section carries a colorMode matching the library's
  variable modes; the frontend wraps each section in data-mode so the
  design tokens resolve per section.

  Every field ships an initialValue so a freshly added section arrives
  pre-filled: lorem copy, sample labels, and a placeholder image asset
  resolved from the dataset (seeded by scripts/seed.ts).
*/

const API = { apiVersion: "2026-07-01" };

/* commerce off = no product/collection types exist; every reference
   to them must vanish with the flag or schema validation fails
   (found the hard way: first commerce-less scaffold 500'd /studio) */
const COMMERCE = designops.features.commerce;

const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

const key = () => `k${Math.random().toString(36).slice(2, 10)}`;

type GetClient = (options: { apiVersion: string }) => SanityClient;

async function placeholderAssetId(getClient: GetClient): Promise<string | null> {
  try {
    const client = getClient(API);
    return await client.fetch(
      `*[_type == "sanity.imageAsset" && originalFilename in ["sdr-placeholder.png", "campaign.png"]]
        | order(originalFilename desc)[0]._id`,
    );
  } catch {
    return null;
  }
}

async function placeholderImage(getClient: GetClient) {
  const id = await placeholderAssetId(getClient);
  // An empty image value keeps the field blank when no asset is seeded yet
  return id
    ? { _type: "image" as const, asset: { _type: "reference" as const, _ref: id } }
    : { _type: "image" as const };
}

/* Section padding: none / S / M / L, fluid between the mobile and
   desktop frames (S 16→32, M 24→64, L 48→96; ~24/48/72 at tablet).
   Top and bottom set independently; default none. */
const paddingField = (name: string, title: string) =>
  defineField({
    name,
    title,
    type: "string",
    options: {
      list: [
        { title: "None", value: "none" },
        { title: "S (16–32)", value: "s" },
        { title: "M (24–64)", value: "m" },
        { title: "L (48–96)", value: "l" },
      ],
      layout: "radio",
      direction: "horizontal",
    },
    initialValue: "none",
  });
const paddingFields = () => [
  paddingField("paddingTop", "Padding top"),
  paddingField("paddingBottom", "Padding bottom"),
  /* the id a Sub-nav anchor (and any in-page link) points at — the
     renderer puts it on the section's wrapper */
  defineField({
    name: "anchor",
    title: "Anchor id",
    type: "string",
    description: "Optional. Lowercase, dashes only (e.g. “plans”). A Sub-nav link “#plans” jumps here.",
    validation: (rule) => rule.regex(/^[a-z0-9-]{1,40}$/, { name: "lowercase letters, numbers, dashes" }),
  }),
];

const colorMode = (initialValue: "light" | "dark") =>
  defineField({
    name: "colorMode",
    title: "Color mode",
    type: "string",
    options: {
      list: [
        { title: "Light", value: "light" },
        { title: "Light Mid", value: "light-mid" },
        { title: "Dark Mid", value: "dark-mid" },
        { title: "Dark", value: "dark" },
      ],
      layout: "radio",
      direction: "horizontal",
    },
    initialValue,
  });

const image = (title = "Image") =>
  defineField({
    name: "image",
    title,
    type: "image",
    options: { hotspot: true },
    initialValue: async (_, { getClient }) => placeholderImage(getClient),
  });

/* Media block: every media slot (hero, Full Width, 50/50 columns) is
   an image or a video with a behavior picked here. The image doubles
   as the poster frame for videos. Pass `allowed` to restrict the
   choices (the hero only offers image / autoplay). */
const isVideoKind = (parent: { mediaKind?: string } | undefined) =>
  parent?.mediaKind !== "videoPlayer" && parent?.mediaKind !== "videoAutoplay";

const MEDIA_KIND_OPTIONS = [
  { title: "Image", value: "image" },
  { title: "Image — Shop the look", value: "look" },
  { title: "Video — click to play", value: "videoPlayer" },
  { title: "Video — autoplay", value: "videoAutoplay" },
  { title: "Text module", value: "text" },
];

const mediaBlockFields = (
  allowedIn: string[] = ["image", "look", "videoPlayer", "videoAutoplay"],
) => {
  const allowed = COMMERCE ? allowedIn : allowedIn.filter((k) => k !== "look");
  return [
  defineField({
    name: "mediaKind",
    title: "Media type",
    type: "string",
    options: {
      list: MEDIA_KIND_OPTIONS.filter((option) => allowed.includes(option.value)),
      layout: "radio",
    },
    initialValue: "image",
  }),
  ...(allowed.some((kind) => kind.startsWith("video"))
    ? [
        defineField({
          name: "video",
          title: "Video file",
          type: "file",
          options: { accept: "video/*" },
          description:
            "Click to play: opens in a player. Autoplay: plays muted in view with a pause control. The image above is the poster frame.",
          hidden: ({ parent }) => isVideoKind(parent),
        }),
      ]
    : []),
  ...(allowed.includes("look")
    ? [
        defineField({
          name: "lookProducts",
          title: "Shop the look — products",
          type: "array",
          of: [defineArrayMember({ type: "reference", to: [{ type: "product" }] })],
          description:
            "Products tagged in this look. A bag button appears on the media; hovering it lists these over the image.",
          hidden: ({ parent }) => parent?.mediaKind !== "look",
        }),
      ]
    : []),
];
};

/* Shared fields for hero / full-width campaign sections: three texts
   sit on the media's vertical center — they load clustered in the
   middle and spread to left / center / right. The right text carries
   the nav-style hover underline. */
const campaignFields = () => [
  defineField({
    name: "eyebrow",
    title: "Left text",
    type: "string",
    initialValue: "Now Arriving",
  }),
  defineField({
    name: "headline",
    title: "Center text",
    type: "string",
    initialValue: "Lorem Ipsum Dolor",
  }),
  defineField({
    name: "primaryCta",
    title: "Right link text",
    type: "string",
    initialValue: "Shop Collection",
  }),
  image(),
];

export const sectionHero = defineType({
  name: "sectionHero",
  icon: icons["image"],
  title: "Hero",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("dark"),
    ...campaignFields(),
    ...mediaBlockFields(["image", "videoAutoplay"]),
  ],
  preview: {
    select: { title: "headline", media: "image" },
    prepare: ({ title, media }) => ({ title: title || "Hero", subtitle: "Hero", media }),
  },
});

export const sectionFullWidth = defineType({
  name: "sectionFullWidth",
  icon: icons["presentation"],
  title: "Full Width",
  type: "object",
  fields: [
    colorMode("dark"),
    ...paddingFields(),
    ...campaignFields(),
    ...mediaBlockFields(),
  ],
  preview: {
    select: { title: "headline", media: "image" },
    prepare: ({ title, media }) => ({ title: title || "Full Width", subtitle: "Full Width", media }),
  },
});

export const sectionInfoSlider = defineType({
  name: "sectionInfoSlider",
  icon: icons["master-detail"],
  title: "Info Card Slider",
  type: "object",
  fields: [
    ...paddingFields(),
    /* dark by default: new sliders arrive as the framed Features /
       Technology design (cards pre-filled WITH body copy — body text
       is what selects the framed variant; clear it for the full-bleed
       category look) */
    colorMode("dark"),
    defineField({ name: "title", type: "string", initialValue: "Lorem Ipsum Slider" }),
    defineField({
      name: "cards",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "infoCard",
          fields: [
            defineField({ name: "title", type: "string", initialValue: "Lorem Card" }),
            defineField({
              name: "body",
              title: "Body",
              description: "Body copy switches the whole slider to the framed info-card design (Features / Technology). Clear every card\u2019s body for the full-bleed category look.",
              type: "text",
              rows: 3,
            }),
            image(),
            ...mediaBlockFields(["image", "videoAutoplay"]),
          ],
          preview: { select: { title: "title", media: "image" } },
        }),
      ],
      // Four pre-filled cards so a new slider arrives full
      initialValue: async (_, { getClient }) => {
        const img = await placeholderImage(getClient);
        return [1, 2, 3, 4].map((n) => ({
          _type: "infoCard",
          _key: key(),
          title: `Lorem Ipsum Dolor Sit \u00ae`,
          body: "Torsional Traction Plate for benefit lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod.",
          ...(img ? { image: img } : {}),
        }));
      },
    }),
  ],
  preview: {
    select: { title: "title" },
    prepare: ({ title }) => ({ title: title || "Info Card Slider", subtitle: "Info Card Slider" }),
  },
});

export const sectionProductSlider = defineType({
  name: "sectionProductSlider",
  icon: icons["package"],
  title: "Product Slider",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({
      name: "title",
      type: "string",
      description: "Optional — leave empty for the untitled variant",
      initialValue: "Lorem Ipsum Slider",
    }),
    defineField({
      name: "source",
      title: "Products source",
      type: "string",
      options: {
        list: [
          { title: "Automatic (by tag, newest first)", value: "auto" },
          { title: "Collection", value: "collection" },
          { title: "Manual selection", value: "manual" },
        ],
        layout: "radio",
      },
      initialValue: "auto",
    }),
    defineField({
      name: "collection",
      title: "Collection",
      type: "reference",
      to: [{ type: "collection" }],
      hidden: ({ parent }) => parent?.source !== "collection",
    }),
    defineField({
      name: "tag",
      title: "Tag",
      description: "Which products the slider pulls in automatically.",
      type: "string",
      options: {
        list: [
          { title: "All products", value: "all" },
          { title: "Footwear", value: "footwear" },
          { title: "Pants", value: "pants" },
          { title: "Polos", value: "polos" },
          { title: "Headwear", value: "headwear" },
          { title: "T-Shirts", value: "tshirts" },
        ],
      },
      initialValue: "all",
      hidden: ({ parent }) => parent?.source !== "auto" && parent?.source !== undefined,
    }),
    defineField({
      name: "products",
      title: "Products (manual selection)",
      type: "array",
      of: [defineArrayMember({ type: "reference", to: [{ type: "product" }] })],
      hidden: ({ parent }) => parent?.source !== "manual",
    }),
  ],
  preview: {
    select: { title: "title", tag: "tag", source: "source" },
    prepare: ({ title, tag, source }) => ({
      title: title || "Product Slider",
      subtitle: `Product Slider — ${source === "manual" ? "manual" : tag || "all"}`,
    }),
  },
});

export const sectionCarousel = defineType({
  name: "sectionCarousel",
  icon: icons["ellipsis-horizontal"],
  title: "Carousel",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "eyebrow", type: "string", initialValue: "SAMPLE BROW" }),
    defineField({
      name: "items",
      title: "Items",
      description:
        "Hovering an item on the site swaps in its image and description. First item is active by default.",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "carouselItem",
          fields: [
            defineField({ name: "title", type: "string", initialValue: "Lorem" }),
            defineField({ name: "description", type: "text", rows: 3, initialValue: LOREM }),
            image(),
          ],
          preview: { select: { title: "title", media: "image" } },
        }),
      ],
      // Five pre-filled items so a new carousel arrives full
      initialValue: async (_, { getClient }) => {
        const img = await placeholderImage(getClient);
        return ["Lorem", "Ipsum", "Dolor", "Sit", "Amet"].map((title) => ({
          _type: "carouselItem",
          _key: key(),
          title,
          description: LOREM,
          ...(img ? { image: img } : {}),
        }));
      },
    }),
  ],
  preview: {
    select: { title: "eyebrow", media: "image" },
    prepare: ({ title, media }) => ({ title: title || "Carousel", subtitle: "Carousel", media }),
  },
});

export const sectionFiftyFifty = defineType({
  name: "sectionFiftyFifty",
  icon: icons["split-vertical"],
  title: "50/50",
  type: "object",
  fields: [
    colorMode("dark"),
    ...paddingFields(),
    defineField({
      name: "ratio",
      title: "Column ratio",
      type: "string",
      description:
        "Aspect ratio applied to both columns. Flex scales the whole 50/50 to the viewport height and the columns fill it.",
      options: {
        list: [
          { title: "5:4 portrait", value: "5:4" },
          { title: "Square (1:1)", value: "1:1" },
          { title: "Flex — fill screen height", value: "flex" },
        ],
        layout: "radio",
      },
      initialValue: "5:4",
    }),
    defineField({
      name: "panels",
      title: "Columns",
      type: "array",
      validation: (rule) => rule.max(2),
      of: [
        defineArrayMember({
          type: "object",
          name: "panel",
          fields: [
            defineField({
              name: "title",
              type: "string",
              description: "Optional overlay title; image columns with a title get the arrow link.",
              initialValue: "Lorem Panel",
            }),
            image(),
            ...mediaBlockFields(["image", "look", "videoPlayer", "videoAutoplay", "text"]),
            defineField({
              name: "eyebrow",
              title: "Text — eyebrow",
              type: "string",
              initialValue: "Sample Brow",
              hidden: ({ parent }) => parent?.mediaKind !== "text",
            }),
            defineField({
              name: "body",
              title: "Text — body",
              type: "text",
              rows: 4,
              initialValue: LOREM,
              hidden: ({ parent }) => parent?.mediaKind !== "text",
            }),
            defineField({
              name: "url",
              title: "Link",
              type: "string",
              description:
                "Image columns with a link render the arrow button and hover state; without one the image is static.",
              hidden: ({ parent }) => parent?.mediaKind !== "image",
            }),
            defineField({
              name: "showEyebrow",
              title: "Text — show eyebrow",
              type: "boolean",
              initialValue: true,
              hidden: ({ parent }) => parent?.mediaKind !== "text",
            }),
            defineField({
              name: "showButton",
              title: "Text — show button",
              type: "boolean",
              initialValue: true,
              hidden: ({ parent }) => parent?.mediaKind !== "text",
            }),
            defineField({
              name: "ctaLabel",
              title: "Text — button label",
              type: "string",
              initialValue: "Button CTA",
              hidden: ({ parent }) => parent?.mediaKind !== "text" || parent?.showButton === false,
            }),
          ],
          preview: { select: { title: "title", media: "image" } },
        }),
      ],
      // Both panels pre-filled
      initialValue: async (_, { getClient }) => {
        const img = await placeholderImage(getClient);
        return [1, 2].map((n) => ({
          _type: "panel",
          _key: key(),
          title: `Lorem Panel ${n}`,
          ...(img ? { image: img } : {}),
        }));
      },
    }),
  ],
  preview: {
    select: { title: "panels.0.title" },
    prepare: ({ title }) => ({ title: title ? `50/50 — ${title}…` : "50/50", subtitle: "50/50" }),
  },
});

export const sectionRichText = defineType({
  name: "sectionRichText",
  icon: icons["block-content"],
  title: "Rich Text",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({
      name: "body",
      type: "blockContent",
      initialValue: () => [
        {
          _type: "block",
          _key: key(),
          style: "normal",
          markDefs: [],
          children: [{ _type: "span", _key: key(), text: `${LOREM} ${LOREM}`, marks: [] }],
        },
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Rich Text", subtitle: "Rich Text" }),
  },
});

/* Label/value rows + circular stat dials (PDP "Technical
   Specifications", usable on any page) */
export const sectionTechSpecs = defineType({
  name: "sectionTechSpecs",
  icon: icons["ulist"],
  title: "Technical Specifications",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "title", type: "string", initialValue: "Technical Specifications" }),
    defineField({
      name: "rows",
      title: "Specification rows",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "specRow",
          options: { columns: 2 },
          fields: [
            defineField({ name: "label", type: "string", initialValue: "Lorem Label" }),
            defineField({ name: "value", type: "text", rows: 2, initialValue: "Lorem ipsum dolor" }),
          ],
          preview: { select: { title: "label", subtitle: "value" } },
        }),
      ],
      initialValue: () =>
        ["Lorem Label", "Ipsum Label", "Dolor Label", "Sit Label"].map((label) => ({
          _type: "specRow",
          _key: key(),
          label,
          value: "Lorem ipsum dolor sit amet",
        })),
    }),
    defineField({
      name: "description",
      title: "Closing paragraph",
      description: "Shown under the rows, above the stat dials.",
      type: "text",
      rows: 3,
      initialValue: LOREM,
    }),
    defineField({
      name: "stats",
      title: "Stat dials",
      description: "Circular percentage dials shown under the rows.",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "specStat",
          options: { columns: 2 },
          fields: [
            defineField({
              name: "value",
              title: "Percent (0–100)",
              type: "number",
              initialValue: 75,
              validation: (rule) => rule.min(0).max(100),
            }),
            defineField({ name: "label", type: "string", initialValue: "Lorem Stat" }),
          ],
          preview: {
            select: { title: "label", value: "value" },
            prepare: ({ title, value }) => ({ title, subtitle: `${value ?? 0}%` }),
          },
        }),
      ],
      initialValue: () =>
        [82, 64, 91].map((value, i) => ({
          _type: "specStat",
          _key: key(),
          value,
          label: `Lorem Stat ${i + 1}`,
        })),
    }),
  ],
  preview: {
    select: { title: "title" },
    prepare: ({ title }) => ({
      title: title || "Technical Specifications",
      subtitle: "Technical Specifications",
    }),
  },
});

/* Media slider where slides keep their natural aspect ratio and fill
   the carousel height; every slide is a full media block. */
export const sectionGallery = defineType({
  name: "sectionGallery",
  icon: icons["images"],
  title: "Gallery",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "title", type: "string", initialValue: "Gallery" }),
    defineField({
      name: "slides",
      title: "Slides",
      description:
        "Any image dimension works — slides fill the carousel height at their natural aspect ratio.",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "gallerySlide",
          fields: [image(), ...mediaBlockFields()],
          preview: {
            select: { media: "image", kind: "mediaKind" },
            prepare: ({ media, kind }) => ({ title: kind ?? "image", media }),
          },
        }),
      ],
      initialValue: async (_, { getClient }) => {
        const img = await placeholderImage(getClient);
        return [1, 2, 3, 4].map(() => ({
          _type: "gallerySlide",
          _key: key(),
          mediaKind: "image",
          ...(img ? { image: img } : {}),
        }));
      },
    }),
  ],
  preview: {
    select: { title: "title" },
    prepare: ({ title }) => ({ title: title || "Gallery", subtitle: "Gallery" }),
  },
});

/* Yotpo reviews — placeholder until the widget is wired up */
export const sectionReviews = defineType({
  name: "sectionReviews",
  icon: icons["star"],
  title: "Reviews (Yotpo)",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "title", type: "string", initialValue: "Reviews" }),
  ],
  preview: {
    prepare: () => ({ title: "Reviews", subtitle: "Yotpo placeholder" }),
  },
});

/* FIBL interactive 3D viewer — placeholder until the integration */
export const sectionThreeD = defineType({
  name: "sectionThreeD",
  icon: icons["cube"],
  title: "3D Viewer (FIBL)",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "title", type: "string", initialValue: "Explore in 3D" }),
    image("Poster image"),
  ],
  preview: {
    select: { media: "image" },
    prepare: ({ media }) => ({ title: "3D Viewer", subtitle: "FIBL placeholder", media }),
  },
});

/* ── Method shared sections (Figma Method/Sections, 37505:3440) ──
   The four most-used blocks on the IA pages. Each is token-only and
   carries its AEO job in the schema description so editors write the
   right thing into it. */

/* Text intro (37505:3536): eyebrow + question-form H2 on the left,
   answer-first prose + one related link on the right. This is how a
   page clears the 300-word depth gate. */
export const sectionTextIntro = defineType({
  name: "sectionTextIntro",
  icon: icons["text"],
  title: "Text intro",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "eyebrow", type: "string", initialValue: "Eyebrow" }),
    defineField({
      name: "headline",
      title: "Heading (phrase it as the question a visitor would type)",
      type: "string",
      initialValue: "Question-form heading that a visitor would type?",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "body",
      title: "Body",
      description: "First paragraph answers the heading directly in 40–60 words; the rest add numbers, places, certifications and limits. Aim for 120–200 words here.",
      type: "blockContent",
      initialValue: () =>
        [
          "Opening paragraph answers the heading directly in 40–60 words. It names the thing, the audience, and the outcome, then the following paragraphs add the specifics — process, materials, timelines, locations — that make the answer complete.",
          "Second paragraph carries the detail: numbers, named places, named certifications, and the limits of the claim. Third paragraphs are welcome; the page-level target is 300+ words of real content, not padding.",
        ].map((text) => ({ _type: "block", _key: key(), style: "normal", markDefs: [], children: [{ _type: "span", _key: key(), text, marks: [] }] })),
    }),
    defineField({
      name: "link",
      title: "Related page link",
      type: "object",
      options: { columns: 2 },
      fields: [
        defineField({ name: "label", type: "string", initialValue: "Related page link" }),
        defineField({ name: "url", type: "string", initialValue: "/" }),
      ],
    }),
  ],
  preview: {
    select: { title: "headline", subtitle: "eyebrow" },
    prepare: ({ title, subtitle }) => ({ title: title ?? "Text intro", subtitle }),
  },
});

/* Stats bar (37506:3714): four value + label pairs between hairlines.
   Values are literal facts and must read identically wherever they
   appear; every number points at a dated source (footnote marker). */
export const sectionStats = defineType({
  name: "sectionStats",
  icon: icons["bar-chart"],
  title: "Stats bar",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({
      name: "stats",
      title: "Stats",
      type: "array",
      validation: (rule) => rule.min(2).max(4),
      of: [
        defineArrayMember({
          type: "object",
          name: "statFact",
          fields: [
            defineField({ name: "value", title: "Value", type: "string", description: "As displayed: “400+”, “2007”, “7”.", validation: (rule) => rule.required() }),
            defineField({ name: "label", title: "Label", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "footnote", title: "Source #", type: "number", description: "1-based index into Sources below; renders the superscript marker.", validation: (rule) => rule.min(1).integer() }),
          ],
          preview: { select: { title: "value", subtitle: "label" } },
        }),
      ],
      initialValue: () =>
        [
          ["400+", "Projects completed since 2007", 1],
          ["2007", "Founded in Seattle, Washington", 1],
          ["7", "Predesigned series · 32 floor plans", 2],
          ["6 states", "Delivered across the West and beyond", 2],
        ].map(([value, label, footnote]) => ({ _type: "statFact", _key: key(), value, label, footnote })),
    }),
    sources(),
  ],
  preview: {
    select: { stats: "stats" },
    prepare: ({ stats }) => ({ title: "Stats bar", subtitle: ((stats as { value?: string }[] | undefined) ?? []).map((s) => s.value).filter(Boolean).join(" · ") }),
  },
});

/* Feature list (37508:4069): icon + title + body + link, 3 or 4
   across under a section header — benefits, partnership models,
   financing options, certifications. Each item is a liftable fact. */
export const sectionFeatureList = defineType({
  name: "sectionFeatureList",
  icon: icons["th-list"],
  title: "Feature list",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "eyebrow", type: "string", initialValue: "Eyebrow" }),
    defineField({ name: "headline", title: "Heading", type: "string", initialValue: "Heading that frames the set of features" }),
    defineField({
      name: "columns",
      title: "Columns",
      type: "number",
      options: { list: [3, 4], layout: "radio", direction: "horizontal" },
      initialValue: 3,
    }),
    defineField({
      name: "items",
      title: "Features",
      type: "array",
      validation: (rule) => rule.min(2).max(8),
      of: [
        defineArrayMember({
          type: "object",
          name: "feature",
          fields: [
            defineField({ name: "icon", title: "Icon", type: "image", description: "Optional 40px glyph; a neutral tile shows when empty." }),
            defineField({ name: "title", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "body", type: "text", rows: 3, description: "Two or three sentences with a concrete, checkable detail." }),
            defineField({
              name: "link",
              title: "Link",
              type: "object",
              options: { columns: 2 },
              fields: [
                defineField({ name: "label", type: "string" }),
                defineField({ name: "url", type: "string" }),
              ],
            }),
          ],
          preview: { select: { title: "title", subtitle: "body", media: "icon" } },
        }),
      ],
      initialValue: () =>
        [1, 2, 3].map(() => ({
          _type: "feature",
          _key: key(),
          title: "Feature title",
          body: "Two or three sentences that explain the feature with a concrete detail a reader could verify.",
          link: { label: "Learn more", url: "/" },
        })),
    }),
  ],
  preview: {
    select: { title: "headline", items: "items" },
    prepare: ({ title, items }) => ({ title: title ?? "Feature list", subtitle: `${(items as unknown[] | undefined)?.length ?? 0} feature(s)` }),
  },
});

/* CTA band (37505:3598): dark conversion band — heading, reassurance
   copy, two CTAs. Closes most pages above the footer. The primary CTA
   points at /get-started, which opens the intake tray in place. */
export const sectionCtaBand = defineType({
  name: "sectionCtaBand",
  icon: icons["bolt"],
  title: "CTA band",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("dark"),
    defineField({ name: "headline", title: "Heading", type: "string", initialValue: "Ready to talk about your site, your budget, and your timeline?", validation: (rule) => rule.required() }),
    defineField({
      name: "body",
      title: "Reassurance copy",
      type: "text",
      rows: 3,
      initialValue: "A ten-minute intake tells us where you're building and what you need. We reply within two business days with a recommended path and a realistic range.",
    }),
    defineField({
      name: "ctaPrimary",
      title: "Primary button",
      type: "object",
      options: { columns: 2 },
      fields: [
        defineField({ name: "label", type: "string", initialValue: "Get started" }),
        defineField({ name: "url", type: "string", initialValue: "/get-started" }),
      ],
      initialValue: { label: "Get started", url: "/get-started" },
    }),
    defineField({
      name: "ctaSecondary",
      title: "Secondary button",
      type: "object",
      options: { columns: 2 },
      fields: [
        defineField({ name: "label", type: "string" }),
        defineField({ name: "url", type: "string" }),
      ],
      initialValue: { label: "Talk to our team", url: "/contact" },
    }),
  ],
  preview: {
    select: { title: "headline" },
    prepare: ({ title }) => ({ title: title ?? "CTA band", subtitle: "CTA band" }),
  },
});

const linkField = (name: string, title: string, label?: string, url?: string) =>
  defineField({
    name,
    title,
    type: "object",
    options: { columns: 2 },
    fields: [
      defineField({ name: "label", type: "string", ...(label ? { initialValue: label } : {}) }),
      defineField({ name: "url", type: "string", ...(url ? { initialValue: url } : {}) }),
    ],
  });

/* Card grid (37506:3646): section header + N cards (image 4:3,
   eyebrow, title, description, meta) in 2, 3 or 4 columns. Cards
   that link emit an ItemList from the page route. */
export const sectionCardGrid = defineType({
  name: "sectionCardGrid",
  icon: icons["th-large"],
  title: "Card grid",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "eyebrow", type: "string", initialValue: "Eyebrow" }),
    defineField({ name: "headline", title: "Heading", type: "string", initialValue: "Grid heading that names the set" }),
    linkField("link", "See-all link", "See all", "/"),
    defineField({ name: "columns", title: "Columns", type: "number", options: { list: [2, 3, 4], layout: "radio", direction: "horizontal" }, initialValue: 3 }),
    defineField({
      name: "cards",
      title: "Cards",
      type: "array",
      validation: (rule) => rule.min(1),
      of: [
        defineArrayMember({
          type: "object",
          name: "gridCard",
          fields: [
            defineField({
              name: "image",
              title: "Image (4:3)",
              type: "image",
              options: { hotspot: true },
              fields: [defineField({ name: "alt", title: "Alternative text", type: "string", description: "Subject, place — required when an image is set." })],
            }),
            defineField({ name: "eyebrow", title: "Eyebrow · meta", type: "string" }),
            defineField({ name: "title", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "body", type: "text", rows: 2 }),
            defineField({ name: "meta", title: "Meta line", type: "string", description: "e.g. “1,590–2,250 sq ft · 2 floor plans”." }),
            defineField({ name: "url", title: "Link", type: "string" }),
          ],
          preview: { select: { title: "title", subtitle: "eyebrow", media: "image" } },
        }),
      ],
      initialValue: () =>
        [1, 2, 3].map(() => ({
          _type: "gridCard",
          _key: key(),
          eyebrow: "Eyebrow · meta",
          title: "Card title",
          body: "One or two sentences of description that say what this is and why it matters to the reader.",
          meta: "Meta line · 1,590–2,250 sq ft · 2 floor plans",
          url: "/",
        })),
    }),
  ],
  preview: {
    select: { title: "headline", cards: "cards" },
    prepare: ({ title, cards }) => ({ title: title ?? "Card grid", subtitle: `${(cards as unknown[] | undefined)?.length ?? 0} card(s)` }),
  },
});

/* Process timeline (37507:3797): numbered steps with title,
   description and typical duration — HowTo-shaped. The page route
   emits a HowTo node from it; durations are real ranges, not
   placeholders, before publishing. */
export const sectionProcess = defineType({
  name: "sectionProcess",
  icon: icons["olist"],
  title: "Process timeline",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "eyebrow", type: "string", initialValue: "Process" }),
    defineField({ name: "headline", title: "Heading (question form)", type: "string", initialValue: "How does a Method home get built?" }),
    linkField("link", "Link", "See the full process", "/process"),
    defineField({
      name: "steps",
      title: "Steps",
      type: "array",
      validation: (rule) => rule.min(2).max(8),
      of: [
        defineArrayMember({
          type: "object",
          name: "processStep",
          fields: [
            defineField({ name: "title", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "body", type: "text", rows: 3 }),
            defineField({ name: "duration", title: "Typical duration", type: "string", description: "“6–8 weeks”, “Varies by jurisdiction”. Also emitted as the HowTo step's time when it parses." }),
          ],
          preview: { select: { title: "title", subtitle: "duration" } },
        }),
      ],
      initialValue: () =>
        [
          ["Discovery & feasibility", "Site, budget, zoning and access review. We confirm a path — series or custom — and a realistic range.", "2–4 weeks"],
          ["Design & engineering", "Architects and engineers finalize the plan, selections and structural package in one process.", "8–12 weeks"],
          ["Permits & site prep", "Permitting runs while the foundation and utilities are prepared on site.", "Varies by jurisdiction"],
          ["Factory build", "Modules are built indoors, finished and inspected while site work completes in parallel.", "10–14 weeks"],
          ["Set & finish", "Modules are delivered and craned onto the foundation; crews stitch, finish and commission.", "6–10 weeks"],
        ].map(([title, body, duration]) => ({ _type: "processStep", _key: key(), title, body, duration })),
    }),
  ],
  preview: {
    select: { title: "headline", steps: "steps" },
    prepare: ({ title, steps }) => ({ title: title ?? "Process timeline", subtitle: `${(steps as unknown[] | undefined)?.length ?? 0} step(s)` }),
  },
});

/* Compare table (37507:3753): a real <table> with a header row — the
   most-cited structure for "X vs Y" prompts. */
export const sectionCompare = defineType({
  name: "sectionCompare",
  icon: icons["block-content"],
  title: "Compare table",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "eyebrow", type: "string", initialValue: "Compare" }),
    defineField({ name: "headline", title: "Heading (question form)", type: "string", initialValue: "Which Method series fits your site and budget?" }),
    linkField("link", "Link", "Pricing guide", "/pricing"),
    defineField({
      name: "headers",
      title: "Column headers",
      description: "The first header labels the row-name column.",
      type: "array",
      of: [{ type: "string" }],
      validation: (rule) => rule.min(2).max(7),
      initialValue: ["Series", "Size range", "Floor plans", "Bedrooms", "Starting range", "Best for"],
    }),
    defineField({
      name: "rows",
      title: "Rows",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "compareRow",
          fields: [
            defineField({ name: "label", title: "Row name", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "cells", title: "Cells (one per remaining header)", type: "array", of: [{ type: "string" }] }),
          ],
          preview: { select: { title: "label", cells: "cells" }, prepare: ({ title, cells }) => ({ title, subtitle: ((cells as string[] | undefined) ?? []).join(" · ") }) },
        }),
      ],
      initialValue: () =>
        [
          ["Elemental", ["624–3,500 sq ft", "8", "1–4", "On request", "Flexible single-storey to family-size plans"]],
          ["Option", ["922–2,320 sq ft", "9", "1–4", "On request", "Modern plans with the most layouts to choose from"]],
          ["Cabin", ["1,298–2,800 sq ft", "5", "2–4", "On request", "Retreats and rural sites"]],
          ["M", ["655–1,740 sq ft", "5", "1–3", "On request", "Compact modern homes and ADUs"]],
          ["Paradigm", ["656–1,868 sq ft", "3", "1–3", "On request", "Efficient contemporary plans"]],
          ["Annata", ["1,590–2,250 sq ft", "2", "3–4", "On request", "Warm, gabled family homes"]],
          ["Method One", ["Custom", "—", "—", "On request", "Our original flagship, tailored to the site"]],
        ].map(([label, cells]) => ({ _type: "compareRow", _key: key(), label, cells })),
    }),
    sources(),
  ],
  preview: {
    select: { title: "headline", rows: "rows" },
    prepare: ({ title, rows }) => ({ title: title ?? "Compare table", subtitle: `${(rows as unknown[] | undefined)?.length ?? 0} row(s)` }),
  },
});

/* Link list (37508:4097): side heading + rows of titled internal links
   with one-line descriptions — every page links to ≥3 related pages
   with descriptive anchor text. */
export const sectionLinkList = defineType({
  name: "sectionLinkList",
  icon: icons["link"],
  title: "Link list",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "eyebrow", type: "string", initialValue: "Related" }),
    defineField({ name: "headline", title: "Heading", type: "string", initialValue: "Keep reading" }),
    defineField({ name: "intro", title: "Intro", type: "text", rows: 2, initialValue: "Guides and pages that answer the next question." }),
    defineField({
      name: "links",
      title: "Links",
      type: "array",
      validation: (rule) => rule.min(2).max(8),
      of: [
        defineArrayMember({
          type: "object",
          name: "linkRow",
          fields: [
            defineField({ name: "title", type: "string", description: "Descriptive anchor text — what the page is, not “click here”.", validation: (rule) => rule.required() }),
            defineField({ name: "description", type: "string" }),
            defineField({ name: "url", type: "string", validation: (rule) => rule.required() }),
          ],
          preview: { select: { title: "title", subtitle: "url" } },
        }),
      ],
      initialValue: () =>
        [1, 2, 3, 4].map(() => ({ _type: "linkRow", _key: key(), title: "Link title", description: "One line on what the reader will find there.", url: "/" })),
    }),
  ],
  preview: {
    select: { title: "headline", links: "links" },
    prepare: ({ title, links }) => ({ title: title ?? "Link list", subtitle: `${(links as unknown[] | undefined)?.length ?? 0} link(s)` }),
  },
});

/* Interstitial (37528:15397): a moment of pause between chapters —
   one message, one medium. At most two per page. The text is a styled
   paragraph, never a heading (it is not a document section). */
export const sectionInterstitial = defineType({
  name: "sectionInterstitial",
  icon: icons["sparkles"],
  title: "Interstitial",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({
      name: "kind",
      title: "Kind",
      type: "string",
      options: {
        list: [
          { title: "Statement — headline alone", value: "statement" },
          { title: "Image — one photograph", value: "image" },
          { title: "Floating images — headline with drifting photos", value: "floating" },
          { title: "Word over image — one word on a full-bleed photo", value: "word" },
          { title: "Number — one figure, one line", value: "number" },
        ],
        layout: "radio",
      },
      initialValue: "statement",
    }),
    defineField({ name: "text", title: "Text", type: "string", description: "The statement, the word, or the number.", initialValue: "Built indoors. Finished on your land." }),
    defineField({ name: "subline", title: "Subline", type: "string", description: "Number and Word kinds: the one line under the figure/word. End a stat with its footnote marker (¹).", hidden: ({ parent }) => !["number", "word"].includes((parent as { kind?: string })?.kind ?? "") }),
    defineField({
      name: "image",
      title: "Photograph",
      type: "image",
      options: { hotspot: true },
      fields: [
        defineField({ name: "alt", title: "Alternative text", type: "string" }),
        defineField({ name: "caption", title: "Caption", type: "string", description: "Image kind: project, place, year." }),
      ],
      hidden: ({ parent }) => !["image", "word"].includes((parent as { kind?: string })?.kind ?? ""),
    }),
    defineField({
      name: "floats",
      title: "Floating photographs (4–6)",
      type: "array",
      validation: (rule) => rule.max(6),
      of: [
        defineArrayMember({
          type: "image",
          options: { hotspot: true },
          fields: [defineField({ name: "alt", title: "Alternative text", type: "string", validation: (rule) => rule.required() })],
        }),
      ],
      hidden: ({ parent }) => (parent as { kind?: string })?.kind !== "floating",
    }),
  ],
  preview: {
    select: { title: "text", kind: "kind" },
    prepare: ({ title, kind }) => ({ title: title ?? "Interstitial", subtitle: `Interstitial · ${kind ?? "statement"}` }),
  },
});

/* Hero / Page (37505:3516): breadcrumb + H1 + lede + actions. The H1
   and the lede are the page's metadata pair (title / description
   fallback); the breadcrumb is the route's BreadcrumbList made
   visible. One per page, first in the stack. */
export const sectionHeroPage = defineType({
  name: "sectionHeroPage",
  icon: icons["document-text"],
  title: "Hero / Page",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "headline", title: "Heading (H1)", type: "string", description: "≤60 characters: the page's name as a search result would show it.", initialValue: "Page heading that names the thing" }),
    defineField({
      name: "lede",
      title: "Lede",
      type: "text",
      rows: 3,
      description: "One or two sentences (≤160 characters) that answer the heading directly — also the meta description fallback.",
      initialValue: "One or two sentences that answer the heading directly: who this is for, what it is, and the number or place that makes it concrete.",
    }),
    linkField("ctaPrimary", "Primary button", "Get started", "/get-started"),
    linkField("ctaSecondary", "Secondary link", "See the plans", "/predesigned"),
  ],
  preview: {
    select: { title: "headline" },
    prepare: ({ title }) => ({ title: title ?? "Hero / Page", subtitle: "Hero / Page" }),
  },
});

/* Sub-nav (37525:15383): a sticky strip under the Nav with the page's
   name, in-page anchors and a short primary button. Anchors are real
   links (crawlable, keyboard-reachable); the active one follows the
   scroll. Place it right after the hero; point each link at a
   section's Anchor id. */
export const sectionSubNav = defineType({
  name: "sectionSubNav",
  icon: icons["hash"],
  title: "Sub-nav",
  type: "object",
  fields: [
    defineField({ name: "contextName", title: "Context name", type: "string", description: "The page or series name shown at the left.", initialValue: "Page name" }),
    defineField({
      name: "anchors",
      title: "Anchors",
      type: "array",
      validation: (rule) => rule.min(2).max(7),
      of: [
        defineArrayMember({
          type: "object",
          name: "subNavAnchor",
          options: { columns: 2 },
          fields: [
            defineField({ name: "label", title: "Label", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "anchor", title: "Anchor id", type: "string", description: "Matches a section's Anchor id (without #).", validation: (rule) => rule.required().regex(/^[a-z0-9-]{1,40}$/, { name: "lowercase letters, numbers, dashes" }) }),
          ],
          preview: { select: { title: "label", subtitle: "anchor" } },
        }),
      ],
      initialValue: () =>
        [["Overview", "overview"], ["Plans", "plans"], ["Features", "features"], ["Gallery", "gallery"], ["FAQ", "faq"]].map(([label, anchor]) => ({ _type: "subNavAnchor", _key: key(), label, anchor })),
    }),
    linkField("cta", "Button", "Get a range", "/get-started"),
  ],
  preview: {
    select: { title: "contextName", anchors: "anchors" },
    prepare: ({ title, anchors }) => ({ title: title ?? "Sub-nav", subtitle: `Sub-nav · ${(anchors as unknown[] | undefined)?.length ?? 0} anchors` }),
  },
});

/* Spec table (37507:3678): heading column + label/value rows. Rows
   are the facts an engine lifts as Product/House additionalProperty;
   keep values short and literal (a number and its unit). */
export const sectionSpecTable = defineType({
  name: "sectionSpecTable",
  icon: icons["list"],
  title: "Spec table",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "eyebrow", type: "string", initialValue: "Specifications" }),
    defineField({ name: "headline", title: "Heading", type: "string", initialValue: "High-level specs" }),
    defineField({ name: "body", title: "Body", type: "text", rows: 3, initialValue: "What every home in the series is built to — structure, envelope, systems and the certifications they carry. Site-specific items are confirmed in your range." }),
    linkField("link", "Link", "Download the spec sheet (PDF)", "/"),
    defineField({
      name: "rows",
      title: "Rows",
      type: "array",
      validation: (rule) => rule.min(1),
      of: [
        defineArrayMember({
          type: "object",
          name: "specRow",
          options: { columns: 2 },
          fields: [
            defineField({ name: "label", title: "Label", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "value", title: "Value", type: "text", rows: 2, validation: (rule) => rule.required() }),
          ],
          preview: { select: { title: "label", subtitle: "value" } },
        }),
      ],
      initialValue: () =>
        [
          ["Structure", "Steel-reinforced wood frame modules, 2×6 exterior walls"],
          ["Envelope", "Continuous exterior insulation; triple-pane windows"],
          ["Systems", "All-electric; heat pump HVAC; ERV ventilation"],
          ["Roof", "Standing-seam metal, solar-ready"],
          ["Certifications", "ENERGY STAR; Built Green 4-Star eligible"],
          ["Warranty", "10-year structural"],
        ].map(([label, value]) => ({ _type: "specRow", _key: key(), label, value })),
    }),
  ],
  preview: {
    select: { title: "headline", rows: "rows" },
    prepare: ({ title, rows }) => ({ title: title ?? "Spec table", subtitle: `Spec table · ${(rows as unknown[] | undefined)?.length ?? 0} rows` }),
  },
});

/* FAQ — question/answer accordion (Figma "FAQ" 37507:3841). Every
   item is emitted as FAQPage/Question/Answer JSON-LD by the page route,
   so the questions buyers actually type become quotable answers; the
   AEO grader counts question-form headings and FAQPage schema. Keep
   answers self-contained (40–120 words, one fact-dense paragraph). */
export const sectionFaq = defineType({
  name: "sectionFaq",
  icon: icons["help-circle"],
  title: "FAQ",
  type: "object",
  fields: [
    ...paddingFields(),
    colorMode("light"),
    defineField({ name: "eyebrow", type: "string", initialValue: "FAQ" }),
    defineField({ name: "title", type: "string", initialValue: "Questions we hear most" }),
    defineField({
      name: "intro",
      title: "Intro",
      description: "One or two sentences framing the set, or empty.",
      type: "text",
      rows: 2,
    }),
    defineField({
      name: "items",
      title: "Questions",
      type: "array",
      validation: (rule) => rule.min(1),
      of: [
        defineArrayMember({
          type: "object",
          name: "faqItem",
          fields: [
            defineField({
              name: "question",
              type: "string",
              description: "Phrase it the way a buyer would ask it (who / what / how much / how long…).",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "answer",
              type: "text",
              rows: 4,
              description: "Answer in the first sentence; add the number or range when there is one.",
              validation: (rule) => rule.required(),
            }),
          ],
          preview: { select: { title: "question", subtitle: "answer" } },
        }),
      ],
      initialValue: () =>
        [
          ["How long does a predesigned home take from contract to move-in?", "Most predesigned homes are complete 8–12 months after contract: 6–8 weeks of design and permitting, 10–14 weeks in the factory, and 2–4 months of on-site finish after set day."],
          ["What does the price include?", "The published series price covers the modules complete — structure, envelope, finishes, fixtures and appliances — delivered to the site. Foundation, utilities, site work and permits are quoted separately for your lot."],
          ["Where do you deliver?", "We set homes across Washington, Oregon, California, Idaho, Montana and British Columbia from our factory in Ferndale, WA."],
        ].map(([question, answer]) => ({ _type: "faqItem", _key: key(), question, answer })),
    }),
  ],
  preview: {
    select: { title: "title", items: "items" },
    prepare: ({ title, items }) => ({
      title: title ?? "FAQ",
      subtitle: `${(items as unknown[] | undefined)?.length ?? 0} question(s)`,
    }),
  },
});

/* D1 — A/B experiment: two-to-four variants, each a stack of normal
   sections. The split happens client-side from a cookie set before
   first paint, so every visitor receives the same cached HTML; the
   control variant is what no-JS visitors (and search engines) see.
   Results accumulate in abResult docs via /api/ab and read out in
   the Studio Overview. Experiments cannot nest. */
export const sectionExperiment = defineType({
  name: "sectionExperiment",
  icon: icons["split-horizontal"],
  title: "A/B Experiment",
  type: "object",
  fields: [
    defineField({
      name: "key",
      title: "Experiment key",
      description:
        "Identifies this experiment in cookies and results (letters, numbers, dashes). Changing it restarts the experiment: visitors re-roll and results start a fresh row.",
      type: "string",
      validation: (rule) =>
        rule
          .required()
          .regex(/^[a-zA-Z0-9-]{1,60}$/, { name: "letters, numbers, dashes" }),
    }),
    defineField({
      name: "note",
      title: "Hypothesis",
      description: "What this experiment is testing — for the results pane.",
      type: "string",
    }),
    defineField({
      name: "variants",
      title: "Variants",
      description:
        "The first variant is the control: it renders for visitors without JavaScript and for search engines. Conversions count clicks on links and buttons inside the shown variant.",
      type: "array",
      validation: (rule) => rule.required().min(2).max(4),
      of: [
        defineArrayMember({
          type: "object",
          name: "experimentVariant",
          fields: [
            defineField({
              name: "label",
              title: "Label",
              type: "string",
              validation: (rule) => rule.required(),
              initialValue: "Variant",
            }),
            defineField({
              name: "sections",
              title: "Sections",
              type: "array",
              validation: (rule) => rule.required().min(1),
              of: [
                defineArrayMember({ type: "sectionHero" }),
                defineArrayMember({ type: "sectionInfoSlider" }),
                defineArrayMember({ type: "sectionFullWidth" }),
                defineArrayMember({ type: "sectionCarousel" }),
                defineArrayMember({ type: "sectionFiftyFifty" }),
                ...(COMMERCE
                  ? [defineArrayMember({ type: "sectionProductSlider" })]
                  : []),
                defineArrayMember({ type: "sectionRichText" }),
                defineArrayMember({ type: "sectionTechSpecs" }),
                defineArrayMember({ type: "sectionGallery" }),
                defineArrayMember({ type: "sectionReviews" }),
                defineArrayMember({ type: "sectionThreeD" }),
                defineArrayMember({ type: "sectionFaq" }),
                defineArrayMember({ type: "sectionTextIntro" }),
                defineArrayMember({ type: "sectionStats" }),
                defineArrayMember({ type: "sectionFeatureList" }),
                defineArrayMember({ type: "sectionCtaBand" }),
                defineArrayMember({ type: "sectionCardGrid" }),
                defineArrayMember({ type: "sectionProcess" }),
                defineArrayMember({ type: "sectionCompare" }),
                defineArrayMember({ type: "sectionLinkList" }),
                defineArrayMember({ type: "sectionInterstitial" }),
                defineArrayMember({ type: "sectionHeroPage" }),
                defineArrayMember({ type: "sectionSubNav" }),
                defineArrayMember({ type: "sectionSpecTable" }),
              ],
            }),
          ],
          preview: {
            select: { title: "label", sections: "sections" },
            prepare: ({ title, sections }) => ({
              title: title ?? "Variant",
              subtitle: `${(sections as unknown[] | undefined)?.length ?? 0} section(s)`,
            }),
          },
        }),
      ],
    }),
  ],
  preview: {
    select: { key: "key", variants: "variants" },
    prepare: ({ key, variants }) => ({
      title: `A/B: ${key ?? "unnamed"}`,
      subtitle: `${(variants as unknown[] | undefined)?.length ?? 0} variants`,
    }),
  },
});

/* running counters per experiment, incremented by /api/ab */
export const abResult = defineType({
  name: "abResult",
  title: "Experiment result",
  type: "document",
  readOnly: true,
  fields: [
    defineField({ name: "experiment", title: "Experiment key", type: "string" }),
    defineField({
      name: "counters",
      title: "Counters",
      description: "views_<variantKey> / converts_<variantKey> running totals.",
      type: "object",
      fields: [
        /* dynamic keys live here; this placeholder keeps the Studio
           from warning about an empty object type */
        defineField({ name: "note", type: "string", hidden: true }),
      ],
    }),
  ],
  preview: {
    select: { title: "experiment" },
    prepare: ({ title }) => ({ title: `Results: ${title ?? "?"}` }),
  },
});

export const sectionTypes = [
  sectionHero,
  sectionFullWidth,
  sectionInfoSlider,
  ...(COMMERCE ? [sectionProductSlider] : []),
  sectionCarousel,
  sectionFiftyFifty,
  sectionRichText,
  sectionTechSpecs,
  sectionGallery,
  sectionReviews,
  sectionThreeD,
  sectionFaq,
  sectionTextIntro,
  sectionStats,
  sectionFeatureList,
  sectionCtaBand,
  sectionCardGrid,
  sectionProcess,
  sectionCompare,
  sectionLinkList,
  sectionInterstitial,
  sectionHeroPage,
  sectionSubNav,
  sectionSpecTable,
  sectionExperiment,
  abResult,
];
