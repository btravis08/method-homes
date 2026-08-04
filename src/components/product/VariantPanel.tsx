"use client";

import { useState } from "react";

import { useCart } from "@/components/cart/CartContext";
import { ChevronDown } from "@/components/icons";
import { SwatchRail } from "@/components/product/SwatchRail";
import type { HeroVariantData } from "@/components/product/ProductHero";

/*
  Tablet/mobile variant selectors inside the description section (the
  comp's 33298:29696 tablet/mobile variants): color chip + swatch
  tiles, the SIZE dropdown chip, and the SELECT SIZE CTA. Size
  selection (and FIND MY SIZE) lives in the quick-add flyout; the marker
  attribute lets the mobile purchase bar minimize while this panel
  is on screen.
*/

export function VariantPanel({
  title,
  price,
  image,
  variants = [],
  sizes = [],
  className = "",
}: {
  title: string;
  price?: string;
  image?: string;
  variants?: HeroVariantData[];
  sizes?: string[];
  className?: string;
}) {
  const { openQuickAdd, quickAddSize } = useCart();
  const [selected, setSelected] = useState(0);
  const active = variants[selected];
  const chip = "bg-wash backdrop-blur-md";
  const open = () => openQuickAdd({ title, price, image, variants, sizes });

  return (
    <div data-variant-panel className={`flex w-full flex-col gap-3 ${className}`}>
      {/* color chip + swatch tiles */}
      <div className="flex items-start gap-1.5">
        <div
          className={`label flex h-[2.875rem] min-w-0 flex-1 items-center rounded-xs px-3 font-medium text-ink md:h-10 ${chip}`}
        >
          <span className="truncate">
            COLOR: {(active?.name ?? "").toUpperCase()}
          </span>
        </div>
        {variants.length > 1 && (
          <SwatchRail variants={variants} selected={selected} onSelect={setSelected} />
        )}
      </div>

      {/* SIZE dropdown chip — selection lives in the quick-add flyout */}
      {sizes.length > 0 && (
        <button
          type="button"
          onClick={open}
          className={`relative flex h-[2.875rem] w-full items-center rounded-xs md:h-10 ${chip}`}
        >
          <span className="label flex flex-1 items-center gap-2 px-3 font-medium text-ink">
            SIZE:
            <span className={quickAddSize ? "" : "text-ink-3"}>
              {quickAddSize ?? "SELECT"}
            </span>
          </span>
          <ChevronDown size={20} className="absolute right-3 text-ink" />
        </button>
      )}

      <button
        type="button"
        onClick={open}
        className="label flex h-[2.875rem] w-full items-center justify-center rounded-xs bg-btn font-medium text-btn-fg md:h-10"
      >
        Select size
      </button>
    </div>
  );
}
