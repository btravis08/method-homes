"use client";

import { useSyncExternalStore } from "react";

/*
  One shared "(hover: none), (pointer: coarse)" subscription for the
  whole app. ProductCard alone used to mount a matchMedia effect per
  card — on the homepage that's ~a hundred listeners doing identical
  work during the hydration burst. Server snapshot is false (hover-
  capable), matching the old per-card initial state.
*/
const QUERY = "(hover: none), (pointer: coarse)";

let mql: MediaQueryList | null = null;
function ensure(): MediaQueryList | null {
  if (!mql && typeof window !== "undefined") mql = window.matchMedia(QUERY);
  return mql;
}

function subscribe(onChange: () => void): () => void {
  const mq = ensure();
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
}

export function useTouch(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ensure()?.matches ?? false,
    () => false,
  );
}
