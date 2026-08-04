"use client";

import { useRouter } from "next/navigation";
import { VisualEditing } from "next-sanity/visual-editing";
import { useCallback } from "react";
import type { ComponentProps } from "react";

type RefreshHandler = NonNullable<ComponentProps<typeof VisualEditing>["refresh"]>;

/*
  next-sanity's default refresh handler IGNORES mutation events on
  purpose (it logs a console.debug and returns false), so draft edits
  in the Presentation tool never re-rendered the page — only the
  manual refresh button did. This wrapper supplies the handler the
  library asks for: re-render the RSC tree on every mutation, and
  resolve after a beat so Presentation's spinner reflects the refresh
  window. Draft-mode fetches are uncached (revalidate 0), so each
  refresh pulls the latest draft.
*/
export function LiveVisualEditing() {
  const router = useRouter();
  const refresh: RefreshHandler = useCallback(
    (payload) => {
      if (payload.source === "mutation" || payload.source === "manual") {
        router.refresh();
      }
      /* short settle: Presentation queues the next refresh behind
         this promise, so a long window makes consecutive edits chain
         slowly — 300ms keeps rapid typing snappy */
      return new Promise((resolve) => setTimeout(resolve, 300));
    },
    [router],
  );
  return <VisualEditing refresh={refresh} />;
}
