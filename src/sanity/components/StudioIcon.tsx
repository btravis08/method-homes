/* Workspace icon for the Studio navbar chip and workspace switcher —
   replaces the auto-generated "MH" initials. Renders the supplied
   Method mark verbatim (public/method/brand/method-mark.png, aspect
   preserved) on a dark chip so the light mark stays visible on both
   Studio themes. */
export function StudioIcon() {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "1em",
        height: "1em",
        borderRadius: "0.1875em",
        background: "#111",
        overflow: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/method/brand/method-mark.png"
        alt="Method Homes"
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    </span>
  );
}
