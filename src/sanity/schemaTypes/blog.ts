import { icons } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

/*
  The blog (Honors Journal) content model — the WordPress feature set
  mapped onto Sanity: posts with author, categories, featured image,
  excerpt, rich body (text + images + pull quotes), publish date and
  SEO fields. Drafts, revisions, preview, and scheduling come from
  the platform (document drafts, history, Presentation, scheduled
  drafts / releases).

  CMS posts render at /journal/<slug> and surface on the journal
  landing inside their category's image stream — a category's slug
  must match one of the landing's stream categories (ambassadors,
  stories-from-the-course, on-craft-and-culture, in-the-press,
  from-tiger) for its posts to appear there.
*/

export const author = defineType({
  name: "author",
  title: "Author",
  icon: icons["user"],
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "role", title: "Role", type: "string" }),
    defineField({ name: "avatar", title: "Avatar", type: "image", options: { hotspot: true } }),
    defineField({ name: "bio", title: "Bio", type: "text", rows: 3 }),
  ],
  preview: { select: { title: "name", subtitle: "role", media: "avatar" } },
});

export const postCategory = defineType({
  name: "postCategory",
  title: "Blog category",
  icon: icons["tag"],
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title" },
      description:
        "Match a journal stream slug (ambassadors, stories-from-the-course, on-craft-and-culture, in-the-press, from-tiger) for posts to surface on the landing.",
      validation: (r) => r.required(),
    }),
    defineField({ name: "description", title: "Description", type: "text", rows: 2 }),
  ],
});

export const post = defineType({
  name: "post",
  title: "Post",
  icon: icons["compose"],
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "meta", title: "Meta & SEO" },
  ],
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      group: "content",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      group: "content",
      options: { source: "title" },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "heroImage",
      title: "Featured image",
      type: "image",
      group: "content",
      options: { hotspot: true },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "excerpt",
      title: "Excerpt",
      type: "text",
      rows: 3,
      group: "content",
      description: "The lead paragraph and the share/SEO description.",
    }),
    defineField({
      name: "body",
      title: "Body",
      type: "array",
      group: "content",
      of: [
        defineArrayMember({
          type: "block",
          styles: [
            { title: "Normal", value: "normal" },
            { title: "Heading", value: "h2" },
            { title: "Subheading", value: "h3" },
            { title: "Pull quote", value: "blockquote" },
          ],
        }),
        defineArrayMember({
          type: "image",
          options: { hotspot: true },
          fields: [
            defineField({ name: "caption", title: "Caption", type: "string" }),
            defineField({ name: "alt", title: "Alt text", type: "string" }),
          ],
        }),
      ],
    }),
    defineField({
      name: "author",
      title: "Author",
      type: "reference",
      to: [{ type: "author" }],
      group: "meta",
    }),
    defineField({
      name: "categories",
      title: "Categories",
      type: "array",
      of: [{ type: "reference", to: [{ type: "postCategory" }] }],
      group: "meta",
    }),
    defineField({
      name: "tags",
      title: "Tags",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
      group: "meta",
      description:
        "Free-form keywords, shown on the article and carried in the RSS feed (categories drive the archives; tags are lighter-weight).",
    }),
    defineField({
      name: "publishedAt",
      title: "Published at",
      type: "datetime",
      group: "meta",
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: "featured",
      title: "Featured",
      type: "boolean",
      group: "meta",
      initialValue: false,
    }),
    defineField({
      name: "seo",
      title: "Search engine listing",
      type: "seo",
      group: "meta",
    }),
    /* superseded by the seo object; hidden but kept so any existing
       documents' overrides survive (metadata falls back to it) */
    defineField({
      name: "seoTitle",
      title: "SEO title override (legacy)",
      type: "string",
      group: "meta",
      hidden: true,
    }),
  ],
  orderings: [
    {
      title: "Publish date, newest",
      name: "publishedAtDesc",
      by: [{ field: "publishedAt", direction: "desc" }],
    },
  ],
  preview: {
    select: { title: "title", subtitle: "publishedAt", media: "heroImage" },
  },
});
