# Method Homes rebuild — project log

The permanent record of decisions, what shipped, what is still owed
and by whom, and the identifiers needed to pick the work back up.
AGENTS.md holds the *rules*; this file holds the *history and the
open ledger*. Append, don't rewrite: new entries go at the top of
each section with their date. (Started 2026-10-03 at Bryce's request
after the author-schema play was flagged late.)

Companion documents: `docs/LAUNCH-PLAN.md` (the marching orders:
every workstream, gate and stage from Dev to Launch — the file to
check designs and builds against) · `docs/SEO-PLAN.md` (the
2026-08-05 audit-driven SEO plan, phased) · `docs/PLAYBOOK.md`
(performance/engineering rules) · AGENTS.md (binding working
agreements).

---

## 1. Open inputs needed from Bryce / Method

Nothing below can be finished by code alone. Each unblocks a shipped
feature.

| # | Input | Unblocks | Where it goes |
|---|---|---|---|
| 1 | **Author roster**: 3–5 real people (name, role, credentials, portrait, 2–3 sentence bio, LinkedIn/AIA profile URLs) + confirmation of the organization byline name | Author pages, bylines on 182 posts (Authority gate ≥80%), Person schema | Studio → Authors |
| 2 | **Site Settings NAP**: street address, city, state, ZIP, phone, email — exactly as written on Google Business Profile | Organization/LocalBusiness schema, footer, llms-full.txt | Studio → Site settings |
| 3 | **Official profiles (sameAs)**: Google Business Profile URL, LinkedIn, Instagram, Houzz, Facebook, YouTube, Wikidata if any | Entity resolution (Organization.sameAs) | Studio → Site settings → Official profiles (fallback: designops.config.json aeo.organization.sameAs) |
| 4 | **Founding year**: 2007 or 2008? Site copy and keyMessages say 2007; the old site's SEO plan recorded 2008 | Organization.foundingDate (currently "2007") | designops.config.json aeo.organization.foundingDate + SEO-PLAN.md |
| 5 | **Series facts**: beds / baths / sq ft / module count / starting price (or price band) per series (Elemental, Option, Cabin, M, Paradigm, Method One) | Series pages' {facts} placeholders, Product/House schema per series, Pricing page, comparison pages | Sanity (series content, when the series doc type lands) |
| 6 | **Project case-study facts** for the 8–12 flagship projects: series, modules, contract-to-keys months, cost band (with client consent), town coordinates, brief, approach, a named testimonial with rating and date | Case studies + House/Review schema + AggregateRating (needs ≥3 ratings) | Studio → Projects → new fields |
| 7 | **Search Console access**: service-account JSON + property URL as Actions secrets `GSC_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL` | "Questions people already ask" panel → FAQ brief | GitHub → repo Secrets |
| 8 | **Press list**: publications, dates, URLs of existing coverage; press contact | Press page (Figma 37513:8922), citations | Studio (press doc type to add) |
| 9 | **Plan PDFs** per series/project, cleared for public download | Crawlable plan documents on project/series pages | Studio → Projects → Floor plans & documents |
| 10 | **Vercel env**: `SANITY_API_WRITE_TOKEN`, `RESEND_API_KEY` etc. per AGENTS.md Forms section | Forms inbox, resume-by-email | Vercel project settings |

---

## 2. AEO plays — status ledger (2026-10-03)

Ten plays identified after the author-page decision. "Code" = shipped
in this repo; "Content" = needs words/facts (owner Method); "Ops" =
needs an account or secret.

