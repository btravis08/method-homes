import type { Metadata } from "next";

import { OpenGetStarted } from "@/components/forms/OpenGetStarted";

/*
  /get-started — the intake opens as a sheet over this page as soon as
  it loads (and reopens from the button when closed). Per the IA this
  URL becomes the contact page; until then it is the intake's home so
  links, finish-later emails and shared URLs all land somewhere that
  works.
*/
export const metadata: Metadata = {
  title: "Get started",
  description: "Tell us about your project and we’ll point you to the right path.",
  robots: { index: false },
};

export default function GetStartedPage() {
  return (
    <main className="mx-auto flex min-h-[60svh] w-full max-w-[34rem] flex-col items-center justify-center gap-xl px-xl py-5xl text-center">
      <h1 className="text-title-lg text-ink">Get started</h1>
      <p className="text-body-md text-ink-3">A few quick questions about your project. Two minutes, no commitment.</p>
      <OpenGetStarted />
    </main>
  );
}
