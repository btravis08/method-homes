import type { ReactNode } from "react";

import {
  CardGrid,
  Carousel,
  CompareTable,
  CtaBand,
  Faq,
  FeatureList,
  FiftyFifty,
  FullWidth,
  Gallery,
  Hero,
  HeroPage,
  HeroSeries,
  InfoSlider,
  Interstitial,
  LinkList,
  LogoRow,
  MapBlock,
  FormBlock,
  ProcessTimeline,
  ProductSlider,
  Reviews,
  SpecTable,
  StatsBar,
  TeamGrid,
  TechSpecs,
  Testimonial,
  TextIntro,
} from "@/components/home/sections";
import { SubNav } from "@/components/home/SubNav";
import { Lineup } from "@/components/home/Lineup";
import { ContactForm } from "@/components/forms/ContactForm";
import { LazyPlanViewer } from "@/components/model/LazyPlanViewer";
import { TurntableViewer } from "@/components/model/TurntableViewer";
import sampleTurntable from "../../public/models/sample/turntable/manifest.json";
import { ExperimentSection } from "@/components/experiment/ExperimentSection";
import { FloatingWords } from "@/components/legacy/FloatingWords";
import { FullBleedCarousel } from "@/components/legacy/FullBleedCarousel";
import { LegacyHero } from "@/components/legacy/LegacyHero";
import { ProductSwirl } from "@/components/legacy/ProductSwirl";
import { SplitTextBlock } from "@/components/legacy/SplitTextBlock";
import { IntakePreview } from "@/components/forms/IntakePreview";

/*
  The section library — every composable section the site can build a
  page from, in one registry. /library renders each entry live (no
  screenshots to go stale), and the Studio embeds that same route as
  its "Sections" tool.

  Entries carry the Sanity type they're authored as, so the grid can
  say which sections are CMS-composable (add them to any page's
  sections[] array) versus fixed page furniture.
*/

export type Mode = "light" | "light-mid" | "dark-mid" | "dark";

export interface SectionEntry {
  slug: string;
  title: string;
  group: "Page sections" | "Legacy page" | "Forms";
  /* the Sanity section type, when it's CMS-composable */
  schemaType?: string;
  description: string;
  /* modes worth previewing; the first is the default */
  modes: Mode[];
  /* full-viewport sections want a taller thumbnail frame */
  tall?: boolean;
  /* the section animates on a timer or scrub, so a still screenshot
     catches a different moment than the comp froze — its diff score
     is indicative, not a verdict */
  timed?: boolean;
  /* the section's frame in the Figma library — deep-links the card,
     and is what `get_design_context` should be pulled from when this
     section is worked on */
  figmaNodeId?: string;
  /* flat renders of that frame per breakpoint, fetched by the
     fetch-figma-assets workflow into public/figma/comps — desktop is
     <slug>.jpg, the others <slug>-<breakpoint>.jpg. The natural size
     lets the viewer overlay comp on build at true scale. A missing
     breakpoint means that device frame hasn't been exported (or
     doesn't exist in the design yet). */
  comps?: Partial<Record<Breakpoint, { width: number; height: number }>>;
  /* scroll-pinned sections render as their own page in the viewer, not
     inside its iframe: iOS expands an iframe to its content height, so
     nothing inside one ever scrolls (the descent sat at frame 0 on a
     phone, 2026-10-09) */
  fullPage?: boolean;
  render: (mode: Mode) => ReactNode;
}

export type Breakpoint = "desktop" | "tablet" | "mobile";

/* the design library file every node id below lives in */
import designops from "../../designops.config.json";

export const FIGMA_FILE = designops.figma.fileKey;

export const figmaUrl = (nodeId: string) =>
  `https://www.figma.com/design/${FIGMA_FILE}/?node-id=${nodeId.replace(":", "-")}`;