| # | Play | Status | Shipped where | Still owed |
|---|---|---|---|---|
| 1 | Structured data for the designed sections | **Code shipped** | `sectionFaq` type + `Faq` component (details/summary, H3 questions) → FAQPage JSON-LD pooled per page; BreadcrumbList on CMS pages, projects, journal posts/categories; ItemList on /projects; `JsonLd.tsx` helpers (`breadcrumbList`, `faqPage`, `itemList`, `updatedLabel`) | HowTo on the Process page (needs the step copy); Product/House per series (needs series facts, input 5); ProfilePage on author pages (needs the route) |
| 2 | Search Console questions → FAQ source | **Code shipped, Ops pending** | `scripts/aeo-queries.mjs` (service-account JWT, 90-day query+page report, question regex) → `src/design/aeo.queries.json`; aeo.yml step; AEO pane panel "Questions people already ask" with per-page FAQ brief | Input 7 (secrets). Panel shows setup steps until then |
| 3 | Visible dated freshness + dateModified | **Code shipped** | CMS pages, project pages and posts render "Updated {Month YYYY}" (`<time>`; posts only when the publish month differs) and emit dateModified from `_updatedAt` | — |
| 4 | Named reviews with Review/AggregateRating | **Code shipped, Content pending** | `project.testimonial` {quote, clientName, clientDetail, date, rating} → quoted on the page + Review on the House (itemReviewed = Organization); site layout computes Organization.aggregateRating from all published ratings once ≥3 exist | Input 6 (real testimonials). Rule: never type a rating by hand; it is always computed |
| 5 | Entity consistency (Organization.sameAs, NAP, founding) | **Code shipped, Content pending** | Site Settings gained city/region/postalCode/sameAs; Organization emits structured PostalAddress, foundingDate (2007), foundingLocation (Seattle), sameAs (settings win over config) | Inputs 2, 3, 4. Then GBP ↔ site ↔ profiles must read identically |
| 6 | Comparison pages | **Design done, Content pending** | Figma: Prefab 101 "Three kinds of prefab" (37523:15844), Compare table (37507:3753), tracked competitor prompt in aeo.prompts | Write /prefab-101 comparison copy (modular vs panelized vs manufactured; prefab vs site-built cost/timeline; Method vs named competitors only with sourced facts). Each gets a FAQ section |
| 7 | Project pages as case studies | **Code shipped, Content pending** | `project` gained series, modules, timelineMonths, costBand, geo, challenge, approach, testimonial, plan files; detail page renders a 10-fact strip, brief/approach, testimonial, plans, House JSON-LD (geo, additionalProperty, review) | Input 6 for 8–12 flagships; the rest can stay gallery-grade |
| 8 | Press / citations | **Design done, Content + PR pending** | Figma Press page (37513:8922) + Press list component (37508:4175) | Input 8; a `press` doc type (publication, date, url, quote, logo) + /press route; outreach to Dwell/Dezeen/Builder-type outlets with the factory-tour angle |
| 9 | Crawlable plan PDFs | **Code shipped, Content pending** | Project page lists `plans[]` as plain `<a type="application/pdf">` links with label + size (cdn.sanity.io URLs are crawlable) | Input 9. Later: proxy PDFs under the site domain (`/plans/<slug>.pdf`) so the files index under methodhomes.net |
| 10 | llms-full.txt | **Code shipped** | `/llms-full.txt` route: every public page's section copy (headlines, intros, FAQ Q/A, spec rows, control-variant sections), project facts, 60 posts (lede + ~1,500 chars); `/llms.txt` links to it | Re-check size once content lands (target < 1 MB) |

How to re-measure: dispatch the **aeo** workflow (GitHub Actions, branch main) — it grades production, pulls Search Console (when connected) and commits `src/design/aeo.*.json`; the Studio's AEO tool renders them. Local structured-data check: `npm run build && npm start`, then `curl -s localhost:3000/<path> | grep -o '<script type="application/ld+json">[^<]*'`.

---

## 3. Decisions (newest first)

