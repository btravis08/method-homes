import type { Metadata, Viewport } from "next";

import { JournalGridLight } from "@/components/journal/JournalGridLight";

export const metadata: Metadata = {
  title: "Honors Journal — Light Field",
  description:
    "A quiet field of stories from Sun Day Red — scroll to wander, the light follows you.",
};

/* the reference's exact cream — keep iOS bars matched from first paint */
export const viewport: Viewport = { themeColor: "#f1efe7" };

/* design experiment #2: photoyoshi-style ghosted lattice with a
   cursor spotlight (static /journal/alt2 wins over the [slug] route) */
export default function JournalAlt2Page() {
  return <JournalGridLight />;
}
