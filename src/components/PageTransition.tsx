"use client";

import { useLenis } from "lenis/react";
import { AnimatePresence, m } from "motion/react";
import { usePathname } from "next/navigation";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useContext, useEffect, useRef } from "react";

import { MEDIA_EASE } from "@/components/home/AnimatedMedia";

/*
  Route-change fade, strictly sequential: the old page eases fully
  out, then the new page eases in, while the fixed chrome (nav,
  mobile bar, footer) stays mounted and untouched. Animated with
  Motion on the real DOM — compositor-driven opacity, smooth on
  mobile Safari where the View Transitions API stutters.

  The exiting subtree is wrapped in a frozen LayoutRouterContext so
  it keeps rendering the OLD route while AnimatePresence fades it
  out — without this, the outgoing clone would re-render as the new
  page mid-exit.

  Links pass scroll={false} (see SmartLink); the scroll reset to the
  top happens here between the fades, while nothing is visible.
*/

function FrozenRouter({ children }: { children: React.ReactNode }) {
  const context = useContext(LayoutRouterContext);
  const frozen = useRef(context).current;
  return (
    <LayoutRouterContext.Provider value={frozen}>{children}</LayoutRouterContext.Provider>
  );
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  /* the reset must go through Lenis: it tracks its own scroll
     position and overrides a plain window.scrollTo on the next
     frame, which left new pages opened at the old scroll depth */
  const lenis = useLenis();
  /* browser back/forward restores its own scroll position — only
     fresh link navigations reset to the top */
  const isPop = useRef(false);
  useEffect(() => {
    const onPop = () => {
      isPop.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <AnimatePresence
      mode="wait"
      initial={false}
      onExitComplete={() => {
        if (!isPop.current) {
          if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
          else window.scrollTo({ top: 0, behavior: "instant" });
        }
        isPop.current = false;
      }}
    >
      <m.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{
          opacity: 1,
          transition: { duration: 0.42, ease: [...MEDIA_EASE] },
        }}
        exit={{ opacity: 0, transition: { duration: 0.28, ease: [...MEDIA_EASE] } }}
      >
        <FrozenRouter>{children}</FrozenRouter>
      </m.div>
    </AnimatePresence>
  );
}
