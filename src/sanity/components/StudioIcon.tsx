"use client";

import { useColorSchemeValue } from "sanity";

/* Workspace icon for the Studio navbar chip and workspace switcher —
   replaces the auto-generated "MH" initials. Renders the supplied
   Method mark verbatim (public/method/brand/method-mark.png, aspect
   preserved). The source mark is light-on-transparent, so on the
   light scheme it's CSS-inverted to read dark; the file itself is
   never modified. */
export function StudioIcon() {
  const scheme = useColorSchemeValue();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/method/brand/method-mark.png"
      alt="Method Homes"
      style={{
        width: "1em",
        height: "1em",
        objectFit: "contain",
        display: "block",
        filter: scheme === "light" ? "invert(1)" : "none",
      }}
    />
  );
}
