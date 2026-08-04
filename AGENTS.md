<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: Sun Day Red (SDR) design library implementation

An e-commerce-style site implementing the Figma "[i] Design Library — SDR"
exactly: Next.js 16 (App Router, Turbopack) + Tailwind v4 + Sanity v6
embedded at /studio, with Motion (framer-motion) for interactions.

## Working agreements

- Work happens on the session's `claude/*` branch (repo
  btravis08/claude_test). Push every change to BOTH the session
  branch and `main` (`git push origin <branch>:main`) without asking
  — `main` is the deploy branch and Vercel builds it to the staging
  site. Never open a PR unless asked.
- Match the Figma design exactly — don't adapt or reinterpret it.
  GOTCHA: the homepage is the V1 design and stays V1 — the V2 frames
  (hero 33585:48542, full-width 33638:56658) were explicitly rejected
  (2026-08-02). Never rebuild homepage sections toward V2 comps; their
  registry comps are disabled for exactly this reason.
- Verify changes with `npm run build`, then drive the real page (in
  Claude's remote sandbox, Playwright with
  `executablePath: '/opt/pw-browsers/chromium'`) before pushing.
- After every push to `main`, notify the user (PushNotification) once
  the changes reach production. The sandbox cannot observe Vercel
  (egress blocks vercel.app; WebFetch gets 403 from Vercel's bot
  protection; GitHub tools don't expose deploy statuses), so
  time-base it: schedule a `send_later` check-in ~5 min after the
  push, then push-notify that the deploy window has elapsed and the
  changes should be live on sundayred.vercel.app. Batch rapid
  successive pushes into one notification.

## designops.config.json (single source for the ops apparatus)

Every project-specific constant the monitoring/dashboard apparatus
needs lives in `designops.config.json` at the repo root: site name +
base URL, the Lighthouse page list, the Figma file key, audit
breakpoints/bands/history cap, the timed-section exemption list, and
the Overview alert thresholds. The collectors, audit, drift check,
link checker, sitemap, registry, and Studio Overview all read it —
edit the config, never the consumers. This is the portability seam:
pointing this apparatus at a new project starts with this one file.

## Feature modules & the scaffold manifest

The codebase is organized as BASE (pages/sections, navigation,
settings, the design-ops apparatus) plus three feature modules —
commerce, blog, projects — gated by `features` flags in
designops.config.json (they compose the Studio schema + desk;
existing dataset documents are untouched by a flag flip).
`scaffold.manifest.json` maps every file to its module and marks
SDR-only content (legacy page, catalog, figma exports) that a
scaffold replaces with a sample pack — it is the copier spec for the
future create-CLI. When adding files, keep them inside one module's
boundary and list new top-level paths in the manifest.

## CMS roadmap (agreed 2026-08-03 — work top to bottom)

Features from the WordPress/Webflow/Framer comparison, to build in
order. Strike items through as they ship.

- ~~A1 Forms + submissions inbox: formSubmission docs, /api/forms
  (honeypot + rate limit, needs SANITY_API_WRITE_TOKEN in Vercel),
  footer newsletter wired, Studio Submissions view.~~
- ~~A2 Yoast-style SEO editor: seo object (metaTitle/metaDescription
  with counters, ogImage override, noindex, canonical) on
  page/post/product/collection, Studio Google+social preview,
  generateMetadata wiring, robots.ts.~~
- ~~A3 Announcement bar: schedulable, dismissible strip above the nav,
  managed from siteSettings; SSR'd, zero CLS.~~
- ~~B1 Blog completion: RSS, related posts (shared category), post
  tags, paginated category archives.~~
- ~~B2 Content calendar: Studio month-grid tool of posts + scheduled
  releases.~~
- ~~C1 Gated pages: protected flag + shared passphrase on page docs.~~
- ~~D1 A/B section testing (flagship): section variants, cookie split,
  conversion logging, results in the Overview pane — edge-safe split
  that must not break caching or the perf standings.~~
- D2 Localization: field-level i18n + locale routing. Biggest lift;
  only when a real project needs it.

## Design source (Figma)

- File: `CMeh0gCtTQAnIRc9iXjGbr` ("[i] Design Library — SDR"), desktop
  PDP design node `33296:15687` (`device=desktop`, 1440 × ~12700) on
  the "❖ DESIGN" page. (Supersedes the old file
  `0IzKylxJcpsuACWsXu7gnu`, which the current Figma account cannot
  access; old node IDs in git history refer to that file.)
- The PDP node is too large for one `get_design_context` call (the
  response truncates at ~100KB) — pull child sections individually
  (known ids: hero `33298:30429`, about/pairs `33298:29697`, tech
  specs `33298:30224`). Resolved tokens the PDP consumes are saved in
  `design/figma-tokens/pdp-desktop.resolved.tokens.json`; the spacing
  scale + Title Large live in `globals.css` (`--spacing-*`,
  `--text-title-lg`).
- The "❖ DESIGN" page is an empty sidebar header — real frames live
  on "↳ UI Design (WIP)" (page `33184:11289`). Remote `get_metadata`
  doesn't expand children; enumerate via read-only `use_figma`
  scripts instead. PLP ids: section `33195:4082`, device instances
  `33592:53549/53550/53551` (1440/1024/428), Story Card V2 set
  `33795:57807`, Filter+Sort row `33416:33779`, filter modal
  `33453:76463` (applied state `33454:77058`), Filter group set
  `33187:6859`, Load More `33416:34482`, collection landing set
  `33195:4849`.
- Read it through the official Figma MCP connector (claude.ai
  connectors), authorized as bryce@weareenvoy.com (Envoy Group org
  seat). The account needs edit access on a Pro-or-better seat
  (rate limit ~200 tool calls/day, 15/min).
- Exported imagery lives in `public/figma/`. Claude's sandbox egress
  policy blocks figma.com, so new assets are fetched by the
  `fetch-figma-assets` GitHub Actions workflow (mint fresh URLs via the
  MCP `download_assets` tool, update `scripts/fetch-figma-assets.sh`,
  push — the workflow commits the files back).
- Color variables: the Figma variable collection (6 modes) is exported
  to `design/figma-tokens/*.tokens.json`; `src/app/globals.css` maps
  them to the site's section modes (light / light-mid / dark-mid /
  dark — see the mapping comment there). TODO: the Medium Light Mode
  export is missing, so the `light-mid` block is PROVISIONAL — replace
  it when the user exports that mode. Brand Mode Light/Dark exist in
  the exports but aren't wired as section modes. Still to wire:
  `--btn-2-fg`/`--ink-disabled` consumers, tokenize hardcoded on-media
  UI colors (MediaBlock, meganav image card), mode-aware
  FullWidth/50-50 gap color (`bg-white`).

