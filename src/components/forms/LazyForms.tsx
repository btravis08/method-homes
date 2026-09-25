"use client";

import dynamic from "next/dynamic";

/*
  Forms are interaction-only: their chunk (engine + react-hook-form +
  zod + the definition) must never ride along in a page's initial
  bundle. ssr:false dynamics inside a client module are the only
  pattern that withholds the chunk (see AGENTS.md → Visual editing),
  so render these, never MultiStepForm directly, from page code — and
  mount them only once the form is actually opened (e.g. inside the
  Get Started modal when it opens).
*/

export const LazyIntakeForm = dynamic(
  () => import("./IntakeForm").then((m) => m.IntakeForm),
  { ssr: false },
);

export const LazyMultiStepForm = dynamic(
  () => import("./MultiStepForm").then((m) => m.MultiStepForm),
  { ssr: false },
);
