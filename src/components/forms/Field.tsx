"use client";

import type { UseFormRegister, UseFormSetValue } from "react-hook-form";

import type { Answers, FieldDef, FieldOption } from "@/lib/forms/types";

import { AddressField } from "./AddressField";

/*
  One renderer per field type, token-styled (no raw colors — error
  state is carried by ink weight + text, not a hue the palette doesn't
  own). Every control is a native input so browser autofill, keyboard
  and screen-reader behavior come for free; RHF only registers them.

  Option groups follow the Figma intake: bordered rows (two columns
  when every label is short), image-background cards for the branch
  choice, and thumbnail rows for the series pick. Selection is a 2px
  ink outline — never a hue.
*/

const INPUT =
  "h-12 w-full rounded-xs border border-line bg-surface px-xl text-body-md text-ink outline-none transition-colors placeholder:text-ink-3 focus-visible:border-ink aria-[invalid=true]:border-ink";
const OPTION =
  "relative flex min-h-16 cursor-pointer items-center gap-lg rounded-xs border border-line bg-surface px-xl py-lg text-body-md text-ink transition-colors hover:border-ink-3 has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-inset has-[:checked]:ring-ink has-[:focus-visible]:border-ink";
const CONTROL = "size-5 shrink-0 accent-ink";

/* two columns when the labels are short enough not to wrap awkwardly */
const twoColumns = (options: FieldOption[] = []) =>
  options.length > 1 && options.every((o) => o.label.length <= 16);

export function Field({
  field,
  register,
  setValue,
  options = field.options ?? [],
  error,
  idPrefix,
  hideLabel,
}: {
  field: FieldDef;
  register: UseFormRegister<Answers>;
  setValue: UseFormSetValue<Answers>;
  /* resolved choices (optionsOf) — dynamic fields differ from field.options */
  options?: FieldOption[];
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
  const labelClass = hideLabel ? "sr-only" : "text-body-md text-ink";

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
    const layout = field.layout ?? "list";
    const control = (o: FieldOption, extra?: string) => (
      <input type={field.type} value={o.value} className={`${CONTROL} ${extra ?? ""}`} {...register(field.name)} />
    );
    return (
      <fieldset className="flex flex-col gap-md" {...aria}>
        <legend className={`${labelClass} mb-md`}>
          {field.label}
          {field.required && !hideLabel ? <span aria-hidden="true"> *</span> : null}
        </legend>
        {hint}
        {layout === "cards" ? (
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
            {options.map((o) => (
              <label
                key={o.value}
                className="group relative flex aspect-[9/5] cursor-pointer items-end overflow-hidden rounded-xs border border-line bg-surface-2 text-body-md font-medium text-white has-[:checked]:border-ink has-[:checked]:ring-2 has-[:checked]:ring-inset has-[:checked]:ring-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ink sm:aspect-square"
              >
                {o.image ? (
                  <img
                    src={o.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : null}
                <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
                <span className="relative flex w-full items-center justify-between gap-lg px-xl py-lg">
                  <span>{o.label}</span>
                  {control(o, "accent-white")}
                </span>
              </label>
            ))}
          </div>
        ) : layout === "media" ? (
          <div className="flex flex-col gap-md">
            {options.map((o, i) => [
              o.group && options[i - 1]?.group !== o.group ? (
                <p key={`g-${o.group}`} className={`label text-ink-3 ${i ? "mt-xl" : ""}`}>
                  {o.group}
                </p>
              ) : null,
              <label key={o.value} className={`${OPTION} p-lg`}>
                {o.image ? (
                  <img
                    src={o.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-[4.5rem] shrink-0 rounded-xs bg-surface-2 object-cover"
                  />
                ) : null}
                <span className="flex min-w-0 flex-1 flex-col gap-xs">
                  {o.eyebrow ? <span className="label text-ink-3">{o.eyebrow}</span> : null}
                  <span className="font-medium">{o.label}</span>
                  {o.meta ? <span className="text-body-sm text-ink-3">{o.meta}</span> : null}
                </span>
                {control(o)}
              </label>,
            ])}
          </div>
        ) : (
          <div className={`grid gap-md ${twoColumns(options) ? "grid-cols-2" : "grid-cols-1"}`}>
            {options.map((o) => (
              <label key={o.value} className={OPTION}>
                <span className="flex-1">{o.label}</span>
                {control(o)}
              </label>
            ))}
          </div>
        )}
        {err}
      </fieldset>
    );
  }

  if (field.type === "consent") {
    return (
      <div className="flex flex-col gap-md">
        <label className="flex cursor-pointer items-center gap-lg py-md text-body-md text-ink">
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
      {field.type === "address" ? (
        <AddressField
          field={field}
          register={register}
          setValue={setValue}
          id={id}
          className={INPUT}
          invalid={Boolean(error)}
          describedBy={describedBy}
        />
      ) : field.type === "select" ? (
        <select id={id} className={`${INPUT} appearance-none`} defaultValue="" {...aria} {...register(field.name)}>
          <option value="" disabled>
            Select one…
          </option>
          {options.map((o) => (
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