export const compUrl = (slug: string, bp: Breakpoint) =>
  `/figma/comps/${slug}${bp === "desktop" ? "" : `-${bp}`}.jpg`;

export const SECTIONS: SectionEntry[] = [
  {
    slug: "hero",
    title: "Hero",
    group: "Page sections",
    schemaType: "sectionHero",
    description:
      "Full-bleed opening image or video with eyebrow, headline and a primary CTA. Carries the page's LCP.",
    modes: ["dark", "light"],
    tall: true,
    /* NOTE: 33585:48542 and its exported comps are the HOMEPAGE V2
       design, which is NOT in use — the user rejected it (2026-08-02:
       "Revert back to the original homepage design. V2 is incorrect").
       comps stay OFF so the audit (and the nightly improvement agent)
       can't score or "fix" this section toward V2. Re-point to the V1
       frame + re-export comps before re-enabling. */
    figmaNodeId: "33585:48542",
    render: (mode) => <Hero mode={mode} />,
  },
  {
    slug: "full-width",
    title: "Full width",
    group: "Page sections",
    schemaType: "sectionFullWidth",
    description:
      "Edge-to-edge media block — image, shop-the-look, click-to-play or autoplay video — with overlaid copy.",
    modes: ["dark", "light"],
    tall: true,
    /* NOTE: 33638:56658 and its exported comps are the HOMEPAGE V2
       design — rejected, see the hero note above. comps OFF until V1
       comps are exported. */
    figmaNodeId: "33638:56658",
    render: (mode) => <FullWidth mode={mode} />,
  },
  {
    slug: "fifty-fifty",
    title: "50 / 50",
    group: "Page sections",
    schemaType: "sectionFiftyFifty",
    description:
      "Two media columns side by side at a chosen ratio (5:4, 1:1, or full-height flex); stacks on mobile.",
    modes: ["dark", "light"],
    tall: true,
    figmaNodeId: "33581:40068",
    comps: {
      desktop: { width: 1440, height: 900 },
      tablet: { width: 1024, height: 640 },
      mobile: { width: 428, height: 1070 },
    },
    render: (mode) => <FiftyFifty mode={mode} />,
  },
  {
    slug: "info-slider",
    title: "Info slider",
    group: "Page sections",
    schemaType: "sectionInfoSlider",
    description:
      "Horizontal rail of info cards with the shared slider chrome: arrow paging, progress bar, hairline variants.",
    modes: ["light", "dark"],
    figmaNodeId: "33781:52010",
    comps: {
      desktop: { width: 1440, height: 953 },
      tablet: { width: 1024, height: 762 },
      mobile: { width: 428, height: 923 },
    },
    render: (mode) => <InfoSlider mode={mode} />,
  },
  {
    slug: "product-slider",
    title: "Product slider",
    group: "Page sections",
    schemaType: "sectionProductSlider",
    description:
      "Product cards sourced by tag, collection, or manual picks, with the MENS/WOMENS filter and hover imagery.",
    modes: ["light", "dark"],
    figmaNodeId: "33691:63690",
    comps: {
      desktop: { width: 1440, height: 660 },
      tablet: { width: 1024, height: 513 },
      mobile: { width: 428, height: 800 },
    },
    render: (mode) => <ProductSlider mode={mode} title="Best Sellers" />,
  },
  {
    slug: "carousel",
    title: "Carousel",
    group: "Page sections",
    schemaType: "sectionCarousel",
    description: "Editorial image carousel — full-bleed slides with the slider chrome.",
    modes: ["light", "dark"],
    figmaNodeId: "33298:30358",
    comps: {
      desktop: { width: 1440, height: 900 },
      tablet: { width: 1024, height: 640 },
      mobile: { width: 428, height: 967 },
    },
    render: (mode) => <Carousel mode={mode} />,
  },
  {
    slug: "gallery",
    title: "Gallery",
    group: "Page sections",
    schemaType: "sectionGallery",
    description:
      "Variable-width media rail mixing stills and video at their native aspect ratios.",
    modes: ["light", "dark"],
    render: (mode) => <Gallery mode={mode} />,
  },
  {
    slug: "tech-specs",
    title: "Tech specs",
    group: "Page sections",
    schemaType: "sectionTechSpecs",
    description:
      "Specification table with description and stat callouts, opened by the comp's heavy rule.",
    modes: ["light", "dark"],
    figmaNodeId: "33298:30224",
    comps: {
      desktop: { width: 1440, height: 1105 },
    },
    render: (mode) => <TechSpecs mode={mode} />,
  },
  {
    slug: "reviews",
    title: "Reviews",
    group: "Page sections",
    schemaType: "sectionReviews",
    description: "Customer review rail with rating summary.",
    modes: ["light", "dark"],
    figmaNodeId: "33209:11159",
    comps: {
      desktop: { width: 1440, height: 1119 },
      tablet: { width: 1024, height: 1311 },
      mobile: { width: 428, height: 1497 },
    },
    render: (mode) => <Reviews mode={mode} />,
  },
  {
    slug: "faq",
    title: "FAQ",
    group: "Page sections",
    schemaType: "sectionFaq",
    description:
      "Question/answer accordion (native details/summary). Each item is emitted as FAQPage schema by the page route; questions render as H3s.",
    modes: ["light", "dark"],
    figmaNodeId: "37507:3841",
    render: (mode) => <Faq mode={mode} />,
  },
  {
    slug: "text-intro",
    title: "Text intro",
    group: "Page sections",
    schemaType: "sectionTextIntro",
    description:
      "Eyebrow + question-form H2 on the left, answer-first prose + related link on the right — how a page clears the 300-word depth gate.",
    modes: ["light", "dark"],
    figmaNodeId: "37505:3536",
    render: (mode) => <TextIntro mode={mode} />,
  },
  {
    slug: "stats-bar",
    title: "Stats bar",
    group: "Page sections",
    schemaType: "sectionStats",
    description:
      "Proof bar: four value + label pairs between hairlines; every value carries a footnote marker to the dated sources line.",
    modes: ["light", "dark"],
    figmaNodeId: "37506:3714",
    render: (mode) => <StatsBar mode={mode} />,
  },
  {
    slug: "feature-list",
    title: "Feature list",
    group: "Page sections",
    schemaType: "sectionFeatureList",
    description: "Icon + title + body + link, 3 or 4 across under a section header.",
    modes: ["light", "dark"],
    figmaNodeId: "37508:4069",
    render: (mode) => <FeatureList mode={mode} />,
  },
  {
    slug: "cta-band",
    title: "CTA band",
    group: "Page sections",
    schemaType: "sectionCtaBand",
    description: "Dark conversion band: heading, reassurance copy, two CTAs. Closes most pages above the footer.",
    modes: ["dark", "light"],
    figmaNodeId: "37505:3598",
    render: (mode) => <CtaBand mode={mode} />,
  },
  {
    slug: "card-grid",
    title: "Card grid",
    group: "Page sections",
    schemaType: "sectionCardGrid",
    description: "Section header + N cards (image 4:3, eyebrow, title, description, meta) in 2, 3 or 4 columns.",
    modes: ["light", "dark"],
    figmaNodeId: "37506:3646",
    render: (mode) => <CardGrid mode={mode} />,
  },
  {
    slug: "process-timeline",
    title: "Process timeline",
    group: "Page sections",
    schemaType: "sectionProcess",
    description: "Numbered steps with title, description and typical duration — the page route emits a HowTo node from it.",
    modes: ["light", "dark"],
    figmaNodeId: "37507:3797",
    render: (mode) => <ProcessTimeline mode={mode} />,
  },
  {
    slug: "compare-table",
    title: "Compare table",
    group: "Page sections",
    schemaType: "sectionCompare",
    description: "A real table with a header row — the structure engines lift for “X vs Y”.",
    modes: ["light", "dark"],
    figmaNodeId: "37507:3753",
    render: (mode) => <CompareTable mode={mode} />,
  },
  {
    slug: "link-list",
    title: "Link list",
    group: "Page sections",
    schemaType: "sectionLinkList",
    description: "Side heading + rows of titled internal links with one-line descriptions.",
    modes: ["light", "dark"],
    figmaNodeId: "37508:4097",
    render: (mode) => <LinkList mode={mode} />,
  },
  {
    slug: "interstitial",
    title: "Interstitial",
    group: "Page sections",
    schemaType: "sectionInterstitial",
    description: "A moment of pause: statement, image, floating images, word over image or number. One message, one medium; at most two per page.",
    modes: ["light", "dark"],
    figmaNodeId: "37528:15397",
    render: (mode) => <Interstitial mode={mode} kind="floating" text="Four hundred homes. One method." />,
  },
  {
    slug: "hero-page",
    title: "Hero / Page",
    group: "Page sections",
    schemaType: "sectionHeroPage",
    description: "Breadcrumb, H1 (Headline Large) and the answer-first lede (Body XLarge) with a primary button and an underline link. The H1 + lede are the page's title/description pair.",
    modes: ["light", "dark"],
    figmaNodeId: "37505:3516",
    render: (mode) => <HeroPage mode={mode} />,
  },
  {
    slug: "hero-series",
    title: "Hero / Series",
    group: "Page sections",
    description: "Series pages only (built from the series document): breadcrumb, the wordmark as H1 (Display XL), one full-width photograph (the LCP), then the one-sentence answer, the meta line with footnote markers and two buttons.",
    modes: ["light", "dark"],
    figmaNodeId: "37525:15367",
    render: (mode) => <HeroSeries mode={mode} />,
  },
  {
    slug: "sub-nav",
    title: "Sub-nav",
    group: "Page sections",
    schemaType: "sectionSubNav",
    description: "Sticky strip under the Nav: context name, real anchor links whose active state follows the scroll (Lenis-driven), and a short primary button. Point anchors at sections' Anchor ids.",
    modes: ["light", "dark"],
    figmaNodeId: "37525:15383",
    render: (mode) => <SubNav mode={mode} />,
  },
  {
    slug: "spec-table",
    title: "Spec table",
    group: "Page sections",
    schemaType: "sectionSpecTable",
    description: "Heading column beside label/value rows (a description list) — the facts a series or plan page states, lifted as Product additionalProperty.",
    modes: ["light", "dark"],
    figmaNodeId: "37507:3678",
    render: (mode) => <SpecTable mode={mode} />,
  },
  {
    slug: "lineup",
    title: "Lineup",
    group: "Page sections",
    description: "Editorial section (/predesigned, built from the series documents): a pill toggle across the series swaps one photograph, a sentence, the meta line, four big numbers and the exterior palette. Pills are real links to the series pages; JS turns a click into an in-place swap.",
    modes: ["light", "dark"],
    tall: true,
    figmaNodeId: "37525:15056",
    render: (mode) => <Lineup mode={mode} />,
  },
  {
    slug: "testimonial",
    title: "Testimonial",
    group: "Page sections",
    schemaType: "sectionTestimonial",
    description: "Centered pull quote with a named, dated, place-specific attribution and a link to the project; the page emits a Review node.",
    modes: ["light-mid", "light", "dark"],
    figmaNodeId: "37506:3733",
    render: (mode) => <Testimonial mode={mode} />,
  },
  {
    slug: "logo-row",
    title: "Logo row",
    group: "Page sections",
    schemaType: "sectionLogoRow",
    description: "Partner and certification marks under a centered eyebrow; every mark is named in text so it counts as an entity mention.",
    modes: ["light", "dark"],
    figmaNodeId: "37506:3750",
    render: (mode) => <LogoRow mode={mode} />,
  },
  {
    slug: "team-grid",
    title: "Team grid",
    group: "Page sections",
    schemaType: "sectionTeamGrid",
    description: "Four-up people grid from Team member documents: portrait, name, role, credentials; each person is a Person node linked to their LinkedIn.",
    modes: ["light", "dark"],
    figmaNodeId: "37508:3875",
    render: (mode) => <TeamGrid mode={mode} />,
  },
  {
    slug: "map-block",
    title: "Map block",
    group: "Page sections",
    schemaType: "sectionMapBlock",
    description: "Service-area map beside the market list (state → named places) from the Market documents; rows link to the market pages once they ship.",
    modes: ["light", "dark"],
    figmaNodeId: "37508:3828",
    render: (mode) => <MapBlock mode={mode} />,
  },
  {
    slug: "form-block",
    title: "Form block",
    group: "Page sections",
    schemaType: "sectionFormBlock",
    description: "Heading and NAP contact details (phone and email from Site Settings) beside the contact form, which posts to /api/forms as the simple form “contact”.",
    modes: ["light", "dark"],
    figmaNodeId: "37508:3799",
    render: (mode) => <FormBlock mode={mode} form={<ContactForm />} />,
  },
  {
    slug: "plan-viewer",
    title: "3D plan viewer",
    group: "Page sections",
    description: "Prototype (2026-10-04): the pipeline's GLB of a sample house turns on its vertical axis; “Floor plan” flies the camera to a north-up top view while a section cut descends to 1.2 m above the chosen storey and the palette turns to a drawing. Loads after idle + in view behind a poster; the plan page's photo, drawing and PDF stay the twin.",
    modes: ["light"],
    tall: true,
    render: () => (
      <section data-mode="light" className="w-full bg-surface px-4 py-8xl text-ink md:px-7xl md:py-10xl">
        <div className="mx-auto flex w-full max-w-page flex-col gap-3xl">
          <div className="flex flex-col gap-xl">
            <p className="label text-ink-3">Walk the plan</p>
            <h2 className="font-display text-headline-md text-ink">Sample house — 3D and floor plan</h2>
          </div>
          <LazyPlanViewer src="/models/sample/basic-house.glb" alt="Sample two-storey house model" />
        </div>
      </section>
    ),
  },
  {
    slug: "module-story",
    title: "Module story — The Module → The Assembly → The Finished Home",
    group: "Page sections",
    description: "The prefab story in four steps (Bryce, 2026-10-09): the module that holds the kitchen on its own; the modules eased apart along their seams with dashed lines showing where they connect; the modules come together as the finished home; then the floor plan. Modules come from the IFC's area scheme (MOD A–G plus the site-built pieces).",
    modes: ["light"],
    tall: true,
    timed: true,
    render: () => (
      <section data-mode="light" className="w-full bg-surface px-4 py-8xl text-ink md:px-7xl md:py-10xl">
        <div className="mx-auto flex w-full max-w-page flex-col gap-3xl">
          <div className="flex flex-col gap-xl">
            <p className="label text-ink-3">Built in modules</p>
            <h2 className="font-display text-headline-md text-ink">One module, the set, the home, the plan</h2>
          </div>
          <LazyPlanViewer src="/models/test.glb" alt="Method reference home, module by module" modes={["single", "modules", "3d", "plan"]} labels={{ single: "The Module", modules: "The Assembly", "3d": "The Finished Home", plan: "Floor plan" }} focusRoom="KITCHEN" explodeGap={0.36} connectors />
        </div>
      </section>
    ),
  },
  {
    slug: "plan-viewer-method",
    title: "3D plan viewer — Method model",
    group: "Page sections",
    description: "Method's own IFC (Studio → 3D models → “test”, 2026-10-09) through the same pipeline with --keep-materials: walls split by their Revit material names (vertical stained wood siding, board-form concrete, cast-in-place concrete, black trim, glass), interior layers white, the finish chosen by name because the IFC carries material identity, not colour. Stain colour is a placeholder until Method confirms it.",
    modes: ["light"],
    tall: true,
    render: () => (
      <section data-mode="light" className="w-full bg-surface px-4 py-8xl text-ink md:px-7xl md:py-10xl">
        <div className="mx-auto flex w-full max-w-page flex-col gap-3xl">
          <div className="flex flex-col gap-xl">
            <p className="label text-ink-3">Walk the plan</p>
            <h2 className="font-display text-headline-md text-ink">Method reference home — 3D and floor plan</h2>
          </div>
          <LazyPlanViewer src="/models/test.glb" alt="Method reference home, single storey with a garage wing" />
        </div>
      </section>
    ),
  },
  {
    slug: "descent",
    fullPage: true,
    title: "Aerial descent — scroll into the home",
    group: "Page sections",
    description: "Prototype (2026-10-09, after ownprimland.com's pinned aerial): a 300svh pinned section. Scroll flies the camera from above a procedural wilderness — ridge-noise terrain, thousands of instanced pines, three drifting noise-cloud sheets you pass through, sky-coloured haze — down a spiral to the framed view of Method's home, where the viewer becomes the usual one (drag to turn, floor plan). Mid-page moment, no markers; Skip jumps to the end.",
    modes: ["light"],
    tall: true,
    render: () => (
      <section data-mode="light" className="w-full bg-surface text-ink">
        <div data-descent className="relative h-[300svh] w-full">
          <div className="sticky top-0 h-[100svh] w-full">
            <LazyPlanViewer src="/models/test.glb" alt="Method reference home from the air" descent className="h-full" />
          </div>
        </div>
      </section>
    ),
  },
  {
    slug: "turntable",
    title: "Rendered turntable",
    group: "Page sections",
    description: "The photoreal layer (2026-10-04): the same sample house rendered offline in Blender Cycles — sky and sun, glass with an interior, standing-seam roof, fibre-cement panels, a lawn pad — as a drag-to-turn frame sequence, with “Floor plan” playing the flight and section cut to a north-up drawing. AVIF frames with a WebP fallback, loaded progressively behind a blurred poster; no WebGL. Built by scripts/model/render-turntable.py + encode-frames.mjs (the model-pipeline workflow's render step).",
    modes: ["light"],
    tall: true,
    render: () => (
      <section data-mode="light" className="w-full bg-surface px-4 py-8xl text-ink md:px-7xl md:py-10xl">
        <div className="mx-auto flex w-full max-w-page flex-col gap-3xl">
          <div className="flex flex-col gap-xl">
            <p className="label text-ink-3">Walk the plan</p>
            <h2 className="font-display text-headline-md text-ink">Sample house — rendered</h2>
          </div>
          <TurntableViewer base="/models/sample/turntable" manifest={sampleTurntable} alt="Rendered sample house, turning" />
        </div>
      </section>
    ),
  },
  {
    slug: "ab-experiment",
    title: "A/B Experiment",
    group: "Page sections",
    schemaType: "sectionExperiment",
    description:
      "Cookie-split wrapper testing two-to-four variant section stacks; one variant paints per visitor, conversions read out in the Studio Overview.",
    modes: ["light", "dark"],
    /* the demo carries its own sections, each with real modes */
    render: (mode) => (
      <ExperimentSection
        exKey="library-demo"
        variants={[
          {
            key: "a",
            node: <Carousel mode={mode} eyebrow="VARIANT A — CONTROL" />,
          },
          {
            key: "b",
            node: <InfoSlider mode={mode} title="Variant B" />,
          },
        ]}
      />
    ),
  },

  /* ---- the Legacy page's bespoke sections ---- */
  {
    slug: "legacy-hero",
    title: "Legacy hero",
    group: "Legacy page",
    description:
      "Scroll-locked title sequence: the phrase rises, splits, and the campaign film expands between the words to full bleed, inverting each word as it passes.",
    modes: ["light"],
    tall: true,
    timed: true,
    figmaNodeId: "33982:60407",
    comps: {
      desktop: { width: 1440, height: 1000 },
      tablet: { width: 1024, height: 1000 },
      mobile: { width: 428, height: 861 },
    },
    render: () => <LegacyHero />,
  },
  {
    slug: "split-text",
    title: "Split text block",
    group: "Legacy page",
    description:
      "Centered Feature Deck statement between drawn hairlines; words resolve blur-to-sharp on a timed 2s pass when the paragraph reaches 30% from the bottom.",
    modes: ["light", "light-mid"],
    tall: true,
    figmaNodeId: "33599:71930",
    comps: {
      desktop: { width: 1440, height: 1000 },
      tablet: { width: 1024, height: 800 },
      mobile: { width: 428, height: 840 },
    },
    render: (mode) => (
      <SplitTextBlock
        mode={mode === "light-mid" ? "light-mid" : "light"}
        eyebrow="Our Mantra"
        text="Every seam, every stitch, every fold of Sun Day Red, is sewn with the meticulousness, care, and unwavering focus that has defined Tiger Woods’ legendary career."
        cta="Shop Sun Day Red"
      />
    ),
  },
  {
    slug: "floating-gallery",
    title: "Floating gallery",
    group: "Legacy page",
    description:
      "Pinned horizontal ride: a 4166px canvas of captioned cards travels right-to-left as you scroll, images lagging inside their frames, surface fading Light → Medium Light.",
    modes: ["light"],
    tall: true,
    timed: true,
    figmaNodeId: "33599:72159",
    comps: {
      desktop: { width: 1440, height: 1000 },
      tablet: { width: 1024, height: 1000 },
      mobile: { width: 428, height: 800 },
    },
    render: () => <FloatingWords />,
  },
  {
    slug: "full-bleed-carousel",
    title: "Full-bleed carousel",
    group: "Legacy page",
    description:
      "Timed slideshow: filling hairline timer, rolling slide number, headline rail sliding one slot per advance, portrait well sliding through, body copy fading in.",
    modes: ["dark"],
    tall: true,
    timed: true,
    figmaNodeId: "34346:77144",
    comps: {
      desktop: { width: 1440, height: 900 },
      mobile: { width: 428, height: 754 },
    },
    render: () => <FullBleedCarousel />,
  },
  {
    slug: "product-swirl",
    title: "Product swirl",
    group: "Legacy page",
    description:
      "Black closing moment — product planes receding along a diagonal spiral with depth-scaled drift, campaign card and shop button centered.",
    modes: ["dark"],
    tall: true,
    figmaNodeId: "34023:187310",
    comps: {
      desktop: { width: 1440, height: 1019 },
      tablet: { width: 1024, height: 815 },
      mobile: { width: 428, height: 711 },
    },
    render: () => <ProductSwirl />,
  },

  /* ---- forms (multi-step engine, lib/forms) ---- */
  {
    slug: "intake-form",
    title: "Get Started intake",
    group: "Forms",
    description:
      "The Get Started sheet (Figma: Intake/Tray): bottom tray on phones with a sliver of page behind, full screen from md; header with Back · section · Close, 3px progress, top-aligned question, footer pinned to the bottom with a fade; the review step with Edit links and the Send preloader. Image cards, series rows grouped by fit, interstitials, tap-to-advance, soft exit, finish-later links, lead scoring and the booking thank-you all run from the intake definition.",
    modes: ["light"],
    tall: true,
    figmaNodeId: "37373:1104",
    render: () => <IntakePreview />,
  },
];

export const bySlug = (slug: string) => SECTIONS.find((s) => s.slug === slug);

export const GROUPS = ["Page sections", "Legacy page", "Forms"] as const;
