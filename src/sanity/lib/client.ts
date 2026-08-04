import { createClient } from "next-sanity";

import { apiVersion, dataset, projectId, readToken } from "@/sanity/env";

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
});

/* Copy fields the visual-editing overlays may stega-encode. An
   ALLOWLIST on purpose: encoding adds invisible characters to the
   string, which is fine for display copy but corrupts anything our
   code compares against literals or renders into attributes —
   colorMode (data-mode CSS selectors), mediaKind/ratio/gender
   (branching), etc. The client's default filter doesn't know about
   those fields; this list does. */
const STEGA_COPY_FIELDS = new Set([
  "title",
  "headline",
  "eyebrow",
  "primaryCta",
  "secondaryCta",
  "description",
  "summary",
  "body",
  "text",
  "label",
  "ctaLabel",
  "name",
  "colorway",
  "value",
  "alt",
  /* Legacy page copy (legacyPage singleton) */
  "wordLeft",
  "wordRight",
  "copy",
  "cta",
  "meta",
  "textLeft",
  "textRight",
]);

/* Draft-mode client for the Studio's Presentation tool: reads draft
   documents (Viewer token), skips the CDN, and stega-encodes copy
   strings so the visual-editing overlays can map content back to
   fields. Only ever used while Next draft mode is enabled — the
   published site never touches it. */
export const previewClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: readToken,
  perspective: "drafts",
  stega: {
    enabled: true,
    studioUrl: "/studio",
    filter: (props) => {
      const end = props.sourcePath.at(-1);
      return typeof end === "string" && STEGA_COPY_FIELDS.has(end)
        ? props.filterDefault(props)
        : false;
    },
  },
});
