# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Project: Method Homes (client rebuild on the SDR-derived template)

Method Homes (methodhomes.net, custom/prefab modular builder) rebuilt
on the design-library template scaffolded from btravis08/claude_test:
Next.js 16 (App Router, Turbopack) + Tailwind v4 + Sanity v6 embedded
at /studio, with Motion for interactions. Scaffolded 2026-08-04 by
packages/create-sdr-site (architecture pack skipped in favor of the
real content migration below).

## Working agreements

- Repo btravis08/method-homes, branch `main` only; pushes deploy via
  Vercel to https://method-homes.vercel.app (staging). Never open a
  PR unless asked.
- The site currently wears the TEMPLATE's design system (SDR-derived
  fonts/sections) with Method's real content. The visual rebrand
  happens from Method's own Figma library (below) — match that file
  exactly once it's readable.
- The design system is token-only (see Design tokens). Verify with
  `npm run build` + Playwright before pushing.

## Sanity CMS

- Project `i2wd5pr1` ("Method Homes"), dataset `production`,
  apiVersion 2026-07-01; defaults baked into src/sanity/env.ts. CORS:
  localhost:3000 + method-homes.vercel.app (credentials on).
- Vercel env: SANITY_API_READ_TOKEN (draft preview) and
  SANITY_API_WRITE_TOKEN (forms inbox + A/B logging). The write token
  was also passed as a workflow_dispatch input to import runs —
  rotate at manage.sanity.io if that ever worries anyone.
- Content state (imported from the live site, 2026-08-05): 93+
  `project` docs across categories residential (custom) / predesigned
  / commercial, 182 `post` docs, 24 section-built `page` docs, ~800
  image assets. Deterministic ids: method-project-<slug>,
  method-post-<slug>, method-page-<slug> — NEVER put a dot in an id
  (dots make ids invisible to the published perspective).
- `teamMember` documents (projects module, Team desk list) are
  MANUAL: methodhomes.net publishes no individual roster (verified
  across the full capture).
- Features: commerce OFF, blog + projects ON
  (designops.config.json). Commerce type references
  (product/collection) are feature-gated in the schemas — with the
  flag off they must not exist or schema validation 500s /studio
  (found the hard way on first deploy).

## Content pipeline (methodhomes.net → dataset)

Client's copyrighted content, migrated for the platform rebuild —
staging/design use.

- `scripts/fetch-method-content.mjs` + fetch-method-content.yml
  (workflow_dispatch): crawls the live site on an Actions runner (the
  sandbox cannot reach methodhomes.net — 403s). Resumable across
  passes; stores each page's internal links so later passes re-enqueue
  the frontier; force-refreshes the portfolio indexes; downloads
  imagery AND PDF documents (floor plans). Output:
  design/method-content/pages.json + public/method/<slug>/.
- `scripts/import-method-content.ts` + import-method-content.yml:
  maps the capture into the dataset. Portfolios → projects (specs
  parsed to sqft/bed/bath; /project/* detail pages = featured:true
  with plan PDFs attached), core pages → section-built pages, /blog →
  posts. Idempotent (createOrReplace + filename-deduped uploads) —
  re-run after any new capture pass. Runs in CI with the write token
  as a masked dispatch input, or locally via
  `npx sanity exec scripts/import-method-content.ts --with-user-token`.
- Every remote call retries 4x with backoff (one ECONNRESET killed a
  40-minute run once).

## Design source (Figma) — THE REBRAND

- File `9nqsOUuF2UrgukNYok3Oko` ("[i] Design Library — Method"),
  entry node 31158:18043; designops.figma.fileKey already points at
  it (arms drift-check + comp tooling).
- BLOCKER: the Figma MCP connector (authorized as
  bryce@weareenvoy.com) needs EDIT access to this file — currently
  denied. Once granted: pull variable collections with
  get_variable_defs, map them into src/app/globals.css (replacing the
  SDR-derived palette), export tokens to design/figma-tokens/, run
  `npm run tokens`, swap fonts + Logo, and re-comp the section
  library against Method frames.
- Until the rebrand, fonts are SDR's TRIAL cuts (Feature Deck /
  Maison Neue) — licensing must be resolved before production.

## Ops apparatus

- designops.config.json is the single config seam (site name/URL,
  perf pages, figma key, features).
- Nightly workflows (lighthouse-history, audit, check-links,
  dataset-backup, design-drift) run against method-homes.vercel.app
  and commit status JSONs the Studio Overview reads. They started
  EMPTY at scaffold time — dashboards fill as runs land.
- The Studio: Overview leads the nav; tool panes are plain @sanity/ui
  (lazy-loaded chunks); workspace title reads designops.site.name;
  the Sections tool passes the Studio's scheme + exact background
  into /library so it matches; Calendar day-click creates a dated
  post; the global Create menu is a curated allowlist.
- probe.yml exists for live-response inspection (edit steps per
  question, dispatch, read the log).

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


## Session-history note

This file is the durable memory. The founding session's full history
lives in the Sun Day Red template repo's session (claude.ai/code) —
deep template rationale (perf war stories, design-ops architecture)
is documented in btravis08/claude_test AGENTS.md.
