import type { ReactNode } from "react";

import { AbTracker } from "./AbTracker";

/*
  A/B experiment shell (D1). Cache-safe by construction: every visitor
  receives identical HTML carrying ALL variants; a tiny inline script
  assigns (or reads) the split cookie and stamps data-ab-pick on this
  wrapper synchronously — before the variant markup below it parses —
  so exactly one variant ever paints. No middleware, no per-cookie
  cache fragmentation, no flicker, no CLS.

  The static CSS defaults to the control: visitors without JavaScript
  (and search engines) see variant one. Hidden variants have no layout
  box, so their lazy images never fetch.

  AbTracker (a ~1KB client island) beacons one view per pageview when
  the picked variant scrolls into sight and one conversion on the
  first link/button click inside it.
*/

const COOKIE_PREFIX = "sdr_ab_";

/* runs at HTML parse time, before the variant divs exist */
const assignScript = (exKey: string, variantKeys: string[]) =>
  `(function(){var r=document.currentScript.parentElement,v=${JSON.stringify(
    variantKeys,
  )},n=${JSON.stringify(COOKIE_PREFIX + exKey)},m=document.cookie.match(new RegExp("(?:^|; )"+n+"=([^;]*)")),p=m&&m[1];if(v.indexOf(p)<0){p=v[Math.floor(Math.random()*v.length)];document.cookie=n+"="+p+"; path=/; max-age=2592000; samesite=lax"}r.setAttribute("data-ab-pick",p)})()`;

export function ExperimentSection({
  exKey,
  variants,
}: {
  exKey: string;
  variants: { key: string; node: ReactNode }[];
}) {
  const keys = variants.map((v) => v.key);
  /* control shows unless a different pick is stamped; the rest hide
     unless picked. Attribute selectors, scoped to this experiment. */
  const css = variants
    .map((v, i) =>
      i === 0
        ? `[data-ab-key="${exKey}"][data-ab-pick]:not([data-ab-pick="${v.key}"])>[data-ab-variant="${v.key}"]{display:none}`
        : `[data-ab-key="${exKey}"]:not([data-ab-pick="${v.key}"])>[data-ab-variant="${v.key}"]{display:none}`,
    )
    .join("");

  return (
    <div data-ab-key={exKey} className="w-full">
      <style>{css}</style>
      <script dangerouslySetInnerHTML={{ __html: assignScript(exKey, keys) }} />
      {variants.map((v) => (
        <div key={v.key} data-ab-variant={v.key} className="w-full">
          {v.node}
        </div>
      ))}
      <AbTracker exKey={exKey} />
    </div>
  );
}
