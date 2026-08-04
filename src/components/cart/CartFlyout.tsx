"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";

import { MEDIA_EASE } from "@/components/home/AnimatedMedia";
import { Close, Minus, Plus, Ruler } from "@/components/icons";
import { useMdUp } from "@/components/useMdUp";
import {
  formatPrice,
  parsePrice,
  useCart,
} from "@/components/cart/CartContext";

/*
  The Flexible Modal flyout (library nodes: Quick Add 33457:87288,
  Cart 33453:62713, Empty 33209:12069): a 500px right panel over a
  blurred dark scrim (rgba(29,29,29,.5) + 12px blur, like the nav's
  transparency). Quick Add selects color/fit/size and adds to the
  bag; the bag lists items with qty controls, the free-shipping
  meter, "customers also bought", and the checkout footer; clearing
  every item lands on the empty state. Same panel on all devices
  (full-width on mobile).
*/

const FREE_SHIPPING_THRESHOLD = 250;

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex w-full shrink-0 items-center justify-between p-4 md:p-6">
      <p className="font-display text-title-xs capitalize text-ink">{title}</p>
      <button type="button" aria-label="Close" onClick={onClose} className="text-ink">
        <Close size={16} />
      </button>
    </div>
  );
}

function QuickAddView() {
  const { quickAdd, addItem, openCart, quickAddSize: size, setQuickAddSize: setSize } =
    useCart();
  const [variantIdx, setVariantIdx] = useState(0);
  const [fit, setFit] = useState("Normal");

  if (!quickAdd) return null;
  const variants = quickAdd.variants ?? [];
  const active = variants[variantIdx];
  const sizes = quickAdd.sizes ?? [];
  const ready = sizes.length === 0 || size !== null;

  const add = () => {
    if (!ready) return;
    addItem({
      title: quickAdd.title,
      price: parsePrice(quickAdd.price),
      image: active?.image ?? quickAdd.image,
      color: active?.name,
      size: size ?? undefined,
    });
    openCart();
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* colorway */}
        {variants.length > 0 && (
          <div className="flex flex-col gap-[1.375rem] border-t border-line p-4 md:p-6">
            <p className="flex items-baseline gap-2.5 font-mono text-[0.875rem] uppercase leading-snug text-ink">
              Color
              <span className="text-ink-2">{active?.name}</span>
            </p>
            <div className="flex gap-px">
              {variants.map((variant, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={variant.name ?? `Colorway ${i + 1}`}
                  onClick={() => setVariantIdx(i)}
                  className="relative h-24 w-[4.7rem] shrink-0 bg-surface-2"
                >
                  {variant.image && (
                    <span
                      aria-hidden
                      className="absolute inset-[4%] bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url(${variant.image})` }}
                    />
                  )}
                  {i === variantIdx && (
                    <>
                      <span aria-hidden className="absolute inset-0 bg-black/10" />
                      <span
                        aria-hidden
                        className="absolute left-1.5 top-1.5 size-2.5 rounded-full bg-ink"
                      />
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* fit toggle */}
        <div className="flex flex-col gap-6 border-t border-line p-4 md:p-6">
          <p className="text-body-md font-medium text-ink">Fit</p>
          {/* segmented toggle: the selected segment is the primary
              button style (black fill, inverted text) on the gray
              track */}
          <div className="flex w-full items-center bg-surface-2 p-1.5">
            {["Normal", "Wide"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFit(option)}
                className={`label flex h-9 flex-1 items-center justify-center px-3 font-medium transition-colors ${
                  fit === option ? "bg-btn text-btn-fg" : "text-ink"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* size grid */}
        {sizes.length > 0 && (
          <div className="flex flex-col gap-6 border-t border-line p-4 pb-8 md:p-6 md:pb-8">
            <p className="text-body-md font-medium text-ink">Size</p>
            <div className="grid grid-cols-6 gap-2">
              {sizes.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSize(option)}
                  className={`flex items-center justify-center py-4 font-mono text-[0.875rem] uppercase leading-none transition-colors ${
                    size === option
                      ? "bg-btn text-btn-fg"
                      : "bg-surface-2 text-ink hover:bg-[#cacbc8]"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="flex w-full items-center justify-center py-1.5">
              <a
                href="#"
                className="label flex items-center gap-1.5 font-medium text-ink transition-opacity hover:opacity-70"
              >
                Find my size
                <Ruler size={10} />
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 bg-surface p-4 md:p-6">
        <button
          type="button"
          onClick={add}
          className={`label flex h-[2.875rem] w-full items-center justify-center rounded-xs bg-btn font-medium text-btn-fg transition-opacity md:h-10 ${
            ready ? "" : "cursor-not-allowed opacity-40"
          }`}
        >
          Add to cart
        </button>
      </div>
    </>
  );
}

function CartView() {
  const {
    items,
    subtotal,
    recommended,
    setQty,
    removeItem,
    addItem,
  } = useCart();

  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const inCart = new Set(items.map((item) => item.title));
  const suggestions = recommended
    .filter((item) => !inCart.has(item.title))
    .slice(0, 3);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* free shipping meter */}
        <div className="flex flex-col gap-8 p-4 md:p-6">
          <p className="w-full text-center text-body-md font-medium text-ink">
            {remaining > 0
              ? `You’re ${formatPrice(remaining)} away from free shipping`
              : "You’ve unlocked free shipping"}
          </p>
          <div className="h-[5px] w-full bg-surface-2">
            <m.div
              className="h-full bg-ink"
              initial={false}
              animate={{
                width: `${Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100)}%`,
              }}
              transition={{ duration: 0.6, ease: [...MEDIA_EASE] }}
            />
          </div>
        </div>

        {/* items */}
        {items.map((item) => (
          <div key={item.id} className="border-b border-line p-4 md:p-6">
            <div className="flex w-full items-center gap-6">
              <div
                className="size-[5.25rem] shrink-0 bg-surface-2 bg-contain bg-center bg-no-repeat"
                style={item.image ? { backgroundImage: `url(${item.image})` } : undefined}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-[1.125rem]">
                <div className="label flex w-full items-start justify-between font-medium text-ink">
                  <p className="truncate">
                    {item.title.toUpperCase()}
                    {item.size ? ` — ${item.size}` : ""}
                  </p>
                  <p>{formatPrice(item.price * item.qty)}</p>
                </div>
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-3 text-ink">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => setQty(item.id, item.qty - 1)}
                    >
                      <Minus size={12} />
                    </button>
                    <p className="label w-3 text-center font-medium">{item.qty}</p>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQty(item.id, item.qty + 1)}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="label font-medium text-ink transition-opacity hover:opacity-70"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* recommendations */}
        {suggestions.length > 0 && (
          <>
            <div className="flex items-center justify-center p-4 md:p-6">
              <p className="text-body-md font-medium text-ink">Customers also bought</p>
            </div>
            {suggestions.map((item, i) => (
              <div key={`${item.title}-${i}`} className="p-4 pt-0 md:p-6 md:pt-0">
                <div className="flex w-full items-center gap-6">
                  <div
                    className="size-[5.25rem] shrink-0 bg-surface-2 bg-contain bg-center bg-no-repeat"
                    style={
                      item.image ? { backgroundImage: `url(${item.image})` } : undefined
                    }
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-[1.125rem]">
                    <div className="label flex w-full items-start justify-between font-medium text-ink">
                      <p className="truncate">{item.title.toUpperCase()}</p>
                      <p>{formatPrice(parsePrice(item.price))}</p>
                    </div>
                    <div className="flex w-full items-center justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          addItem({
                            title: item.title,
                            price: parsePrice(item.price),
                            image: item.image,
                            color: item.color,
                          })
                        }
                        className="label flex items-center gap-1.5 font-medium text-ink transition-opacity hover:opacity-70"
                      >
                        <Plus size={10} />
                        Add to bag
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* checkout footer */}
      <div className="flex shrink-0 flex-col gap-8 bg-surface p-4 md:p-6">
        <div className="flex w-full items-start justify-between text-body-md text-ink">
          <p className="font-medium">Subtotal</p>
          <p>{formatPrice(subtotal)}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="label flex h-[2.875rem] w-full items-center justify-center rounded-xs bg-btn font-medium text-btn-fg md:h-10"
          >
            Checkout
          </button>
          <p className="w-full text-center font-mono text-label-sm uppercase leading-none text-ink">
            Taxes and shipping calculated at checkout
          </p>
        </div>
      </div>
    </>
  );
}

function EmptyView() {
  const { close } = useCart();
  return (
    <>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4 md:p-6">
        <p className="font-display text-title-md text-ink">
          You have no items in your bag
        </p>
      </div>
      <div className="shrink-0 bg-surface p-4 md:p-6">
        <a
          href="#"
          onClick={close}
          className="label flex h-[2.875rem] w-full items-center justify-center rounded-xs bg-btn font-medium text-btn-fg md:h-10"
        >
          Shop all
        </a>
      </div>
    </>
  );
}

export function CartFlyout() {
  const { isOpen, view, items, quickAdd, close } = useCart();
  const mdUp = useMdUp();

  /* scroll lock + escape while open */
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, close]);

  const showQuickAdd = view === "quickAdd" && quickAdd !== null;
  const title = showQuickAdd ? "Select Size" : "Your Bag";
  const body = showQuickAdd ? (
    <QuickAddView key={`qa-${quickAdd?.title}`} />
  ) : items.length > 0 ? (
    <CartView key="cart" />
  ) : (
    <EmptyView key="empty" />
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <m.button
            key="cart-scrim"
            type="button"
            aria-label="Close cart"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [...MEDIA_EASE] }}
            data-nav-overlay
            className="fixed inset-0 z-[80] cursor-default bg-[rgba(29,29,29,0.5)] backdrop-blur-md"
          />
          <m.aside
            key="cart-panel"
            data-mode="light"
            data-nav-overlay
            role="dialog"
            aria-label={title}
            /* mobile: rises from the bottom; md+: slides from the right */
            initial={mdUp ? { x: "100%" } : { y: "100%" }}
            animate={{ x: "0%", y: "0%" }}
            exit={mdUp ? { x: "100%" } : { y: "100%" }}
            transition={{ duration: 0.6, ease: [...MEDIA_EASE] }}
            className="fixed inset-y-0 right-0 z-[90] flex w-[31.25rem] max-w-full flex-col bg-surface text-ink"
          >
            <PanelHeader title={title} onClose={close} />
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={showQuickAdd ? "view-quickadd" : items.length > 0 ? "view-cart" : "view-empty"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [...MEDIA_EASE] }}
                className="flex min-h-0 flex-1 flex-col"
              >
                {body}
              </m.div>
            </AnimatePresence>
          </m.aside>
        </>
      )}
    </AnimatePresence>
  );
}
