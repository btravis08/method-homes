"use client";

import dynamic from "next/dynamic";

/* The cart flyout is interaction-only chrome — defer its chunk out of
   the initial bundle on every route. (Client wrapper because
   ssr: false dynamic imports aren't allowed in Server Components.) */
export const LazyCartFlyout = dynamic(
  () => import("@/components/cart/CartFlyout").then((m) => m.CartFlyout),
  { ssr: false },
);
