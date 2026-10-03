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
  /* Authors are REAL people (3–5) plus one organization byline for
     news. Each gets a landing page at /blog/authors/[slug] — the
     Person entity every byline links to (Authority gate: bylines on
     ≥80% of posts, sameAs on the author). Never create a persona.
     Figma: "Author hero" + the Author page template. */
  groups: [
    { name: "identity", title: "Identity", default: true },
    { name: "page", title: "Author page" },
  ],
  fields: [
    defineField({ name: "name", title: "Name", type: "string", group: "identity", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      group: "identity",
      options: { source: "name" },
      description: "Author page URL: /blog/authors/<slug>.",
    }),
    defineField({
      name: "kind",
      title: "Kind",
      type: "string",
      group: "identity",
      options: {
        list: [
          { title: "Person", value: "person" },
          { title: "Organization (news byline)", value: "organization" },
        ],
        layout: "radio",
      },
      initialValue: "person",
      description: "Person emits Person schema; Organization reuses the site's Organization node (factory news, plan launches).",
    }),
    defineField({ name: "firstName", title: "First name", type: "string", group: "identity", description: "Used in copy: 'Ask {first name} a question', 'Projects {first name} led'." }),
    defineField({ name: "role", title: "Role", type: "string", group: "identity", description: "Job title as it should read in the byline (Person.jobTitle)." }),
    defineField({ name: "credentials", title: "Credentials", type: "string", group: "identity", description: "e.g. AIA, LEED AP, 15 years in modular construction" }),
    defineField({
      name: "avatar",
      title: "Portrait",
      type: "image",
      group: "identity",
      options: { hotspot: true },
      description: "Byline avatar and, cropped by hotspot, the 4:5 portrait on the author page.",
    }),
    defineField({ name: "bio", title: "Short bio", type: "text", rows: 3, group: "identity", description: "Two or three sentences on expertise — shown under the byline and emitted as Person.description." }),
    defineField({
      name: "sameAs",
      title: "Profiles",
      type: "array",
      of: [{ type: "url" }],
      group: "identity",
      description: "LinkedIn, AIA directory, personal site — lets answer engines resolve the author to one person (Person.sameAs).",
    }),
    defineField({ name: "email", title: "Public email", type: "string", group: "identity", description: "Optional. Shown as 'Email {first name}' on the author page." }),
    defineField({
      name: "teamMember",
      title: "Team member",
      type: "reference",
      to: [{ type: "teamMember" }],
      group: "identity",
      description: "Link to the About-page team entry so the person exists once.",
    }),
    defineField({
      name: "bioLong",
      title: "Author page bio",
      type: "text",
      rows: 8,
      group: "page",
      description: "Two first-person paragraphs: what you actually do at Method, and what you write about here. Separate paragraphs with a blank line.",
    }),
    defineField({ name: "startedAt", title: "At Method since (year)", type: "number", group: "page", validation: (r) => r.min(2007).max(2100) }),
    defineField({ name: "homesSet", title: "Homes set / projects delivered", type: "number", group: "page", description: "The number behind the 'homes set' fact. Leave empty to hide." }),
    defineField({
      name: "reviewsTopics",
      title: "Reviews posts on",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
      group: "page",
      description: "Topics this author reviews before publish (e.g. pricing, process). Posts can show 'Reviewed by' when the writer is unknown.",
    }),
    defineField({
      name: "projects",
      title: "Projects led",
      type: "array",
      of: [{ type: "reference", to: [{ type: "project" }] }],
      group: "page",
      description: "Shown as 'Projects {first name} led' on the author page.",
    }),
    defineField({ name: "featured", title: "Show on the Blog authors row", type: "boolean", group: "page", initialValue: true }),
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
      description: "A real person (or the organization byline for news). Bylines on ≥80% of posts clear the AEO Authority gate.",
    }),
    defineField({
      name: "reviewedBy",
      title: "Reviewed by",
      type: "reference",
      to: [{ type: "author" }],
      group: "meta",
      description: "Optional. For backfilled posts whose original writer is unknown: the expert who reviewed it. Shown as 'Reviewed by' under the byline.",
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
