"use client";

import { useEffect } from "react";

import { openGetStarted } from "./LazyGetStarted";

/* opens the sheet on mount and offers a button to reopen it */
export function OpenGetStarted() {
  useEffect(() => {
    const t = setTimeout(openGetStarted, 50);
    return () => clearTimeout(t);
  }, []);
  return (
    <button
      type="button"
      onClick={openGetStarted}
      className="label inline-flex h-14 items-center justify-center bg-btn px-2xl font-medium text-btn-fg transition-opacity hover:opacity-80"
    >
      Start
    </button>
  );
}
