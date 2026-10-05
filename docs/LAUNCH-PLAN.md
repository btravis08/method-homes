# Method Homes rebuild — Launch plan (marching orders)

The one file that takes the project from today to launch. It lists
every idea we have agreed to for SEO/AEO, every practical wiring job
in Sanity, Vercel and the integrations, and the order and acceptance
gates for Dev → QA → Alpha → Beta → Launch → Post-launch. When the
designs are finessed, each section and page is checked against the
requirements here before it is called done.

How this file relates to the others:

- **This file** = what to do, in what order, and what "done" means.
- `docs/PROJECT-LOG.md` = what has happened, dated decisions, the
  open inputs ledger. New decisions go there first, then change this
  plan.
- `docs/SEO-PLAN.md` = the 2026-08-05 audit evidence behind the
  SEO items. This plan supersedes its phase list; the evidence
  stays there.
- `docs/PLAYBOOK.md` and `AGENTS.md` = binding engineering rules.
  The gates below reference them rather than repeating them.

Conventions: `[ ]` open · `[x]` done · `[~]` partial (say what is
left) · **Owner** is Bryce (design/decisions), Method (content,
accounts, facts), Claude (code, Figma scripting, verification).
Stage order is Alpha before Beta (internal before friendly-external);
if Method prefers the reverse naming, swap the labels, not the gates.

Maintained by Claude. Every push that lands an item flips its box;
every approved idea that affects design or dev gets its line here in
the same turn it is approved (the Running docs rule in AGENTS.md),
with a dated entry in PROJECT-LOG.

---

## 0. Where we are (2026-10-03)

- Site runs on Vercel staging (method-homes.vercel.app) in the
  TEMPLATE's design system with Method's migrated content (24 pages,
  93+ projects, 182 posts, ~800 images). The Method rebrand has not
  been applied to code yet; fonts are SDR trial cuts.
- Figma: 31 shared section components, 9 editorial bespoke sections,
  6 Rivian-derived patterns, 5 interstitial kinds, 39 desktop page
  frames, an AEO review board. No mobile frames yet.
- Shipped platform: AEO grader + Studio panes, forms engine with
  inbox, A/B sections, gated pages, announcement bar, SEO object,
  structured data layer (Organization, WebPage kinds, FAQPage,
  BreadcrumbList, ItemList, House/Review, Article), llms.txt +
  llms-full.txt, Search Console ingestion (awaiting secrets).
- Blocking inputs: see PROJECT-LOG §1 (author roster, NAP, sameAs,
  founding year, series facts, case-study facts, GSC secrets, press
  list, plan PDFs, Vercel env).
- **QA baseline (first production run, 2026-10-03 19:08 UTC, 80 of
  209 sitemap URLs):** gate score **46 / 100**. Per gate: G3 78/80 ·
  G4 1/80 · G5 78/80 · G6 79/80 · G7 0/78 · G8 24/80 · G9 23/78 ·
  G10 49/80 · G11 1/80. What that means: headings, alt text and
  indexability are already near-clean; metadata fails almost
  everywhere on title length (the " | Method Homes" suffix pushes
  most past 60), excerpt-length descriptions and no og:image (A3);
  no page yet clears content depth (words + question headings =
  the content work in §5); posts lacked a visible Updated line and
  30 of 53 have no author; `/llms-full.txt` was 716 bytes because
  its GROQ had a syntax error (fixed the same day). Re-run after
  each content or template change; the number to beat is 46.

---

## 1. Definition of done — the gates every page must pass

A page is launch-ready only when all of these hold. QA tests exactly
this list (§8 is the per-template sheet).

**Design fidelity**
- G1 Matches its Figma frame at 1440, 1024 and 428 (mobile frames
  must exist first — see Workstream A). Compare-bar DIFFERENCE check
  in /library for every section it uses.
- G2 Zero `off-token` readings in the token inspector (`?inspect=1`).

**SEO**
- G3 One H1, semantic heading order, no decorative headings.
- G4 Title ≤60 chars and description 120–155 chars from the SEO
  object or the template fallback; self-canonical; OG + Twitter card
  with a real image.
- G5 Every image: alt text, explicit width/height or aspect box,
  `urlFor().width()` sized to its surface, lazy unless LCP.
- G6 In the sitemap with real lastmod; not noindex unless intended.

**AEO**
- G7 ≥300 words of body copy that answers the page's question in
  the first 120 words (the "lede"); at least two question-form H2/H3s.
- G8 Structured data: WebPage kind correct + BreadcrumbList; FAQPage
  when the page has a FAQ section; the entity node its template
  requires (House, Article, Person, Product/Series, HowTo).
- G9 Visible "Updated {Month YYYY}" and `dateModified`.
- G10 Byline (Person) on every article; Organization.sameAs and NAP
  resolvable; no unfilled `{placeholder}` facts.
- G11 Appears in `/llms-full.txt` with its copy intact.

**Performance** (PLAYBOOK is binding)
- G12 Mobile Lighthouse ≥90 performance on `lighthouse.yml`; LCP
  <2.5 s, CLS <0.1, INP <200 ms in field data once available.
- G13 HTML <100 KB, no base64 images, LCP image eager + preloaded,
  never faded.

**Behavior**
- G14 Playwright: navigation works (pathname changes on Link click),
  reveals complete (overlay opacity 0), sliders settle on step,
  forms submit and appear in the inbox, no console errors.
- G15 Accessible: keyboard reachable, focus visible, labels and
  live regions on forms, reduced-motion respected.

**Content ops**
- G16 Editable in Studio with Presentation preview working; every
  value on the page comes from Sanity or a code default documented in
  the registry.

---

## 2. Workstream A — Design: rebrand tokens, mobile frames, finesse

Owner Bryce (design), Claude (token export, scripting).

- [~] A1 Figma MCP access on `9nqsOUuF2UrgukNYok3Oko`: VERIFIED
      2026-10-03 (connector authorized as brycetravis@gmail.com, Full
      seat; reads and writes the file). The "blocker since 2026-08"
      note was stale. Still to do: export the variable collections →
      `design/figma-tokens/`, map to `globals.css` semantic vars,
      `npm run tokens`, commit. Precondition on the design side: the
      Method color/spacing/type variables must exist as a collection
      with modes (today the library binds to Colors/Spacing/Radius
      variables + Geist text styles — confirm these are the final
      brand values before export).
