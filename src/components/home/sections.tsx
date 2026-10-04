import dynamic from "next/dynamic";

import { AnimatedMedia } from "@/components/home/AnimatedMedia";
import { CampaignOverlay } from "@/components/home/CampaignOverlay";
import { ArrowInViewPlay, ArrowLink, ArrowSwap } from "@/components/home/ArrowHover";
import type { LookProductData } from "@/components/home/MediaBlock";
import type { ProductCardData } from "@/components/home/ProductCard";
import { SectionReveal, RevealLine, RevealText } from "@/components/home/SectionReveal";
import { FloatingImages } from "@/components/home/FloatingImages";
import type { FloatData } from "@/components/home/FloatingImages";
import { ArrowUpRight } from "@/components/icons";

/* Heavy interactive client components load as their own chunks
   (next/dynamic, SSR intact): the HTML still streams complete, but
   their JS parses and hydrates off the critical path — they all live
   below the fold, and bundling them with the route made hydration the
   page's biggest main-thread cost (measured: 1.9s script eval in one
   chunk under PSI's 4x throttle). The hero path (AnimatedMedia,
   CampaignOverlay) stays eagerly bundled — it IS the critical path. */
const SliderShell = dynamic(() =>
  import("@/components/home/SliderShell").then((m) => m.SliderShell),
);
const ProductCard = dynamic(() =>
  import("@/components/home/ProductCard").then((m) => m.ProductCard),
);
const StatDials = dynamic(() =>
  import("@/components/home/StatDial").then((m) => m.StatDials),
);
const AutoplayVideo = dynamic(() =>
  import("@/components/home/MediaBlock").then((m) => m.AutoplayVideo),
);
const ShopTheLook = dynamic(() =>
  import("@/components/home/MediaBlock").then((m) => m.ShopTheLook),
);
const VideoPlayerBlock = dynamic(() =>
  import("@/components/home/MediaBlock").then((m) => m.VideoPlayerBlock),
);

/*
  Presentational sections from the Figma SDR library. Content and color
  mode come in as props (fed from Sanity page sections); defaults match
  the Figma "Homepage — V1 Grid" design. Breakpoints follow the
  desktop/tablet/mobile variants in the library.
*/

type Mode = "light" | "light-mid" | "dark-mid" | "dark";

/* ---------- shared primitives ---------- */

export function PrimaryButton({ label }: { label: string }) {
  return (
    <a
      href="#"
      className="label flex h-[2.875rem] min-w-[9.375rem] items-center justify-center rounded-md bg-btn px-3.5 font-medium text-btn-fg transition-opacity hover:opacity-80 md:h-10"
    >
      {label}
    </a>
  );
}

export function SecondaryTextButton({ label }: { label: string }) {
  return (
    <a href="#" className="group relative text-label-md font-medium uppercase text-ink">
      {label}
      <span className="absolute inset-x-0 -bottom-1 h-px origin-right bg-ink transition-transform duration-300 group-hover:scale-x-0" />
    </a>
  );
}

/* Media-block behaviors shared by Full Width and 50/50 columns;
   "text" is a 50/50-only column kind handled before media renders */
export type MediaKind = "image" | "look" | "videoPlayer" | "videoAutoplay" | "text";

export interface MediaBlockProps {
  kind?: MediaKind;
  videoUrl?: string;
  lookProducts?: LookProductData[];
}

function Media({
  aspect,
  image,
  overlay = false,
  position = "center",
  hoverScale = false,
  parallax = false,
  kind = "image",
  videoUrl,
  lookProducts,
  entranceDuration,
  priority = false,
  lqip,
}: {
  aspect: string;
  image?: string;
  /* true = gradient scrim; "flat" = constant 25% black layer */
  overlay?: boolean | "flat";
  position?: string;
  hoverScale?: boolean;
  parallax?: boolean;
  entranceDuration?: number;
  priority?: boolean;
  lqip?: string;
} & MediaBlockProps) {
  const autoplay = kind === "videoAutoplay" && videoUrl;
  return (
    /* data-mode=dark: imagery is dark-mode content, so the fixed
       bars' point-sampling inverts over any media section */
    /* sdr-parallax-frame: names the view() timeline the touch-device
       CSS parallax scrubs against — it must live on this wrapper (the
       outermost overflow ancestor) so the timeline tracks the
       viewport, not a degenerate inner scrollport */
    <div
      data-mode="dark"
      className={`relative w-full overflow-hidden rounded-xs bg-surface-2 ${
        parallax ? "sdr-parallax-frame" : ""
      } ${aspect}`}
    >
      {autoplay ? (
        <AutoplayVideo src={videoUrl} poster={image} />
      ) : (
        image && (
          <AnimatedMedia
            image={image}
            position={position}
            hoverScale={hoverScale}
            parallax={parallax}
            entranceDuration={entranceDuration}
            priority={priority}
            lqip={lqip}
          />
        )
      )}
      {overlay && (
        <div
          className={
            overlay === "flat"
              ? "pointer-events-none absolute inset-0 bg-black/25"
              : "media-overlay"
          }
        />
      )}
      {/* video UI only exists on video kinds — an image shows none */}
      {kind === "videoPlayer" && videoUrl && <VideoPlayerBlock src={videoUrl} />}
      {kind === "look" && lookProducts && <ShopTheLook products={lookProducts} />}
    </div>
  );
}

/* ---------- Hero ---------- */

export interface HeroProps {
  mode?: Mode;
  /* three overlay texts: left / center / right (right hover-underlines) */
  eyebrow?: string;
  headline?: string;
  primaryCta?: string;
  image?: string;
  /* the hero's media is a static image or an autoplay video only */
  kind?: "image" | "videoAutoplay";
  videoUrl?: string;
  /* base64 blur preview from Sanity image metadata */
  lqip?: string;
}

export function Hero({
  mode = "dark",
  eyebrow = "Now Arriving",
  headline = "Spring Traditions",
  primaryCta = "Shop Collection",
  image = "/figma/campaign.jpg",
  kind = "image",
  videoUrl,
  lqip,
}: HeroProps) {
  return (
    <section data-mode={mode} className="relative w-full bg-surface text-ink">
      {/* the whole hero is the link and the hover parent: image scales,
          the right text's underline draws in */}
      <a href="#" aria-label={headline} className="group block w-full">
        {/* slower entrance (2x) and no hover zoom on the hero image */}
        <Media
          aspect="h-svh"
          image={image}
          overlay="flat"
          parallax
          kind={kind}
          videoUrl={videoUrl}
          entranceDuration={1.8}
          priority
          lqip={lqip}
        />
        <CampaignOverlay
          left={eyebrow}
          center={headline}
          right={primaryCta}
          stack="button"
          /* the hero headline is the mobile LCP element — its fade
             must not wait for hydration (CSS reveal, see globals) */
          priority
        />
      </a>
    </section>
  );
}

/* ---------- Full Width campaign ---------- */

export interface FullWidthProps extends MediaBlockProps {
  mode?: Mode;
  /* three overlay texts: left / center / right (right hover-underlines) */
  eyebrow?: string;
  headline?: string;
  primaryCta?: string;
  image?: string;
  /* base64 blur preview from Sanity image metadata */
  lqip?: string;
}

export function FullWidth({
  mode = "dark",
  eyebrow = "Now Arriving",
  headline = "Spring Traditions",
  primaryCta = "Shop Collection",
  image = "/figma/campaign.jpg",
  kind = "image",
  videoUrl,
  lookProducts,
  lqip,
}: FullWidthProps) {
  const media = (
    <>
      <Media
        aspect="aspect-[2/3] sm:aspect-[16/9]"
        image={image}
        overlay
        position="bottom"
        hoverScale={kind === "image"}
        parallax
        kind={kind}
        videoUrl={videoUrl}
        lookProducts={lookProducts}
        lqip={lqip}
      />
      {/* pointer-events pass through the text overlay so the media's
          own controls (bag, play, pause) stay hoverable beneath it */}
      <CampaignOverlay left={eyebrow} center={headline} right={primaryCta} stack="link" />
    </>
  );
  return (
    /* plain-image sections are one big link; interactive media keeps
       its own controls clickable instead */
    <section data-mode={mode} className="group relative w-full bg-white text-ink">
      {kind === "image" ? (
        <a href="#" aria-label={headline} className="block w-full">
          {media}
        </a>
      ) : (
        media
      )}
    </section>
  );
}