### 2026-10-03 — Figma libraries bound to the variables and text styles (Bryce: "use the spacing variables and type variables")
- The first mobile pass had written raw paddings, gaps and scaled
  font sizes. Replaced: every unstyled text in both libraries now
  carries a text style (1,199 nodes; Mobile twins take their Desktop
  twin's style, uppercase/tracking preserved); 343 raw paddings and
  gaps are bound to `spacing-*` (3. Spacing) or the container paddings
  (`container-padding-desktop-lg` 64 on Desktop roots,
  `container-padding-mobile` 16 on Mobile roots — the system's mobile
  gutter is 16, not the 24 I had typed).
- Mobile type now comes from the Typography collection's **Mobile
  mode** (`setExplicitVariableModeForCollection`) on every Mobile
  variant (sections and pages), not from hand-scaled sizes — the
  styles' font sizes are bound to the `Font size/*` variables, which
  carry Desktop/Tablet/Mobile values. Tablet variants would be the
  same mechanism with the Tablet mode.
- New: text style **Display XL/Regular** bound to a new
  `Font size/display-xl` variable (176 / 120 / 72 by device) and
  `Line height/display-xl-tight` (160 / 112 / 68) — the Hero / Series
  wordmark is no longer a size override (closes the AGENTS.md TODO).
- Lesson: switching a frame's variable mode re-lays-out every text
  node, so every font in the subtree (including Noto Sans Symbols for
  arrows) must be loaded first or the call throws.

### 2026-10-03 — Figma restructured: every section and page is a component set with Device=Desktop|Mobile (Bryce's request)
- Shared library (37505:3440): all 35 section components are now
  component sets with a `Device` variant property (existing sets —
  50/50, Card grid, Feature list — gained Device alongside their
  Image/Columns props). Editorial library (37521:15243): all 13 sets
  gained Device per state (e.g. Build journey 4 steps × 2 = 8
  variants; Interstitial 5 kinds × 2 = 10). Pages (37509:3821): all
  40 page frames became component sets `Page / <name> — <route>` with
  Device=Desktop (the original 1440 frame) and Device=Mobile (a 428
  clone whose every section instance is switched to its Mobile
  variant). Labels re-attached; Pages re-flowed 3 per row.
- The Mobile variants are a SCRIPTED FIRST PASS for Bryce to finesse
  (A4): horizontal rows become vertical stacks, 24px gutters, fill
  widths, type scaled one to two steps (60→40, 48→36, 40→32 …) with
  108–120% line height, images proportional to the 380 column,
  grids one column, nav/sub-nav/filter bar as wrapping bars (nav
  hides its link list). Known rough spots: Carousel stacks its slides
  (should scroll), Filter bar wraps tall, Footer/Author hero are long
  stacks, the hero wordmark is 56px.
- Scripting lessons (added to AGENTS.md): flipping a HORIZONTAL
  auto-layout to VERTICAL while a child still has layoutGrow=1 makes
  that child FILL the hug-sized parent and balloon to thousands of px
  — set the child's `layoutSizingVertical = "HUG"` and `layoutGrow =
  0` in the same pass; FILL cannot be set on absolute-positioned
  children (guard `layoutPositioning === "ABSOLUTE"`); variant names
  in a set must share the property keys (`Kind=Image, Device=Mobile`).

### 2026-10-03 — Shared sections batch 1 shipped (code)
- Text intro, Stats bar, Feature list, CTA band built from the Figma
  design context (37505:3536, 37506:3714, 37508:4069, 37505:3598):
  Sanity object types with AEO-minded field descriptions, components
  with Figma defaults, SectionRenderer + SectionList cases, /library
  entries, page.ts + experiment of-lists. Verified: build, Playwright
  at 1440 and 428 (no overflow), token inspector 0 off-token.
- Decisions baked in: stat values are DOM text with a 1-based
  `footnote` → `sources[]` (label, url, date) rendered as the dated
  sources line; the CTA band's primary button points at /get-started
  so the intake tray opens in place; feature icons are optional
  images with a neutral tile fallback.
- Token gaps to resolve at the rebrand export (A1): Method spacing
  3xl/5xl/7xl added now (24/40/64) and `--container-page` 80rem; 2xl
  stays 24 until Method's 20 replaces it; body-lg (18/28) has no
  template type step (body-md used); the comp's black primary button
  on the dark band conflicts with the mode-flipping `--btn` token.

### 2026-10-03 — Figma page frames reconciled to the scheme
- Audit of the 39 page frames (their names embed the route): 32
  matched; 13 frames carried drift — series pages as
  `/predesigned/<series>` and the plan as `/predesigned/annata/annata-1`,
  Portfolio as `/portfolio[/<slug>]`, `/architects-developers`,
  `/commercial/schools-and-classrooms`, `/commercial/multifamily-housing`.
  Bryce chose to KEEP the accepted `/series/<slug>` form over the
  design's nesting under /predesigned; frames, labels and
  "Portfolio" copy renamed in Figma to match.
- Settled by the frames: market slugs are full state names
  (`/where-we-build/washington`, `/where-we-build/oregon`, …); the
  `market` document slug is the state name.

### 2026-10-03 — URL scheme ACCEPTED (Bryce) — the C4 decision
- `/series/<slug>` + `/series/<slug>/<plan>` · `/projects/<slug>` (one
  URL per project; category is a filter, never a path) ·
  `/where-we-build` + `/where-we-build/<state>` · `/commercial/<type>`
  (`schools`, `multifamily`, `hospitality`, `workforce-housing`) ·
  `/blog`, `/blog/<slug>`, `/blog/category/<c>`, `/blog/authors/<a>`
  (the template's `/journal` route renamed; `/journal*` 301s) ·
  renamed pages: `/custom-homes`, `/predesigned`, `/process`,
  `/architects`, `/method-arc`, `/prefab-101`, `/privacy`, `/press`.
  Trailing-slash 301s and real 404s preserved.
- Redirect map: `design/redirects/legacy-map.json` generated from the
  331 crawled URLs by `scripts/build-redirect-map.mjs` (192 keep ·
  137 redirect · 2 gone). `next.config.ts` emits only `live` entries;
  the ~20 pending ones (series, markets, commercial types, /process,
  /method-arc, /prefab-101, /privacy) flip live when their routes
  ship. `scripts/check-redirects.mjs` + `redirects.yml` verify one
  hop against any origin (fails red on live breakage).
- Vanity → canonical project mapping (by title, "Custom" wins over a
  same-named predesigned entry): peninsula → peninsula-custom-by-
  studio-s2; calistoga → calistoga-custom; chimney-rock-estate →
  chimney-rock-designed-by-nick-noyes-architects; martis-camp-416 →
  martis-416-custom-home-designed-by-sagemodern-architects;
  martis-camp-663 → martis-663-by-sagemodern; santa-rosa →
  santa-rosa-custom-by-tobylongdesign; orcas-cabin-retreat →
  orcas-retreat-washington; sv-residence(+ -arc) →
  sv-residence-custom; fish-creek → fish-creek-passage-by-method-arc.
  `/custom-regions/*` → `/where-we-build` (lifestyle landers have no
  state twin). Old `/press` → `/blog` until the press page exists.
- Dataset: page slugs renamed (custom-residential → custom-homes,
  predesigned-residential → predesigned,
  partnerships-with-architects-and-developers → architects). The
  interim flat pages `predesigned-series-*`, `custom-regions-*`,
  `commercial-project-types-*` stay until series / market /
  commercialType documents replace them, then get redirects.
- Blog pruning (keep / 301 / 410 per post) is still open — the map
  lists all 182 posts as keep with that note.
- Verified on production the same evening (`redirects.yml` run 1):
  311 pass, 20 pending, 0 fail — all 118 live redirects resolve in one
  hop and every kept URL answers 200.

### 2026-10-03 — MCP access re-verified (Figma blocker was stale)
- Figma MCP is authorized as brycetravis@gmail.com (Full seat, admin
  on the Pro teams) and reads/writes the Method library file; the IA
  Design page, libraries and 39 page frames were all scripted through
  it today. The "edit access denied" blocker in AGENTS.md dated from
  the earlier bryce@weareenvoy.com authorization and is removed.
  Sanity MCP and GitHub MCP are connected in the session too. What
  still needs Bryce for access: Search Console (service account →
  Actions secrets), Vercel env vars, Sanity CORS for the launch
  domain — none of these are MCP connectors.

### 2026-10-03 — First production QA baseline: 46/100
- `qa.yml` run 1 over 80 of 209 sitemap URLs. Strong: headings
  (78/80), alt text (78/80), indexability (79/80). Weak: metadata
  1/80 (title suffix pushes titles past 60; excerpt-length
  descriptions; no og:image), content depth 0/78 (words + question
  headings — the §5 content work), schema 24/80 (posts counted as
  missing a WebPage node — checker corrected: BlogPosting is the page
  node), freshness 23/78 (posts had no visible Updated line — added),
  bylines missing on 30/53 posts (author roster, input 1), and
  `/llms-full.txt` at 716 bytes: a bare `variants[0].sections[]{}`
  attribute is invalid GROQ and the whole query fell back to empty
  (aliased; lesson added below).
- Decision: title pattern needs a shorter suffix or none on long
  titles — decide with the SEO fallback patterns (SEO-PLAN Phase 2);
  logged in LAUNCH-PLAN E1.

### 2026-10-03 — Content model for the catalog and landers
- Six document types added so content entry can start before the
  routes exist: `series`, `plan`, `market`, `commercialType`,
  `press`, `glossary` (all under the projects feature module).
  Shared helpers give every type the same AEO furniture: FAQ items,
  dated sources (footnotes), images with required alt.
- Facts policy encoded in the schema: a series publishes either an
  exact `priceFrom` or a `priceBand` (never both blank when a price
  is public) plus `priceNote` saying what the price includes;
  ranges (beds, baths, sqft, modules, timeline) are min/max pairs.
- FAQ stays a page section (`sectionFaq`) and a field on the new
  types; no standalone FAQ document type (revisit only if one Q/A
  must appear on >3 pages).
- Desk: Projects now has saved views "Case studies (facts filled)"
  and "Missing facts" so the content gap is visible in the Studio.
- QA gates G3–G11 are now machine-checked by `scripts/qa-pages.mjs`
  (`qa.yml`); the report is the input to the per-template QA sheet.

### 2026-10-03 — Running docs rule
- Any idea Bryce approves that affects design or dev is recorded in
  the same turn: a dated entry here (§3, plus §1/§2 when relevant),
  the task line(s) with owner and status in `docs/LAUNCH-PLAN.md`,
  AGENTS.md only for rules, and a Figma Dev Mode annotation when a
  section's spec changes. The full rule lives in AGENTS.md → Working
  agreements. `docs/LAUNCH-PLAN.md` created the same day as the
  marching orders Dev → QA → Alpha → Beta → Launch.

### 2026-10-03 — Authors are real people; one organization byline
- 3–5 real Method people + one organization byline for news. Never a
  persona. Each person gets `/blog/authors/[slug]` (ProfilePage +
  Person JSON-LD, their posts, projects led, "Ask {first name}" →
  intake with the author id).
- Schema shipped (`author`: slug, kind, firstName, role, credentials,
  avatar, bio, sameAs, email, teamMember, bioLong, startedAt,
  homesSet, reviewsTopics, projects, featured; `post.reviewedBy`).
- Figma: Author hero 37530:15456; Page / Author 37530:15457; Authors
  row on Blog.
- Still to build: the route, the Blog authors row, byline → author
  links, the 182-post backfill (after input 1).

### 2026-10-03 — Interstitial "moments of pause"
- One message, one medium, no buttons; at most two per page; placed
  once on each key page. Kinds: Statement, Image, Floating images,
  Word over image, Number. Figma set 37528:15397. Text is a styled
  `<p>` unless it opens a chapter; numbers carry a footnote marker;
  floating photos are 4–6 lazy `<img>` with alt and parallax 0.1–0.3
  (static under reduced motion); the Image kind is never the LCP.

### 2026-10-02/03 — Editorial register for bespoke sections (v2)
- v1 "techy" experiential comps (37516:13784) superseded. v2 uses
  standard UI: eyebrow + headline + body, bullets, accordions, large
  type, a single toggle or slider, one photo. References: Rivian
  (captures in `design/reference/rivian-*.md/.png`) and Apple Mac
  pages. Twelve Rivian-derived patterns catalogued in AGENTS.md; five
  applied (lineup toggle, finish cards, size-it-up, series hero,
  sub-nav + location card).
- v2 sets and their pages: Build journey 37521:15440 (Process), What
  it costs 37521:15565 (Pricing), Walk the plan 37521:15819 (Floor
  plan), We deliver to you 37522:15404 (Where we build), Find your
  fit 37522:15611 (Predesigned), Scale simply 37522:15714
  (Commercial), Set day 37523:15487 (Process), Measured not marketed
  37523:15606 (Sustainability), Three kinds of prefab 37523:15844
  (Prefab 101), Lineup 37525:15056, Finish levels 37525:15191, Size
  it up 37525:15330 (series pages).

### 2026-10-01/02 — Full IA built in Figma; judged against the AEO rubric
- Method/Sections library 37505:3440; Pages (39 desktop frames)
  37509:3821; AEO review board 37514:13776.
- Verdict: 35/39 pages clear 300 words; 36 use question headings; 17
  carry FAQ; ~635 `{facts}` placeholders await real numbers (inputs
  5, 6). Cross-cutting gaps: no author docs, empty NAP, series
  numbers unpublished, no mobile frames yet.

### 2026-09 — AEO grader shipped
- Four pillars (Content 35 · Technical 35 · Authority 15 ·
  Measurement 15), gates (Content depth ≥300 words, Authority
  bylines ≥80%, sameAs), prompt insights via Claude + web search,
  nightly `aeo.yml`, Studio AEO/Traffic/Analytics panes, edge bot
  counters in `proxy.ts`. Config: `designops.config.json → aeo`.

### 2026-09-25 — Monitoring schedules paused
- lighthouse-history, audit, check-links, dataset-backup,
  design-drift are workflow_dispatch-only until re-enabled (re-add
  `schedule:` blocks).

### 2026-08-05 — SEO plan from the live-site audit
- See `docs/SEO-PLAN.md`: 0 JSON-LD, 184/331 pages without meta
  descriptions, 2.2 MB homepage HTML, duplicate project URLs, junk in
  the sitemap. Phases 0–7; redirect map is the gating item.

---

## 4. Identifiers (so nothing has to be rediscovered)

- **Repo**: btravis08/method-homes · deploy branch `main` →
  method-homes.vercel.app · session branch `claude/new-session-96edb4`.
- **Sanity**: project `i2wd5pr1`, dataset `production`.
- **Figma**: file `9nqsOUuF2UrgukNYok3Oko`; IA Design page
  36373:44911; library 37505:3440; pages 37509:3821; AEO board
  37514:13776; experiential v2 37521:15243; interstitials 37528:15397.
  Component ids and page ids are listed in AGENTS.md → Design source.
- **Workflows** (Actions, main): `aeo.yml` (grade + Search Console),
  `fetch-page.yml` (render any URL to design/reference), `probe.yml`,
  `lighthouse.yml`, catalog/asset fetchers.
- **Key files**: `designops.config.json` (all constants),
  `src/components/seo/JsonLd.tsx` (structured-data helpers),
  `src/sanity/lib/queries.ts` (GROQ), `src/components/SectionRenderer.tsx`
  + `src/components/preview/SectionList.tsx` (keep in sync),
  `src/library/registry.tsx` (section catalogue), `scripts/aeo-*.mjs`.

---

## 5. Lessons worth keeping

- Flag schema/architecture implications the moment a decision is
  made (the author model's SEO value surfaced two steps late — hence
  this log).
- Figma scripting: hide index-addressed children last-first; variant
  lookups need tolerant `variantProperties` matching; instance text
  overrides go by layer-name path.
- Nightly workflow commits land on `main`; rebase before every push
  and never commit the regenerated `aeo.status.json` / `aeo.history.json`
  from the sandbox.
- Never print confidential client documents into Actions logs — the
  repo is public.
- GROQ: every computed attribute in a projection must be aliased
  (`"name": expr`); a bare `variants[0].sections[]{…}` is a syntax
  error and `sanityFetch` falls back silently, so the page looks
  empty rather than broken. Localhost cannot catch this (Sanity is
  egress-blocked) — the QA workflow against production can.