- [~] A2 Fonts: license Method's production faces (Geist per the
      file, or the brand's choice); replace the SDR trial cuts in
      `src/fonts/`. Done 2026-10-03: the "Display XL/Regular" text
      style exists, bound to `Font size/display-xl` (176/120/72 by
      device) — the Hero / Series wordmark is no longer an override.
- [ ] A3 Logo + favicon + OG default image into `public/method/brand/`
      and wired as the `openGraph.images` fallback in the root layout
      (QA G4 fails site-wide on "no og:image" until then).
- [~] A4 Mobile (428) variants: SCRIPTED FIRST PASS exists for every
      section (shared + editorial) and every page as `Device=Mobile`
      variants of their component sets (2026-10-03). Still: Bryce's
      finesse pass — Carousel → horizontal scroller, Filter bar → one
      scrolling row, Nav → hamburger pattern, Hero / Series wordmark
      size, Lineup / Finish levels / Size it up / We deliver to you
      toggles → segmented controls, diagrams stacked; then tablet
      (1024) variants if wanted (a third Device value).
- [ ] A5 Design finesse pass over the 39 frames. For each frame, the
      AEO review board (37514:13776) must stay green: words ≥300, ≥2
      question H2s, FAQ where listed in §5, byline on articles, NAP on
      About/Contact, zero `{placeholders}` once facts exist.
- [ ] A6 Dev Mode annotations on every section: spacing rationale,
      responsive behavior, states, motion (the code reads these as
      spec).
- [ ] A7 Comps exported for /library's compare bar: `get_screenshot`
      at 1440/1024/428 → `scripts/fetch-figma-assets.sh` →
      fetch-figma-assets workflow → set `comps` sizes in the registry.
- [ ] A8 Decide and document the color-mode mapping (Figma modes →
      `data-mode` light / light-mid / dark-mid / dark) in globals.css.

Exit: tokens in code, fonts licensed, every section has three
breakpoints and a comp, review board green.

---

## 3. Workstream B — Sections: build the library in code

Owner Claude. Each section ships with: Sanity object type (if
CMS-composable), component with Figma defaults, SectionRenderer AND
SectionList cases, registry entry with `figmaNodeId` + comps, token
sweep, three-breakpoint Playwright check, and its structured-data
contribution wired. Build order follows page priority in §5.

### B1 Shared sections (Figma `Method/Sections`, 37505:3440)

