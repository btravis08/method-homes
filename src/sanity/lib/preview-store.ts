import { createQueryStore } from "@sanity/react-loader";

/*
  Loader store for DRAFT-MODE preview rendering only. Inside the
  Studio's Presentation tool, useLiveMode connects the page to the
  Studio over a message channel — edits stream into useQuery results
  BEFORE they save, which is what makes the preview feel instant.

  client:false — the browser never talks to the Sanity API directly
  (and never holds a token): initial data comes from the server render,
  live updates come from the Studio channel. Outside Presentation the
  page simply renders the initial data.

  This module is only imported by preview components, which only render
  in draft mode — none of it reaches the production bundle.
*/
export const { useQuery, useLiveMode } = createQueryStore({
  client: false,
  ssr: true,
});