/* ---------- Info Card Slider ---------- */

export interface InfoCardData {
  _key?: string;
  title?: string;
  /* optional body copy (feature / technology cards) — presence flips
     the whole slider into the bordered FRAMED variant */
  body?: string;
  /* editorial line under an OPEN card (Slider Info V2, 33781:52010):
     body-sm secondary copy ending in Learn More. Distinct from `body`
     so it can't trip the framed heuristic. */
  copy?: string;
  image?: string;
  /* info cards allow a static image or an autoplay video */
  kind?: MediaKind;
  videoUrl?: string;
}

export interface InfoSliderProps {
  mode?: Mode;
  title?: string;
  cards?: InfoCardData[];
}

const defaultInfoCards: InfoCardData[] = ["Footwear", "Polos", "Headwear", "T-Shirts"].map(
  (title) => ({
    title,
    copy: "Torsional Traction Plate for benefit lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod.",
    image: "/figma/media-portrait.jpg",
  }),
);

export function InfoSlider({
  mode = "light",
  title = "Explore Sun Day Red",
  cards = defaultInfoCards,
}: InfoSliderProps) {
  /* card bodies mark the bordered info-card variant (Features /
     Technology): hairlines between and around the cards plus generous
     space under the slider; category sliders keep the open look */
  const framed = cards.some((card) => card.body);
  /* Slider Info V2 (editorial copy under open cards) breathes like
     the framed variant: 9xl above and below instead of sitting flush */
  const editorial = !framed && cards.some((card) => card.copy);
  return (
    <section
      data-mode={mode}
      className={`flex w-full flex-col bg-surface text-ink ${
        framed || editorial ? "py-9xl" : ""
      }`}
    >
      <SliderShell
        title={title}
        titleClassName={
          framed ? "font-display text-title-md text-ink" : undefined
        }
        bordered={!framed && !editorial}
        headerClassName={
          framed
            ? "border-b border-line px-4 pb-12 pt-4 md:px-6 md:pt-6"
            : editorial
              ? "px-4 pb-12 md:px-6"
              : undefined
        }
        cols={
          framed
            ? "auto-cols-[85%] sm:auto-cols-[45%] lg:auto-cols-[28.75%]"
            : editorial
              ? /* V2 comps: near-full card on mobile, 4-up from tablet */
                "auto-cols-[93%] sm:auto-cols-[45%] lg:auto-cols-[24%] xl:auto-cols-[23.75%]"
              : undefined
        }
        items={cards.map((card, i) => {
          const media = (
            <Media
              aspect="aspect-[3/4]"
              image={card.image ?? "/figma/media-portrait.jpg"}
              hoverScale={card.kind !== "videoAutoplay"}
              kind={card.kind === "videoAutoplay" ? "videoAutoplay" : "image"}
              videoUrl={card.videoUrl}
            />
          );
          /* the FRAMED variant applies to every card once the section
             is framed (any body copy anywhere) — a card missing its
             body must not fall back to the full-bleed category look
             mid-slider */
          return {
            key: card._key ?? String(i),
            card: framed ? (
              <a
                href="#"
                /* border-b only: the header row above already draws
                   the top rule — border-y would stack into a 2px line */
                className="group flex w-full flex-col gap-[1.125rem] border-b border-r border-line bg-surface p-4 pb-16 md:p-6 md:pb-16"
              >
                {media}
                <p className="font-display text-title-xs text-ink">{card.title}</p>
                {card.body && <p className="text-body-sm text-ink-2">{card.body}</p>}
              </a>
            ) : (
              /* Slider Info V2 (33781:52010): serif card title, then
                 the editorial line closing on Learn More */
              <a href="#" className="group flex w-full flex-col gap-[1.125rem] bg-surface pb-16">
                {media}
                <div className="flex flex-col gap-2 px-4 md:px-6">
                  <p className="font-display text-title-sm text-ink">{card.title}</p>
                  {card.copy && (
                    <p className="max-w-[18.75rem] text-body-sm text-ink-2">
                      {card.copy} <span className="text-ink">Learn More</span>
                    </p>
                  )}
                </div>
              </a>
            ),
          };
        })}
      />
    </section>
  );
}

/* ---------- Product Slider ---------- */

export interface ProductSliderProps {
  mode?: Mode;
  title?: string;
  products?: ProductCardData[];
}

/* Mirrors the seeded Presidio colorways so the CMS-less fallback
   behaves exactly like production data */
const SAMPLE_SWATCHES = [
  { name: "White / White", color: "#f4f4f2", image: "/figma/products/presidio-white.png", hoverImage: "/figma/products/presidio-white-hover.png" },
  { name: "White / Red", color: "#b01f24", image: "/figma/products/presidio-red.png", hoverImage: "/figma/products/presidio-red-hover.png" },
  { name: "Black / White", color: "#161716", image: "/figma/products/presidio-black.png", hoverImage: "/figma/products/presidio-black-hover.png" },
  { name: "White / Blue", color: "#4b74ad", image: "/figma/products/presidio-blue.png", hoverImage: "/figma/products/presidio-blue-hover.png" },
  { name: "Gray / Navy", color: "#9aa0a8", image: "/figma/products/presidio-navy.png", hoverImage: "/figma/products/presidio-navy-hover.png" },
];

const defaultProducts: ProductCardData[] = Array.from({ length: 24 }, (_, i) => ({
  title: "Presidio",
  price: "$198.00",
  gender: i % 2 === 0 ? "mens" : "womens",
  image: "/figma/products/presidio-white.png",
  hoverImage: "/figma/products/presidio-white-hover.png",
  variants: SAMPLE_SWATCHES,
  // variant-per-card: each card defaults to a different colorway
  defaultVariant: i % SAMPLE_SWATCHES.length,
}));

export function ProductSlider({
  mode = "light",
  title,
  products = defaultProducts,
}: ProductSliderProps) {
  return (
    <section data-mode={mode} className="flex w-full flex-col bg-surface text-ink">
      <SliderShell
        title={title}
        bordered={false}
        /* comp card widths (33691:63690/63703/63716): ~4.3 cards at
           desktop AND tablet, one near-full card + sliver on mobile */
        cols="auto-cols-[93%] sm:auto-cols-[45%] lg:auto-cols-[23.3%]"
        items={products.map((product, i) => ({
          key: product._key ?? String(i),
          gender: product.gender,
          card: <ProductCard product={product} />,
        }))}
      />
    </section>
  );
}

/* ---------- Carousel (client, interactive) ---------- */

export const Carousel = dynamic(() =>
  import("@/components/home/Carousel").then((m) => m.Carousel),
);
export type { CarouselProps } from "@/components/home/Carousel";

/* ---------- 50/50 ---------- */

export interface FiftyPanelData extends MediaBlockProps {
  _key?: string;
  title?: string;
  image?: string;
  /* image columns: a link turns on the arrow button + hover state */
  url?: string;
  /* text-module columns (kind === "text") */
  eyebrow?: string;
  body?: string;
  /* CMS toggles for the eyebrow and CTA (default on when content exists) */
  showEyebrow?: boolean;
  showButton?: boolean;
  ctaLabel?: string;
}

export type FiftyRatio = "5:4" | "1:1" | "flex";

export interface FiftyFiftyProps {
  mode?: Mode;
  /* aspect applied to both columns; flex = the whole 50/50 fills the
     viewport height and the columns fill it */
  ratio?: FiftyRatio;
  panels?: FiftyPanelData[];
}

const defaultPanels: FiftyPanelData[] = ["Women’s Apparel", "Men’s Apparel"].map(
  (title) => ({
    title,
    image: "/figma/campaign.jpg",
  }),
);

const RATIO_ASPECT: Record<FiftyRatio, string> = {
  "5:4": "aspect-[4/5]",
  "1:1": "aspect-square",
  // flex: columns fill the 100vh section (stacked 50vh each on mobile)
  flex: "h-[50vh] sm:h-full",
};

