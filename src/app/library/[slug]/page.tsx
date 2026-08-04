import { notFound } from "next/navigation";

import { TokenAuditBridge } from "@/components/dev/TokenAuditBridge";
import { statusFor } from "@/library/status";

import { bySlug, figmaUrl, SECTIONS, type Mode } from "@/library/registry";
import { SectionViewer } from "@/library/SectionViewer";

/*
  One section, two renders:
    ?frame=1  → the bare section (what the thumbnails and the
                viewer's iframe load, and what the token inspector
                reads with Alt+T)
    otherwise → the viewer shell: toolbar + resizable iframe
*/
export function generateStaticParams() {
  return SECTIONS.map((s) => ({ slug: s.slug }));
}

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ frame?: string; mode?: string; audit?: string; scheme?: string }>;
}) {
  const { slug } = await params;
  const { frame, mode, audit, scheme } = await searchParams;
  const entry = bySlug(slug);
  if (!entry) notFound();

  if (frame === "1") {
    const active = (entry.modes.includes(mode as Mode) ? mode : entry.modes[0]) as Mode;
    return (
      <div data-mode={active} className="min-h-screen w-full bg-surface text-ink">
        {entry.render(active)}
        {/* ?audit=1 exposes window.__sdrAudit() for the audit script */}
        {audit === "1" && <TokenAuditBridge />}
      </div>
    );
  }

  return (
    <SectionViewer
      entry={{
        slug: entry.slug,
        title: entry.title,
        schemaType: entry.schemaType,
        description: entry.description,
        modes: entry.modes,
        figmaNodeId: entry.figmaNodeId,
        figmaUrl: entry.figmaNodeId ? figmaUrl(entry.figmaNodeId) : undefined,
        comps: entry.comps,
        timed: entry.timed,
        match: statusFor(entry.slug)?.comps as never,
        offToken: statusFor(entry.slug)?.tokens?.offToken,
      }}
      scheme={scheme === "dark" ? "dark" : "light"}
    />
  );
}
