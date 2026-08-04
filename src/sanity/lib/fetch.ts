import { draftMode } from "next/headers";
import type { QueryParams } from "next-sanity";

import { readToken } from "@/sanity/env";
import { client, previewClient } from "@/sanity/lib/client";

/**
 * Fetch from Sanity, returning `fallback` if the request fails or matches no
 * documents (GROQ returns null), so the site still renders with empty states
 * when the API is unreachable or the dataset is empty.
 *
 * While Next draft mode is on (the Studio's Presentation tool enables it via
 * /api/draft-mode/enable), reads switch to the drafts perspective, uncached,
 * so editors see changes live. The published path is byte-for-byte what it
 * always was — draft mode off means zero behavior change.
 */
export async function sanityFetch<T>(
  query: string,
  params: QueryParams,
  fallback: T,
): Promise<T> {
  try {
    const { isEnabled } = await draftMode();
    if (isEnabled && readToken) {
      const result = await previewClient.fetch<T | null>(query, params, {
        next: { revalidate: 0 },
      });
      return result ?? fallback;
    }
    const result = await client.fetch<T | null>(query, params, {
      /* tag-based: a Sanity publish webhook hits /api/revalidate and
         busts everything instantly; the 10-minute revalidate is only
         the safety net if the webhook is missing/misconfigured */
      next: { revalidate: 600, tags: ["sanity"] },
    });
    return result ?? fallback;
  } catch (error) {
    console.error("Sanity fetch failed:", error);
    return fallback;
  }
}
