import {
  createImageUrlBuilder,
  type SanityImageSource,
} from "@sanity/image-url";

import { dataset, projectId } from "@/sanity/env";

const builder = createImageUrlBuilder({ projectId, dataset });

export function urlFor(source: SanityImageSource) {
  /* auto("format") lets the Sanity CDN serve AVIF/WebP to browsers
     that accept them — every image URL in the app flows through here,
     so this is the single lever for modern formats */
  return builder.image(source).auto("format");
}

/* Build a srcset from an already-built Sanity CDN URL by swapping its
   w= param — lets components stay string-based while the browser
   picks the right size per viewport/DPR. Non-Sanity URLs (static
   /figma fallbacks) get no srcset and load as-is. */
export function sanitySrcSet(
  url: string | undefined,
  widths: number[] = [480, 768, 1080, 1600, 2000],
): string | undefined {
  if (!url || !url.includes("cdn.sanity.io") || !/[?&]w=\d+/.test(url)) return undefined;
  const cap = Number(url.match(/[?&]w=(\d+)/)?.[1] ?? Infinity);
  const usable = widths.filter((w) => w <= cap);
  if (!usable.includes(cap) && Number.isFinite(cap)) usable.push(cap);
  return usable.map((w) => `${url.replace(/([?&])w=\d+/, `$1w=${w}`)} ${w}w`).join(", ");
}
