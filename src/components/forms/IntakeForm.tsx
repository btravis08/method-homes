"use client";

import { intakeForm } from "@/lib/forms/definitions/intake";

import { MultiStepForm, type MultiStepFormProps } from "./MultiStepForm";

/* the Get Started intake, bound to its definition (loaded via LazyIntakeForm) */
export function IntakeForm(props: Omit<MultiStepFormProps, "def">) {
  return <MultiStepForm def={intakeForm} {...props} />;
}
