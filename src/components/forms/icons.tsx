import type { SVGProps } from "react";

/* Icons from the Method Figma library (Untitled UI set), exported as
   SVG strings and drawn in currentColor so they take the ink token */

/* "arrow-left" — 24 × 24, 2px stroke */
export function ArrowLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M19 12H5M12 5L5 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* "x-close" — 20 × 20, 1.67px stroke */
export function XClose(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
