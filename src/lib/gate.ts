import { createHash } from "node:crypto";

/*
  Gated pages (C1): a page doc with `protected: true` renders a
  passphrase form until the visitor's cookie proves they've entered
  the shared passphrase.

  The cookie stores sha256(slug:passphrase) — never the passphrase
  itself — so editing the passphrase in the Studio invalidates every
  visitor's cookie at once. Server-only: nothing here may be imported
  into client components (the passphrase would end up in a bundle).

  Honest scope note: this is Shopify-style shared-passphrase gating
  for previews and soft launches, not authentication — the dataset's
  public read API can still serve the document to someone who goes
  looking. Real secrets don't belong on gated pages.
*/

export const gateCookieName = (slug: string) =>
  `sdr_gate_${slug.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

export const gateCookieValue = (slug: string, passphrase: string) =>
  createHash("sha256").update(`${slug}:${passphrase}`).digest("hex");

export const GATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // a week
