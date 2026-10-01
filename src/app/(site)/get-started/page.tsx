import type { Metadata } from "next";

import { OpenGetStarted } from "@/components/forms/OpenGetStarted";
import { JsonLd, webPage } from "@/components/seo/JsonLd";
import { seoMeta } from "@/sanity/lib/seo";

/*
  /get-started — the intake opens as a sheet over this page as soon as
  it loads (and reopens from the button when closed). Per the IA this
  URL becomes the contact page; until then it is the intake's home so
  links, finish-later emails and shared URLs all land somewhere that
  works.
*/
const DESCRIPTION = "Tell us about your project — site, timeline, size and budget — and we’ll point you to the Method series or custom path that fits.";
export const metadata: Metadata = {
  ...seoMeta({ title: "Get started", description: DESCRIPTION, path: "/get-started" }),
  robots: { index: false },
};

export default function GetStartedPage() {
  return (
    <main className="mx-auto flex min-h-[60svh] w-full max-w-[34rem] flex-col items-center justify-center gap-xl px-xl py-5xl text-center">
      <JsonLd data={webPage({ type: "ContactPage", name: "Get started", description: DESCRIPTION, path: "/get-started" })} />
      <h1 className="text-title-lg text-ink">Get started</h1>
      <p className="text-body-md text-ink-3">A few quick questions about your project. Two minutes, no commitment.</p>
      <OpenGetStarted />
    </main>
  );
}
