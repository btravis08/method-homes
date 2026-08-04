"use client";

import { LegacyBody } from "@/components/legacy/LegacyBody";
import { previewClient } from "@/sanity/lib/client";
import { useLiveMode, useQuery } from "@/sanity/lib/preview-store";
import { legacyPageQuery } from "@/sanity/lib/queries";
import type { LegacyPageDoc } from "@/sanity/types";

/*
  Draft-mode shell for /legacy: the SAME LegacyBody the server route
  renders, but fed from a live query subscription — inside
  Presentation, edits stream in BEFORE they save, and the stega-
  encoded copy gives every text block a click-to-edit overlay. Never
  rendered outside draft mode.
*/

function LiveMode() {
  useLiveMode({ client: previewClient });
  return null;
}

export function LegacyPreview({ initial }: { initial: LegacyPageDoc | null }) {
  const { data } = useQuery<LegacyPageDoc | null>(
    legacyPageQuery,
    {},
    { initial: { data: initial, sourceMap: undefined, perspective: "drafts" } },
  );

  return (
    <>
      <LegacyBody doc={data ?? initial} />
      <LiveMode />
    </>
  );
}