## Sanity CMS

- Project `alsdve2t`, dataset `production`, apiVersion 2026-07-01;
  config in `sanity.config.ts` / `sanity.cli.ts`, schema in
  `src/sanity/schemaTypes/`, GROQ in `src/sanity/lib/queries.ts`.
- Claude's sandbox CANNOT reach *.sanity.io (egress-blocked): pages
  render fallbacks during remote builds, and dataset writes must run on
  the user's machine: `npx sanity exec scripts/seed.ts --with-user-token`
  (idempotent: uploads imagery, creates 120 tagged products, rebuilds
  the "home" page). WARNING: re-seeding OVERWRITES the home page and
  seeded products — never suggest re-running it after the user has
  edited content in the Studio.
- Content model: `page` documents are built from a reorderable
  `sections[]` array (hero, info slider, full width, carousel, 50/50,
  product slider, rich text). Every section has a `colorMode`
  (light/dark) matching the Figma variable modes. Full Width sections
  and 50/50 columns are media blocks (image / shop-the-look with
  product refs / click-to-play video / autoplay video); 50/50 carries
  a ratio (5:4, 1:1, flex = 100vh). New sections arrive pre-filled
  with lorem copy and a placeholder image resolved from the dataset by
  filename (sdr-placeholder.png).
- Commerce model (Shopify-shaped): `product` has status (only Active
  renders), vendor/productType/gender/tags/postedAt, pricing {price,
  compareAtPrice, costPerItem}, options (Color/Size), variants with
  SKU/barcode/tracked inventory + per-variant price overrides and the
  SDR colorway visuals (swatch, image, hoverImage), shipping, SEO, up
  to 6 images (first = card thumbnail, second = hover). `collection`
  is manual (ordered refs) or smart (whitelisted rules compiled to
  parameterized GROQ in `src/sanity/lib/commerce.ts`). `discount`
  mirrors Shopify (code/automatic × percentage/fixed/BOGO/free
  shipping, scheduling, minimums, usage limits); active automatic
  price discounts are applied to displayed card prices (best wins,
  original struck). `storeSettings` singleton = currency/locale +
  display toggles. Sliders source by tag, collection, or manual refs.
  The Studio desk mirrors the Shopify admin sidebar. `navigation`
  singleton = Shopify-style menu (items → dropdown layout: columns +
  collection-fed image card / product grid / image cards; links can
  reference collections); Navigation.tsx falls back to hardcoded
  defaults when the document is missing.
