import { defineEnableDraftMode } from "next-sanity/draft-mode";

import { readToken } from "@/sanity/env";
import { client } from "@/sanity/lib/client";

/* The Studio's Presentation tool opens the site through this route:
   next-sanity validates the request came from a Studio with access to
   the project (using the Viewer token), turns Next draft mode on, and
   redirects into the page being previewed.

   useCdn:false is REQUIRED here: this route reads back the one-time
   preview secret the Studio just created in the dataset. The base
   client uses the CDN (≤60s stale), which won't have a secret born
   milliseconds ago — so the read fails, the route returns "Invalid
   secret", never redirects, and Presentation shows "Unable to
   connect". Reading live fixes the handshake. */
export const { GET } = defineEnableDraftMode({
  client: client.withConfig({ token: readToken, useCdn: false }),
});
