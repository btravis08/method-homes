import { preload } from "react-dom";

import { Carousel, FiftyFifty, ProductSlider } from "@/components/home/sections";
import type { ProductCardData } from "@/components/home/ProductCard";
import { ArticleTop } from "@/components/journal/ArticleTop";
import {
  ARTICLE_BODY,
  ARTICLE_LEAD,
  type JournalArticle,
  type JournalCategory,
} from "@/components/journal/articles";

/*
  Honors Journal article: fullscreen dark hero with the breadcrumb +
  title over its lower edge (one design for every entry path — see
  ArticleTop), then text blocks interleaved with the site's existing
  50/50, carousel, and product slider sections, all in dark mode.
*/

/* centered 800px reading column: serif lead + body copy */
function TextBlock({ lead, body }: { lead?: string; body: string[] }) {
  return (
    <div className="flex w-full items-center justify-center px-6 py-20 md:py-32">
      <div className="flex w-full max-w-[50rem] flex-col gap-10 md:gap-[3.75rem]">
        {lead && (
          <p className="font-display text-title-lg text-ink">{lead}</p>
        )}
        <div className="flex flex-col gap-4 text-body-md text-ink">
          {body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ArticleView({
  article,
  category,
  sliderProducts,
}: {
  article: JournalArticle;
  category: JournalCategory;
  sliderProducts?: ProductCardData[];
}) {
  /* the normal hero is the page's LCP: preloaded, eager, never faded */
  preload(article.hero, { as: "image", fetchPriority: "high" });
  /* dark throughout — articles continue the journal field's dark
     ground so the tile-expand illusion never breaks below the hero */
  return (
    <div data-mode="dark" className="bg-[#0b0b0b] text-ink">
      <ArticleTop
        slug={article.slug}
        title={article.title}
        categoryTitle={category.title}
        heroSrc={article.hero}
      >
        <TextBlock lead={ARTICLE_LEAD} body={[ARTICLE_BODY[0]]} />
        <FiftyFifty
          mode="dark"
          ratio="5:4"
          panels={article.pair.map((image) => ({ image }))}
        />
        <TextBlock lead={ARTICLE_LEAD} body={[ARTICLE_BODY[1]]} />
        <Carousel
          mode="dark"
          eyebrow="Shop the Story"
          items={article.carousel.map((item) => ({
            ...item,
            description: ARTICLE_BODY[1].slice(0, 170),
          }))}
        />
        <TextBlock lead={ARTICLE_LEAD} body={ARTICLE_BODY} />
        <ProductSlider mode="dark" title="New Arrivals" products={sliderProducts} />
      </ArticleTop>
    </div>
  );
}
