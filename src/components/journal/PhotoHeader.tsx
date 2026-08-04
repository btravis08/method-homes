"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
  The photoyoshi header, verbatim: small mark top left (24/30), and
  "Work, About" top right in 14px grotesque — the current page's link
  carries a persistent underline. These two routes hide the site's
  standard chrome entirely.
*/
export function PhotoHeader() {
  const pathname = usePathname();
  const onWork = pathname === "/journal/alt2";
  const link = (active: boolean) =>
    `decoration-1 underline-offset-4 hover:underline ${active ? "underline" : ""}`;
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex items-start justify-between px-6 pt-6 text-[#252726]">
      <Link href="/journal/alt2" aria-label="Honors Journal">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/figma/journal/hj-monogram.svg"
          alt=""
          className="h-7 w-auto"
        />
      </Link>
      <nav className="flex items-baseline text-[0.875rem] font-medium leading-none">
        <Link href="/journal/alt2" className={link(onWork)}>
          Work
        </Link>
        <span>,&nbsp;</span>
        <Link href="/journal/alt2/about" className={link(!onWork)}>
          About
        </Link>
      </nav>
    </header>
  );
}