- GOTCHA: `tag` is a reserved Sanity fetch-option name — GROQ params
  use `$productTag`.

## Real product catalog (captured from sundayred.com)

- `design/sdr-catalog/products.json` = the complete live catalog:
  483 colorway captures grouping into 164 products; imagery in
  `public/sdr/<sku>/<n>.jpg` (~435MB, up to 6 shots each, 1200w).
  `urls.json` seeds the crawler; `crawl-debug.json` explains counts.
- `scripts/fetch-sdr-catalog.mjs` (v5) re-captures: seeded, resumable
  (skips what products.json already has), stops after 20 consecutive
  refusals (Akamai rate-limits mid-run) and commits partial progress
  — re-run until converged. Runs on the fetch-sdr-catalog.yml Actions
  workflow (fresh runner IP per run) or the user's machine; the
  sitemap undercounts, so discovery walks category PLPs + an a-z
  search sweep. 14 URLs never capture (11 content pages, 3 that 500).
- Import chain (all idempotent, run with
  `npx sanity exec scripts/<x> --with-user-token` when the Sanity MCP
  is absent): `import-sdr-catalog.ts` (products.json → 164 product
  docs, one variant per colorway, sharp-sampled swatch colors),
  `retire-lorem.ts` (drafts the 120 lorem products),
  `wire-nav-collections.ts` (collections + nav links + chips),
  `fix-catalog-ids.ts` (diagnoses raw-vs-published visibility).
- CRITICAL Sanity rule: document _ids must NEVER contain a dot —
  `sdr.foo` is a path/namespaced id, invisible to the `published`
  perspective the site queries with (Studio still shows it, so the
  break is silent). Catalog ids are `sdr-<slug>`.
- Dataset state: 164 `sdr-*` products + the `product-presidio`
  showcase are Active; lorem `product-seed-*` are Draft; `page-home`
  (slug "home", 9 sections) drives the homepage; collections =
  shop-all + 10 category smarts + gender trees + manual gear sets
  (vessel/headcovers/gloves/bags/on-course/training/summer-picks).
- The Sanity MCP connector (claude.ai) can read AND write the dataset
  when connected — prefer it over user-run scripts; remember MCP
  patches land as drafts and need publish_documents. SDR content is
  TaylorMade's copyrighted material: staging/design use only.

## GitHub Actions = the network escape hatch

- The sandbox cannot reach sundayred.com, *.sanity.io, vercel.app, or
  figma.com — Actions runners can. Workflows live on the repo DEFAULT
  branch `claude/sanity-github-app-setup-x49xa8` (workflow_dispatch
  only registers there) and commit results back to that branch:
  - `lighthouse.yml` → design/perf/lighthouse-mobile.json (mobile
    Lighthouse against production — the perf measurement loop)
  - `probe.yml` → prints curl/grep inspection of live HTML or the
    Sanity API to the job log (edit its steps per question)
  - `fetch-sdr-catalog.yml` / `fetch-figma-assets` → data captures
