export const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "i2wd5pr1";

export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";

export const apiVersion = "2026-07-01";

/* server-only Viewer token for draft-mode preview (Presentation tool);
   without it the site simply serves published content everywhere */
export const readToken = process.env.SANITY_API_READ_TOKEN;
