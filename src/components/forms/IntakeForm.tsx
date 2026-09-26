"use client";

import { useEffect, useState } from "react";

import { hasResumeParam, openResumeFromUrl } from "@/lib/forms/client";
import { intakeForm } from "@/lib/forms/definitions/intake";
import type { ResumePayload } from "@/lib/forms/types";

import { MultiStepForm, type MultiStepFormProps } from "./MultiStepForm";

/*
  The Get Started intake, bound to its definition (loaded via
  LazyIntakeForm). When the page opened from a finish-later link
  (?resume=<token>) the answers are unsealed first and the form mounts
  already restored — defaultValues only apply on mount, so the form
  waits rather than rendering empty and swapping.
*/
export function IntakeForm(props: Omit<MultiStepFormProps, "def">) {
  const [pending, setPending] = useState(() => !props.resume && hasResumeParam());
  const [resume, setResume] = useState<ResumePayload>();

  useEffect(() => {
    if (!pending) return;
    let live = true;
    openResumeFromUrl(intakeForm.id).then((payload) => {
      if (!live) return;
      setResume(payload);
      setPending(false);
    });
    return () => {
      live = false;
    };
  }, [pending]);

  if (pending)
    return (
      <p className={props.className} role="status" aria-live="polite">
        <span className="text-body-md text-ink-2">Restoring your answers…</span>
      </p>
    );

  return <MultiStepForm def={intakeForm} {...props} resume={props.resume ?? resume} />;
}
