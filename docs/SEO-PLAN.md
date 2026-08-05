# SEO work plan — methodhomes.net rebuild

Grounded in the 2026-08-05 audit of the live Webflow site: the
`design/method-content/pages.json` crawl (331 pages) plus live probes
run from the `probe.yml` Actions workflow (head tags, robots, sitemap,
redirects, homepage weight). Every item below traces to an observed
defect; evidence is noted inline. Work the phases top to bottom —
each phase is shippable on its own. Strike items through as they land.

Key verified facts the plan is built on:

- 0 JSON-LD blocks on any probed page; canonicals only on the blog
  template; `og:image` missing site-wide; collection items (portfolio,
  series, blog posts) missing og:title/og:description/twitter:card.
- 184/331 pages missing meta descriptions (174 of 182 blog posts);
  5 duplicate-title groups ("Method Homes" ×7); 35 junk-short titles;
  64 over-long.
- Homepage HTML is 2,256,920 bytes — 2,194,812 of them are two base64
  data-URI images inlined in the document. 47/49 homepage images
  lazy-load, including the hero.
- 266/331 pages under 250 words; portfolio project pages ~85–90 words.
- ~2,355 of 2,659 captured images have empty alt; 893 exceed 300 KB;
  portfolio pages carry 11–18 MB of imagery.
- Duplicate project URLs live simultaneously with no canonicals:
  `/peninsula` + `/custom-portfolio/peninsula-custom-by-studio-s2` +
  `/project/peninsula` (all 200). Legacy sections still indexable:
  `/custom-portfolios-new-design/*`, `/project/*`,
  `/commercial-project-types/*`.
- Sitemap (330 URLs) includes `/search`, intake surveys, and
  `-copy` duplicates, all returning 200 with no robots rules.
