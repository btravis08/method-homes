import type { Metadata } from "next";

import { MotionProvider } from "@/components/MotionProvider";

/*
  The section library renders real sections, so it needs the app-wide
  motion provider (every section animates through `m.*`). It
  deliberately skips the site chrome — no nav, no footer — so each
  section is seen on its own.
*/
export const metadata: Metadata = {
  title: "Section library",
  robots: { index: false, follow: false },
};

export default function LibraryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <MotionProvider>{children}</MotionProvider>;
}
