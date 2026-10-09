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
| 5 | **Series facts**: beds / baths / sq ft / module count / starting price (or price band) / timeline / specs / finish levels / FAQ / photos per series (Elemental, Option, Cabin, M, Paradigm, Method One, Annata) + each floor plan (beds, baths, sq ft, modules, dimensions, drawing, PDF) | `/series/<slug>` and `/series/<slug>/<plan>` pages (code shipped 2026-10-04; they 404 until the documents exist), Product/Offer schema, Pricing page, comparison pages | Studio → Series & plans |
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

### 2026-10-04 — Photoreal layer: offline Blender Cycles turntable + plan-cut frame sequence (Bryce: "Start")
- Bryce judged the real-time viewer's look ("early 2000s game",
  fake HDRI reflections, aliased edges) and asked for a more
  sophisticated rendering technique. Decision: render OFFLINE with
  a path tracer and ship frames, not a real-time shader. Blender
  Cycles as a Python module (`pip install bpy`, 4.5 LTS) runs on the
  Actions runner; the browser only shows images. The raster
  PlanViewer stays as the interactive/plan twin; Gaussian splats
  remain a later option for photographed homes.
- `scripts/model/render-turntable.py` builds the scene from scratch
  per run from the pipeline's uncompressed GLB: Nishita sky (the
  physically based atmosphere; no HDRI file — download.blender.org
  and Poly Haven are 403 from the sandbox, and the sky's own sun is
  importance-sampled), hazier late-afternoon sun (intensity 0.55,
  dust 2.0, exposure −0.8 under AgX so sunlit faces don't bleach),
  per-category materials — fibre-cement panels as a procedural brick
  grid whose horizontal axis follows each face's normal (4 × 8 ft,
  12 mm reveals, bump), Kynar-black standing seam as a dark
  DIELECTRIC paint (Fresnel sky reflections at grazing, near-black
  face-on; a metallic black reflects nothing) with 16 in ribs as
  bump, physical glass (IOR 1.52, transmission) over a dark interior
  box capped below the eaves, concrete slab — and a lawn disc
  (two-scale noise shader, radial alpha fade) on a transparent film
  so frames sit on the page surface. Orbit: 36 frames at 26°
  elevation. Plan flight: 24 frames easing to straight above with
  the lens going 40 → 160 mm (≈ orthographic) and the model turning
  north-up; over the last 40% the camera's clip start descends in
  WORLD height from above the ridge to 1.2 m above the storey (a
  true section cut, no booleans), the roof stops casting/bouncing
  light and the sun climbs to noon so the opened floors read evenly,
  and every material mixes to the drawing palette (walls black,
  floors paper, glass blue). Output PNGs + manifest.json;
  `scripts/model/encode-frames.mjs` (sharp) writes AVIF (q55, 4:2:0,
  alpha) + WebP fallback + a 48 px blurred poster and copies the
  manifest with byte sizes.
- `TurntableViewer` (client; no WebGL): drag or arrow keys turn the
  home through the orbit frames (the nearest LOADED frame always
  shows, so a drag never flashes empty); "Floor plan" plays the
  flight forward at 24 fps and holds on the drawing, "3D" plays it
  back; frames preload progressively (first frame, then every 8th,
  4th, 2nd, rest; plan frames on first request); reduced motion
  jumps. Sample at /library/turntable, frames in
  public/models/sample/turntable/ — the sandbox set (24 orbit + 16
  plan frames at 1280 × 800, 48 samples, 34 min on 4 CPU cores) is
  **0.41 MB of AVIF for all 40 frames** (5–14 KB each; the WebP
  fallback set is 2.6 MB), far under the 3–5 MB budget, so the
  workflow's 1440 × 900 / 96-sample set has room. Headless Chromium:
  drag turns, arrow keys step, Floor plan plays to the drawing and
  back, 41 image requests all unique, no console errors. Gotcha: AVIF
  support must be probed by DECODING a tiny AVIF — Chrome decodes AVIF
  but refuses to encode it, so canvas.toDataURL says "no" everywhere
  and the WebP fallback would have shipped to every visitor.
  model-pipeline.yml gained a
  render step (inputs render/frames/samples; ~1–2 min a frame on a
  runner at 1440 × 900, so the job timeout is 5.5 h) that commits
  public/models/<slug>/turntable/ beside the GLB.
- Lessons: (1) a driver on a shader Value socket never evaluated in
  module mode — every material sat at the node's 0.5 default and the
  whole house tinted toward the plan palette; set the Value nodes
  directly per frame. (2) The camera clip plane hides geometry from
  the camera only — the roof still blocked light and the opened plan
  rendered black until the roof's ray visibility was switched off for
  the cut. (3) The interior box must stop below the eaves, or it
  pokes through the roof slopes as "beige slabs". (4) Hair-particle
  grass is pointless from 40 m: 9 cm blades are sub-pixel; a two-scale
  lawn shader does the work for free. (5) Express the section cut in
  world height, not as a fraction of the camera distance — at 150 m
  the latter only bit in the final two frames. (6) The lawn's radial
  fade must be in unit-disc coordinates (scale object coords by
  1/radius) or the gradient is 1 m wide.
- Realism pass (2026-10-05, Bryce set Samara's product renders as the
  bar: bright sun, detailed shadows, HDRI reflections in glass,
  sheen vs matte). Shipped: (1) the pipeline splits window PANES from
  FRAMES by each face's surface-style transparency (Revit windows
  carry an opaque frame style and a ~0.75-transparent glazing style)
  — new `frame` category, dark anodised in both viewers; (2) `--style
  studio` (default): a shadow-catcher ground on the transparent film,
  so the home sits on the page with only its shadow, like Samara's
  white product shot (lawn stays as `--style lawn`); (3) `--hdri` +
  `--hdri-rotation` (Environment Texture world; a top Sun lamp fades
  in with the plan cut because an HDRI's sun can't be moved to noon)
  and `--textures` (Poly Haven-style diff/rough sets, box-projected
  from object space since the models have no UVs, multiplied into the
  procedural finishes); (4) the workflow render step fetches a Poly
  Haven sky + plaster/metal/concrete sets through api.polyhaven.com
  (each optional) and takes `frames_dir` so the sample's frames land
  in public/models/sample/turntable. Verified here on synthetic
  stand-ins (sandbox can't reach Poly Haven); the real-HDRI run is
  the Actions dispatch. Honest limit: the renderer is no longer the
  gap — Samara's detail (mullions, deck, fascia, solar, furniture,
  trees, pool) is MODEL and SCENE DRESSING. A real Method model
  through the pipeline is the next test; entourage needs an asset
  library pass.
