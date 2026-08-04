import { icons } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";
import type { SanityClient } from "sanity";

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
  allowed: string[] = ["image", "look", "videoPlayer", "videoAutoplay"],
) => [
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
                defineArrayMember({ type: "sectionProductSlider" }),
                defineArrayMember({ type: "sectionRichText" }),
                defineArrayMember({ type: "sectionTechSpecs" }),
                defineArrayMember({ type: "sectionGallery" }),
                defineArrayMember({ type: "sectionReviews" }),
                defineArrayMember({ type: "sectionThreeD" }),
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
  sectionProductSlider,
  sectionCarousel,
  sectionFiftyFifty,
  sectionRichText,
  sectionTechSpecs,
  sectionGallery,
  sectionReviews,
  sectionThreeD,
  sectionExperiment,
  abResult,
];
