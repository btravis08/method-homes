import { NextResponse } from "next/server";

import { compUrl, figmaUrl, SECTIONS } from "@/library/registry";
import { auditedAt, driftScore, layoutDelta, statusFor } from "@/library/status";

/*
  The library, machine-readable: every section with its Figma node,
  comps per breakpoint, latest diff scores and off-token findings.

  This exists so the design system's state can be read in one request
  — "what's off-token across the site", "which sections drifted" —
  instead of being reconstructed by driving the UI.
*/
export function GET() {
  return NextResponse.json({
    auditedAt,
    sections: SECTIONS.map((entry) => {
      const status = statusFor(entry.slug);
      return {
        slug: entry.slug,
        title: entry.title,
        group: entry.group,
        description: entry.description,
        schemaType: entry.schemaType ?? null,
        timed: Boolean(entry.timed),
        modes: entry.modes,
        preview: `/library/${entry.slug}`,
        figma: entry.figmaNodeId
          ? { nodeId: entry.figmaNodeId, url: figmaUrl(entry.figmaNodeId) }
          : null,
        comps: Object.entries(entry.comps ?? {}).map(([breakpoint, size]) => ({
          breakpoint,
          ...size,
          url: compUrl(entry.slug, breakpoint as "desktop" | "tablet" | "mobile"),
          match: status?.comps?.[breakpoint] ?? null,
        })),
        tokens: status?.tokens ?? null,
        /* worst-layout change vs the previous audit run */
        layoutDelta: layoutDelta(entry.slug),
        motion: status?.motion ?? null,
        designDrift: driftScore(entry.slug),
      };
    }),
  });
}