- Pattern: edit workflow on that branch via a worktree, dispatch via
  the GitHub MCP, read job logs or fetch the committed file. Runner
  queue occasionally starves — re-dispatch rather than wait forever.

## Frontend architecture

- `src/app/globals.css` is the design-token source of truth: semantic
  vars flip per section via `data-mode="light|dark"` wrappers (never
  hardcode mode colors); fluid type interpolates between the Figma
  428px and 1440px frames via clamp() and freezes beyond; the root
  font-size grows past 1920px (`html { font-size: max(100%, 0.83333vw) }`)
  so every rem-based value zooms proportionally on large screens — keep
  layout values in rem (hairline borders stay px on purpose).
- `src/app/(site)/` holds the site routes inside the chrome
  (Navigation + SiteFooter); /studio deliberately renders bare.
- `src/components/home/sections.tsx` = presentational sections with
  Figma content as prop defaults; `SectionRenderer.tsx` maps Sanity
  sections to them; `SliderShell.tsx` = slider chrome (arrows move one
  card width and disable at the ends, MENS/WOMENS filter with staggered
  Motion fade, eased progress bar replacing the scrollbar, arrow-swap
  hover via `ArrowHover.tsx`).
- Slider cards are borderless: the track is a grid with 1px gaps
  (`gap-px`), cards are full-bleed (no horizontal padding), and the
  arrow/snap step measures consecutive slide offsetLefts so it
  includes the gap.
- Brand fonts are self-hosted from `src/fonts/` via next/font/local:
  Feature Deck (display serif, trial cut), Maison Neue Book 400 +
  Medium 500 (Medium carries the label style), Maison Neue Mono
  (unused by default; available through the `font-mono` utility).

## Design tokens (BINDING — the only design vocabulary)

Every design value in this codebase comes from the Figma library.
Build from the tokens; never invent a value, never eyeball a comp.

- **The inventory** is `src/design/tokens.index.json`, generated by
  `npm run tokens` from `design/figma-tokens/*.tokens.json` (the
  Figma variable collection, one export per mode) plus the tokens
  `globals.css` actually defines. Browse it in the Studio under
  **Tokens** — a Figma-Variables-style panel with a row per token, a
  column per mode, and the date each source was last re-exported.
  Re-run `npm run tokens` after any token re-export or globals.css
  token edit, and commit the regenerated files.
- **Color**: only the semantic vars — `--surface`, `--surface-2`,
  `--ink`, `--ink-2`, `--ink-3`, `--ink-disabled`, `--line`,
  `--line-2`, `--wash`, `--btn`, `--btn-fg`, `--btn-2-fg` — through
  their utilities (`bg-surface`, `text-ink`, `border-line`, …). They
  flip per `data-mode="light|light-mid|dark-mid|dark"` wrapper. NEVER
  hardcode a hex/rgb for a themed surface or text color, and never
  pick a mode's literal value to "match" another mode.
- **Spacing**: the named scale (`--spacing-xxs` … `--spacing-11xl`,
  plus `--spacing-section-s|m|l`) via `p-*`, `gap-*`, `m-*`. Arbitrary
  values (`p-[13px]`) are a defect unless the comp value genuinely has
  no token — in which case say so rather than silently inventing one.
- **Type**: the fluid scale only — `text-label-sm|md`,
  `text-body-sm|md`, `text-title-xs|sm|md|lg`,
  `text-headline-sm|md|lg`, `text-display-xl`. Each carries its own
  line-height and tracking; don't override them. Fonts are
  `font-display` (Feature Deck), `font-sans` (Maison Neue),
  `font-mono` — never a raw family.
