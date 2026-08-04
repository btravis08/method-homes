# Greenfield playbook — Next.js + React + Sanity

Portable rules for starting the next site from scratch. Distilled from
building the SDR storefront (mobile PageSpeed 18MB/51.9s-LCP → sub-1MB
/ green TBT), including every incident that produced a rule. The
project-specific working copy lives in AGENTS.md; this file is the
framework-level version meant to be copied into a new repo on day one.

## Images

1. Content imagery is a real `<img loading="lazy" decoding="async">` —
   never a CSS background. Backgrounds can't lazy-load and are
   invisible to the preload scanner and to LCP.
2. Every CMS image URL carries an explicit width sized to its surface
   plus `auto=format`; large surfaces add a srcset. Never request the
   raw asset URL.
3. The first viewport's image is eager + `fetchPriority="high"` and
   preloaded from the page (`ReactDOM.preload`, with `imageSrcSet` so
   the browser fetches exactly one candidate). Everything else waits.
4. Hover/variant imagery mounts only on hover-capable devices, after
   pointer entry. Never render all variants eagerly.
5. Static files are compressed before commit (mozjpeg q~72–75, palette
   PNG for product shots). Nothing over ~300KB ships without a reason.

## LCP — the golden rule

6. The LCP element must be TECHNICALLY PAINTED from its first frame.
   Animate anything — but a fade-in on the LCP element is forbidden:
   - Images: paint at opacity 1; fade a surface-colored overlay OUT on
     top (the fade-in is an illusion).
   - Text: CSS keyframe animation starting at opacity 0.011 (LCP only
     counts non-zero-opacity frames), never a JS-driven fade —
     hydration must never gate a paint. A JS fade also makes the paint
     look script-dependent to Lighthouse's simulator, compounding the
     penalty.
7. Know WHICH element is scored: Chrome excludes some images
   (low-entropy heuristics), so the biggest *qualifying* element may
   be a headline, not the hero photo. Log real
   `PerformanceObserver('largest-contentful-paint')` entries; don't
   assume.
8. Cap visual-completeness animations (~0.9s) — Speed Index scores how
   fast the screen LOOKS finished, and a screen mid-fade reads as
   incomplete.

## JavaScript & hydration

9. One LazyMotion provider app-wide; import `m.*` only — a single
   `motion.*` import drags the full runtime back into a chunk. Eases
   and durations are named tokens in one file; CSS twins must match
   the tokens.
10. Reveals/entrances are STATE-DRIVEN (`initial={false}` + a flag
    flipped by an IntersectionObserver), never mount animations —
    anything under a presence context (page transitions) silently
    suppresses mounts. Inside horizontal rails, observe the RAIL, not
    the clipped slide (a sideways-offscreen element reports zero
    intersection at any rootMargin).
11. Effect dependencies must be identity-stable. An effect keyed on an
    array/object rebuilt each render re-fires after EVERY render — at
    best wasted work, at worst it silently kills router navigation
    (Link clicks run `router.push` and the URL never commits, no
    errors anywhere). Key on a joined string instead. After touching
    effects on shared components, Playwright-verify "click a Link →
    location.pathname changes".
12. Below-fold interactive components load as split chunks
    (`next/dynamic`, SSR intact) and render inside per-section
    `<Suspense>` boundaries — React hydrates boundaries at low
    priority instead of one long task, and promotes whatever the user
    touches. The above-fold path stays eagerly bundled: it IS the
    critical path.
13. NO lazy-hydration hacks (innerHTML adoption): React 19 answers a
    hydration mismatch with a full client re-render, which breaks
    frozen-router transitions and freezes reveals.
    `content-visibility: auto` is the approved render-cost tool for
    below-fold sections.
14. Expensive startup work (canvas sampling, probes) waits for
    `requestIdleCallback`. Interaction-only chrome (modals, flyouts,
    zoom viewers) loads via `next/dynamic` ssr:false wrappers.
15. If a smooth-scroll library owns scrolling (Lenis), every scroll
    reset goes through it — a bare `window.scrollTo` is overridden on
    the next frame.

## Data (Sanity)

16. One `sanityFetch` wrapper for the whole site: tag-based
    revalidation driven by a publish webhook, a short time revalidate
    as the safety net, and EVERY failure path returns the caller's
    fallback — the site renders empty states, never crashes, when the
    API is unreachable.
17. GROQ comments are `//` ONLY. A `/* */` inside a query string fails
    silently site-wide — every fetch falls back and the site looks
    like the no-CMS demo. If prod shows fallback content over a
    healthy dataset, suspect query syntax FIRST.
18. Document `_id`s never contain a dot: dotted ids are path/namespace
    ids, invisible to the `published` perspective the site queries
    with, while the Studio still shows them — the break is silent.
19. Keep list/card projections slim; page-only fields (sku, inventory,
    body) live only in page queries.
20. Idempotent seed/import scripts, and never re-run a seeder over
    content a human has since edited.

## Process — worth as much as the code

21. Measure before keeping. Every perf-flavored change gets numbers
    from a repeatable harness: Lighthouse in CI against production,
    and numeric Playwright assertions locally (computed opacity,
    scrollLeft, longtask totals, real PerformanceObserver entries) —
    not eyeballed screenshots.
22. Distrust single runs. Shared CI runners swing 2–4× on CPU metrics
    between consecutive runs of identical code; judge trends across
    2–3 runs and learn the quiet hours. A/B locally under a fixed CPU
    throttle (3 samples per build, compare medians).
23. Localhost with CMS fallbacks proves component behavior, NOT data
    wiring — CMS-path bugs only reproduce against production. Keep a
    prod-probing loop (curl/grep in CI) for that.
24. Adopt bleeding-edge platform features (PPR/cache modes, compilers,
    speculation rules) behind a measurement, and be genuinely willing
    to revert the same day — commit the full recipe so the retry is
    cheap. A feature that moves the architecture forward but the score
    backward is a revert.
25. When something bites, write the rule down immediately, in the repo
    the next agent/developer will read. This file is that habit.

## The one-liner

Server-render everything; paint the first viewport honestly with zero
JavaScript in its path; make all motion an illusion layered on top of
already-painted content; treat the CMS as untrusted input; and never
ship a perf claim you didn't measure twice.
