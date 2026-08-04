import { GROUPS } from "@/library/registry";
import { LibraryGrid } from "@/library/LibraryGrid";
import { auditedAt, summaries } from "@/library/status";

/*
  The section library index — every composable section at a glance,
  each rendered live, each carrying what the audit found. Click
  through for the full-size preview with mode, breakpoint and comp
  comparison.
*/
export default async function LibraryIndex({
  searchParams,
}: {
  searchParams: Promise<{ scheme?: string }>;
}) {
  /* the Studio's Sections tool passes its appearance scheme so the
     embedded library chrome matches */
  const { scheme } = await searchParams;
  const chrome = scheme === "dark" ? "dark" : "light";
  return (
    <div data-mode={chrome} className="min-h-screen w-full bg-surface text-ink">
      <header className="border-b border-line px-6 py-8">
        <p className="label font-medium text-ink-3">SUN DAY RED</p>
        <h1 className="mt-2 font-display text-headline-md">Section library</h1>
        <p className="mt-3 max-w-[43.75rem] text-body-sm text-ink-2">
          Every section the site builds pages from, rendered live from the same
          components production uses. Open one to preview it at any breakpoint
          and color mode, diff it against its Figma comp, or press Alt+T inside
          a preview for the token readout.
        </p>
      </header>

      <LibraryGrid
        entries={summaries()}
        groups={[...GROUPS]}
        generatedAt={auditedAt}
        scheme={chrome}
      />
    </div>
  );
}
