import type { Metadata, Viewport } from "next";

import { PhotoHeader } from "@/components/journal/PhotoHeader";

export const metadata: Metadata = {
  title: "About — Honors Journal",
  description: "The field notes of Sun Day Red.",
};

export const viewport: Viewport = { themeColor: "#f1efe7" };

/*
  The reference's About page, verbatim layout: photo filling the left
  ~43%, cream right column with a small underlined name up top, one
  big grotesque paragraph in the middle, and label/value contact rows
  at the bottom. Mobile stacks the photo above the copy.
*/
export default function JournalAboutPage() {
  return (
    <div
      data-mode="light"
      className="relative w-full bg-[#f1efe7] text-[#252726] md:h-svh md:overflow-hidden"
    >
      <PhotoHeader />
      <div className="flex min-h-svh flex-col md:h-svh md:flex-row">
        <div className="h-[62svh] w-full md:h-full md:w-[43%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/figma/journal/hero-03.jpg"
            alt="Sun Day Red on course"
            fetchPriority="high"
            className="size-full object-cover"
          />
        </div>
        <div className="flex flex-1 flex-col px-6 pb-10 md:px-[6.75rem] md:pb-0">
          <a
            href="/journal"
            className="mt-10 self-start text-[0.8125rem] font-medium underline decoration-1 underline-offset-4 md:mt-[9.375rem]"
          >
            Honors Journal
          </a>
          <p className="my-10 max-w-[37.5rem] text-[1.625rem] font-medium leading-[1.32] md:my-auto md:text-[2.25rem]">
            The Honors Journal collects people, ideas, and culture from Sun
            Day Red — stories from the course, the craft behind the clothes,
            and everything beyond the red.
          </p>
          <div className="grid max-w-[24rem] grid-cols-[9rem_1fr] gap-y-1.5 text-[0.8125rem] font-medium md:mb-[10rem]">
            <span>EMAIL</span>
            <span>mail@sundayred.com</span>
            <span>INSTAGRAM</span>
            <span>@sundayred</span>
          </div>
        </div>
      </div>
    </div>
  );
}