- **Radius**: `rounded-xs` (the system's only radius).
- **Components**: reuse the built ones (buttons, cards, sliders,
  `ArrowHover`, `SliderShell`) before writing a new variant. A button
  is `bg-btn text-btn-fg` at `h-12 rounded-xs px-[1.125rem]` with the
  `label` utility — match the existing implementations rather than
  restyling.
- Layout values stay in **rem** so the >1920px root-font zoom carries
  them (hairline borders stay px on purpose).

### Working from a Figma link

1. Pull the node with `get_design_context` (and `get_variable_defs`
   for its resolved variables) — never build from a screenshot alone.
2. Read the **Dev Mode annotations** on the node: they carry the
   intent (spacing rationale, responsive behavior, states, motion)
   that the raw geometry doesn't. Treat an annotation as
   specification, and follow it over anything inferred from pixels.
3. Map every value the node reports to its token *before* writing
   code. A raw px/hex from Figma is an input to that lookup, not
   something to paste. If a value maps to no token, flag it —
   it usually means the export is stale (re-export the mode) or the
   design drifted from the library.
4. Match the comp exactly (see Working agreements) — using tokens is
   how you match it, not an excuse to approximate.

### The section library

`/library` is the catalogue of every composable section, rendered
live from the same components production uses (no screenshots to go
stale) — a grid of thumbnails, each opening a preview with color-mode
and breakpoint switching (real iframes, so responsive behavior is
genuine). The Studio embeds the same route as its **Sections** tool.
Entries live in `src/library/registry.tsx`: **add a section there
whenever you build one**, with its Sanity `schemaType` when it's
CMS-composable. The route is noindex and carries no site chrome.

An entry also carries `figmaNodeId` — the section's frame in the
library file, which deep-links the viewer's FIGMA link and is the
node to pull `get_design_context` from when working on that section.
Where a comp has been exported, the viewer's compare bar overlays it
on the live build: OVERLAY ghosts the design over the build, and
DIFFERENCE blends them so a mismatch lights up and a perfect match
goes black, with an opacity slider and 1px nudge to find alignment.
**Diff a section this way before calling it done.**

Adding a comp: mint a render with the Figma MCP `get_screenshot`
(maxDimension 1440 for viewport frames), append a `fetch_jpg
comps/<slug>.jpg <asset-id> 1440` line to
`scripts/fetch-figma-assets.sh`, push, and dispatch the
fetch-figma-assets workflow — it commits the file back. The runner
may lack ImageMagick and commit a near-raw export, so re-compress
with sharp afterwards (q72, ≤1440w) and set the entry's `comp`
dimensions to the render's natural size.

### Checking the result

Load any page with `?inspect=1` (or press **Alt+T**) for the token
inspector — the site's Dev Mode. Hovering an element names the tokens
behind its mode, surface, ink, type style, padding, gaps, and radius,
shades its padding bands, and flags anything that matches no token as
`off-token` in orange. Click to pin a reading, Esc to exit. Sweep a
new section with it before pushing: **no `off-token` readings in work
you ship** unless you can name why. It never loads for visitors (an
`ssr:false` dynamic inside a client gate), so it costs them nothing.

## Performance & motion ground rules (BINDING for all new work)

Hard-won on 2026-07-21/22 (mobile PageSpeed: 18MB → ~800KB payload,
LCP 51.9s → ~3.5s). Every change must keep these true.

Images
- Content imagery is a real `<img loading="lazy" decoding="async">`,
  NEVER a CSS background-image (backgrounds can't lazy-load and hide
  the LCP from the preload scanner). Backgrounds are acceptable only
  for tiny chrome/thumbnails.
- Every Sanity image URL goes through `urlFor()` (src/sanity/lib/
  image.ts) — it appends `auto=format` (AVIF/WebP) globally — with an
  explicit `.width()` sized to the surface (cards 800, PDP hero 1200,
  media 1400–2000). Full-width media adds `srcSet={sanitySrcSet(url)}`.
- Never request the raw asset URL. Never render all variants'
  imagery eagerly — hover images mount only on hover-capable devices
  after pointer entry (see ProductCard).
- Static files in public/ must be compressed before commit (mozjpeg
  q~72–75, ≤1920w; palette PNG for product shots). Nothing over
  ~300KB ships without a reason.

LCP
- The first section's image is eager + `fetchPriority="high"` and
  preloaded from the page (ReactDOM.preload, with imageSrcSet when a
  srcset exists so the browser fetches exactly one candidate).
- NEVER fade in the LCP image itself: an opacity-0 image delays the
  metric. Use the overlay pattern (image at opacity 1 from first
  paint; a surface-colored overlay fades out — AnimatedMedia and the
  PDP hero are the references). Reveal overlays cap at 0.9s (Speed
  Index) even when the scale settle runs longer.

Motion / JS
- Use `m.*` from motion/react under the app-wide
  LazyMotion(domAnimation) provider (MotionProvider). NEVER import
  `motion.*` — one import drags the full runtime back into a chunk.
  Layout animations / drag (domMax features) are not available; FLIP
  and drags are hand-rolled on motion values by design.
- Eases and durations come from src/lib/motion.ts (EASE_OUT,
  EASE_DRAMATIC, EASE_TICK, DUR). No inline bezier arrays. CSS twins
  (cubic-bezier strings in classes) must match the tokens.
- Reveals/entrances are STATE-DRIVEN (`initial={false}` +
  `animate={{...}}` flipped by useInView/IO state), never
  initial/whileInView mount animations — the SPA PageTransition's
  presence context silently suppresses mount animations (recurring
  bug class: frozen opaque overlays). Media inside horizontal rails
  reveals off the rail's `[data-reveal-scope]`, not the clipped slide.
- Expensive startup work (canvas sampling, probes) waits for
  requestIdleCallback. Interaction-only chrome (viewer, cart flyout)
  loads via next/dynamic ssr:false client wrappers.
- NO lazy-hydration hacks (dangerouslySetInnerHTML adoption): React
  19 responds to the mismatch with a full client re-render, which
  breaks FrozenRouter and freezes reveals. `cv-auto`
  (content-visibility) on below-fold sections is the approved
  render-cost tool.
- Route scroll resets go through Lenis (`lenis.scrollTo`), never bare
  window.scrollTo — Lenis overrides it next frame.
- Effect dependencies must be identity-stable. An effect keyed on an
  array/object rebuilt every render re-fires after EVERY render —
  wasted work always, and under Next's transition-based router
  features it can silently block navigation (found via ProductHero's
  decode probe keyed on `[slides]`; fixed by keying on
  `slides.join("|")`). When touching effects on PDP/shared
  components, Playwright-verify "click a Link → pathname changes".
- PPR / Cache Components (`cacheComponents: true`) was shipped
  2026-07-23 (commit 682b6a8) and REVERTED same day — it hurt the
  PageSpeed standings. If retrying: the commit has the full recipe
  (sanityFetch as the `use cache` boundary with errors caught INSIDE
  the cached scope, Suspense holes for Navigation/PageTransition
  because usePathname is runtime data on dynamic-param routes, no
  route segment configs) — but measure with lighthouse.yml before
  keeping it.

Visual editing / draft preview (Presentation tool)
- Draft mode = the Studio's Presentation preview. The published path
  must never change behavior or gain bytes from preview features.
  PROOF, not assumption: fingerprint the non-draft network waterfall
  for preview/loader code after touching this area.
- Next preloads every statically-analyzable client reference of a
  page — even conditionally rendered ones. The ONLY form that
  withholds a chunk is an ssr:false dynamic inside a client gate
  (PreviewGate; LazyCartFlyout pattern). Static imports, server-side
  next/dynamic, and branch-local await import() all shipped the
  loader library to visitors.
- Instant (pre-save) editing: PagePreview/ProductPreview shells
  render the SAME components from @sanity/react-loader useQuery +
  useLiveMode (client:false — the browser never holds a token).
  SectionList is the client-safe twin of SectionRenderer's switch:
  KEEP THEM IN SYNC. Card math lives in src/sanity/lib/cards.ts
  (client-safe, no fetch imports) — SectionRenderer re-exports it.
- Refresh-mode surfaces (collections) rely on LiveVisualEditing: the
  next-sanity default refresh handler deliberately IGNORES mutations
  — a custom refresh prop calling router.refresh() is required.
- FrozenRouter (PageTransition) eats router.refresh() — draft mode
  renders WITHOUT the transition wrapper ((site)/layout).
- Stega is enabled ONLY on the copy-field allowlist in client.ts:
  encoding corrupts strings compared to literals or rendered into
  attributes (colorMode → data-mode selectors, mediaKind/ratio).
- The draft-mode enable route must read the preview secret with
  useCdn:false — the CDN is too stale to see a secret created
  milliseconds ago ("Invalid secret", stuck handshake).

GROQ / data
- GROQ comments are `//` ONLY. A `/* */` inside a query string fails
  silently site-wide (every fetch falls back — the site looks like
  the no-CMS demo). If prod ever shows fallback content with a
  healthy dataset, suspect a query syntax error first.
- Keep card projections slim: sliderProductFields carries no
  sku/inventory (PDP-only fields live in the PDP query).

Verification (before pushing perf-relevant work)
- `npm run build` + drive the real pages with Playwright locally
  (chromium at /opt/pw-browsers/chromium); remember localhost renders
  CMS-less fallbacks — CMS-path bugs only reproduce on prod.
- Measure prod from the workflow branch's GitHub Actions:
  `lighthouse.yml` commits design/perf/lighthouse-mobile.json;
  `probe.yml` greps live HTML (product hrefs, image URLs). The
  sandbox cannot reach vercel.app/sanity.io — runners can.

## Deployment (Vercel staging)

- The repo deploys on Vercel via the GitHub integration: pushes to
  `main` build automatically and go live on the project's
  `*.vercel.app` domain (the staging site); every other branch gets a
  preview deployment URL on push.
- No env vars are required — the Sanity project id/dataset default in
  `src/sanity/env.ts` (`NEXT_PUBLIC_SANITY_PROJECT_ID` /
  `NEXT_PUBLIC_SANITY_DATASET` override them if ever needed). Node is
  pinned to 22.x via package.json engines.
- The embedded Studio (/studio) on the deployed domain needs that
  domain added to the Sanity project's CORS origins (with
  credentials) at manage.sanity.io → API.

