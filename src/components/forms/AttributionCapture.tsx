"use client";

import { useEffect } from "react";

import { captureAttribution } from "@/lib/forms/attribution";

/* Records the landing visit's UTM tags + referrer once per session
   (see lib/forms/attribution). Idle-scheduled: it never competes with
   first paint, and it renders nothing. */
export function AttributionCapture() {
  useEffect(() => {
    const run = () => captureAttribution();
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run);
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 1);
    return () => clearTimeout(t);
  }, []);
  return null;
}
