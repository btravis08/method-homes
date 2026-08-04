import { groq } from "next-sanity";

import { sanityFetch } from "@/sanity/lib/fetch";

/*
  Redirect lookup, called by dynamic routes just before they 404 —
  the miss path only, so the happy path pays nothing. Exact-match on
  the requested pathname.
*/

const redirectQuery = groq`
  *[_type == "redirect" && from == $path][0]{ to, permanent }
`;

export interface RedirectHit {
  to: string;
  permanent?: boolean;
}

export async function resolveRedirect(path: string): Promise<RedirectHit | null> {
  if (!path.startsWith("/")) return null;
  return sanityFetch<RedirectHit | null>(redirectQuery, { path }, null);
}