## Verification recipes (sandbox)

- Browser checks: playwright-core with
  `executablePath: "/opt/pw-browsers/chromium"`; mobile context =
  428x926, isMobile + hasTouch. Wait on "domcontentloaded" + a
  poll/selector — NOT "networkidle" (long-lived requests hang it).
  After `npm ci`, reinstall with `npm install --no-save playwright-core`.
- `npm start` serves the LAST build — always `npm run build` first,
  and kill the old server (`pkill -f next-server`; the command kills
  its own shell too, so expect exit 144 and run it alone) or the
  stale instance keeps port 3000 and you verify old code.
- Localhost renders CMS-less fallbacks everywhere (Sanity is
  egress-blocked): fallback home/PLP/PDP prove component behavior but
  NOT data wiring — CMS-path bugs only reproduce on production
  (verify via probe.yml).
- Animation verification is numeric: measure computed opacity /
  transforms / scrollLeft frame-by-frame in page.evaluate rather than
  eyeballing screenshots (e.g. slider settles to scrollLeft % step
  === 0; overlay opacity reaches 0; hero <img> opacity is 1 at first
  paint).
- iOS-specific behaviors that CANNOT be reproduced in sandbox
  Chromium (snap engine fights, momentum event silence, SVG
  transform-origin) are documented inline where they were fought:
  SliderShell (hand-rolled touch paging — touch-action pan-y, one
  card per flick), MenuX (HTML bars, not SVG), AnimatedMedia/
  ProductHero (state-driven reveals). Change those with care and
  have the user re-test on device.

## Local dev (user's machine)

Two terminals: one runs `npm run dev` (localhost:3000), the other runs
git/seeds. Restart the dev server after dependency or Sanity schema
changes. Node >= 22.12 required (Sanity CLI).