| Section | Figma | Sanity type | AEO/SEO contribution | Status |
|---|---|---|---|---|
| Nav | 37505:3463 | navigation singleton | SiteNavigationElement optional; breadcrumbs live in pages | [~] exists in template skin |
| Hero / Home | 37505:3489 | sectionHero | LCP image eager+preload; H1 stays sr-only on CMS pages | [~] template Hero |
| Hero / Page | 37505:3516 | sectionHeroPage | breadcrumb (visible BreadcrumbList) + H1/lede = title/description pair; `text-body-xl` added for the lede | [x] 2026-10-04 |
| Hero / Series | 37525:15367 | series doc (route-built, not a section type) | breadcrumb + Display XL wordmark H1 + eager LCP photo + sentence + meta line with footnote markers | [x] 2026-10-04 |
| Sub-nav | 37525:15383 | sectionSubNav (+ every section's `anchor` field) | real `#anchor` links, active follows scroll, Lenis scrollTo; series route builds it from the sections present | [x] 2026-10-04 |
| Text intro | 37505:3536 | sectionTextIntro | ≥120-word lede, H2 question | [x] 2026-10-03 |
| 50/50 | 37505:3577 | sectionFiftyFifty | alt text required | [~] template |
| Card + Card grid | 37506:3516/3646 | sectionCardGrid | cards with eyebrow/title/body/meta; link wraps the card | [x] 2026-10-04 |
| Carousel | 37506:3699 | sectionCarousel | ImageObject captions | [~] template |
| Stats bar | 37506:3714 | sectionStats | numbers are DOM text with footnote markers → dated sources line | [x] 2026-10-03 |
| Testimonial | 37506:3733 | sectionTestimonial (fields, or pulls a project's testimonial) | `<blockquote>` + `<figcaption>`; page emits Review of the Organization (named, dated, rated) | [x] 2026-10-04 |
| Logo row | 37506:3750 | sectionLogoRow | every mark named in text (alt or label), links to the certifier | [x] 2026-10-04 |
| Spec table | 37507:3678 | sectionSpecTable (`<dl>`) | rows → Product additionalProperty on series and plan pages | [x] 2026-10-04 |
| Compare table | 37507:3753 | sectionCompare | real `<table>` with header row + sources; comparison pages (play 6) | [x] 2026-10-04 |
| Process timeline | 37507:3797 | sectionProcess | `<ol>` of steps; page route emits HowTo (steps, ISO durations) | [x] 2026-10-04 |
| FAQ | 37507:3841 | sectionFaq | FAQPage | [x] shipped 2026-10-03 |
| Author & share | 37507:3851 | post.author / reviewedBy | Person + links to author page | [~] byline exists; links pending |
| Article body | 37507:3864 | post.body | Article; H2 ids for anchors | [~] PostArticle |
| Inline CTA | 37507:3880 | sectionCta (new) | — | [ ] |
| Filter bar | 37508:3695 | route-level (projects, blog) | URL params, not JS-only state | [~] projects filters |
| Gallery | 37508:3726 | sectionGallery | ImageObject with captions | [~] template |
| Form block | 37508:3799 | sectionFormBlock + ContactForm (simple form “contact” → /api/forms) | NAP from Site Settings beside the form; page becomes ContactPage | [x] 2026-10-04 |
| Map block | 37508:3828 | sectionMapBlock (rows from Market docs or typed) | named places = areaServed entities; rows link to market pages when `linkRows` is on | [x] 2026-10-04 (links off until /where-we-build ships) |
| Team grid | 37508:3875 | sectionTeamGrid → teamMember docs (+credentials, linkedin) | Person nodes (jobTitle, sameAs) per member | [x] 2026-10-04 |
| Pricing cards → Finish levels | 37525:15191 | series.finishLevels | Offer/PriceSpecification per level | [ ] |
| Feature list | 37508:4069 | sectionFeatureList | bullets = liftable facts; 3 or 4 columns | [x] 2026-10-03 |
| Link list | 37508:4097 | sectionLinkList | internal linking hub (descriptive anchors) | [x] 2026-10-04 |
| Glossary | 37508:4131 | glossary doc (new) | DefinedTerm set on /prefab-101 | [ ] |
| Press list | 37508:4175 | press doc (new) | citations; NewsArticle refs | [ ] |
| Plan drawings → Walk the plan | 37521:15819 | plan doc + PDF | crawlable PDFs; ImageObject | [ ] |
| CTA band | 37505:3598 | sectionCtaBand | primary CTA → /get-started opens the intake tray | [x] 2026-10-03 |
| Footer + Location + newsletter | 37505:3650 / 37525:15440 | siteSettings NAP | NAP visible on every page; matches GBP | [~] footer exists; NAP fields added |
| Interstitial ×5 | 37528:15397 | sectionInterstitial (kind) | styled `<p>`, lazy imgs, depth parallax (static under reduced motion), never LCP | [x] 2026-10-04 |

### B2 Editorial bespoke sections (37521:15243)

Rules (AGENTS.md): every fact is DOM text, the shared component beside
it is the no-JS twin, interactive chunks load via an ssr:false client
gate after idle. Each has one toggle or slider at most.

| Section | Page | States | Status |
|---|---|---|---|
| Build journey | /process | Step | [ ] |
| What it costs | /pricing | Path=Predesigned/Custom | [ ] |
| Walk the plan | series, plan pages | View=Plan/Modules/Photos (+ 3D view from the IFC pipeline, prototype 2026-10-04; photoreal Cycles turntable + plan-cut frames, same day) | [~] 3D viewer (with real-time scanned planting) + rendered turntable prototypes in code (/library/plan-viewer, /library/turntable); Plan/Modules/Photos pending Bryce's design pass |
| We deliver to you | /where-we-build | State=Empty/Result | [ ] |
| Lineup (replaces Find your fit) | /predesigned | Series | [x] 2026-10-04 — pills are real links to /series/*, JS swaps in place (state-driven cross-fade); twin = Card grid + Compare table on the same page |
| Scale, simply | /commercial | Config=24/48 units | [ ] |
| Set day | / | Time=06:10/14:40 | [ ] |
| Measured, not marketed | /sustainability | Show=Method/Site-built | [ ] |
| Three kinds of prefab | /prefab-101 | Type=Modular/Panelized/Manufactured | [ ] |
| Size it up | floor-plan pages | Plan | [ ] |

Exit: every row above `[x]`, registry complete, compare-bar diff
≤ visible threshold per section, SectionList in sync (the preview
twin renders every type).

---

## 4. Workstream C — Sanity: content model, wiring, operations

Owner Claude (schema/code), Method (content), Bryce (decisions).

### C1 Document types to add (today: page, project, post, author,
postCategory, teamMember, navigation, siteSettings, redirect, seo,
formSubmission, A/B + AEO traffic types)

- [x] `series` (7: Elemental, Option, Cabin, M, Paradigm, Method One,
      Annata): name, slug, tagline, hero image, lede, beds/baths/sqft/
      modules ranges, priceFrom or priceBand + priceNote, timeline
      range, specs rows, finishLevels[] {name, tagline, from, three
      numbers, includes, optional}, gallery, FAQ, sources (footnotes),
      architect credit, SEO. Plans reference the series (so the
      ItemList is derived). Emits Product + Offer(s) once a route
      exists. (schema 2026-10-03; `src/sanity/schemaTypes/catalog.ts`)
- [x] `plan` (per floor plan): series ref, name, lede, beds, baths,
      sqft, modules, stories, priceFrom override, dimensions A–H (Size
      it up), plan image, module diagram, PDF, photos, SEO.
      (schema 2026-10-03) Route still to decide in C4.
- [x] `market` (WA, OR, CA, ID, MT, CO, UT + BC): name, slug, code,
      country, lede, hero, body, geo pin, factory distance, delivery
      days/notes, permitting notes, regions served, local partners,
      FAQ, sources, SEO. Projects list by `project.state`.
      (schema 2026-10-03; `markets.ts`)
- [x] `commercialType` (Schools, Multifamily, Hospitality, Workforce
      housing): lede, hero, body, case studies (project refs),
      configurations[] for Scale simply (label, units, modules, sqft,
      months), FAQ, sources, SEO. (schema 2026-10-03)
- [x] `press` (publication, headline, url, date, journalist, pull
      quote, logo, project/series ref, featured, kind). (schema
      2026-10-03; `press.ts`)
- [x] `glossary` (term, slug anchor, 40–90-word definition, aliases,
      read-more ref, order). (schema 2026-10-03; `glossary.ts`)
- [x] Shared field helpers (`shared.ts`): `faqItems()`, `sources()`
      footnotes, `imageWithAlt()` (alt required), `galleryWithAlt()`.
      New types use them; retrofit page sections + project + post.
- [ ] Routes, GROQ projections, TS types and Presentation locations
      for all six types — after the C4 URL decision.
- [ ] `faq` as a reusable document? Decision: NO — FAQ stays a
      page section (sectionFaq) so each page owns its answers; a
      shared FAQ page is a page built from several sectionFaq
      sections. Revisit only if the same Q/A must appear on >3 pages.
- [ ] `author` → add `teamMember` sync or merge decision (one person,
      one document). Keep both until the roster exists, then merge.
- [~] `project` → `state`, `architect`, `certifications[]` added
      (2026-10-03). Still: `series` string → reference to the series
      doc (migration script once the seven series exist).
- [ ] `post` → `updatedAt` override (editorial "last reviewed"),
      `faq[]` items for FAQPage on posts, `relatedProjects[]`.

### C2 Studio
- [~] Desk structure mirrors the IA (2026-10-03): Blog · Pages ·
      Navigation · Inbox · Series & plans · Projects (All / Custom /
      Predesigned / Commercial / Case studies / Missing facts) ·
      Where we build · Commercial types · Press · Glossary · Team ·
      Site settings. Still: a Redirects list item and the Create
      menu order review with Method's editors.
- [ ] Presentation preview for every route (series, plans, markets,
      commercial types, press, authors) — `PagePreview`-style shells
      with `useQuery`/`useLiveMode`; SectionList kept in sync.
- [ ] Validation: required alt on every image field; SEO description
      counter; slug uniqueness across types that share a URL space.
- [ ] Initial values: every new section arrives pre-filled (lorem +
      placeholder asset) — keep the convention.
- [ ] Studio Overview card for "launch readiness" reading this file's
      gate results (optional, after QA tooling exists).

### C3 Wiring and operations
- [ ] Sanity → Vercel revalidation webhook (`/api/revalidate`,
      `SANITY_REVALIDATE_SECRET`) on publish of every type; verify
      with a publish → curl loop on staging.
- [ ] CORS origins: localhost:3000, method-homes.vercel.app,
      preview domain(s), **methodhomes.net** + www (credentials on)
      before launch.
- [ ] Vercel env (production + preview): SANITY_API_READ_TOKEN,
      SANITY_API_WRITE_TOKEN, SANITY_REVALIDATE_SECRET, FORMS_SECRET,
      RESEND_API_KEY, FORMS_NOTIFY_TO/FROM, FORMS_WEBHOOK_URL(+SECRET),
      TURNSTILE keys, NEXT_PUBLIC_MAPBOX_TOKEN, NEXT_PUBLIC_BOOKING_URL,
      NEXT_PUBLIC_SANITY_* if the project/dataset ever changes.
- [ ] Actions secrets: ANTHROPIC_API_KEY (prompt insights),
      GSC_SERVICE_ACCOUNT_JSON + GSC_SITE_URL (questions), Sanity
      write token for import workflows (rotate after launch).
- [ ] Dataset backup workflow re-enabled on a schedule before
      content entry begins (it was paused 2026-09-25).
- [ ] Roles: Method editors as Sanity Editors, Bryce/Claude as
      Administrators; a `reviewer` role is unnecessary — use drafts +
      Presentation.
- [x] Redirects live in `next.config.ts` from the generated map (not
      as `redirect` docs — the map is code-owned and CI-checked;
      `redirect` docs remain for editor-made one-offs). CI:
      `redirects.yml` (2026-10-03).
- [ ] Media: all migrated imagery re-uploaded through the CDN with
      alt seeded from `design/method-content/pages.json`; delete the
      >300 KB originals from `public/method/` once referenced from
      Sanity.

### C4 Decisions to take (Bryce) — each blocks a route
- [x] URL scheme DECIDED 2026-10-03: `/series/<slug>` +
      `/series/<slug>/<plan>`; `/projects/<slug>`; `/where-we-build` +
      `/where-we-build/<state>`; `/commercial/<type>`; `/blog` family
      (journal route renamed); renamed pages /custom-homes
      /predesigned /process /architects /method-arc /prefab-101
      /privacy /press. Details + vanity mapping in PROJECT-LOG.
- [ ] Journal pruning: which of the 182 posts keep (≈30), redirect,
      or 410 (SEO-PLAN Phase 1).
- [ ] Author roster and organization byline name.
- [ ] Founding year (2007 vs 2008).
- [ ] Price publishing policy: exact starting prices, bands, or
      "from" per finish level — determines Offer schema and the
      Pricing page copy.

Exit: every IA route has a document type and a desk entry; preview
works for all; webhook revalidation proven; env complete in Vercel.

---

## 5. Workstream D — Pages: the 39 routes, with requirements

Owner Claude (build), Method (copy/facts), Bryce (design sign-off).
Build in priority order (P1 → P3). "FAQ" = carries a sectionFaq.
Schema = the entity node beyond WebPage + BreadcrumbList.

| P | Route | Figma | Sanity source | Schema | FAQ | Bespoke | Status |
|---|---|---|---|---|---|---|---|
| 1 | `/` Home | 37509:3822 | page "home" | Organization graph (layout) | no | Set day; Interstitial | [~] |
| 1 | `/predesigned` | 37565:18408 | series list (+ optional page doc “predesigned” for hero/intro/FAQ/SEO overrides) | CollectionPage + ItemList of series Products + FAQPage | yes | Lineup; Interstitial (Number) | [x] route 2026-10-04; renders the designed defaults until the series docs exist |
| 1 | `/series/<slug>` ×7 (Elemental 37513:9343, Option 9729, Cabin 10115, M 10501, Paradigm 10887, Method One 11273, Annata 37509:4620) | templates | series doc | Product (+AggregateOffer when a price is published, hasVariant per plan, additionalProperty from specs) + ItemList(plans) + FAQPage | yes | Hero/Series, Sub-nav, Walk the plan, Finish levels | [~] route shipped 2026-10-04 (finish-level cards are the shared-component twin; Walk the plan bespoke pending); content: 7 series docs |
| 1 | `/series/<slug>/<plan>` (Floor plan detail) | 37509:5006 | plan doc | Product isVariantOf series (+Offer, subjectOf DigitalDocument PDF, dimensions as additionalProperty) | no | Size it up, Walk the plan | [~] route shipped 2026-10-04 (Size it up = Spec table twin with lettered rows; bespoke pending); content: plan docs |
| 1 | `/pricing` | 37510:5762 | page | FAQPage; Offer refs | yes | What it costs, Finish levels | [ ] |
| 1 | `/process` | 37510:6259 | page | HowTo (steps from Process timeline) | yes | Build journey, Set day | [ ] |
| 1 | `/custom-homes` | 37509:4036 | page | Service | yes | Interstitial | [ ] |
| 1 | `/contact` (+ /get-started sheet) | 37510:6059 | page + siteSettings | ContactPage + LocalBusiness NAP | yes | Location + newsletter | [~] |
| 2 | `/projects` | 37511:6447 | project list | CollectionPage + ItemList | no | Filter bar | [x] |
| 2 | `/projects/<slug>` | 37511:6702 | project doc | House + Review | no | — | [x] code; content pending |
| 2 | `/where-we-build` | 37511:6962 | page + markets | Service.areaServed; ItemList | yes | We deliver to you | [ ] |
| 2 | `/where-we-build/<state>` ×7 (WA 37511:7208, OR 12406, CA 12630, ID 12854, MT 13078, CO 13302, UT 13526) | templates | market doc | Service + Place + ItemList(projects) | yes | Map block | [ ] |
| 2 | `/commercial` | 37510:5217 | page + types | Service | yes | Scale, simply | [ ] |
| 2 | `/commercial/<type>` ×4 (Workforce 37510:5513, Schools 11659, Multifamily 11908, Hospitality 12157) | templates | commercialType doc | Service + case studies | yes | — | [ ] |
| 2 | `/about` | 37512:7598 | page + team + siteSettings | AboutPage + Person per member + NAP | no | Interstitial; Location card | [ ] |
| 2 | `/prefab-101` | 37512:8343 | page + glossary | FAQPage + DefinedTermSet | yes | Three kinds of prefab | [ ] |
| 2 | `/sustainability` | 37512:8092 | page | — (claims with sources) | yes | Measured, not marketed | [ ] |
| 2 | `/architects` (partnerships) | 37511:7432 | page | Service | yes | — | [ ] |
| 2 | `/method-arc` | 37512:7852 | page | Service/Brand | no | — | [ ] |
| 2 | `/blog` | 37512:8629 | posts + authors | Blog + ItemList; Authors row | no | — | [~] |
| 2 | `/blog/<slug>` | 37512:8851 | post | BlogPosting + Person (+FAQPage if faq) | opt | Author & share | [~] visible Updated line pending |
| 2 | `/blog/authors/<slug>` | 37530:15457 | author | ProfilePage + Person | no | Author hero | [ ] |
| 2 | `/blog/category/<slug>` | — | postCategory | CollectionPage | no | — | [x] |
| 3 | `/press` | 37513:8922 | press docs | CollectionPage + ItemList(NewsArticle) | no | Press list, Logo row | [ ] |
| 3 | `/privacy` (+ terms) | 37513:9086 | page (rich text) | WebPage, noindex optional | no | — | [ ] |
| 3 | `/404` | 37513:9187 | code | — | no | — | [~] |
| 3 | `/search` | — | code | noindex | no | — | [~] |
| 3 | `/faq` (standalone) | — | page of sectionFaq | FAQPage (page-level type) | yes | — | [ ] decide keep/merge |

Per-page copy requirements (Method): lede ≤120 words that answers the
page question; ≥300 words total; every number sourced (footnote →
dated sources line); FAQ of 4–8 real questions (seed from the
"Questions people already ask" panel once GSC is connected).

Exit: every P1 row `[x]` for Alpha; P1+P2 for Beta; all for Launch.

---

## 6. Workstream E — SEO/AEO: the complete idea inventory

Everything agreed, in one place. Items marked ✔ are shipped in code
and only need content; the rest are build or content work.

### E1 Technical foundation
- ✔ robots.txt with named AI crawlers; sitemap from Sanity with
  lastmod; canonical + OG/Twitter via the SEO object; noindex on
  utility routes; `/llms.txt` + `/llms-full.txt`.
- [ ] Single-hop apex → www (or www → apex) redirect at the DNS/Vercel
      layer; keep trailing-slash 301 and real 404s.
- [~] Full 301 map for all 331 legacy URLs, one hop, CI-verified:
      `design/redirects/legacy-map.json` (generated), live entries in
      `next.config.ts`, `redirects.yml` check (2026-10-03). First
      production run 2026-10-03 23:16 UTC: **311 pass · 20 pending ·
      0 fail** (every live redirect one hop, every kept URL 200).
      2026-10-04: `/series/*` flipped live (125 live · 13 pending).
      Still: flip the 13 pending entries live as markets / commercial /
      process / method-arc / prefab-101 / privacy routes ship; per-post
      keep/301/410 decisions for the 182 blog URLs.
- [~] Sitemap extended to series + plans (2026-10-04); still markets,
      commercial types, press, authors; images sitemap optional.
- [ ] `WebSite.potentialAction` SearchAction if /search stays public.
- [ ] hreflang none (US-only); `inLanguage` en-US already set.
- [ ] Title/description fallback patterns per template (SEO-PLAN
      Phase 2) tuned to the gates: titles ≤60 incl. any suffix (drop
      " | Method Homes" when the title alone exceeds ~45), descriptions
      120–160 generated from the lede, not the excerpt. QA baseline:
      G4 passes on 1 of 80 pages today.

### E2 Structured data (per template)
- ✔ Organization + HomeAndConstructionBusiness (structured NAP,
  foundingDate/Location, sameAs, computed AggregateRating).
- ✔ WebPage kinds, BreadcrumbList, FAQPage pooling, ItemList,
  House + Review, BlogPosting + Person, dateModified.
- [x] Product + Offer per series and plan — code shipped 2026-10-04;
      emits only when `priceFrom` is published (band → text only).
- [x] HowTo from the Process timeline steps (route emits it for the
      first Process section on any CMS page; durations like “6–8
      weeks” become ISO `P8W`). 2026-10-04.
- [ ] ProfilePage + Person on author pages; Person per team member.
- [ ] Service + areaServed on markets and commercial types.
- [ ] DefinedTermSet on /prefab-101 glossary.
- [ ] ImageObject with captions on galleries; VideoObject for install
      videos (Set day footage) when published.
- [ ] Validation step in QA: Rich Results Test on one URL per
      template; `probe.yml` greps `application/ld+json` per template.

### E3 Content plays
- ✔ FAQ sections (play 1) — write 4–8 real Q/A per P1/P2 page.
- ✔ Search Console questions → FAQ brief (play 2) — connect secrets.
- ✔ Visible freshness (play 3) — add the Updated line to posts.
- ✔ Named reviews (play 4) — collect ≥3 testimonials with consent.
- ✔ Entity consistency (play 5) — fill NAP/sameAs; align GBP; claim
  Bing Places, Apple Business Connect; Wikidata item if eligible.
- [ ] Comparison pages (play 6): modular vs panelized vs manufactured;
      prefab vs site-built cost and timeline; "Method vs {competitor}"
      only with sourced public facts. Compare table + FAQ each.
- ✔ Case-study projects (play 7) — fill facts for 8–12 flagships.
- [ ] Press & citations (play 8): press doc type + /press; outreach
      list (Dwell, Dezeen, Builder, local business journals) with the
      factory-tour and set-day angles; link every clipping.
- ✔ Crawlable plan PDFs (play 9) — upload PDFs; later proxy under
  the site domain (`/plans/<slug>.pdf`).
- ✔ llms-full.txt (play 10) — re-check size after content lands.
- [ ] Pillars from SEO-PLAN Phase 4: /pricing cost pillar, /prefab-101
      pillar, four market landers, four commercial service pages,
      ADU/backyard cottage page, fire-rebuild expertise page, FAQ
      maintained; About with named team and certifications.
- [ ] Internal linking: Link list sections on pillars; series ↔
      projects ↔ markets related blocks; every post links one money
      page.
- [ ] Author pages + bylines on ≥80% of posts (Authority gate).
- [ ] Image alt coverage 100% (seed from crawl alts), captions on
      galleries, descriptive file names via Sanity.
- [ ] Footnoted numbers: every stat carries a marker to a dated
      sources line (the Rivian pattern) — a code component
      (`Footnotes`) + a `sources[]` field on sections that carry
      numbers.

### E4 Measurement
- ✔ AEO grader nightly; Studio AEO/Traffic/Analytics panes; edge bot
  counters; prompt insights (needs ANTHROPIC_API_KEY).
- [ ] Search Console + Bing Webmaster verified on the launch domain;
      GSC property for staging too.
- [ ] GA4 or Vercel Analytics events: `mh:form` steps, CTA clicks,
      toggle usage on bespoke sections (so we learn which state sells).
- [ ] Rank tracking for the keyword map (SEO-PLAN Phase 4) from a
      pre-launch baseline.
- [ ] Monitoring schedules re-enabled: lighthouse-history, audit,
      check-links, dataset-backup, design-drift.

---

## 7. Stage plan

### Stage 1 — Dev (now → all P1 pages built)
Entry: this plan accepted. Work in parallel:
- A1–A4 (tokens, fonts, mobile frames) — Bryce + Claude.
- C1 doc types `series`, `plan`, `market`, `commercialType`, `press`,
  `glossary`; C2 desk + previews; C3 webhook + env.
- B1/B2 sections in the order the P1 pages need them.
- D: P1 pages built from Sanity with CMS-bound values.
- E1 redirects map encoded; E2 Product/HowTo/Service nodes.
- Method starts content: inputs 1–9 in PROJECT-LOG, P1 copy and FAQs.
Exit: P1 pages pass G1–G16 on staging with real or clearly marked
interim content; `npm run build` clean; Playwright suite green.

### Stage 2 — QA (continuous, formalized at end of Dev)
- [~] QA tooling (2026-10-03): `scripts/qa-pages.mjs` runs G3–G11 per
      sitemap URL (one H1 + heading order, title/description/canonical/
      og:image, alt coverage, noindex, word count + question headings,
      JSON-LD kinds incl. FAQPage/House/BlogPosting, Updated line,
      placeholders/lorem/byline, llms-full presence) and writes
      `src/design/qa.status.json`; `qa.yml` runs it on demand against
      production (or an `origin` input) and commits the report. Still:
      a Studio Overview card reading the report; nightly schedule
      once content entry starts.
- [ ] Playwright suite covers: nav + Link navigation, forms end to
      end (submission in inbox), FAQ toggle, bespoke toggles/sliders
      (state changes are DOM-visible), sliders settle, reveals finish,
      reduced-motion path, 428/1024/1440.
- [ ] Lighthouse mobile on every P1/P2 route via `lighthouse.yml`.
- [ ] Structured data: Rich Results Test per template (manual) +
      probe greps (automated).
- [ ] Accessibility: axe pass per template; keyboard walk of the
      intake sheet.
- [ ] Redirect map test: all legacy URLs one hop (runner).
- [ ] Content QA sheet (§8) filled per page by Bryce/Method.
Exit: zero P1 failures; P2 failures triaged with owners and dates.

### Stage 3 — Alpha (internal, Method team + Envoy)
- [ ] Staging password gate ON (announcement bar off); Method editors
      invited to Studio; 60-minute editor training (sections, SEO
      object, FAQ, preview, publish → live in ~1 min).
- [ ] Method completes P1+P2 content in Sanity; author roster
      entered; 182-post triage executed (keep/redirect/410).
- [ ] Case-study facts and testimonials for flagships entered.
- [ ] Feedback captured as GitHub issues labeled `alpha`; fix cycle
      weekly; re-run QA tooling after each cycle.
Exit: P1+P2 pages pass gates with REAL content; no `{placeholder}`
left on indexable pages; inbox receiving test leads and emails.

### Stage 4 — Beta (friendly external: past clients, partners, 2 weeks)
- [ ] Gate off for invited users (shared passphrase or unlisted
      domain); `noindex` remains on staging domain.
- [ ] Real-device matrix: iOS Safari (sheet, history Back, snap),
      Android Chrome, Safari macOS, Edge; the iOS-only behaviors in
      AGENTS.md re-tested on device by Bryce.
- [ ] Field CWV from Vercel Speed Insights reviewed; INP on bespoke
      toggles.
- [ ] Intake funnel review: step drop-off from `mh:form` events; copy
      fixes.
- [ ] Legal/content sign-off: privacy policy, accessibility
      statement, image rights (all project photography cleared),
      testimonial consents on file, price-publishing policy applied.
- [ ] Final content capture of the old site (fetch-method-content) and
      redirect map reconciled against it.
Exit: no P1/P2 open defects; Method sign-off recorded in PROJECT-LOG.

### Stage 5 — Launch
Pre-cutover (T-7 to T-1)
- [ ] Production Vercel project with `methodhomes.net` + www added;
      single-hop redirect chosen; SSL issued; env vars copied;
      `designops.site.baseUrl` → https://methodhomes.net (search for
      every hard-coded staging URL); `aeo.brandDomains` updated.
- [ ] Sanity CORS + Presentation preview origin for the new domain;
      webhook target updated.
- [ ] Sitemap, robots, llms.txt regenerated with the new base; staging
      domain set to `noindex` + redirect to production after cutover.
- [ ] Redirect map loaded; CI check green against production preview.
- [ ] Rank/traffic baseline snapshot taken (SEO-PLAN Phase 0).
Cutover (T-0)
- [ ] DNS switch; verify apex/www single hop; verify 20 top legacy
      URLs by hand; verify forms + emails on production; verify
      Studio at /studio on the production domain.
- [ ] Search Console: add + verify the new property (domain
      property), submit sitemap, use Change of Address if the host
      changes; Bing Webmaster import from GSC.
- [ ] GBP website URL + NAP checked; social profile links updated.
- [ ] Run `probe.yml`, `lighthouse.yml`, `aeo.yml` against production;
      record results in PROJECT-LOG.
Post-launch (T+1 to T+14)
- [ ] Daily: GSC coverage + 404 report, Vercel logs for 404/500,
      inbox health; fix same day.
- [ ] T+7: CWV field check; AEO grade compared to pre-launch; first
      "Questions people already ask" run → FAQ additions.
- [ ] T+14: retire the old Webflow site (keep redirects at the old
      host if it stays alive); close the launch in PROJECT-LOG.

### Stage 6 — Ongoing cadence
- Weekly: inbox review, journal post (calendar), AEO pane check.
- Monthly: Lighthouse + link check, GSC questions → FAQ updates,
  dateModified refreshes on pillars, new case study.
- Quarterly: thin-content review, redirect hygiene, token/Figma drift
  check, dependency updates.

---

## 8. Per-template QA sheet (copy per page into the QA run)

```
Route: ______            Figma frame: ______        Owner: ______
[ ] G1 matches frame @1440/1024/428   [ ] G2 no off-token
[ ] G3 one H1 / heading order         [ ] G4 title/desc/canonical/OG
[ ] G5 images alt+size+lazy           [ ] G6 sitemap + index state
[ ] G7 ≥300 words, lede answers, ≥2 question H2s
[ ] G8 schema: WebPage kind ___ + Breadcrumb + FAQPage? + entity ___
[ ] G9 Updated line + dateModified    [ ] G10 byline/NAP/no placeholders
[ ] G11 present in /llms-full.txt     [ ] G12 Lighthouse mobile ≥90
[ ] G13 HTML <100KB, LCP eager        [ ] G14 Playwright green
[ ] G15 a11y pass                     [ ] G16 editable + preview works
Notes / defects (issue #): ______
```

---

## 9. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Figma edit access still denied | Rebrand blocked; design/code drift | Escalate access (A1); meanwhile build sections against the IA frames' values read via scripts |
| Series prices unpublished | Pricing/Lineup/Finish levels show bands or nothing; Offer schema thin | Decide price policy (C4); bands are acceptable; never fabricate |
| 182 thin posts migrate as-is | Content-depth gate fails; crawl budget wasted | Triage in Alpha; 301/410 before launch |
| Nightly AEO commits land on main | Rebase conflicts | Always `git fetch && rebase` before push; never commit regenerated status JSON from the sandbox |
| Trial fonts in production | Licensing exposure | A2 before Beta |
| Sandbox egress limits (figma, sanity, vercel, methodhomes.net) | Verification gaps | Use the Actions workflows (probe, fetch-page, lighthouse, aeo) as the network path |
| Testimonials without consent | Legal/trust | Consent on file per testimonial before publish |
| Launch redirect misses | Equity loss | CI one-hop check on all 330+ URLs; manual top-20 check at cutover |

---

## 10. Change log

- 2026-10-05 — Plan viewer planting rules (Bryce): shrubs in mixed
  clusters (round each tree, two diagonal corners, one drift) instead
  of rows along the walls; four shrub looks from CC0 leaf atlases so
  neighbours differ; exterior doors found in the model (doors.ts) get
  a clear approach — no shrubs, and a bare path through the lawn.
  Docs: PROJECT-LOG decision, AGENTS rule.
- 2026-10-05 — Plan viewer: organic lawn (Bryce). Procedural grass
  (src/components/model/lawn.ts): a noise-edged coverage field around
  the home that reaches out under the trees; a baked mat with a frayed,
  clumping edge plus 20k instanced tufts thinning toward the fringe;
  dissolves in plan. No downloads. Docs: PROJECT-LOG decision, AGENTS.
- 2026-10-05 — Plan viewer: ambient occlusion removed (Bryce: it
  painted grey onto the ground as the house spun), and plants moved to
  their own render layer so the ground contact shadow no longer prints
  their leaf cards as grey smears. Docs: PROJECT-LOG decision + lesson,
  AGENTS rule.
- 2026-10-05 — Real scanned planting in the real-time viewer (Bryce:
  "It needs to be real time"). plants.yml fetches Poly Haven CC0
  plants, merges their separate leaf alpha (merge-alpha.py),
  compresses (meshopt + WebP) and thins trees (thin-plant.mjs). The
  viewer (src/components/model/plants.ts) loads a scanned jacaranda
  pair after the house and dresses the shrub spots as photo clumps
  skinned with its frond atlas, replacing the painterly cards (still
  the instant fallback); mip-scaled alpha-to-coverage keeps leaves at
  distance; everything dissolves in plan. 1.3 MB, viewer visitors
  only. Docs: PROJECT-LOG decision + lessons, AGENTS planting rule.
- 2026-10-04 — Photoreal layer for the plan viewer (Bryce: the
  real-time look read as a game; "Start" on offline rendering).
  `scripts/model/render-turntable.py` renders the pipeline GLB with
  Blender Cycles (bpy module): Nishita sky + sun, procedural
  fibre-cement panels and black standing seam, physical glass over an
  interior, lawn pad on a transparent film; 36 orbit frames + a
  24-frame flight to a north-up plan with a true section cut (camera
  clip start) and a palette fade to the drawing.
  `scripts/model/encode-frames.mjs` → AVIF + WebP + poster +
  manifest; `TurntableViewer` (no WebGL: drag to turn, "Floor plan"
  plays the sequence, progressive preload) at /library/turntable
  with the sample house's frames in public/models/sample/turntable/.
  model-pipeline.yml gained a render step (inputs render/frames/
  samples). Docs: PROJECT-LOG decision + lessons, AGENTS 3D rules.
- 2026-10-05 — Realism pass (Bryce: Samara's renders are the bar).
  Pipeline splits window panes from frames (new `frame` category);
  renderer gains `--style studio` (shadow catcher on the transparent
  film), `--hdri`, `--textures` (box-projected PBR); workflow fetches
  a Poly Haven sky + texture sets and takes `frames_dir`. First
  real-HDRI run dispatched against the sample on Actions.
- 2026-10-04 — 3D plan viewer prototype (Bryce: interactive floor
  plans — the home spins on its vertical axis, "Floor plans" flies to
  a north-up top view and cuts the model into a drawing). IFC → GLB
  pipeline `scripts/model/ifc-to-glb.py` (IfcOpenShell + trimesh:
  keep architecture by IfcType, drop furniture/fixtures/services/site,
  re-material by category, one mesh per storey × category, metres,
  Y-up, centred, TrueNorth stored) + gltf-transform compression;
  viewer `src/components/model/PlanViewer.tsx` (three + React Three
  Fiber) behind `LazyPlanViewer` (ssr:false, idle + in view, WebGL
  check, poster). Floor plan docs gained `model` (GLB) + `northDeg`;
  the plan page shows the viewer above the drawing when a model is
  uploaded; /library/plan-viewer runs the sample house.
- 2026-10-04 — Shared sections batch 3: Testimonial (Review),
  Logo row, Team grid (Person nodes; teamMember gained credentials +
  LinkedIn), Map block (rows from Market documents; links gated on
  `linkRows` until /where-we-build ships), Form block (contact form →
  /api/forms simple form “contact”; phone/email from Site Settings;
  page types itself ContactPage). Every shared section in the Figma
  library (B1) now exists in code.
- 2026-10-04 — Generated type scale (Bryce's spec: respect the Figma
  Mobile / Tablet / Desktop variables, clamp between them, keep
  scaling above 1440). `design/type-scale.json` + `npm run type` →
  the `@generated:type-scale` block in globals.css: 20 styles named
  as in Figma (label-xs…display-xl), two linear segments 428→1024→1440,
  then ×0.5 of the viewport's growth to 1920 where the root zoom takes
  over; one clamp() per token. Renames: template `text-display-xl`
  (40→64) → `text-display-sm`; `text-display-2xl` → `text-display-xl`.
  New tokens: label-xs/lg, body-xs/lg, display-sm/md/lg. Verified at
  nine widths (e.g. Headline Large 40 / 48 / 48 / 56 / 74.7 at 428 /
  1024 / 1440 / 1920 / 2560) and 0 off-token type readings across
  the swept sections.
- 2026-10-04 — `/predesigned` lineup page: Hero / Page, series Card
  grid (4 cols), Lineup editorial section (pill toggle → photo,
  sentence, meta, four numbers, exterior palette; pills link to the
  series pages), Number interstitial (plan count), "Why a series"
  Text intro, Compare table (6 columns from the catalog), FAQ (5
  designed questions, page-doc override), CTA band. CollectionPage +
  ItemList of series Products + FAQPage + Breadcrumb. Series schema
  gained `factoryWeeks`, `bestFor`, `palette[]`. FAQ section/component
  gained a side link. Every number on the page comes from the series
  documents; footnotes ¹²³ → catalog / prices / schedules.
- 2026-10-04 — Series routes: `/series/<slug>` (Hero / Series,
  Sub-nav, overview, facts bar, plans grid, finish levels, Spec
  table, gallery, FAQ, CTA; WebPage→Product+AggregateOffer+hasVariant,
  ItemList, FAQPage, BreadcrumbList) and `/series/<slug>/<plan>`
  (Hero / Page, drawing as LCP, Size-it-up spec table with lettered
  dimensions, PDF link, photos, sibling plans; Product isVariantOf +
  Offer + DigitalDocument). New section types Hero / Page, Sub-nav,
  Spec table; every section gained an `anchor` id field; Presentation
  locations + routes for series/plan; sitemap, llms.txt and
  llms-full.txt carry series + plans; `/series/*` redirects live.
  `text-body-xl` token (Body XLarge 18→20) added.

- 2026-10-04 — Shared sections batch 2 in code: Card grid, Process
  timeline (+ HowTo JSON-LD), Compare table, Link list, Interstitial
  (5 kinds, floating parallax). `text-display-2xl` token added for
  Method's Display XL (72→176). All 10 P1 shared sections now exist
  in code; Hero / Page, Hero / Series, Sub-nav, Gallery, Testimonial,
  Logo row, Spec table, Team grid, Map block, Form block remain.
- 2026-10-03 — Libraries bound to the system: text styles on all
  text, spacing/container variables on all paddings and gaps, Mobile
  variants driven by the Typography collection's Mobile mode; Display
  XL/Regular style + `Font size/display-xl` variable added (A2's
  "Display XL" item done).
- 2026-10-03 — Figma restructured (Bryce's request): every section
  (35 shared + 13 editorial sets) and all 40 pages are component sets
  with Device=Desktop|Mobile; the Mobile variants are a scripted first
  pass for the finesse pass (A4 now [~]).
- 2026-10-03 — Shared sections batch 1 in code: Text intro, Stats
  bar (footnotes + sources), Feature list, CTA band — schema, preview
  twin, /library entries, zero off-token readings. globals.css gained
  spacing 3xl/5xl/7xl and `max-w-page` (1280). Token notes for the
  rebrand: Method's 2xl is 20 (template 24); body-lg 18px has no
  template step (rendered body-md); the comp's primary button is black
  on the dark band while `bg-btn` flips white in dark mode.
- 2026-10-03 — Figma page frames reconciled to the accepted scheme
  (13 frames renamed: series → /series/*, Portfolio → /projects,
  /architects, short commercial slugs); market slugs = full state
  names. Bryce kept /series over the design's /predesigned nesting.
- 2026-10-03 — URL scheme accepted (C4 decided). Journal route and
  components renamed to blog (`/journal*` 301s); legacy redirect map
  generated from the 331 crawled URLs (118 live, 20 pending, 191
  keep, 2 gone) and wired into next.config.ts; `redirects.yml` one-hop
  check; three CMS page slugs renamed (custom-homes, predesigned,
  architects).
- 2026-10-03 — First production QA baseline recorded (46/100, §0).
  Fixes from it: llms-full GROQ alias, visible Updated line + machine-
  readable byline on posts, checker accepts BlogPosting as the page
  node. Open from it: title-length pattern (G4) and the default
  og:image (A3).
- 2026-10-03 — Sanity model: series, plan, market, commercialType,
  press, glossary document types + shared AEO field helpers; desk
  restructured; project gains state/architect/certifications. QA
  gate checker (`scripts/qa-pages.mjs`, `qa.yml`) added; its first
  local run found the home page had no WebPage node (fixed) and no
  default og:image site-wide (open: needs the brand asset, A3).
- 2026-10-03 — Running docs rule adopted (AGENTS.md): approved
  design/dev ideas are logged here and in PROJECT-LOG in the same
  turn.
- 2026-10-03 — Created. Consolidates SEO-PLAN phases, the ten AEO
  plays, the Figma IA/section inventories, the Sanity model gaps and
  the stage gates into one plan. Status reflects the repo at commit
  6f27fdb.
