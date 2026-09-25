"use client";

import type { UseFormRegister } from "react-hook-form";

import type { Answers, FieldDef } from "@/lib/forms/types";

/*
  One renderer per field type, token-styled (no raw colors — error
  state is carried by ink weight + text, not a hue the palette doesn't
  own). Every control is a native input so browser autofill, keyboard
  and screen-reader behavior come for free; RHF only registers them.
*/

const INPUT =
  "h-12 w-full rounded-xs border border-line bg-surface px-xl text-body-md text-ink outline-none transition-colors placeholder:text-ink-3 focus-visible:border-ink aria-[invalid=true]:border-ink";
const OPTION =
  "flex min-h-12 cursor-pointer items-center gap-lg rounded-xs border border-line bg-surface px-xl py-lg text-body-md text-ink transition-colors hover:border-ink-3 has-[:checked]:border-ink has-[:checked]:bg-wash has-[:focus-visible]:border-ink";
const CONTROL = "size-4 shrink-0 accent-ink";

export function Field({
  field,
  register,
  error,
  idPrefix,
  hideLabel,
}: {
  field: FieldDef;
  register: UseFormRegister<Answers>;
  error?: string;
  idPrefix: string;
  /* a step with a single question uses the step title as its label */
  hideLabel?: boolean;
}) {
  if (field.type === "hidden") return null;

  const id = `${idPrefix}-${field.name}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [field.hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  const aria = { "aria-invalid": error ? true : undefined, "aria-describedby": describedBy };
  const labelClass = hideLabel ? "sr-only" : "text-body-sm text-ink";

  const hint = field.hint ? (
    <p id={hintId} className="text-body-sm text-ink-3">
      {field.hint}
    </p>
  ) : null;
  const err = error ? (
    <p id={errorId} role="alert" className="text-body-sm font-medium text-ink">
      {error}
    </p>
  ) : null;

  if (field.type === "radio" || field.type === "checkbox") {
    return (
      <fieldset className="flex flex-col gap-md" {...aria}>
        <legend className={`${labelClass} mb-md`}>
          {field.label}
          {field.required && !hideLabel ? <span aria-hidden="true"> *</span> : null}
        </legend>
        {hint}
        <div className="flex flex-col gap-md">
          {field.options?.map((o) => (
            <label key={o.value} className={OPTION}>
              <input
                type={field.type}
                value={o.value}
                className={CONTROL}
                {...register(field.name)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        {err}
      </fieldset>
    );
  }

  if (field.type === "consent") {
    return (
      <div className="flex flex-col gap-md">
        <label className={OPTION}>
          <input type="checkbox" className={CONTROL} {...register(field.name)} {...aria} />
          <span>{field.label}</span>
        </label>
        {hint}
        {err}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      <label htmlFor={id} className={labelClass}>
        {field.label}
        {field.required && !hideLabel ? <span aria-hidden="true"> *</span> : null}
      </label>
      {hint}
      {field.type === "select" ? (
        <select id={id} className={`${INPUT} appearance-none`} defaultValue="" {...aria} {...register(field.name)}>
          <option value="" disabled>
            Select one…
          </option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          id={id}
          rows={5}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          className={`${INPUT} h-auto py-lg`}
          {...aria}
          {...register(field.name)}
        />
      ) : (
        <input
          id={id}
          type={field.type}
          inputMode={field.type === "tel" ? "tel" : field.type === "email" ? "email" : undefined}
          autoComplete={field.autoComplete}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          className={INPUT}
          {...aria}
          {...register(field.name)}
        />
      )}
      {err}
    </div>
  );
}
