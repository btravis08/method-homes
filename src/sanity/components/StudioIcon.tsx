"use client";

import { useColorSchemeValue } from "sanity";

/* Workspace icon for the Studio navbar chip and workspace switcher —
   replaces the auto-generated "MH" initials. Renders the supplied
   Method mark verbatim (public/method/brand/method-mark.png, aspect
   preserved). Fills the media slot (1em fallback for inline
   contexts); the source canvas carries transparent padding, so a
   presentational scale zooms the mark to sit comfortably in the
   chip. Light scheme inverts via CSS; the file is never modified. */
export function StudioIcon() {
  const scheme = useColorSchemeValue();
  return (
    <span
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        minWidth: "1em",
        minHeight: "1em",
        overflow: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/method/brand/method-mark.png"
        alt="Method Homes"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
          transform: "scale(1.35)",
          filter: scheme === "light" ? "invert(1)" : "none",
        }}
      />
    </span>
  );
}
