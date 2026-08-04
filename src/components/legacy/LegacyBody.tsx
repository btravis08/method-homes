import { FloatingWords } from "@/components/legacy/FloatingWords";
import { LegacyHero } from "@/components/legacy/LegacyHero";
import { ProductSwirl } from "@/components/legacy/ProductSwirl";
import { SplitTextBlock } from "@/components/legacy/SplitTextBlock";
import { FullBleedCarousel } from "@/components/legacy/FullBleedCarousel";
import { urlFor } from "@/sanity/lib/image";
import type { LegacyPageDoc } from "@/sanity/types";
import type { SanityImageSource } from "@sanity/image-url";

/*
  The Legacy page body — the doc→section mapping shared by the server
  route and the draft-mode preview shell (LegacyPreview), so editors
  preview through EXACTLY the components visitors get. Every field
  falls back to the built-in design content, so the page renders
  identically when the document (or any field) is absent.
*/

const MANTRA =
  "Every seam, every stitch, every fold of Sun Day Red, is sewn with the meticulousness, care, and unwavering focus that has defined Tiger Woods’ legendary career.";

const MARK_COPY =
  "When you wear these clothes, you wear the confidence to compete. You carry the legacy of a champion. You become part of the SUN DAY RED story.";

/* CDN URL for a Sanity image, or undefined (→ component fallback) */
function img(source: SanityImageSource | undefined, width: number) {
  if (!source) return undefined;
  try {
    return urlFor(source).width(width).url();
  } catch {
    return undefined;
  }
}

export function LegacyBody({ doc }: { doc: LegacyPageDoc | null }) {
  /* partial by design — the carousel merges each field by position
     onto its built-in deck, so one replaced image shows immediately */
  const slides = doc?.slides?.map((s) => ({
    title: s.title || undefined,
    bg: img(s.background, 2000),
    media: img(s.media, 900),
    body: s.body || undefined,
  }));

  return (
    <div className="flex w-full flex-col">
      <LegacyHero
        left={doc?.hero?.wordLeft || undefined}
        right={doc?.hero?.wordRight || undefined}
        image={img(doc?.hero?.image, 2000)}
      />
      <SplitTextBlock
        eyebrow={doc?.mantraTop?.eyebrow || "Our Mantra"}
        text={doc?.mantraTop?.copy || MANTRA}
        cta={doc?.mantraTop?.cta || "Shop Sun Day Red"}
      />
      <FloatingWords
        cards={doc?.gallery?.cards?.map((card) => ({
          src: img(card.image, 1400),
          meta: card.meta,
        }))}
        texts={[
          doc?.gallery?.textLeft || undefined,
          doc?.gallery?.textRight || undefined,
        ]}
      />
      <SplitTextBlock
        mode="light-mid"
        eyebrow={doc?.mantraBottom?.eyebrow || "Our Mantra"}
        text={doc?.mantraBottom?.copy || MANTRA}
        cta={doc?.mantraBottom?.cta || "Shop Sun Day Red"}
      />
      <FullBleedCarousel slides={slides} />
      <SplitTextBlock
        mode="light-mid"
        eyebrow={doc?.mark?.eyebrow || "Our Mark"}
        text={doc?.mark?.copy || MARK_COPY}
        markImage={img(doc?.mark?.image, 1100) ?? "/figma/legacy/mark-emboss.svg"}
      />
      <ProductSwirl
        cta={doc?.swirl?.cta || undefined}
        centerImage={img(doc?.swirl?.centerImage, 900)}
      />
    </div>
  );
}
