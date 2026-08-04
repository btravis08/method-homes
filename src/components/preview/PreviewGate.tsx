"use client";

import dynamic from "next/dynamic";

import type { ProductCardData } from "@/components/home/ProductCard";
import type {
  Discount,
  LegacyPageDoc,
  Page,
  ProductFull,
  SliderProduct,
  StoreSettings,
} from "@/sanity/types";

/*
  Tiny client gate between server routes and the draft-mode preview
  shells. Next preloads every statically-analyzable client reference
  of a page — even conditionally rendered ones — so importing a shell
  from a server page ships the loader library to every visitor
  (verified by fingerprinting the non-draft waterfall). An ssr:false
  dynamic inside a client component is the one form that is NOT
  preloaded: shell chunks download only when the gate actually
  renders, which only happens in draft mode. Same pattern as
  LazyCartFlyout. Each shell is its own lazy chunk — only the kind
  being rendered loads.
*/
const PagePreview = dynamic(
  () => import("@/components/preview/PagePreview").then((m) => m.PagePreview),
  { ssr: false },
);
const ProductPreview = dynamic(
  () => import("@/components/preview/ProductPreview").then((m) => m.ProductPreview),
  { ssr: false },
);
const LegacyPreview = dynamic(
  () => import("@/components/preview/LegacyPreview").then((m) => m.LegacyPreview),
  { ssr: false },
);

export type PreviewGateProps =
  | {
      kind: "page";
      slug: string;
      initial: Page;
      sliderCards: Record<string, ProductCardData[]>;
    }
  | {
      kind: "product";
      slug: string;
      initial: ProductFull | null;
      settings: StoreSettings | null;
      discounts: Discount[];
      related: SliderProduct[];
      homeHeroImage?: string;
      sliderCards: Record<string, ProductCardData[]>;
    }
  | {
      kind: "legacy";
      initial: LegacyPageDoc | null;
    };

export function PreviewGate(props: PreviewGateProps) {
  if (props.kind === "product") {
    const { kind: _kind, ...rest } = props;
    return <ProductPreview {...rest} />;
  }
  if (props.kind === "legacy") {
    return <LegacyPreview initial={props.initial} />;
  }
  const { kind: _kind, ...rest } = props;
  return <PagePreview {...rest} />;
}
