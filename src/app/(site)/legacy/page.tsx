import type { Metadata } from "next";
import { draftMode } from "next/headers";

import { LegacyBody } from "@/components/legacy/LegacyBody";
import { sanityFetch } from "@/sanity/lib/fetch";
import { legacyPageQuery } from "@/sanity/lib/queries";
import type { LegacyPageDoc } from "@/sanity/types";

/*
  The Legacy page (Figma node 33599:69683) — a scroll-driven brand
  story: locked title intro, split-text mantra blocks, the pinned
  gallery ride, the timed full-bleed carousel, the embossed mark, and
  the product swirl. Site chrome (nav + footer) comes from the (site)
  layout; the bespoke Legacy footer design is a separate, later pass.

  Content comes from the "legacyPage" Sanity singleton; the doc→
  section mapping (and its design-content fallbacks) lives in
  LegacyBody, shared with the draft-mode preview shell.
*/

export const metadata: Metadata = {
  title: "A New Legacy — Sun Day Red",
  description:
    "Every seam, every stitch, every fold of Sun Day Red is sewn with the meticulousness, care, and unwavering focus that has defined Tiger Woods' legendary career.",
};

export default async function LegacyPage() {
  const doc = await sanityFetch<LegacyPageDoc | null>(legacyPageQuery, {}, null);

  /* Presentation preview: live client shell, edits stream pre-save */
  const { isEnabled: isDraft } = await draftMode();
  if (isDraft) {
    const { PreviewGate } = await import("@/components/preview/PreviewGate");
    return <PreviewGate kind="legacy" initial={doc} />;
  }

  return <LegacyBody doc={doc} />;
}