export function FiftyFifty({
  mode = "dark",
  ratio = "5:4",
  panels = defaultPanels,
}: FiftyFiftyProps) {
  const aspect = RATIO_ASPECT[ratio] ?? RATIO_ASPECT["5:4"];
  return (
    <section
      data-mode={mode}
      className={`grid w-full grid-cols-1 bg-white text-ink sm:grid-cols-2 ${
        ratio === "flex" ? "sm:h-svh" : ""
      }`}
    >
      {panels.map((panel, i) => {
        const kind = panel.kind ?? "image";
        /* text module (comp 33321:30688): a left-aligned 460px stack
           centered in the column — label eyebrow, Title Large body,
           and the 46px Secondary CTA; eyebrow and button carry CMS
           toggles. Mobile runs top-left on a 64px rhythm. */
        if (kind === "text") {
          const showEyebrow = panel.showEyebrow !== false && panel.eyebrow;
          const showButton = panel.showButton !== false && panel.ctaLabel;
          return (
            <div
              key={panel._key ?? i}
              className={`flex flex-col items-start bg-surface px-4 py-8 md:items-center md:justify-center md:px-16 md:py-[4.5rem] ${aspect}`}
            >
              <div className="flex w-full flex-col items-start gap-16 md:max-w-[28.75rem] md:gap-12">
                {showEyebrow && (
                  <p className="label font-medium text-ink">{panel.eyebrow!.toUpperCase()}</p>
                )}
                {panel.body && (
                  <p className="font-display text-title-lg text-ink">{panel.body}</p>
                )}
                {showButton && (
                  <a
                    href="#"
                    className="label flex h-[2.875rem] min-w-[7.5rem] items-center justify-center gap-1.5 rounded-md bg-surface-2 px-4 font-medium text-ink transition-colors hover:bg-[#cacbc8]"
                  >
                    {panel.ctaLabel!.toUpperCase()}
                    <ArrowUpRight size={10} />
                  </a>
                )}
              </div>
            </div>
          );
        }
        const media = (
          <Media
            aspect={aspect}
            image={panel.image ?? "/figma/campaign.jpg"}
            overlay
            hoverScale={kind === "image" && Boolean(panel.url)}
            parallax={kind !== "videoAutoplay"}
            kind={kind}
            videoUrl={panel.videoUrl}
            lookProducts={panel.lookProducts}
          />
        );
        /* Image columns with a link are the clickable panel with the
           arrow swap + hover zoom; without a link they fall through
           to the static render. Interactive media owns its own
           controls instead. */
        if (kind === "image" && panel.url) {
          return (
            <ArrowLink
              key={panel._key ?? i}
              href={panel.url}
              aria-label={panel.title}
              className="sdr-parallax-frame group relative block overflow-hidden"
            >
              {media}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 md:p-6">
                {/* mobile: same display size as the Full Width headline */}
                <p className="font-display text-headline-lg md:text-title-md">
                  {panel.title}
                </p>
                {/* md+: swap on panel hover; mobile: plays once in view */}
                <span className="hidden size-10 items-center justify-center rounded-md bg-white text-[#161716] md:flex">
                  <ArrowSwap dx={1} dy={-1}>
                    <ArrowUpRight />
                  </ArrowSwap>
                </span>
                <ArrowInViewPlay className="flex size-10 items-center justify-center rounded-md bg-white text-[#161716] md:hidden">
                  <ArrowSwap dx={1} dy={-1}>
                    <ArrowUpRight />
                  </ArrowSwap>
                </ArrowInViewPlay>
              </div>
            </ArrowLink>
          );
        }
        return (
          <div
            key={panel._key ?? i}
            className={`relative overflow-hidden ${
              kind !== "videoAutoplay" ? "sdr-parallax-frame" : ""
            }`}
          >
            {media}
            {panel.title && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 md:p-6">
                {/* mobile: same display size as the Full Width headline */}
                <p className="font-display text-headline-lg md:text-title-md">
                  {panel.title}
                </p>
                {/* mobile: the square NE arrow, playing once in view */}
                <ArrowInViewPlay className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white text-[#161716] md:hidden">
                  <ArrowSwap dx={1} dy={-1}>
                    <ArrowUpRight />
                  </ArrowSwap>
                </ArrowInViewPlay>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ---------- Technical Specifications ---------- */

export interface TechSpecsProps {
  mode?: Mode;
  title?: string;
  rows?: Array<{ _key?: string; label?: string; value?: string }>;
  /* closing paragraph under the rows */
  description?: string;
  stats?: Array<{ _key?: string; value?: number; label?: string }>;
}

const defaultSpecRows = [
  { label: "First Light Collection", value: "140 grams" },
  { label: "First Light Collection", value: "89% Polyamide 11% Elastane" },
  { label: "Temperature Range", value: "8-20 deg C\n8-20 deg C\n8-20 deg C" },
  { label: "Features", value: "Torsion Control\nMoisture Wicking\nDermacare Breathability" },
];

const defaultSpecDescription =
  "Maecenas suspendisse ultrices pellentesque et ornare dui nisl. Eget convallis lorem faucibus tortor in. Cursus feugiat feugiat a quam vestibulum dignissim sem ullamcorper.";

const defaultSpecStats = [
  { value: 66, label: "Breathability" },
  { value: 80, label: "Weathers Resistance" },
  { value: 91, label: "Mobility" },
];


export function TechSpecs({
  mode = "light",
  title = "Technical Specifications",
  rows = defaultSpecRows,
  description = defaultSpecDescription,
  stats = defaultSpecStats,
}: TechSpecsProps) {
  return (
    <section data-mode={mode} className="w-full bg-surface text-ink">
      {/* heavy 6px rule opening the section, per the comp — the margin
          above keeps the section's own surface at the boundary (flush
          against a light neighbor, a dark section otherwise peeks up
          beside the inset rule) */}
      <div className="mx-4 mt-14 h-1.5 bg-ink md:mx-8 md:mt-8xl" />
      {/* no column gap: the right column starts on the same centerline
          as the description section's pairs rail above */}
      <SectionReveal className="grid w-full grid-cols-1 gap-y-10 px-4 pb-28 pt-14 md:grid-cols-2 md:px-8 md:pb-10xl md:pt-24">
        <p className="max-w-[26rem] font-display text-title-lg">{title}</p>
        <div className="flex flex-col gap-8">
          {/* each group opens with a 1.5px full-width rule; value rows
              sit on a 12px rhythm with hairlines spanning only the
              value column. The rules and text share one timeline: a
              group's opener draws left→right while its title fades
              up, its value rows follow one after another, and each
              group starts on the tail of the one before */}
          {(() => {
            const STEP = 0.08;
            let t = 0;
            const groups = rows.map((row, i) => {
              const lines = (row.value ?? "").split("\n").filter(Boolean);
              const d0 = t;
              t += STEP * (lines.length + 1);
              return (
                <div key={row._key ?? i} className="grid grid-cols-2">
                  <RevealLine delay={d0} className="col-span-2 h-[1.5px] w-full bg-line" />
                  <RevealText delay={d0}>
                    <p className="label py-3 font-medium text-ink-2">
                      {(row.label ?? "").toUpperCase()}
                    </p>
                  </RevealText>
                  <div className="flex flex-col">
                    {lines.map((line, j) => (
                      <div key={j} className="flex flex-col">
                        <RevealText delay={d0 + STEP * (j + 1)}>
                          <p className="label py-3 font-medium">{line.toUpperCase()}</p>
                        </RevealText>
                        <RevealLine
                          delay={d0 + STEP * (j + 1)}
                          className="h-px w-full bg-line"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
            return (
              <>
                {groups}
                {description && (
                  <div className="grid grid-cols-2 gap-y-3">
                    <RevealLine delay={t} className="col-span-2 h-[1.5px] w-full bg-line" />
                    <span />
                    <RevealText delay={t}>
                      <p className="label font-medium leading-relaxed">
                        {description.toUpperCase()}
                      </p>
                    </RevealText>
                  </div>
                )}
              </>
            );
          })()}
          {stats.length > 0 && <StatDials stats={stats} />}
        </div>
      </SectionReveal>
    </section>
  );
}

/* ---------- Gallery (variable-aspect media slider) ---------- */

export interface GallerySlideData extends MediaBlockProps {
  _key?: string;
  image?: string;
  /* natural aspect ratio (w / h); slides fill the track height */
  aspect?: number;
}

export interface GalleryProps {
  mode?: Mode;
  title?: string;
  slides?: GallerySlideData[];
}

const defaultGallerySlides: GallerySlideData[] = [
  { image: "/figma/products/presidio-white-hover.png", aspect: 4 / 3 },
  { image: "/figma/media-portrait.jpg", aspect: 3 / 4 },
  { image: "/figma/campaign.jpg", aspect: 16 / 9 },
  { image: "/figma/products/presidio-black-hover.png", aspect: 1 },
];

export function Gallery({ mode = "light", title = "Gallery", slides = defaultGallerySlides }: GalleryProps) {
  return (
    <section data-mode={mode} className="flex w-full flex-col bg-surface text-ink">
      <SliderShell
        title={title}
        variable
        items={slides.map((slide, i) => ({
          key: slide._key ?? String(i),
          card: (
            <div
              className="relative h-[60vh] max-w-[92vw] overflow-hidden bg-surface-2 sm:h-[70vh]"
              style={{ aspectRatio: slide.aspect ?? 4 / 3 }}
            >
              {slide.kind === "videoAutoplay" && slide.videoUrl ? (
                <AutoplayVideo src={slide.videoUrl} poster={slide.image} />
              ) : (
                slide.image && <AnimatedMedia image={slide.image} />
              )}
              {slide.kind === "videoPlayer" && slide.videoUrl && (
                <VideoPlayerBlock src={slide.videoUrl} />
              )}
              {slide.kind === "look" && slide.lookProducts && (
                <ShopTheLook products={slide.lookProducts} />
              )}
            </div>
          ),
        }))}
      />
    </section>
  );
}

/* ---------- Reviews (Yotpo placeholder) ---------- */

/* five-pointed star, filled with the current ink */
function Star({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 15 15"
      fill="currentColor"
      aria-hidden
    >
      <path d="M7.5 0l2.02 4.68 5.08.44-3.85 3.34 1.15 4.97L7.5 10.8l-4.4 2.63 1.15-4.97L.42 5.12l5.08-.44L7.5 0z" />
    </svg>
  );
}

function StarRow({ count = 5, size = 15 }: { count?: number; size?: number }) {
  return (
    <span className="flex items-center gap-[0.125rem] text-ink" aria-label={`${count} stars`}>
      {Array.from({ length: count }, (_, i) => (
        <Star key={i} size={size} />
      ))}
    </span>
  );
}

interface Review {
  name: string;
  verified?: boolean;
  stars: number;
  title: string;
  body: string;
  date: string;
}

const defaultReviews: Review[] = Array.from({ length: 3 }, () => ({
  name: "Jane D.",
  verified: true,
  stars: 5,
  title: "Lorem ipsum dolor sit amet consectetur adipiscing elit",
  body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.",
  date: "4/20/26",
}));

/* Reviews (Figma 33209:11159): centered rating summary, then a
   full-width list — search/sort bar and review rows separated by
   1.5px rules, each row three columns (reviewer · stars/title/body ·
   date), pagination under the last row. */
export function Reviews({
  mode = "light",
  title = "Presidio",
  rating = "4.9",
  count = 21,
  reviews = defaultReviews,
}: {
  mode?: Mode;
  title?: string;
  rating?: string;
  count?: number;
  reviews?: Review[];
}) {
  return (
    <section data-mode={mode} className="w-full bg-surface text-ink">
      {/* 20px header stack gap is the comp's own value — the spacing
          scale steps 16 → 24 with no 20 */}
      <div className="flex flex-col items-center gap-6xl px-4xl py-9xl">
        <div className="flex flex-col items-center gap-[1.25rem]">
          <p className="font-display text-title-lg">{title}</p>
          {/* 10px rating-row gap: comp value, no token (8 → 12) */}
          <div className="flex items-center gap-[0.625rem]">
            <p className="text-body-md font-medium">{rating}</p>
            <StarRow size={17} />
            <p className="text-body-md font-medium">{count} Reviews</p>
          </div>
          <button type="button" className="text-body-md font-medium">
            Write a review
          </button>
        </div>

        <div className="flex w-full flex-col">
          {/* the comp's rules are deliberately heavier than the 1px
              hairline system — 1.5px per the node */}
          <div className="flex items-center justify-between border-t-[1.5px] border-line py-2xl">
            <p className="text-body-md font-medium">Search reviews</p>
            <p className="text-body-md font-medium">Sort by: Most recent</p>
          </div>

          {reviews.map((review, i) => (
            <div
              key={i}
              /* 29px column gap + 13px title/body gap are the comp's
                 own values — no tokens at those steps */
              /* tablet holds three near-equal columns (the copy wraps
                 tall); desktop widens the middle per the 1440 comp */
              className="grid grid-cols-1 gap-y-lg border-t-[1.5px] border-line py-6xl md:grid-cols-[1fr_1.05fr_1fr] md:gap-x-[1.8125rem] xl:grid-cols-[1fr_2.3fr_1fr]"
            >
              <div className="flex flex-col gap-xs">
                <p className="text-body-md font-medium">{review.name}</p>
                {review.verified && (
                  <p className="text-label-md font-medium uppercase text-ink-2">
                    Verified
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-4xl">
                <StarRow count={review.stars} />
                <div className="flex flex-col gap-[0.8125rem]">
                  <p className="text-body-md font-medium">{review.title}</p>
                  <p className="text-body-sm text-ink-2">{review.body}</p>
                </div>
              </div>
              <p className="text-label-md font-medium uppercase text-ink-2 md:text-right">
                {review.date}
              </p>
            </div>
          ))}

          <div className="flex items-center justify-center gap-4xl pt-6xl">
            <button type="button" aria-label="Previous page" className="text-ink">
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M7 1L1 7l6 6" />
              </svg>
            </button>
            <div className="flex items-center gap-2xl text-body-md font-medium">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>...</span>
              <span>6</span>
            </div>
            <button type="button" aria-label="Next page" className="text-ink">
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M1 1l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Method shared sections (Figma Method/Sections) ---------- */

export interface LinkData {
  label?: string;
  url?: string;
}

/* 12px medium underline link with the library's wipe-out underline
   (SecondaryTextButton without the uppercase, and with a real href) */
export function UnderlineLink({ label, href = "/" }: { label: string; href?: string }) {
  return (
    <ArrowLink href={href} className="group relative inline-block self-start text-label-sm font-medium text-ink">
      {label}
      <span className="absolute inset-x-0 -bottom-0.5 h-px origin-right bg-ink transition-transform duration-300 group-hover:scale-x-0" />
    </ArrowLink>
  );
}

/* The library button: 48px tall, 8px radius, 14px medium label.
   Primary = the mode's button tokens; secondary = ghost outline. A
   /get-started href opens the intake tray (LazyGetStarted listens). */
export function CtaButton({ label, href = "/get-started", variant = "primary" }: { label: string; href?: string; variant?: "primary" | "secondary" }) {
  return (
    <ArrowLink
      href={href}
      className={`inline-flex h-12 min-w-[9.375rem] items-center justify-center rounded-md px-[1.125rem] text-body-sm font-medium transition-opacity hover:opacity-80 ${
        variant === "primary" ? "bg-btn text-btn-fg" : "border border-ink/70 bg-ink/10 text-ink"
      }`}
    >
      {label}
    </ArrowLink>
  );
}

/* shared frame: 64px gutters on desktop, the 1280 content column */
const SECTION_X = "px-4 md:px-7xl";
const CONTAINER = "mx-auto w-full max-w-page";

const defaultIntroParagraphs = [
  "Opening paragraph answers the heading directly in 40–60 words. It names the thing, the audience, and the outcome, then the following paragraphs add the specifics — process, materials, timelines, locations — that make the answer complete.",
  "Second paragraph carries the detail: numbers, named places, named certifications, and the limits of the claim. Third paragraphs are welcome; the page-level target is 300+ words of real content, not padding.",
];

/* Text intro (37505:3536): eyebrow + question-form H2 left, prose +
   related link right. The H2 is the question an engine matches; the
   first paragraph is the quotable answer. */
export function TextIntro({
  mode = "light",
  eyebrow = "Eyebrow",
  headline = "Question-form heading that a visitor would type?",
  body,
  paragraphs = defaultIntroParagraphs,
  link = { label: "Related page link", url: "/" },
}: {
  mode?: Mode;
  eyebrow?: string;
  headline?: string;
  /* Portable Text from the CMS; `paragraphs` is the code default */
  body?: React.ReactNode;
  paragraphs?: string[];
  link?: LinkData | null;
}) {
  return (
    <section data-mode={mode} className={`w-full bg-surface text-ink ${SECTION_X} py-8xl md:py-10xl`}>
      <SectionReveal className={`${CONTAINER} grid grid-cols-1 gap-6xl md:grid-cols-[minmax(0,32.5rem)_1fr] md:gap-9xl`}>
        <div className="flex flex-col gap-xl">
          {eyebrow && <p className="label text-ink-3">{eyebrow}</p>}
          <RevealText>
            <h2 className="font-display text-headline-md text-ink">{headline}</h2>
          </RevealText>
        </div>
        <div className="flex flex-col gap-3xl text-body-md text-ink-2 [&_p]:max-w-prose">
          {body ?? paragraphs.map((text, i) => <p key={i}>{text}</p>)}
          {link?.label && <UnderlineLink label={link.label} href={link.url || "/"} />}
        </div>
      </SectionReveal>
    </section>
  );
}

export interface StatFactData {
  _key?: string;
  value?: string;
  label?: string;
  footnote?: number;
}
export interface SourceData {
  _key?: string;
  label?: string;
  url?: string;
  date?: string;
}

const defaultStats: StatFactData[] = [
  { value: "400+", label: "Projects completed since 2007", footnote: 1 },
  { value: "2007", label: "Founded in Seattle, Washington", footnote: 1 },
  { value: "7", label: "Predesigned series · 32 floor plans", footnote: 2 },
  { value: "6 states", label: "Delivered across the West and beyond", footnote: 2 },
];
const defaultSources: SourceData[] = [
  { label: "Method Homes company records", date: "2026-09-01" },
  { label: "Predesigned catalog, methodhomes.net", date: "2026-09-01" },
];

/* Stats bar (37506:3714): the proof bar. Values are DOM text (the
   numbers an answer engine quotes) and each carries a footnote marker
   to the dated sources line — the Rivian way of keeping claims honest. */
export function StatsBar({
  mode = "light",
  stats = defaultStats,
  sources = defaultSources,
  id,
}: {
  mode?: Mode;
  stats?: StatFactData[];
  sources?: SourceData[];
  /* anchor base for the footnotes when several bars share a page */
  id?: string;
}) {
  const base = id ?? "stats";
  const list = stats.filter((s) => s.value && s.label);
  const used = sources.filter((s) => s.label);
  const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : null);
  return (
    <section data-mode={mode} className={`w-full border-y border-line bg-surface text-ink ${SECTION_X} py-6xl md:py-8xl`}>
      <div className={CONTAINER}>
        <dl className="grid grid-cols-2 gap-x-4xl gap-y-6xl md:grid-cols-4 md:gap-x-7xl">
          {list.map((s, i) => (
            <div key={s._key ?? i} className="flex flex-col gap-md">
              <dd className="order-1 font-display text-headline-md text-ink">
                {s.value}
                {s.footnote && used[s.footnote - 1] ? (
                  <sup className="ml-0.5 text-label-sm font-medium text-ink-3">
                    <a href={`#${base}-source-${s.footnote}`} aria-label={`Source ${s.footnote}`}>{s.footnote}</a>
                  </sup>
                ) : null}
              </dd>
              <dt className="order-2 text-body-sm text-ink-2">{s.label}</dt>
            </div>
          ))}
        </dl>
        {used.length > 0 && (
          <ol className="mt-6xl flex flex-wrap gap-x-xl gap-y-xs label text-ink-3">
            <li className="list-none">Sources</li>
            {used.map((s, i) => (
              <li key={s._key ?? i} id={`${base}-source-${i + 1}`} className="list-none">
                <sup>{i + 1}</sup>{" "}
                {s.url ? (
                  <a href={s.url} className="underline-offset-2 hover:underline" rel="noopener">{s.label}</a>
                ) : (
                  s.label
                )}
                {fmt(s.date) ? `, ${fmt(s.date)}` : ""}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export interface FeatureItemData {
  _key?: string;
  icon?: string;
  title?: string;
  body?: string;
  link?: LinkData | null;
}

const defaultFeatures: FeatureItemData[] = [1, 2, 3].map(() => ({
  title: "Feature title",
  body: "Two or three sentences that explain the feature with a concrete detail a reader could verify.",
  link: { label: "Learn more", url: "/" },
}));

/* Feature list (37508:4069): icon + title + body + link, 3 or 4
   across under a section header. */
export function FeatureList({
  mode = "light",
  eyebrow = "Eyebrow",
  headline = "Heading that frames the set of features",
  columns = 3,
  items = defaultFeatures,
}: {
  mode?: Mode;
  eyebrow?: string;
  headline?: string;
  columns?: 3 | 4;
  items?: FeatureItemData[];
}) {
  return (
    <section data-mode={mode} className={`w-full bg-surface text-ink ${SECTION_X} py-8xl md:py-10xl`}>
      <SectionReveal className={`${CONTAINER} flex flex-col gap-6xl`}>
        <div className="flex max-w-[47.5rem] flex-col gap-xl">
          {eyebrow && <p className="label text-ink-3">{eyebrow}</p>}
          <RevealText>
            <h2 className="font-display text-headline-md text-ink">{headline}</h2>
          </RevealText>
        </div>
        <ul className={`grid grid-cols-1 gap-4xl sm:grid-cols-2 ${columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {items.filter((f) => f.title).map((f, i) => (
            <li key={f._key ?? i} className="flex flex-col gap-lg border-t border-line py-3xl">
              {f.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.icon} alt="" width={40} height={40} loading="lazy" decoding="async" className="size-10 rounded-md object-cover" />
              ) : (
                <span aria-hidden className="block size-10 rounded-md bg-wash" />
              )}
              <h3 className="font-display text-title-sm font-medium text-ink">{f.title}</h3>
              {f.body && <p className="text-body-sm text-ink-2">{f.body}</p>}
              {f.link?.label && <UnderlineLink label={f.link.label} href={f.link.url || "/"} />}
            </li>
          ))}
        </ul>
      </SectionReveal>
    </section>
  );
}

/* CTA band (37505:3598): the dark conversion band that closes most
   pages above the footer. */
export function CtaBand({
  mode = "dark",
  headline = "Ready to talk about your site, your budget, and your timeline?",
  body = "A ten-minute intake tells us where you're building and what you need. We reply within two business days with a recommended path and a realistic range.",
  primary = { label: "Get started", url: "/get-started" },
  secondary = { label: "Talk to our team", url: "/contact" },
}: {
  mode?: Mode;
  headline?: string;
  body?: string;
  primary?: LinkData | null;
  secondary?: LinkData | null;
}) {
  return (
    <section data-mode={mode} className={`w-full bg-surface text-ink ${SECTION_X} py-8xl md:py-10xl`}>
      <SectionReveal className={`${CONTAINER} flex flex-col items-start gap-6xl md:flex-row md:items-center md:justify-between md:gap-9xl`}>
        <div className="flex max-w-[47.5rem] flex-col gap-xl">
          <RevealText>
            <h2 className="font-display text-headline-md text-ink">{headline}</h2>
          </RevealText>
          {body && <p className="text-body-md text-ink-2">{body}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-lg">
          {primary?.label && <CtaButton label={primary.label} href={primary.url || "/get-started"} />}
          {secondary?.label && <CtaButton label={secondary.label} href={secondary.url || "/contact"} variant="secondary" />}
        </div>
      </SectionReveal>
    </section>
  );
}

/* ---------- Card grid (37506:3646) ---------- */

export interface GridCardData {
  _key?: string;
  image?: string;
  alt?: string;
  eyebrow?: string;
  title?: string;
  body?: string;
  meta?: string;
  url?: string;
}

const defaultGridCards: GridCardData[] = [1, 2, 3].map(() => ({
  eyebrow: "Eyebrow · meta",
  title: "Card title",
  body: "One or two sentences of description that say what this is and why it matters to the reader.",
  meta: "Meta line · 1,590–2,250 sq ft · 2 floor plans",
  url: "/",
}));

function SectionHeader({ eyebrow, headline, link }: { eyebrow?: string; headline?: string; link?: LinkData | null }) {
  return (
    <div className="flex w-full flex-col items-start justify-between gap-xl md:flex-row md:items-end md:gap-7xl">
      <div className="flex max-w-[47.5rem] flex-col gap-xl">
        {eyebrow && <p className="label text-ink-3">{eyebrow}</p>}
        <RevealText>
          <h2 className="font-display text-headline-md text-ink">{headline}</h2>
        </RevealText>
      </div>
      {link?.label && <UnderlineLink label={link.label} href={link.url || "/"} />}
    </div>
  );
}

export function CardGrid({
  mode = "light",
  eyebrow = "Eyebrow",
  headline = "Grid heading that names the set",
  link = { label: "See all", url: "/" },
  columns = 3,
  cards = defaultGridCards,
}: {
  mode?: Mode;
  eyebrow?: string;
  headline?: string;
  link?: LinkData | null;
  columns?: 2 | 3 | 4;
  cards?: GridCardData[];
}) {
  const cols = columns === 2 ? "lg:grid-cols-2" : columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";
  return (
    <section data-mode={mode} className={`w-full bg-surface text-ink ${SECTION_X} py-8xl md:py-10xl`}>
      <SectionReveal className={`${CONTAINER} flex flex-col gap-6xl`}>
        <SectionHeader eyebrow={eyebrow} headline={headline} link={link} />
        <ul className={`grid grid-cols-1 gap-4xl sm:grid-cols-2 ${cols}`}>
          {cards.filter((c) => c.title).map((c, i) => {
            const Wrap = c.url ? ArrowLink : "div";
            return (
              <li key={c._key ?? i} className="flex flex-col gap-2xl">
                <Wrap {...(c.url ? { href: c.url } : {})} className="group flex flex-col gap-2xl">
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xs bg-wash">
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image} alt={c.alt ?? c.title ?? ""} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                    ) : (
                      <span className="label absolute inset-0 flex items-center justify-center text-ink-3">{c.alt ?? "Image"}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-md">
                    {c.eyebrow && <p className="label text-ink-3">{c.eyebrow}</p>}
                    <h3 className="font-display text-title-sm font-medium text-ink">{c.title}</h3>
                    {c.body && <p className="text-body-sm text-ink-2">{c.body}</p>}
                    {c.meta && <p className="text-label-sm font-medium text-ink-3">{c.meta}</p>}
                  </div>
                </Wrap>
              </li>
            );
          })}
        </ul>
      </SectionReveal>
    </section>
  );
}

/* ---------- Process timeline (37507:3797) — HowTo-shaped ---------- */

export interface ProcessStepData {
  _key?: string;
  title?: string;
  body?: string;
  duration?: string;
}

export const defaultProcessSteps: ProcessStepData[] = [
  { title: "Discovery & feasibility", body: "Site, budget, zoning and access review. We confirm a path — series or custom — and a realistic range.", duration: "2–4 weeks" },
  { title: "Design & engineering", body: "Architects and engineers finalize the plan, selections and structural package in one process.", duration: "8–12 weeks" },
  { title: "Permits & site prep", body: "Permitting runs while the foundation and utilities are prepared on site.", duration: "Varies by jurisdiction" },
  { title: "Factory build", body: "Modules are built indoors, finished and inspected while site work completes in parallel.", duration: "10–14 weeks" },
  { title: "Set & finish", body: "Modules are delivered and craned onto the foundation; crews stitch, finish and commission.", duration: "6–10 weeks" },
];

export function ProcessTimeline({
  mode = "light",
  eyebrow = "Process",
  headline = "How does a Method home get built?",
  link = { label: "See the full process", url: "/process" },
  steps = defaultProcessSteps,
}: {
  mode?: Mode;
  eyebrow?: string;
  headline?: string;
  link?: LinkData | null;
  steps?: ProcessStepData[];
}) {
  const list = steps.filter((s) => s.title);
  const cols = list.length >= 5 ? "lg:grid-cols-5" : list.length === 4 ? "lg:grid-cols-4" : list.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
  return (
    <section data-mode={mode} className={`w-full bg-surface text-ink ${SECTION_X} py-8xl md:py-10xl`}>
      <SectionReveal className={`${CONTAINER} flex flex-col gap-6xl`}>
        <SectionHeader eyebrow={eyebrow} headline={headline} link={link} />
        {/* an ordered list: the steps ARE the HowTo */}
        <ol className={`grid grid-cols-1 gap-4xl sm:grid-cols-2 ${cols}`}>
          {list.map((s, i) => (
            <li key={s._key ?? i} className="flex flex-col gap-lg border-t border-line py-3xl">
              <p className="text-label-sm font-medium text-ink-3">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="font-display text-title-sm font-medium text-ink">{s.title}</h3>
              {s.body && <p className="text-body-sm text-ink-2">{s.body}</p>}
              {s.duration && <p className="text-label-sm font-medium text-ink-3">{/^[A-Z]/.test(s.duration) ? s.duration : `Typical: ${s.duration}`}</p>}
            </li>
          ))}
        </ol>
      </SectionReveal>
    </section>
  );
}

/* ---------- Compare table (37507:3753) ---------- */

export interface CompareRowData {
  _key?: string;
  label?: string;
  cells?: string[];
}

const defaultCompareHeaders = ["Series", "Size range", "Floor plans", "Bedrooms", "Starting range", "Best for"];
const defaultCompareRows: CompareRowData[] = [
  { label: "Elemental", cells: ["624–3,500 sq ft", "8", "1–4", "On request", "Flexible single-storey to family-size plans"] },
  { label: "Option", cells: ["922–2,320 sq ft", "9", "1–4", "On request", "Modern plans with the most layouts to choose from"] },
  { label: "Cabin", cells: ["1,298–2,800 sq ft", "5", "2–4", "On request", "Retreats and rural sites"] },
  { label: "M", cells: ["655–1,740 sq ft", "5", "1–3", "On request", "Compact modern homes and ADUs"] },
  { label: "Paradigm", cells: ["656–1,868 sq ft", "3", "1–3", "On request", "Efficient contemporary plans"] },
  { label: "Annata", cells: ["1,590–2,250 sq ft", "2", "3–4", "On request", "Warm, gabled family homes"] },
  { label: "Method One", cells: ["Custom", "—", "—", "On request", "Our original flagship, tailored to the site"] },
];

export function CompareTable({
  mode = "light",
  eyebrow = "Compare",
  headline = "Which Method series fits your site and budget?",
  link = { label: "Pricing guide", url: "/pricing" },
  headers = defaultCompareHeaders,
  rows = defaultCompareRows,
  sources = [],
}: {
  mode?: Mode;
  eyebrow?: string;
  headline?: string;
  link?: LinkData | null;
  headers?: string[];
  rows?: CompareRowData[];
  sources?: SourceData[];
}) {
  const [first, ...rest] = headers;
  return (
    <section data-mode={mode} className={`w-full bg-surface text-ink ${SECTION_X} py-8xl md:py-10xl`}>
      <SectionReveal className={`${CONTAINER} flex flex-col gap-6xl`}>
        <SectionHeader eyebrow={eyebrow} headline={headline} link={link} />
        {/* a real table — the structure engines lift for "X vs Y"; it
            scrolls sideways on narrow screens rather than reflowing */}
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="label w-[12.5rem] py-lg pr-3xl font-medium text-ink-3">{first}</th>
                {rest.map((h, i) => (
                  <th key={i} scope="col" className="label py-lg pr-3xl font-medium text-ink-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.filter((r) => r.label).map((r, i) => (
                <tr key={r._key ?? i} className="border-b border-line align-middle">
                  <th scope="row" className="py-2xl pr-3xl text-body-md font-medium text-ink">{r.label}</th>
                  {rest.map((_, j) => (
                    <td key={j} className="py-2xl pr-3xl text-body-md text-ink-2">{r.cells?.[j] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sources.filter((s) => s.label).length > 0 && (
          <ol className="flex flex-wrap gap-x-xl gap-y-xs label text-ink-3">
            <li className="list-none">Sources</li>
            {sources.filter((s) => s.label).map((s, i) => (
              <li key={s._key ?? i} className="list-none"><sup>{i + 1}</sup> {s.url ? <a href={s.url} rel="noopener" className="underline-offset-2 hover:underline">{s.label}</a> : s.label}</li>
            ))}
          </ol>
        )}
      </SectionReveal>
    </section>
  );
}

/* ---------- Link list (37508:4097) ---------- */

export interface LinkRowData {
  _key?: string;
  title?: string;
  description?: string;
  url?: string;
}

const defaultLinkRows: LinkRowData[] = [1, 2, 3, 4].map(() => ({ title: "Link title", description: "One line on what the reader will find there.", url: "/" }));

export function LinkList({
  mode = "light",
  eyebrow = "Related",
  headline = "Keep reading",
  intro = "Guides and pages that answer the next question.",
  links = defaultLinkRows,
}: {
  mode?: Mode;
  eyebrow?: string;
  headline?: string;
  intro?: string;
  links?: LinkRowData[];
}) {
  return (
    <section data-mode={mode} className={`w-full bg-surface text-ink ${SECTION_X} py-8xl md:py-10xl`}>
      <SectionReveal className={`${CONTAINER} grid grid-cols-1 gap-6xl md:grid-cols-[minmax(0,25rem)_1fr] md:gap-9xl`}>
        <div className="flex flex-col gap-xl">
          {eyebrow && <p className="label text-ink-3">{eyebrow}</p>}
          <RevealText>
            <h2 className="font-display text-headline-md text-ink">{headline}</h2>
          </RevealText>
          {intro && <p className="text-body-md text-ink-2">{intro}</p>}
        </div>
        <ul className="flex flex-col border-t border-line">
          {links.filter((l) => l.title && l.url).map((l, i) => (
            <li key={l._key ?? i} className="border-b border-line">
              <ArrowLink href={l.url!} className="group flex items-center justify-between gap-4xl py-2xl">
                <span className="flex flex-col gap-xs">
                  <span className="text-body-md font-medium text-ink">{l.title}</span>
                  {l.description && <span className="text-body-sm text-ink-2">{l.description}</span>}
                </span>
                <span aria-hidden className="font-display text-title-sm font-medium text-ink transition-transform duration-300 group-hover:translate-x-1">→</span>
              </ArrowLink>
            </li>
          ))}
        </ul>
      </SectionReveal>
    </section>
  );
}

/* ---------- Interstitial (37528:15397) — moments of pause ---------- */

export type InterstitialKindData = "statement" | "image" | "floating" | "word" | "number";

const defaultFloats: FloatData[] = [
  "interior detail — oak stair",
  "cedar siding and window trim",
  "module on a trailer at dawn",
  "floor plan drawing",
  "factory floor — framing a wall",
  "client portrait at the door",
].map((alt) => ({ src: "", alt }));

/* One message, one medium, no eyebrow or buttons. The text is a
   styled <p> (it is not a document section); numeric statements end
   with their footnote marker; the Image kind is never the LCP (lazy). */
export function Interstitial({
  mode = "light",
  kind = "statement",
  text = "Built indoors. Finished on your land.",
  subline,
  image,
  alt,
  caption,
  floats = defaultFloats,
}: {
  mode?: Mode;
  kind?: InterstitialKindData;
  text?: string;
  subline?: string;
  image?: string;
  alt?: string;
  caption?: string;
  floats?: FloatData[];
}) {
  if (kind === "image") {
    return (
      <section data-mode="dark" className="relative w-full bg-surface text-ink">
        <div className="relative min-h-[47.5rem] w-full overflow-hidden">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={alt ?? ""} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="label absolute left-7xl top-6xl text-ink-2">{alt ?? "Photograph"}</span>
          )}
          {caption && <p className="absolute bottom-6xl left-6xl text-body-sm text-ink-2">{caption}</p>}
        </div>
      </section>
    );
  }
  if (kind === "word") {
    return (
      <section data-mode="dark" className="relative w-full bg-surface text-ink">
        <div className={`relative flex min-h-[51.25rem] w-full flex-col items-center justify-center gap-3xl overflow-hidden ${SECTION_X}`}>
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={alt ?? ""} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
          )}
          <p className="relative z-10 text-center font-display text-display-2xl text-ink">{text}</p>
          {subline && <p className="relative z-10 max-w-[45rem] text-center text-body-md text-ink-2">{subline}</p>}
        </div>
      </section>
    );
  }
  if (kind === "number") {
    return (
      <section data-mode={mode} className={`w-full bg-surface-2 text-ink ${SECTION_X} py-11xl`}>
        <div className={`${CONTAINER} flex min-h-[20rem] flex-col items-center justify-center gap-xl text-center`}>
          <p className="font-display text-display-2xl text-ink">{text}</p>
          {subline && <p className="max-w-[45rem] text-body-md text-ink-2">{subline}</p>}
        </div>
      </section>
    );
  }
  if (kind === "floating") {
    return (
      <section data-mode={mode} className={`w-full overflow-hidden bg-surface text-ink ${SECTION_X}`}>
        <FloatingImages floats={floats.filter((f) => f.src || f.alt)}>
          <p className="max-w-[45rem] text-center font-display text-display-xl text-ink">{text}</p>
        </FloatingImages>
      </section>
    );
  }
  return (
    <section data-mode={mode} className={`w-full bg-surface text-ink ${SECTION_X} py-11xl`}>
      <div className={`${CONTAINER} flex min-h-[20rem] items-center justify-center`}>
        <p className="max-w-[60rem] text-center font-display text-display-xl text-ink">{text}</p>
      </div>
    </section>
  );
}

/* ---------- FAQ (question / answer accordion) ---------- */

export interface FaqItemData {
  _key?: string;
  question?: string;
  answer?: string;
}

const defaultFaqItems: FaqItemData[] = [
  {
    question: "How long does a predesigned home take from contract to move-in?",
    answer:
      "Most predesigned homes are complete 8–12 months after contract: 6–8 weeks of design and permitting, 10–14 weeks in the factory, and 2–4 months of on-site finish after set day.",
  },
  {
    question: "What does the price include?",
    answer:
      "The published series price covers the modules complete — structure, envelope, finishes, fixtures and appliances — delivered to the site. Foundation, utilities, site work and permits are quoted separately for your lot.",
  },
  {
    question: "Where do you deliver?",
    answer:
      "We set homes across Washington, Oregon, California, Idaho, Montana and British Columbia from our factory in Ferndale, WA.",
  },
];

/* Native <details>/<summary>: the answers are in the HTML for every
   crawler and reader (no JS gate on the content an answer engine
   quotes), the open/close needs no script, and the first item starts
   open so the section never reads as an empty list of headings. The
   questions are H3s on purpose — question-form headings are what the
   AEO grader's Content pillar counts. */
export function Faq({
  mode = "light",
  eyebrow = "FAQ",
  title = "Questions we hear most",
  intro,
  items = defaultFaqItems,
  link,
}: {
  mode?: Mode;
  eyebrow?: string;
  title?: string;
  intro?: string;
  items?: FaqItemData[];
  /* side-column link under the intro ("Ask us a question") */
  link?: LinkData | null;
}) {
  const list = items.filter((item) => item.question && item.answer);
  return (
    <section data-mode={mode} className="w-full bg-surface text-ink">
      <SectionReveal className="grid w-full grid-cols-1 gap-y-10 px-4 py-14 md:grid-cols-[minmax(0,26rem)_1fr] md:gap-x-10 md:px-8 md:py-24">
        <div className="flex flex-col gap-4">
          {eyebrow && <p className="label text-ink-2">{eyebrow}</p>}
          <h2 className="font-display text-title-lg">{title}</h2>
          {intro && <p className="max-w-[26rem] text-body-md text-ink-2">{intro}</p>}
          {link?.label && link.url && <UnderlineLink label={link.label} href={link.url} />}
        </div>
        <div className="flex flex-col">
          <RevealLine className="h-[1.5px] w-full bg-line" />
          {list.map((item, i) => (
            <details
              key={item._key ?? i}
              open={i === 0}
              className="group border-b-[1.5px] border-line"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-6 [&::-webkit-details-marker]:hidden">
                <h3 className="text-body-md font-medium">{item.question}</h3>
                <span
                  aria-hidden
                  className="mt-1 flex size-5 shrink-0 items-center justify-center text-ink transition-transform duration-300 group-open:rotate-45"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M7 1v12M1 7h12" />
                  </svg>
                </span>
              </summary>
              <p className="max-w-[44rem] pb-8 text-body-md text-ink-2">{item.answer}</p>
            </details>
          ))}
        </div>
      </SectionReveal>
    </section>
  );
}

/* ---------- 3D Viewer (FIBL placeholder) ---------- */

export function ThreeDViewer({
  mode = "light",
  title = "Explore in 3D",
  image,
}: {
  mode?: Mode;
  title?: string;
  image?: string;
}) {
  return (
    <section data-mode={mode} className="relative w-full bg-surface text-ink">
      {/* FIBL interactive viewer mounts here once the integration lands */}
      <div
        data-fibl-viewer
        className="relative flex aspect-[2/3] w-full items-center justify-center overflow-hidden bg-surface-2 sm:aspect-[16/9]"
      >
        {image && (
          <div
            aria-hidden
            className="absolute inset-[12%] bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${image})` }}
          />
        )}
        <div className="absolute bottom-6 left-6 flex flex-col gap-1 rounded-xs bg-surface/85 p-4 backdrop-blur-md">
          <p className="text-body-md font-medium text-ink">{title}</p>
          <p className="label text-ink-2">FIBL 3D VIEWER PLACEHOLDER</p>
        </div>
      </div>
    </section>
  );
}

/* ---------- Breadcrumb (visible twin of BreadcrumbList) ---------- */

export interface CrumbData {
  name: string;
  path?: string;
}

/* Home / Section / Page — Body Small, tertiary ink, the current page
   unlinked. The route emits the matching BreadcrumbList JSON-LD. */
export function Breadcrumb({ crumbs, className = "" }: { crumbs: CrumbData[]; className?: string }) {
  const all = [{ name: "Home", path: "/" }, ...crumbs];
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-md gap-y-xs text-body-sm text-ink-3">
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <li key={`${c.path ?? c.name}-${i}`} className="flex items-center gap-md">
              {c.path && !last ? (
                <ArrowLink href={c.path} className="transition-colors hover:text-ink">{c.name}</ArrowLink>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-ink-2" : undefined}>{c.name}</span>
              )}
              {!last && <span aria-hidden>/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ---------- Hero / Page (37505:3516) ---------- */

/* Breadcrumb + H1 (Headline Large, 960 max) + lede (Body XLarge,
   720 max) + primary button and underline link. The H1 and lede are
   the page's title/description pair; no image, so the LCP is text. */
export function HeroPage({
  mode = "light",
  crumbs = [{ name: "Page name" }],
  headline = "Page heading that names the thing",
  lede = "One or two sentences that answer the heading directly: who this is for, what it is, and the number or place that makes it concrete.",
  primary = { label: "Get started", url: "/get-started" },
  secondary = { label: "See the plans", url: "/predesigned" },
  as = "h1",
}: {
  mode?: Mode;
  crumbs?: CrumbData[];
  headline?: string;
  lede?: string;
  primary?: LinkData | null;
  secondary?: LinkData | null;
  /* a CMS page already renders an sr-only H1 from its title; the
     section then demotes to a visible H2 so the page keeps one H1 */
  as?: "h1" | "h2";
}) {
  const Heading = as;
  return (
    <section data-mode={mode} className={`w-full bg-surface text-ink ${SECTION_X} py-9xl`}>
      <div className={`${CONTAINER} flex flex-col gap-3xl`}>
        <Breadcrumb crumbs={crumbs} />
        <Heading className="max-w-[60rem] font-display text-headline-lg text-ink">{headline}</Heading>
        {lede && <p className="max-w-[45rem] text-body-xl text-ink-2">{lede}</p>}
        {(primary?.label || secondary?.label) && (
          <div className="flex flex-wrap items-center gap-lg pt-md">
            {primary?.label && <CtaButton label={primary.label} href={primary.url || "/get-started"} />}
            {secondary?.label && (
              <ArrowLink href={secondary.url || "/"} className="group relative inline-flex h-12 items-center text-body-sm font-medium text-ink">
                {secondary.label}
                <span className="absolute inset-x-0 bottom-3 h-px origin-right bg-ink transition-transform duration-300 group-hover:scale-x-0" />
              </ArrowLink>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- Hero / Series (37525:15367) ---------- */

/* Breadcrumb, the series wordmark as the H1 (Display XL, centered),
   one full-width photograph (the LCP: eager, high priority, never
   faded), then the facts column: the one-sentence answer, the meta
   line (from price · size range · plan count · months to set day) and
   two buttons. Every number is DOM text with its footnote marker. */
export function HeroSeries({
  mode = "light",
  crumbs = [{ name: "Predesigned Series", path: "/predesigned" }, { name: "Annata" }],
  name = "Annata",
  sentence = "A two-story series for narrow and sloped lots, built from two to four modules and finished on your land in about ten months.",
  meta = "From $585k¹ · 1,590–2,250 sq ft · 2 floor plans · 9–11 months to set day²",
  image,
  alt,
  lqip,
  primary = { label: "Get a range for your site", url: "/get-started" },
  secondary = { label: "Explore the plans", url: "#plans" },
}: {
  mode?: Mode;
  crumbs?: CrumbData[];
  name?: string;
  sentence?: string;
  meta?: string;
  image?: string;
  alt?: string;
  lqip?: string;
  primary?: LinkData | null;
  secondary?: LinkData | null;
}) {
  return (
    <section data-mode={mode} className={`w-full bg-surface text-ink ${SECTION_X} py-9xl`}>
      <div className={`${CONTAINER} flex flex-col items-center gap-6xl`}>
        <Breadcrumb crumbs={crumbs} className="self-start" />
        <h1 className="w-full text-center font-display text-display-2xl text-ink">{name}</h1>
        <div className="relative aspect-[2/1] w-full overflow-hidden rounded-md bg-wash md:h-[40rem] md:aspect-auto">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={alt ?? `${name} series home`}
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 size-full object-cover"
              style={lqip ? { backgroundImage: `url(${lqip})`, backgroundSize: "cover" } : undefined}
            />
          ) : (
            <span className="label absolute inset-0 flex items-center justify-center text-ink-3">{alt ?? `${name} series photograph`}</span>
          )}
        </div>
        <div className="flex w-full max-w-[55rem] flex-col items-center gap-3xl text-center">
          <p className="text-body-xl text-ink">{sentence}</p>
          {meta && <p className="text-body-md text-ink-2">{meta}</p>}
          <div className="flex flex-wrap items-center justify-center gap-lg pt-md">
            {primary?.label && <CtaButton label={primary.label} href={primary.url || "/get-started"} />}
            {secondary?.label && <CtaButton label={secondary.label} href={secondary.url || "#plans"} variant="secondary" />}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Spec table (37507:3678) ---------- */

export interface SpecRowData {
  _key?: string;
  label?: string;
  value?: string;
}

const defaultSpecTableRows: SpecRowData[] = [
  { label: "Structure", value: "Steel-reinforced wood frame modules, 2×6 exterior walls" },
  { label: "Envelope", value: "Continuous exterior insulation; triple-pane windows" },
  { label: "Systems", value: "All-electric; heat pump HVAC; ERV ventilation" },
  { label: "Roof", value: "Standing-seam metal, solar-ready" },
  { label: "Certifications", value: "ENERGY STAR; Built Green 4-Star eligible" },
  { label: "Warranty", value: "10-year structural" },
];

/* Heading column (eyebrow, H2, body, link) beside label/value rows.
   A description list: each row is a term + definition, the shape an
   engine lifts as Product/House additionalProperty. */
export function SpecTable({
  mode = "light",
  eyebrow = "Specifications",
  headline = "High-level specs",
  body = "What every home in the series is built to — structure, envelope, systems and the certifications they carry. Site-specific items are confirmed in your range.",
  link = { label: "Download the spec sheet (PDF)", url: "/" },
  rows = defaultSpecTableRows,
  as = "h2",
}: {
  mode?: Mode;
  eyebrow?: string;
  headline?: string;
  body?: string;
  link?: LinkData | null;
  rows?: SpecRowData[];
  as?: "h2" | "h3";
}) {
  const Heading = as;
  const list = rows.filter((r) => r.label && r.value);
  return (
    <section data-mode={mode} className={`w-full bg-surface text-ink ${SECTION_X} py-8xl md:py-10xl`}>
      <SectionReveal className={`${CONTAINER} grid grid-cols-1 gap-6xl md:grid-cols-[minmax(0,25rem)_1fr] md:gap-9xl`}>
        <div className="flex flex-col gap-xl">
          {eyebrow && <p className="label text-ink-3">{eyebrow}</p>}
          <RevealText>
            <Heading className="font-display text-headline-md text-ink">{headline}</Heading>
          </RevealText>
          {body && <p className="text-body-md text-ink-2">{body}</p>}
          {link?.label && link.url && <UnderlineLink label={link.label} href={link.url} />}
        </div>
        <dl className="flex flex-col border-t border-line">
          {list.map((r, i) => (
            <div key={r._key ?? i} className="flex flex-col gap-xs border-b border-line py-xl md:flex-row md:gap-4xl">
              <dt className="w-full shrink-0 text-body-sm font-medium text-ink-2 md:w-[16.25rem]">{r.label}</dt>
              <dd className="flex-1 text-body-md text-ink">{r.value}</dd>
            </div>
          ))}
        </dl>
      </SectionReveal>
    </section>
  );
}