- Smoothness (Bryce, same day: "so jumpy", then "the 3D plan viewer
  is smoother"). A frame sequence can only show the angles it has, so
  the viewer now (1) draws decoded frames to a canvas — swapping an
  <img> src re-decoded and flashed on every step, (2) keeps the turn
  as a continuous angle with momentum on release that settles onto an
  exact frame, (3) cross-fades the two frames either side of the
  current angle while moving, so the idle spin and a drag read as
  motion rather than steps, (4) spins slowly on its own until the
  first touch. The real set is 72 orbit frames (5° steps) instead of
  the sandbox's 24 (15°). The workflow render is sharded across six
  runner jobs (a frame is ~2.5 min on a runner at 1440 × 900 / 64
  samples — slower than the sandbox — so 96 frames were a 4-hour job;
  convert → render × 6 → encode now turns a set around in under an
  hour). Gotcha: the inline Python in the Poly Haven fetch carried
  YAML indentation and raised IndentationError, so the first runner
  render silently fell back to the procedural sky; the lookup is a
  one-liner and logs each asset's byte size.
- The raster viewer takes the same HDRI (Bryce: "Can the procedural
  one use hdri?"). `scripts/model/prep-env.py` (numpy only — a small
  Radiance RGBE reader/writer with RLE) downsamples the render's sky
  to 512 × 256, bakes the render's rotation into the image (Blender's
  Mapping-node +θ shows the sky turned −θ; roll the columns by θ/360;
  Blender's Z-up and three's Y-up equirect lookups agree once the
  GLB's axis swap is applied, so no mirror), and finds the sun
  (brightest 5 × 5 region) → public/models/env/{sky.hdr, env.json}.
  PlanViewer loads env.json + the HDR through RGBELoader → PMREM as
  scene.environment (intensity 0.55) and points its directional light
  at the HDRI's sun, so glass and metal reflect a real sky and the
  shadows agree with the turntable frames; RoomEnvironment remains
  the fallback. The workflow gained an `env` job that refreshes the
  folder from Poly Haven. Budget: a real 512 × 256 sky is a few hundred
  KB, fetched only inside the lazy viewer chunk.
- First real-HDRI render on Actions (run 37253100387): 72 orbit + 24
  plan frames at 1440 × 900 / 64 samples, Poly Haven
  kloofendal_48d_partly_cloudy_puresky at rotation 120°, studio
  shadow catcher, PBR sets. Six shards took 22–45 min each (≈2.5 min
  a frame; one shard's 16 frames in 1355 s), the whole run 52 min
  wall-clock, encode included. Output: **0.58 MB of AVIF for all 96
  frames** (avg 6 KB — the transparent studio frames compress far
  better than the lawn set), WebP fallback 3.9 MB, folder 5.0 MB on
  disk. The frames read as a product shot: dark seamed roof with a
  soft sky sheen, grey panel siding with reveals, dark window frames
  around real glass, a hard sun shadow on nothing (the page surface).
  This sky's sun sits behind the home from the first frames, so the
  orbit opens on the shaded elevations — a one-number rotation change
  in the workflow if the sunlit side should greet first.
- What Samara actually uses (checked from a runner with the new
  probe-url workflow, 2026-10-05): the configurator at
  samara.com/adus/configure is a separate Svelte 4 bundle (Vite-hashed
  index-*.js, ~400 KB+) that renders LIVE in three.js (a 2025 r16x
  build: WebGLRenderer, MeshPhysicalMaterial with transmission,
  AgX/ACES tone mapping available) with GSAP for motion, lil-gui left
  in, Mapbox for the site map; a separate "3D tour" route loads a
  Draco-compressed GLB (/assets/tour/assets/xl8.glb) with baked
  texture JPGs. Not Unity, not an image sequence. So their smoothness
  is the same real-time route as our PlanViewer; their look comes
  from a detailed authored model with baked textures. The frame
  turntable remains our photoreal layer; the real-time viewer is the
  one to invest in for interaction.
- Aliasing pass on the raster viewer (Bryce: "jumpy jagged lines").
  Two sources: the canvas rendered at ≤1.5 × device pixels, and the
  procedural reveals (12 mm) and seams (30 mm) were drawn with hard
  metre-width edges, so at a distance they were sub-pixel and
  shimmered as the model turned. Fixes: device pixel ratio up to 2
  with drei's PerformanceMonitor stepping it down only when the frame
  rate sags (Samara caps at 2 and lowers resolution during drags);
  analytic anti-aliasing in the finish shaders — edge ramps at least
  one screen pixel wide via fwidth(), and a coverage term that fades a
  line out as its width drops below a pixel, so distant joints read as
  a faint even tone instead of sparkling. Verified at 2 × in headless
  Chromium: 2560 × 1440 backing store, clean edges, seams fading with
  distance, no errors.
- Borrowed from Samara's configurator (Bryce: "take what we can"):
  (1) a LONG LENS — FOV 8° with the orbit radius at 7.2 × the model's
  largest dimension (was 35° at 1.6 ×; distance ∝ 1/tan(fov/2) keeps
  the framing), so the home reads as a flat product render with no
  perspective splay, and near/far hug the radius (0.3 × / 3 ×) because
  a 0.1 m near plane 170 m out starves depth precision and panes fight
  their frames; (2) RESOLUTION SCALING ON INTERACTION — pixel ratio
  drops to 1.25 while the pointer is down and restores 200 ms after
  it lifts (their exact timing), on top of the PerformanceMonitor;
  (3) PHYSICAL GLASS — MeshPhysicalMaterial with transmission 0.92,
  IOR 1.5, 2 cm thickness, roughness 0.06, the transmission pass at
  half resolution; it fades to the flat plan blue by lerping
  transmission → 0 and opacity → the plan value; (4) NEUTRAL TONE
  MAPPING (Khronos PBR neutral) at exposure 1 instead of ACES, for
  faithful material colour. Not borrowed: Draco/KTX2 (we have meshopt
  and no textures), Svelte, GSAP, lil-gui. Two fixes that fell out:
  glass keeps FLAT shading (welded pane corners carry averaged normals,
  and smooth normals swung the refraction into a kaleidoscope across
  each pane); and in plan the split window frames turn glass-blue
  while horizontal wall faces seen from their FRONT (sills, wall tops)
  turn paper and those seen from their BACK (the hollow wall bottoms
  the cut exposes) stay ink — gl_FrontFacing, not a height threshold,
  which floor-to-ceiling windows defeated — so windows read as
  openings instead of black blocks. Materials also lerp envMapIntensity → 0.15 in plan so the
  sky's blue cast leaves the drawing.
- Finish + transition (Bryce, 2026-10-05: "off-white exterior with
  black mullion windows, black standing seam"; "the transition spins
  unnecessarily, jumps into place and looks low quality"). Palette in
  both viewers: siding #e9e5dd off-white, roof #0e0f10, frames #111.
  The flight was a per-frame lerp chasing the top view with a snap at
  98%, and the north turn ran on its own curve. Now it is a pure
  function of progress: the camera follows a spherical path from the
  orbit pose it left (polar angle closes, azimuth HELD, radius eases),
  on one cubic in-out curve over ~1.2 s, and the model turns by the
  shortest way to north + the held azimuth (screen-up in the top view
  is −(sin θ, cos θ)), so plan lands north-up from any angle with a
  turn of at most 180° (measured 29°–49°). The PerformanceMonitor now
  needs a sustained dip (6 × 1.5 s windows) before lowering
  resolution, so a flight never reads as a quality drop. The turntable
  frames were re-rendered on Actions in the new palette.
- Plan drawing as poché (Bryce, 2026-10-05: "keep the walls filled
  black and fade out the white floor"). The floor now fades to 0 with
  the transition, and the ground contact shadow fades with it. Walls
  had read as outlines: each wall's underside sits exactly on the slab
  top and the slab won the z-fight, and face/height heuristics for
  "inside the wall" broke on reversed winding and floor-to-ceiling
  windows. Replaced with a STENCIL CAP, the standard section-fill
  technique: every wall/structure solid gets two invisible clipped
  copies (back faces +1, front faces −1 on the stencil), then a black
  plane riding the cut height draws only where the stencil is
  non-zero, i.e. exactly where the cut passes through solid wall.
  Openings are gaps in the solid at the cut, so windows and doors stay
  open by construction; overlapping solids and reversed winding still
  count non-zero. The counters and cap live in the transparent list
  after the model (the glass transmission pass has no stencil
  buffer), the canvas asks for stencil: true, and sills fade with the
  floor so openings read as true gaps.
- Ambient occlusion (Bryce, 2026-10-05: "Can we do ambient
  occlusion?"). N8AO through @react-three/postprocessing: an
  EffectComposer with MSAA ×4 and a stencil buffer (the plan's section
  fill needs it), N8AO at full resolution (half-res stair-stepped the
  base silhouette against the background), radius 1.5 m, intensity 3,
  then Neutral tone mapping as the last effect (three skips tone
  mapping when rendering to a target, so the renderer runs
  NoToneMapping and canvas antialias is off — the composer does both).
  AO fades out over the first half of the plan flight. Measured with
  a matched-pose on/off pair: it darkens the band under the eaves, the
  window reveals and frames, and the gable/wall junction, with no
  halo or ground artefacts — about 0.5 % of the frame on this sample,
  because the BIM house is a convex box with flush windows and no
  deck; a detailed model gives it far more to find. Cost: the lazy
  viewer chunk grows 269 → 370 KB gzip (+101 KB), paid only by
  visitors who reach the viewer. The HDR loader moved to three's
  HDRLoader (RGBELoader is deprecated).
- Painterly planting + a colourless plan (Bryce, 2026-10-05: "more
  painterly / realistic foliage around the house?"; "I don't want plan
  view to have any color"). src/components/model/foliage.ts builds
  procedural planting with no assets: each shrub or tree crown is a
  cloud of leaf CARDS carrying a canvas-painted dab texture, with
  normals pointing out from the clump centre (lifted skyward) so the
  clump lights as one soft volume — the stylised-foliage technique —
  plus per-card muted greens darkening toward the base. One merged
  geometry per material (leaves, trunks), seeded so planting is stable;
  alpha-to-coverage under the composer's MSAA keeps dab edges smooth.
  Placement is generic until a site plan exists: shrubs along both
  long elevations, clumps at the corners, two trees off the short
  ends. It rides the model group (turns north-up with the home) and
  DISSOLVES (alphaTest
  rising) over the first half of the plan flight. Plan colour: the
  plan palette is greys only and a HueSaturation effect at the end of
  the chain goes to −1 as the view lands, so nothing can tint the
  drawing (measured: no chroma in the canvas beyond the page surface
  behind it). Photoreal planting for the Cycles turntable — Poly Haven
  CC0 plant models scattered in Blender on the runner — is the
  follow-up.
- Real scanned planting, in REAL TIME (Bryce, 2026-10-05: "It needs to
  be real time" — the realism belongs in the live viewer, not only the
  offline turntable). Poly Haven CC0 plant models are fetched by
  .github/workflows/plants.yml (the sandbox can't reach polyhaven.com):
  glTF 1k + textures → gltf-transform (meshopt, WebP) →
  public/models/plants/<id>.glb + plants.json (bytes, source, CC0).
  Three lessons, in the order they bit:
  1. Poly Haven ships leaf cut-outs as a SEPARATE alpha map ("Alpha",
     "leaves_alpha" in files.json) — its glTF diffuse is a plain RGB
     JPEG — so scripts/model/merge-alpha.py bakes it into an RGBA PNG
     (and BLEND → MASK) before compression. Without it leaves render
     as solid quads or, under alpha-to-coverage (whose smoothstep
     degenerates when alpha never varies), vanish.
  2. At the viewer's 170 m camera the GPU samples low mips, where a
     leaf card's alpha averages ~0.3 and a 0.5 cut-off erases the
     canopy (contact shadows, which ignore alpha, still showed full
     bushes — the tell). plants.ts scales alpha by the sampled mip
     level (×(1 + 0.25·lod)) and sharpens it to the pixel footprint
     around the cut-off before alpha-to-coverage.
  3. Poly Haven's SHRUBS are wild, leggy sprigs that read as weeds
     beside a house; its trees are good. So trees are whole scanned
     models — the jacaranda, thinned by scripts/model/thin-plant.mjs
     (leaf islands: seeded 15 % kept, each grown ×1.9 about its centre;
     bark meshopt-simplified; 512 px textures: 242k → 47k triangles,
     6.3 → 1.3 MB) — and shrubs are PHOTO CLUMPS: the volumetric clump
     technique from foliage.ts skinned with the jacaranda's own frond
     atlas (three fronds, picked per card), shading-only vertex colour.
     Full, garden-like masses with photographic leaves in one draw call.
  plants.ts loads after the house is up and swaps in for the painterly
  cards at the same spots (one shared planting plan, `plantingPlan` in
  foliage.ts); the cards stay as the instant and failure fallback.
  Trees are InstancedMeshes (one per sub-mesh); every plant dissolves
  on a world-space hash over the first half of the plan flight, and
  foliage reflects the sky at 0.45 (full strength silvered it). Weight,
  only for visitors who open the viewer: 1.3 MB (one tree GLB), ~98k
  triangles for the whole garden. The fetched shrub GLBs were deleted.
- Ambient occlusion REMOVED (Bryce, 2026-10-05: "It appears to paint
  gray onto the ground as the house spins"). Screen-space AO (N8AO)
  is view-dependent: on this low-contrast ground its halo darkened
  patches that swam as the model turned, for a gain of ~0.5 % of the
  frame. The composer stays for Neutral tone mapping and the plan's
  desaturation. A second source of the same smear: the ground contact
  shadow renders with an alpha-blind depth override, so every leaf
  card printed as a solid blurred rectangle. Plants now live on their
  own render layer (PLANT_LAYER in PlanViewer.tsx) that the view camera
  enables and the shadow camera doesn't, so the ground carries only
  the house's shadow. Lesson: don't add screen-space AO or contact
  shadows over alpha-cut foliage on a plain ground — both print
  artefacts the eye reads as dirt, worst while the model moves.
- Organic lawn (Bryce, 2026-10-05: grass that "thins out as it moves
  farther from the house … the grass edge undulates around the home and
  under the trees and shrubs"). src/components/model/lawn.ts, procedural,
  no assets. One coverage field drives it: the max of a superellipse
  ~4.4 m out from the walls and a soft 3.4 m disc under each tree, plus
  fBm value noise, so the edge forms bays and promontories and the lawn
  reaches out to wrap the trees. Layer 1 is a ground mat whose colour
  (mottled greens drying to straw at the fringe) and alpha (coverage)
  are baked into a 256² texture; its shader jitters the alpha with an
  8 cm world-space grain under alpha-to-coverage, so the edge breaks
  into clumps (a 3 cm grain went sub-pixel and shimmered on the spin).
  Layer 2 is 20k five-blade tufts in one InstancedMesh (100k
  triangles), placed with probability rising with coverage — dense by
  the walls, thinning outward, a few strays past the edge — taller
  toward the fringe, with up-facing normals so tufts light like the
  turf. The lawn rides the model group, sits on the plant layer (out of
  the contact shadow, which still darkens it near the walls), and
  dissolves with the planting on the flight to plan. Greens are muted
  (#3a5426–#5f7a3e): the strong sun lifts them, and the first pass at
  #66843f read lime.
- Planting RULES (Bryce, 2026-10-05: vary the shrubs so they don't look
  like duplicates; keep them in clusters, "a few around the trees", not
  lining the house; no grass or shrubs in front of front doors). The
  one planting plan (`plantingPlan`, foliage.ts) now encodes them:
  - Clusters, never rows: 3 shrubs round each tree's base, a drift of
    3–5 at two corners on a DIAGONAL (one per long side, so both
    elevations get one), one drift of 3 partway along a long side. Each
    drift has a big anchor plant and smaller ones round it.
  - Variety: four shrub LOOKS (plants.ts `LOOKS`), each a CC0 Poly Haven
    leaf atlas with its own colour, density and habit — feathery
    jacaranda fronds (airy mound), sage-silver lance leaves from
    shrub_02 (upright), broad heart leaves from shrub_03 (low,
    spreading, deepened from lime), small rounded leaves from shrub_04
    (dense dome). Each drift leads with a different look and mixes in
    an accent. The atlases are standalone 512 px WebPs
    (public/models/plants/atlas-*.webp, 56 KB total) cut from the
    earlier alpha-merged shrub GLBs.
  - Doors: src/components/model/doors.ts finds EXTERIOR doors in the
    model itself — the pipeline merges a storey's doors into one mesh,
    so door vertices are binned on a 25 cm grid and flood-filled with a
    ~1 m join (rejoining jambs without merging doors); a door on the
    ground storey's outer wall line is exterior, with an outward normal.
    The sample house yields its two (one per long side). `doorClear`
    keeps a strip the door's width + 0.9 m each side, running outward,
    free of shrubs, and the lawn's coverage field carves the same
    strip (ragged sides), so every door gets a bare approach path.
  Bug found on the way: the lawn mat's baked texture was mirrored in z
  against the tufts (a -90° X-rotated plane puts v = 0 at +z); it read
  fine until the path made the asymmetry visible.
- Lawn toned down (Bryce, 2026-10-05: "too 3d … looks too large and
  out of scale, less grass, less green"). At the viewer's distance a
  10–25 cm tuft reads as knee-high meadow. Now: 7k tufts (≈5k placed)
  at 3.5–10 cm, narrower and close in value to the mat, so they add
  grain rather than a second layer; the mat is soft grey-green
  (#55624a–#69755b) with a muted fringe; the lawn reaches 3.4 m past
  the walls and 2.8 m round trees (was 4.4 / 3.4). Lesson: ground
  cover at product-shot distance should read as a surface, not
  geometry — scale and saturation both shout.
- Stable ground, matched planting (Bryce, 2026-10-05: corner shrubs
  should match the tree colour; drop the no-grass-at-the-door rule; the
  "AO" still smears as the house spins — "I think it's the house
  footprint"; the grass edges shimmer, "terribly fake").
  - The smear WAS the footprint: drei ContactShadows re-renders the
    house from below every frame with far = the house height, so the
    roof overhang printed a blurred, footprint-shaped grey patch that
    swam as the model turned. Removed. Grounding is now a contact
    darkening baked into the lawn texture along the foot of the walls
    (wall box from doors.ts `wallBounds`) — static, turns with the
    home, costs nothing per frame.
  - The shimmer was everything sub-pixel: hash-frayed alpha-to-coverage
    edge cells and 1–2 px grass tufts. The lawn is now ONE blended
    ground plane — macro texture (512², mipmapped, anisotropic) with
    colour + contact darkening + alpha fading over ~25 cm, times a tiled
    turf-grain texture — so every pixel is a filtered average. No tufts,
    no alpha test, no shader noise.
  - Shrub colour: each leaf look is tinted so its alpha-weighted mean
    (linear, inside its rects) matches the tree's fronds; shapes still
    vary, the palette is one.
  - Grass now covers the door approaches; shrubs still keep them clear.
  Lesson: in a spinning product view, anything that is re-rendered per
  frame from a second camera, or that is smaller than a pixel, reads as
  dirt or fizz. Bake it or filter it.
- Lawn joined, darker, textured (Bryce, 2026-10-05: the grass round a
  tree was a separate circle; a shade darker; slightly more texture —
  "you over indexed on the sameness"). Each tree's disc now meets the
  home's lawn through a BRIDGE (a capsule from the trunk to the nearest
  wall point) under a smooth union, so it flows in with a waisted neck.
  Greens dropped a shade with wider spread (#3f4c35–#63724f) and
  stronger mottling. The turf grain is now drawn at a scale that
  survives filtering: at the viewer's distance a screen pixel is ~2 cm
  of lawn, so the old 1 cm strokes on a 1.6 m tile mipmapped to flat
  grey; the new 6 m tile carries 5–20 cm clumps plus strokes.
  The pale glow round the lawn edge was COMPOSITING, not colour: the
  post chain writes straight alpha to the transparent canvas, and the
  canvas was premultiplied, so wherever the image was part-transparent
  the page behind was added twice (measured: edge pixels brighter than
  the bare ground). The Canvas now sets premultipliedAlpha: false. The
  edge fade was also tightened to ~25 cm (the field changes ~0.12/m
  there, so the old 0.1-wide fade was ~80 cm of half-transparent lawn).
- No load flash; scroll-tied turn instead of a free spin (Bryce,
  2026-10-05, from a phone: "on load the old trees and textures load
  then the new ones … it flashes"; "I don't want the model to freely
  spin … tie it to scroll depth … rotates into a final resting position
  … then can be dragged").
  - Flash: the painterly cards drew first and were swapped for the
    scanned plants, and the sky could re-light the scene when the HDRI
    landed. Now nothing is swapped in view: the canvas stays at opacity
    0 until the house, the planting and the sky have all settled
    (ViewerState.checkReady; a 6 s cap, after which a late planting
    dissolves in over 0.5 s), then fades in once. The painterly cards
    are built ONLY if the real planting fails. LazyPlanViewer keeps the
    page's poster on top until the viewer reports ready (onReady), then
    cross-fades — no photo → grey → 3D. Measured sequence: poster 1 /
    canvas 0 → ready with plants, no fallback → canvas 1 → poster 0.
  - Turn: the free spin is gone. Yaw = REST − 100° × (1 − ease(p)),
    p = 0 as the viewer's top enters the bottom of the window → 1 when
    it is centred, damped (7/s) so the turn trails the scroll softly;
    scrolling back unwinds it. Read from the canvas rect in the frame
    loop (no scroll listeners). The first pointer-down hands the model
    to the user for good (OrbitControls drag); reduced motion sits at
    rest. Measured: −100° below the fold, −92° entering, 0° centred,
    unchanged after a drag and scroll-up.
- Green-tree sky + transparent plan floor (Bryce, 2026-10-05: "a better
  hdri that reflects the sky but also green trees in the reflections";
  "the floor of the floor plan should never be white … just always be
  transparent").
  - Sky: sky.yml lists Poly Haven outdoor HDRIs with greenery, renders
    previews to the `sky-previews` branch, and installs one (prep-env.py
    → public/models/env, source + CC0 in env.json). From six previewed
    (ballawley_park, charolettenbrunn_park, greenwich_park, meadow_2,
    pretoria_gardens, sunny_country_road) meadow_2 won: sun, blue sky,
    a full ring of green trees, green grass. model-pipeline.yml now
    takes the sky from one SKY_ID (meadow_2) for renders and the env
    job — the Cycles turntable still shows the old sky until re-rendered.
  - THE BUG behind "reflections do nothing": three uses
    scene.environmentIntensity for every material that has no envMap of
    its own — material.envMapIntensity is IGNORED. So the plan-mode
    reflection fade, and any per-surface strength, never applied. The
    house's materials now hold the sky themselves (mat.envMap =
    scene.environment) and ENV_BOOST sets glass 2.4, roof 0.8 (black,
    not green-cast), the rest 1, all × environmentIntensity (0.9, down
    from 1.3: meadow_2's bright green ground half lifts the bounce).
  - Window reflections are ART-DIRECTED: the 8° lens is nearly
    orthographic, so a flat pane physically reflects one direction —
    open sky ~30° up, above the trees. The glass's IBL lookup is steered
    to the horizon band (tree line along the bottom of a pane, sky to
    the top) with the azimuth sweeping along the facade, so trees run
    across the glazing and slide as the home turns. Glass is now dark
    (#1f2a30 — a light base colour read as a matte blue coat over the
    reflection), transmission 0.35, ior 1.7, specularIntensity 1.6.
  - Floor: surfaces that leave the drawing (floor, roof) keep their own
    colour while fading (lerping to the plan palette flashed them
    white); the floor is fully transparent by the first sixth of the
    flight (measured: colour constant, opacity 1 → 0 early).
- Subtle topography (Bryce, 2026-10-05: "a little subtle topography …
  realistically terrain is uneven or curves slightly into hills").
  src/components/model/terrain.ts: one height function shared by the
  lawn (its plane is subdivided at ~0.4 m and displaced, normals
  recomputed so the low sun shades the swells) and the planting (each
  plan entry gets y = h(x, z); trees sit 4 cm into the ground, clumps
  are centred on it). Level pad within 0.8 m of the walls, easing to
  full relief by 3 m — a 6 m ease (first pass) put all the relief
  outside the lawn, which only reaches ~3.4 m out. Relief: a ~9 m roll
  of ±0.42 m and a ~3 m undulation of ±0.12 m, biased +0.12 m (the
  ground tends to rise away from the home), plus a 0.22 m mound under
  each tree. Measured −0.06 … +0.49 m on the sample. From the default
  view it reads as light across the lawn; at a low angle the lawn edge
  rolls and the trees stand on mounds.
- SAMARA REALISM PASS (Bryce, 2026-10-05, side-by-side phone shots:
  "Samara has a relief, you see the house, soft shadows and less stark
  materials"). Three changes. (1) Relief in the materials: the siding
  shader is board-and-batten (40.6 cm pitch, a raised batten with a
  shadow strip beside it, a soft darkening at the wall foot), and the
  roof's standing-seam ribs are stronger, so seams read from the default
  view. (2) Real-time soft sun shadows: a variance shadow map (2048,
  blurred, frustum hugging the site) from the sun light, aligned with
  the HDRI's sun. House and plants cast; house and lawn receive (glass
  doesn't cast). Shadows and the 3D saturation fade out with the plan
  transition. (3) Calmer materials and lighting: a cooler off-white wall
  (#d7d6d1) and a charcoal roof (#3b3e41) in place of near-black. The
  shadows were already rendering but were invisible: sky 0.9 +
  hemisphere 0.4 + fill 0.5 lit the shade almost as brightly as the sun
  did, because three divides a light's diffuse irradiance by π. The
  balance is now a product shot's: sky 0.45, hemisphere 0.12, fill 0.15,
  key sun 7 (slightly warm). The glass reflection boost was raised
  (4.8) to keep its old strength.
- FIGMA REORG (Bryce, 2026-10-05: "move all the UX components to the
  UX page, order the UX pages the same way the IA cards are, left to
  right, so I can check the IA against the UX"). Moved Experiential v2,
  the Get Started intake and tray flows, and two orphaned mobile
  variants from IA Design to UX Design. The components stay on the
  left. The pages are now an auto-layout row with one column per IA
  card, aligned under a 6.2× IA instance (every column within 6 px of
  its card). Gaps this exposed: six floor-plan pages are missing
  (Method One, Cabin, Elemental, M Series, Option and Paradigm plans;
  only Annata 1 exists), and the Author page has no IA card. A stray
  nav instance uses the uninstalled "FG Culture Medium TRIAL" font, so
  the API can't move it. It is parked under the pages row.
- WEBFLOW CMS IMPORT (Bryce, 2026-10-05: "organize the information and
  place within our CMS"). Bryce exported all 10 Webflow collections to
  Drive; they now live in design/webflow-export/ (no personal data:
  projects are named by place, blog items are public posts; drafts are
  unfinished portfolio entries). `scripts/import-webflow.ts` maps them
  onto our types and runs from import-webflow.yml. What the export
  revealed: three overlapping portfolio collections (Custom, a 2024
  "New Designs" redesign that is all drafts, Predesigned) plus
  Commercial — 109 unique projects, 16 the crawl never saw; the crawl's
  "21-image galleries" were page chrome, the real galleries are 1–25
  photos; plan facts live only as bullet HTML (sq ft, deck/garage,
  Modular price, Modular+Site price, beds/baths, modules, stories) —
  parsed to numbers with ranges kept as dimension rows; series
  descriptions name the architects (Annata/Elemental: Chris Pardo
  Design, Cabin/M: Prentiss + Balance + Wickline, Option:
  Grouparchitect, Paradigm: Bogue Trondowski, Method One: Method Arc);
  blog = 200 articles, 44 press, 13 events, 75 drafts, 1,050 unique
  images. Schema grew `project.status` (completed / in-progress),
  `project.order`, `series.brochure`. Still missing after import
  (Input 5/6): series finish levels, FAQ, timelines; project modules,
  months, cost band, testimonials, geo — the export never had them.
- IMPORT RUN (2026-10-05 21:03–21:44Z, import-webflow run 6): 7 series,
  36 plans (3 drafts), 109 projects (12 drafts — one Webflow draft was
  already live from the crawl, so it stays published), 4 commercial
  types, 4 region pages, 3 post categories, 257 posts (75 drafts); 1,096
  assets uploaded, 0 failed, 0 Studio-edited docs skipped. Every crawl
  post was re-written from its Webflow row (none orphaned). Leftovers to
  delete by hand when ready: the crawl's three
  `method-page-custom-regions-*` pages (superseded by
  `method-page-custom-homes-*`). GitHub gotcha: the `ubuntu-latest`
  pool refused to acquire the job four times ("not acquired by Runner
  of type hosted") while `ubuntu-22.04` ran at once — the workflow now
  pins 22.04.
### 2026-10-08 — /pricing realigned to Method's published cost structure (Bryce: "we're off base")
- Source: methodhomes.net/pricing rendered by fetch-page.yml →
  design/reference/method-pricing.{md,png}. Method's page = intro
  (60% faster, ~6 months shorter) · Cost Structure in three
  components (Soft $40,000+ · Modular $300–$450+/sf · Site 60–150% of
  modular, each with an inclusions list) · four Pricing Variables
  (location, site complexity, size & design complexity,
  specifications) + "fixed contract price before construction" · a
  five-question FAQ with real figures · CTA + newsletter.
- Our page had: {low}–{high} placeholders, invented ~{x}% cost shares,
  "Three finish levels. One factory price." (Method sells no finish
  levels), a financing feature list (not Method content) and generic
  FAQs. All replaced.
- Figma (UX Design page): new component set `Cost structure`
  37646:61250 (Site=Simple|Typical|Complex × Device, cloned from What
  it costs 37521:15565) with How-it-works card 37646:61569. Defaults:
  2,000 sq ft → modular $600k–$900k, soft $40k+, site $480k–$1.08M
  (typical) → $1.12M–$2.02M all-in; Simple 60–80% / Complex 120–150%
  bands are a planning assumption (flagged in the set description)
  to confirm with Method. /pricing set 37565:22297: What it costs →
  Cost structure, Finish levels removed, Feature list switched to
  Columns=4 as "What moves the number", Spec table rewritten as
  "What Method publishes" (8 rows, all sourced), Interstitial = "We
  arrive at a fixed contract price before construction begins.", FAQ
  = Method's five questions, CTA = "Ready to start the process?".
  Order: Hero → Cost structure → variables → published numbers →
  Process (Bryce's instance, desktop) → Interstitial → FAQ → CTA →
  Footer. Mobile variant mirrors it.
- Bryce ("don't we need the module that has 'soft costs'"): added
  `Cost components` set 37651:69373 (Device=Desktop|Mobile, cloned
  from Feature list [Columns=3]) — Method's own three-column module:
  photo slot (3:2, placeholder fill), title, price line and the
  published inclusions list per component, verbatim. Placed right
  after Cost structure on both /pricing variants (instances
  37651:69526 / 37651:69551); it is the no-JS twin of the bespoke.
  Photos still to drop in: design studio, factory floor, crane set.
  Bryce was editing the desktop /pricing variant live at the same
  time (Nav/Hero swapped for his Title / Full / Intro components) —
  left untouched.
- Code: not started (design-dependent work paused for Bryce's Figma
  pass). When built: section = three DOM-text columns + one slider +
  one toggle; Sanity `method-page-pricing` body still holds the
  crawled copy.
### 2026-10-09 — IFC intake slot: `plan.sourceModel` (Bryce has a 50 MB Method IFC)
- model-pipeline.yml already resolved `sourceModel.asset->url` from the
  plan document, but the schema never had the field — the only way in
  was a public `ifc_url`. Added `sourceModel` (file, accept .ifc) to
  the plan's Drawings & files group. Upload in the Studio, then
  dispatch model-pipeline with the plan's slug. Sanity assets are
  unlisted CDN URLs, so Method's model never lands in the public repo
  (GitHub also warns at 50 MB). Bryce's IFC carries siding materials
  to keep — ifc-to-glb.py currently re-materials by category
  (`apply-default-materials`), so a material-preserving path is the
  next pipeline change once the file is in.
- Still to do: per-series finish presets, a storey selector for
  multi-storey plans (one plan sequence per habitable storey), the
  plan page preferring the turntable when its manifest exists, and
  the hero/landscape style (trees, ground, furniture) once there is a
  detailed model to dress.

### 2026-10-04 — Interactive floor plans: IFC → GLB pipeline + 3D plan viewer (prototype, Bryce)
- Bryce's idea, approved for a sample test: a 3D model of each home
  that turns on its vertical axis; "Floor plans" animates to a top
  view, north up, and the rendered view becomes a floor plan.
- Tool decision: real-time three.js (React Three Fiber) over
  pre-rendered turntables or hosted viewers (Sketchfab, model-viewer,
  Spline), because it is the only route that gives the plan-cut
  transition and stays within our bundle rules (ssr:false client
  gate, idle + in view, static twin). Turntable frames remain the
  fallback if Method has renderings but no models.
- Cleanup is scripted, not manual (Bryce is not a modeller):
  `scripts/model/ifc-to-glb.py` reads IFC (the BIM exchange format
  every Revit/ArchiCAD seat exports), keeps architecture by IfcType,
  drops furniture/fixtures/services/spaces/site, keeps untyped
  proxies only above 1.5 m (listed for allow/deny), re-materials by
  category so source materials never reach the web, merges per
  storey × category, converts to metres / Y-up / centred, stores
  TrueNorth and storeys in glTF extras, then gltf-transform welds,
  simplifies and meshopt-compresses. A geometry cache (--cache) makes
  export tweaks instant. The IfcOpenShell multi-threaded iterator
  was far slower than one-by-one create_shape on the Revit sample
  (>20 min vs ~4) — opt-in flag until understood. The pipeline is
  meant to run in GitHub Actions (model-pipeline.yml, next step):
  Method uploads an IFC, the workflow attaches the GLB to the plan.
- Viewer: one clipping plane shared by all materials (normal down)
  descends from above the roof to storey elevation + 1.2 m; palette
  lerps render → drawing (walls dark, floors light, roof fades);
  camera flies to straight above with FOV 35° → 8° at 6× footprint
  distance (≈ orthographic) and the model settles to north-up; storey
  pills choose the cut level; auto-rotation pauses on pointer down
  and is off under prefers-reduced-motion. Frame-loop mutation lives
  in a plain class (ViewerState) because the React Compiler's
  immutability lint forbids mutating hook values in component code.
- Sample: BasicHouse (andrewisen/bim-whale-ifc-samples, Revit IFC2x3,
  52.7 MB, 13 walls / 19 windows / 8 doors / roof, 71 furnishing
  elements to strip). Result: 43 elements kept, 134 dropped (all
  furniture, fixtures, services, openings, site; appliances and Model
  Text caught by the proxy name filter), 552k raw triangles →
  **127 KB GLB** after gltf-transform (weld + simplify 0.001 +
  meshopt). Headless Chromium: 3D turntable renders, "Floor plan"
  produces a true section cut (dark walls, glass lines, doors), no
  console errors; the three.js chunk (≈985 KB uncompressed) loads
  only on the viewer's page. Report: design/models/
  basic-house.report.json; sample at /library/plan-viewer.
- Lessons: (1) Revit walls also carry a 2D "Axis" representation and
  IfcOpenShell fails the whole product on it — restrict conversion to
  the Body context (`context-ids`), or every wall is lost silently.
  (2) Revit exports its roof level as an IfcBuildingStorey; the
  pipeline marks storeys `habitable` (has walls/doors/windows) and the
  viewer offers only those. (3) The multi-threaded iterator was 5×
  slower than one-by-one create_shape on this file. (4) The React
  Compiler lint forbids mutating hook values even in frame callbacks;
  keep three.js mutation in a plain class driven from useFrame.
- Finish (Bryce, same day): grey fibre-cement panel siding and a
  black standing-seam metal roof. Done as PROCEDURAL materials, not
  textures — the model has no UVs and stays ~129 KB: the shader
  derives 4 × 8 ft panel reveals (12 mm joints, per-panel tone) and
  16 in standing seams (30 mm rib, light/shade flanks, lower
  roughness on the rib) from world position and the face normal
  (screen derivatives, not the smoothed vertex normal, or seams bend
  across a plane). Flat shading for crisp planes; image-based light
  from three's procedural RoomEnvironment (no HDR fetch) so the metal
  reflects; ACES tone mapping; drei ContactShadows to ground the
  home. Both finishes fade out with the plan transition (uPlan
  uniform) so the drawing stays flat. Finish presets per series/
  finish level (Figma Finish levels) are the natural next step — the
  category palette is already one table.
- gltf-transform gotcha: `optimize` runs a palette + join pass that
  merged every opaque mesh into one and replaced the colours with a
  palette texture, silently destroying the per-category materials the
  viewer keys on. Run it with `--palette false --join false --flatten
  false` (workflow updated).
- Revit roofs: IfcSlab NOTDEFINED under an IfcRoof aggregate; the
  pipeline now classifies slabs by their aggregate parent and by
  family name (roof / tak / dach / toit…).
- Still to do for production: stencil caps on the section cut
  (clipped wall tops currently show the inner faces, which read as
  solid only because they share the wall colour), room labels from
  IfcSpace as HTML overlays (also DOM text), dimension strings,
  turntable poster rendered by the pipeline, the Actions workflow run
  for real (model-pipeline.yml committed, needs SANITY_AUTH_TOKEN write
  scope confirmed), and the Figma state in "Walk the plan" during
  Bryce's design pass.
- Ask of Method: one IFC per floor plan, architecture model only,
  one storey per IfcBuildingStorey; a sample first.

### 2026-10-04 — Shared sections batch 3 (code): Testimonial, Logo row, Team grid, Map block, Form block
- B1 is complete: every shared section in the Figma library now has
  a Sanity type, a component, a preview twin and a /library entry.
- Testimonial can pull a project's testimonial (reference) or be
  typed; the page emits a Review of the Organization. Team grid
  shows picked Team members or everyone (server resolves "everyone";
  the preview shows picks); teamMember gained `credentials` and
  `linkedin` (Person.sameAs). Map block rows come from the Market
  documents (name → regions served) or are typed; the row links are
  behind a `linkRows` switch so no page links to /where-we-build
  before that route exists. Form block = ContactForm posting to
  /api/forms as the simple form "contact" (name, email, message +
  phone/location/planning as extra fields; honeypot, rate limit,
  spam heuristics inherited); phone and email render from Site
  Settings so the page and Organization.contactPoint cannot drift; a
  page carrying a Form block types itself ContactPage.
- Pending on Method: logo marks (SVG) and certifier URLs, team
  portraits + credentials + LinkedIn, the service map image, phone
  and email in Site Settings, Market documents for the map rows.

### 2026-10-04 — Type scale generated from the Figma device modes (Bryce)
- Bryce's rule: keep the Figma Mobile / Tablet / Desktop font
  variables as the anchors so designing stays in the three modes;
  clamp between them; above 1440 keep scaling at a relational rate.
- Implementation: `design/type-scale.json` (per style: mobile /
  tablet / desktop px, unitless line-height, em tracking, family,
  Figma style name) → `scripts/build-type-scale.mjs` → the
  `@generated:type-scale` block inside `@theme` in globals.css. Each
  token is one `clamp(min, <nested min/max of three linear segments>,
  max)`; the generator picks the shortest nesting that reproduces
  the target curve at every sampled width (320–2600), so there are no
  breakpoint jumps and the inspector has a single value to match.
- Above desktop: `aboveDesktop.rate` = 0.5 (fonts grow half as fast
  as the viewport) until 1920, where the existing root font-size
  zoom (`html { font-size: max(100%, .83333vw) }`) scales type and
  layout together 1:1. rate 1 would make the two slopes continuous;
  0.5 keeps body text from outrunning the layout between 1440 and
  1920. One number to change if the feel is off. Micro labels now
  scale too (the old "12px stays fixed" exception is gone).
- Naming now mirrors Figma: label-xs/sm/md/lg, body-xs/sm/md/lg/xl,
  title-sm/md/lg, headline-sm/md/lg, display-sm/md/lg/xl. The SDR
  template's `display-xl` (40→64) became `display-sm` (48/60/60) and
  the interim `display-2xl` became `display-xl` (72/120/176);
  `title-xs` (18 fixed) stays as a code-only template leftover.
  Line-heights follow the /Regular styles (Headline Large 1.2, Title
  Small 1.4 — the template's 1.1 was wrong for Method).
- Figma side unchanged by design. Hygiene to fix in the finesse
  pass: styles on Inter / Neue Haas Grotesk instead of Geist (Body
  Small underlined, Display Large/Regular), two Body Small weights
  without a font, percent line-heights that disagree with siblings
  (Headline Large/Regular, Headline Small/Regular, Display
  Small/Medium, Label Medium/Medium).
- Measured on the built server (px): Headline Large 40 → 48 → 48 →
  56 → 74.7 and Body Medium 16 → 16 → 16 → 18.7 → 24.9 at 428 / 1024 /
  1440 / 1920 / 2560; Display XL 72 → 120 → 176 → 205 → 274.

### 2026-10-04 — /predesigned lineup page (code)
- Built from the series documents, not the page builder: every
  number (sizes, plan counts, bedrooms, weeks in the factory, prices,
  timelines) is the catalog's, rendered once as DOM text in the Card
  grid, the Lineup, the Number interstitial and the Compare table.
  A `page` doc with slug `predesigned` is the editorial override for
  hero copy, the why-intro, the FAQ and SEO — no doc, designed
  defaults render.
- Lineup interaction model: the pills are real links to `/series/*`
  (crawlable, no-JS works, modifier-click opens the page); with JS a
  click swaps the stage in place through a state-driven cross-fade
  (fade out → swap → fade in, `aria-live="polite"`), never a mount
  animation. One toggle, nothing else interactive.
- Series schema gained `factoryWeeks` (range), `bestFor` (Compare
  table column, falls back to tagline) and `palette[]` (name + hex,
  the exterior swatches). Figma Lineup uses `bg-tertiary` (#b4b4b1)
  for the toggle track and image wells; the code has no token for
  that value, so the track uses `--line-2` and wells `--wash` — flag
  for the token re-export (same gap as the Card image placeholders).
  `--radius-full` (the library's radius-full, 9999px — pill toggles)
  added to the code tokens; it was the only new off-token reading.
  The swatch fills are catalog data (hex per finish), not themed
  surfaces, so the inspector lists them by design.
- Default FAQ copy on the route is the design's questions with
  answers drawn from the sections' approved defaults plus two new
  ones (customization; code equivalence of modular homes) — Method
  to review before launch, or override in the page doc.
- Hero lede states the series count, plan count and size range from
  the data; "set within N months" appears only when timelines exist.
  Prices show only where a series publishes `priceFrom` or a band.

### 2026-10-04 — Series routes + Hero / Page, Hero / Series, Sub-nav, Spec table (code)
- `/series/<slug>` and `/series/<slug>/<plan>` ship, built from the
  `series`/`plan` documents (not the page builder). Sections render
  only when the document has the content, and the Sub-nav lists only
  the anchors that exist — it never links to nothing.
- Structured data decided: a series is a Product (brand/manufacturer
  = the Organization, category "Predesigned prefab home", specs →
  additionalProperty, plans → hasVariant) with an AggregateOffer ONLY
  when an exact `priceFrom` exists (a price band renders as text and
  emits no price — never fabricate a number). A plan is a Product
  `isVariantOf` its series with an Offer when it or the series has a
  from-price, and its PDF as `subjectOf` DigitalDocument. Plans list
  as an ItemList on the series page; series FAQ → FAQPage.
- Every section now has an optional `anchor` id (rendered on the
  wrapper) so editors can target Sub-nav links on CMS pages; on CMS
  pages Hero / Page demotes its heading to H2 (the page keeps its one
  sr-only H1) and gets the breadcrumb from the route.
- Token: `--text-body-xl` (Figma Body XLarge 20/30; 18→20 fluid) for
  the lede under page/series H1s. Known accepted off-token readings:
  the library button's 18px horizontal padding and the ghost button's
  10% ink surface (both pre-existing primitives).
- Redirects: `/series/*` legacy URLs flipped live (125 live · 13
  pending). Sitemap/llms.txt/llms-full.txt extended with series +
  plans. Presentation locations for series/plan documents added.
- Verified on the built server: four sections 0 off-token except the
  button primitives above, no mobile overflow, Sub-nav sticks and
  the active anchor follows the scroll (click → `#features` active,
  hash updated), unknown series/plan slugs 404 cleanly.
- Content now blocking the pages: the seven series documents and
  their plans (Method facts: beds/baths/sqft/modules, from-price or
  band, timeline, specs, finish levels, FAQ, photos, plan PDFs).

### 2026-10-04 — Shared sections batch 2 shipped (code)
- Card grid (2/3/4 columns, linked cards), Process timeline (ordered
  steps → HowTo node with ISO durations parsed from "6–8 weeks"),
  Compare table (real `<table>` + sources; scrolls sideways on
  phones), Link list, Interstitial (statement / image / floating
  images with depth parallax / word over image / number). Verified on
  the built server: correct semantics (`<ol>`, `<th>` ×6, H3s), 0
  off-token readings, no mobile overflow, parallax offsets scale with
  each float's depth.
- Tokens: `--text-display-2xl` (4.5rem→11rem) is Method's Display XL
  in code (wordmark, interstitial word/number); the template's
  `display-xl` (40–64px) maps to Method's Display Small for the
  statement kind. Both get reconciled at the rebrand export.
- Rule kept: interstitial text is a `<p>`, never a heading; floating
  photographs are lazy `<img>` with alt (neutral tile when unfilled).

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
  36373:44911 (IA board + AEO board); UX Design page 36371:44705
  (everything else since 2026-10-05: library section 37581:41071,
  pages-in-IA-order frame 37586:31063 in section 37581:41072,
  Experiential v2 section 37521:15243). Superseded ids: library
  37505:3440; pages 37509:3821; AEO board
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
