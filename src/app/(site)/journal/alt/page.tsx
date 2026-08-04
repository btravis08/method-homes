import type { Metadata, Viewport } from "next";

import { JournalGrid } from "@/components/journal/JournalGrid";

export const metadata: Metadata = {
  title: "Honors Journal — Field",
  description:
    "An infinite drag-anywhere field of stories from Sun Day Red.",
};

/* iOS tints its bars from theme-color — declared server-side so the
   field never flashes white chrome before hydration */
export const viewport: Viewport = { themeColor: "#0b0b0b" };

/* design experiment: the journal as an infinite draggable masonry
   field (static /journal/alt wins over the [slug] article route) */
export default function JournalAltPage() {
  return <JournalGrid />;
}
