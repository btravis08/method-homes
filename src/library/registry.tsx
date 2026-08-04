import type { ReactNode } from "react";

import {
  Carousel,
  FiftyFifty,
  FullWidth,
  Gallery,
  Hero,
  InfoSlider,
  ProductSlider,
  Reviews,
  TechSpecs,
} from "@/components/home/sections";
import { ExperimentSection } from "@/components/experiment/ExperimentSection";
import { FloatingWords } from "@/components/legacy/FloatingWords";
import { FullBleedCarousel } from "@/components/legacy/FullBleedCarousel";
import { LegacyHero } from "@/components/legacy/LegacyHero";
import { ProductSwirl } from "@/components/legacy/ProductSwirl";
import { SplitTextBlock } from "@/components/legacy/SplitTextBlock";

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
  group: "Page sections" | "Legacy page";
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
];

export const bySlug = (slug: string) => SECTIONS.find((s) => s.slug === slug);

export const GROUPS = ["Page sections", "Legacy page"] as const;
