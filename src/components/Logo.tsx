/*
  SDR "Union" logo mark from Figma (public/figma/union.svg), rendered
  through a CSS mask so it takes the current ink color in any section
  mode. Falls back to invisible until the asset is fetched — run
  scripts/fetch-figma-assets.sh once to populate public/figma/.
*/
export function Logo({
  width = 71,
  height = 23.5,
  className = "",
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <span
      aria-label="Sun Day Red"
      className={`inline-block bg-current ${className}`}
      style={{
        width: `${width / 16}rem`,
        height: `${height / 16}rem`,
        maskImage: "url(/figma/union.svg)",
        maskSize: "100% 100%",
        maskRepeat: "no-repeat",
        WebkitMaskImage: "url(/figma/union.svg)",
        WebkitMaskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
      }}
    />
  );
}
