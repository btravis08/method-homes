import type { Attribution } from "./types";

/*
  First-touch attribution: the UTM tags and external referrer of the
  visit that LANDED on the site, kept for the session so a lead that
  converts three pages later is still credited to the ad or article
  that brought it. Captured once per session by <AttributionCapture/>;
  read by the form engine at submit time. sessionStorage can throw
  (private mode, blocked storage) — every access is guarded.
*/
const KEY = "mh:attribution";
const UTM: [string, keyof Attribution][] = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_term", "utmTerm"],
  ["utm_content", "utmContent"],
];

export function captureAttribution() {
  try {
    if (sessionStorage.getItem(KEY)) return;
    const url = new URL(window.location.href);
    const a: Attribution = { landingPage: url.pathname };
    for (const [param, key] of UTM) {
      const v = url.searchParams.get(param);
      if (v) a[key] = v.slice(0, 120);
    }
    const ref = document.referrer;
    if (ref && new URL(ref).host !== url.host) a.referrer = ref.slice(0, 300);
    sessionStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* storage unavailable — attribution is best-effort */
  }
}

export function readAttribution(): Attribution | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : undefined;
  } catch {
    return undefined;
  }
}
