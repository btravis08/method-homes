import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { cardImg } from "@/sanity/lib/cards";
import { sanityFetch } from "@/sanity/lib/fetch";
import { productBySlugQuery } from "@/sanity/lib/queries";
import type { ProductFull } from "@/sanity/types";

/*
  Branded share card per product: product shot on the gray canvas,
  Feature Deck title, price, SUN DAY RED wordmark. Served from
  /products/<slug>/opengraph-image — Next wires the og:image meta
  automatically. Satori can't read woff2, so the OG-only woff cuts
  live in src/fonts/og (never preloaded by pages).
*/

export const alt = "Sun Day Red";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [product, feature, maison] = await Promise.all([
    sanityFetch<ProductFull | null>(productBySlugQuery, { slug }, null),
    readFile(join(process.cwd(), "src/fonts/og/FeatureDeck-Regular-Trial.woff")),
    readFile(join(process.cwd(), "src/fonts/og/MaisonNeue-Medium.woff")),
  ]);

  const title = product?.title ?? "Sun Day Red";
  const price = product?.pricing?.price
    ? `$${product.pricing.price}`
    : undefined;
  const image = cardImg(product?.thumb, 800);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#e5e5e2",
          color: "#161716",
          fontFamily: "Maison",
        }}
      >
        {/* product shot */}
        <div
          style={{
            width: 560,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              src={image}
              width={460}
              height={460}
              style={{ objectFit: "contain" }}
            />
          ) : (
            <div style={{ display: "flex" }} />
          )}
        </div>
        {/* copy column */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            paddingRight: 72,
            gap: 18,
          }}
        >
          <div style={{ fontSize: 22, letterSpacing: 4, opacity: 0.65 }}>
            SUN DAY RED
          </div>
          <div
            style={{
              fontFamily: "FeatureDeck",
              fontSize: 68,
              lineHeight: 1.05,
            }}
          >
            {title}
          </div>
          {price ? (
            <div style={{ fontSize: 30, opacity: 0.8 }}>{price}</div>
          ) : null}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "FeatureDeck", data: feature, style: "normal", weight: 400 },
        { name: "Maison", data: maison, style: "normal", weight: 500 },
      ],
    },
  );
}
