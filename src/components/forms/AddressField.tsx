"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";

import type { AddressPart, Answers, FieldDef } from "@/lib/forms/types";

/*
  Address input with place autocomplete. With NEXT_PUBLIC_MAPBOX_TOKEN
  set it queries Mapbox Geocoding v6 (forward, autocomplete, US + CA)
  as the visitor types and, on pick, writes the formatted address plus
  the structured parts the field declares (city, state, postal, lat,
  lng) into their hidden sibling answers. Without a token it is a plain
  text input — the form never depends on the geocoder.

  A native <input> registered with react-hook-form, so the value flows
  through the same validation as any text field; the suggestion list is
  a listbox driven from the input (ArrowUp/Down, Enter, Escape).
*/

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
export const ADDRESS_LOOKUP_ENABLED = Boolean(TOKEN);

interface Suggestion {
  id: string;
  label: string;
  parts: Partial<Record<AddressPart, string>>;
}

interface MapboxFeature {
  id: string;
  properties?: {
    full_address?: string;
    name?: string;
    context?: {
      address?: { name?: string };
      street?: { name?: string };
      place?: { name?: string };
      region?: { name?: string; region_code?: string };
      postcode?: { name?: string };
      country?: { name?: string; country_code?: string };
    };
    coordinates?: { longitude?: number; latitude?: number };
  };
  geometry?: { coordinates?: [number, number] };
}

function toSuggestion(f: MapboxFeature): Suggestion | undefined {
  const p = f.properties ?? {};
  const c = p.context ?? {};
  const label = p.full_address ?? p.name;
  if (!label) return undefined;
  const [lng, lat] = f.geometry?.coordinates ?? [p.coordinates?.longitude, p.coordinates?.latitude];
  return {
    id: f.id,
    label,
    parts: {
      street: c.address?.name ?? c.street?.name,
      city: c.place?.name,
      state: c.region?.name,
      postal: c.postcode?.name,
      country: c.country?.country_code?.toUpperCase(),
      lat: typeof lat === "number" ? lat.toFixed(6) : undefined,
      lng: typeof lng === "number" ? lng.toFixed(6) : undefined,
    },
  };
}

async function lookup(query: string, signal: AbortSignal): Promise<Suggestion[]> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", query);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("country", "us,ca");
  url.searchParams.set("types", "address,street,place,locality,postcode");
  url.searchParams.set("limit", "5");
  url.searchParams.set("access_token", TOKEN!);
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: MapboxFeature[] };
  return (data.features ?? []).map(toSuggestion).filter((s): s is Suggestion => Boolean(s));
}

export function AddressField({
  field,
  register,
  setValue,
  id,
  className,
  invalid,
  describedBy,
}: {
  field: FieldDef;
  register: UseFormRegister<Answers>;
  setValue: UseFormSetValue<Answers>;
  id: string;
  className: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const listId = useId();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abort = useRef<AbortController>(undefined);
  const reg = register(field.name);

  /* cancel in-flight work on unmount */
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      abort.current?.abort();
    },
    [],
  );

  const clearParts = () => {
    for (const key of Object.values(field.addressParts ?? {})) if (key) setValue(key, undefined);
  };

  const search = (q: string) => {
    clearTimeout(timer.current);
    abort.current?.abort();
    if (q.trim().length < 3) {
      setItems([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const found = await lookup(q, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setItems(found);
        setOpen(found.length > 0);
        setActive(-1);
      } catch {
        /* aborted or offline — the field still works as plain text */
      }
    }, 250);
  };

  const pick = (s: Suggestion) => {
    setValue(field.name, s.label, { shouldDirty: true, shouldValidate: false });
    for (const [part, key] of Object.entries(field.addressParts ?? {}) as [AddressPart, string][]) {
      if (key) setValue(key, s.parts[part]);
    }
    setItems([]);
    setOpen(false);
    setActive(-1);
  };

  const input = (
    <input
      id={id}
      type="text"
      autoComplete={ADDRESS_LOOKUP_ENABLED ? "off" : (field.autoComplete ?? "street-address")}
      maxLength={field.maxLength}
      placeholder={field.placeholder}
      className={className}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      {...(ADDRESS_LOOKUP_ENABLED
        ? {
            role: "combobox" as const,
            "aria-autocomplete": "list" as const,
            "aria-expanded": open,
            "aria-controls": listId,
            "aria-activedescendant": active >= 0 ? `${listId}-${active}` : undefined,
          }
        : {})}
      {...reg}
      onChange={(e) => {
        void reg.onChange(e);
        if (!ADDRESS_LOOKUP_ENABLED) return;
        clearParts();
        search(e.target.value);
      }}
      onBlur={(e) => {
        void reg.onBlur(e);
        /* let a click on a suggestion land first */
        setTimeout(() => setOpen(false), 120);
      }}
      onKeyDown={(e) => {
        if (!open) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive((i) => Math.min(items.length - 1, i + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive((i) => Math.max(-1, i - 1));
        } else if (e.key === "Enter" && active >= 0) {
          e.preventDefault();
          pick(items[active]);
        } else if (e.key === "Escape") {
          setOpen(false);
        }
      }}
    />
  );

  if (!ADDRESS_LOOKUP_ENABLED) return input;

  return (
    <div className="relative">
      {input}
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-10 mt-xs flex flex-col overflow-hidden rounded-xs border border-line bg-surface shadow-sm"
        >
          {items.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-xl py-md text-body-md text-ink ${i === active ? "bg-wash" : "hover:bg-wash"}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
            >
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
