"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/* Search is interaction-only chrome: the chunk loads the first time
   someone actually opens it (ssr:false dynamic inside this client
   gate — the LazyCartFlyout pattern). Any part of the site opens it
   by dispatching the "sdr:search" window event. */
const SearchFlyout = dynamic(() => import("@/components/search/SearchFlyout"), {
  ssr: false,
});

export function LazySearchFlyout() {
  const [open, setOpen] = useState(false);
  const [ever, setEver] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      setEver(true);
      setOpen(true);
    };
    window.addEventListener("sdr:search", onOpen);
    return () => window.removeEventListener("sdr:search", onOpen);
  }, []);

  if (!ever) return null;
  return <SearchFlyout open={open} onClose={() => setOpen(false)} />;
}