- Apex redirect is two hops (http://apex → https://apex → www).
  Trailing-slash 301s and real 404s work — preserve both.

## Phase 0 — Baseline & access (before build decisions)

- [ ] Get Google Search Console access (or export): top pages, top
      queries, coverage report. Decides which of the 330 URLs carry
      equity → how aggressive blog pruning / slug changes can be.
- [ ] Get analytics access (GA or Webflow analytics) for traffic
      baseline per URL.
- [ ] Snapshot current rankings for the target keyword set (see
      Phase 4 mapping) so post-launch movement is measurable.
- [ ] Re-run `fetch-method-content` workflow for a final content
      capture immediately before launch (crawl is resumable; catches
      content edited after 2026-08-05).

## Phase 1 — URL architecture & redirect map (design-time, blocks everything)

- [ ] Define the canonical URL scheme: one URL per project
      (`/projects/<slug>` or keep flat slugs for the 10 equity pages),
      series (`/series/<slug>`), regions, commercial types, press,
      journal.
- [ ] Build the full 301 map covering ALL 330 sitemap URLs plus
      off-sitemap legacy URLs found live (`/project/calistoga`,
      `/project/peninsula`, `/custom-portfolios-new-design/*`, old
      `/press` 301 target). Single-hop only.
- [ ] Collapse duplicate project clusters to one URL each:
      peninsula, calistoga, santa-rosa, sv-residence (×3 incl.
      `/sv-residence-arc`), fish-creek, lid-park (in two portfolios).
- [ ] Decide fate of every thin blog URL (182 posts, median 185
      words): keep+expand (~30 substantive), 301 to press page or a
      related page, or 410. No thin page migrates as-is.
- [ ] Junk URLs: delete + 301 `-copy` surveys and `/res-survey`;
      `noindex` live surveys, `/search`, thank-you pages.
- [ ] Encode the map in `vercel.json` / `next.config.ts` redirects;
      add a CI check that every legacy URL resolves 301→200 in one hop.
- [ ] Collapse apex redirect chain to a single hop; keep
      trailing-slash 301 and 404 behavior.

## Phase 2 — Metadata & schema layer (build into templates once)

- [ ] SEO object on every Sanity document type: metaTitle +
      metaDescription with character counters, ogImage override,
      noindex flag, canonical override (A2 editor pattern from the
      scaffold).
- [ ] Template-level fallbacks so no page renders without title/
      description: project → "<name> | <type> Modular Home | <City,
      ST>" (the pattern the 10 newer flat pages already prove out);
      series → "<name> Series | Prefab Home by <architect>"; etc.
- [ ] Full OG + Twitter card set on all templates; branded default
      share image; projects/posts default og:image to first photo.
- [ ] Canonical tag on every page, self-referencing by default.
- [ ] robots.txt with real rules (search, surveys, studio, API) +
      sitemap reference; `meta robots noindex` on utility pages.
- [ ] Generated sitemap.xml from Sanity: canonical URLs only, real
      lastmod, no utility/junk pages.
- [ ] JSON-LD (site has zero today):
  - [ ] Organization + HomeAndConstructionBusiness (NAP: 95 Yesler
        Way Suite 300, Seattle; founded 2008; areaServed Western
        US + Canada; sameAs socials) — sitewide.
  - [ ] BreadcrumbList on all nested pages.
  - [ ] FAQPage on the FAQ (2,795 words of real Q&A ready to go).
  - [ ] Article on journal posts (author, dates, image).
  - [ ] Product/CreativeWork per predesigned series with specs.
  - [ ] ImageObject galleries on projects; VideoObject where install
        videos exist.
  - [ ] WebSite + SearchAction if on-site search is kept.
- [ ] Validate schema in Rich Results Test pre-launch (runner probe
      can lint JSON-LD presence per template).

## Phase 3 — Templates & on-page structure

- [ ] One H1 per template, everywhere (85 pages currently multi-H1;
      live placeholder "Heading" H1 on /predesigned-series/annata;
      /blog H1 says "Press"; 2 pages have no H1).
- [ ] Semantic heading hierarchy — slider counters and section labels
      stop being h2/h3s.
- [ ] Project template with structured fields (already in the Sanity
      schema): location, sq ft, beds/baths, series, architect, year,
      certifications + narrative body. Kills the ~85-word project
      page problem structurally.
- [ ] Breadcrumbs component (paired with BreadcrumbList schema).
- [ ] Related-content blocks: related projects (series/region/
      architect), series ↔ built examples, region ↔ projects.
- [ ] Image alt required-by-default in Studio with template fallback
      ("<project>, <shot subject>, <city>"); seed from the crawl's
      generated alts in `pages.json` (~300 descriptive alts exist).
- [ ] width/height on all rendered images (CLS 0).

## Phase 4 — Content (writing work, parallel to build)

- [ ] Keyword map per template committed to this doc: home =
      prefab / custom modular homes; pricing = modular home cost;
      what-is-prefab = what is prefab construction; series = "<series>
      prefab home"; regions = "mountain modern prefab", "Tahoe modular
      home", etc.
- [ ] Expand /pricing (581 words) into the cost pillar: ranges,
      cost-per-sqft, soft/modular/site cost breakdown, financing.
- [ ] Expand /what-is-prefab (408 words) into the prefab pillar.
- [ ] Rebuild the four region/lifestyle pages as real landers
      (currently ~170 words each and the live section 404s):
      mountain, valley/vineyard, island/waterfront, city/urban —
      each linking its projects.
- [ ] Make the four commercial project types real service pages
      (multifamily, classrooms, workforce housing, hospitality —
      currently ~200 words, all titled "Method Homes").
- [ ] Split Press from Journal: press page for the ~150 clippings
      (Curbed, Dwell, The Oregonian…), journal keeps ~30 substantive
      posts, expanded.
- [ ] New pages with proven demand already evidenced on the old site:
      ADU / backyard cottage; fire-rebuild expertise (Santa Rosa, LA
      fires); FAQ maintained and expanded.
- [ ] Rewrite the 64 over-long and 35 junk-short titles via the
      Phase 2 fallback patterns; hand-write descriptions for money
      pages (fix the 4 duplicate-description groups).
- [ ] About page: named team/leadership, certifications (LEED,
      Energy Star, Living Building Challenge, Passive House), 400+
      projects since 2008 — surfaced, not buried.

## Phase 5 — Performance (playbook already binding; SEO-critical items)

- [ ] Homepage HTML budget < ~100 KB — no base64 image inlining
      (old site: 2.19 MB of data-URIs inside a 2.26 MB document).
- [ ] Every image through the Sanity CDN: auto=format + explicit
      width per surface + srcset on large surfaces (old site: 893
      images > 300 KB, a recurring 3.5 MB PNG, 11–18 MB portfolio
      pages, partial srcset coverage).
- [ ] LCP element painted from first frame: hero eager +
      fetchPriority=high + preload; never lazy, never faded (old
      site lazy-loads its hero).
- [ ] Static generation for all indexable routes; CWV verified via
      `lighthouse-history.yml` against production before calling any
      phase done.

## Phase 6 — Launch & migration protection

- [ ] Staging parity crawl with the audit script: titles, metas,
      canonicals, schema, H1s, alt coverage — diffed against this
      plan's acceptance criteria per template.
- [ ] Test the full 301 map on staging (all 330+ legacy URLs,
      one hop, correct targets).
- [ ] DNS/host cutover with the single-hop apex redirect.
- [ ] Verify Search Console (+ Bing) on the new site; submit new
      sitemap; keep the old sitemap 301-ing.
- [ ] Daily GSC coverage + 404 watch for 2 weeks; fix crawl errors
      as they surface; monitor CWV field data.
- [ ] Post-launch probe.yml run to re-verify robots, sitemap,
      canonicals, schema on production.

## Phase 7 — Ongoing (post-launch cadence)

- [ ] Rank tracking for the Phase 4 keyword set.
- [ ] `lighthouse-history.yml` scheduled against key prod pages;
      `check-links.yml` for dead links.
- [ ] Journal cadence via the Studio content calendar.
- [ ] Quarterly thin-content and coverage review against GSC.
- [ ] Google Business Profile aligned with on-site NAP; review
      strategy for project testimonials.
