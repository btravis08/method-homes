"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { hasResumeParam } from "@/lib/forms/client";

/*
  Client gate for the Get Started sheet (the LazySearchFlyout pattern):
  the tray + engine chunk loads the first time it opens. It opens from
  - a "mh:get-started" window event (openGetStarted()),
  - a click on any link to /get-started or an element with
    data-get-started (progressive enhancement: the link still works
    as a page without JS),
  - a #get-started hash or a ?resume= finish-later link on load.
*/
const GetStartedTray = dynamic(() => import("./GetStartedTray"), { ssr: false });

export const GET_STARTED_EVENT = "mh:get-started";

export function openGetStarted() {
  window.dispatchEvent(new CustomEvent(GET_STARTED_EVENT));
}

export function LazyGetStarted() {
  const [open, setOpen] = useState(false);
  const [ever, setEver] = useState(false);

  const show = useCallback(() => {
    setEver(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onEvent = () => show();
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = (e.target as Element | null)?.closest("a[href], [data-get-started]");
      if (!target) return;
      const href = target.getAttribute("href") ?? "";
      if (target.hasAttribute("data-get-started") || /^\/get-started\/?(?:[?#]|$)/.test(href)) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener(GET_STARTED_EVENT, onEvent);
    /* capture phase: a next/link to /get-started must not ALSO start a
       route change — its handler bails on a default-prevented event —
       or the router's own history entry lands between the sheet's and
       the device Back button pops out of the form */
    document.addEventListener("click", onClick, true);
    /* deep links open after hydration settles (a tick later, not inside
       the effect body) */
    const t = window.location.hash === "#get-started" || hasResumeParam() ? setTimeout(show, 0) : undefined;
    return () => {
      window.removeEventListener(GET_STARTED_EVENT, onEvent);
      document.removeEventListener("click", onClick, true);
      clearTimeout(t);
    };
  }, [show]);

  if (!ever) return null;
  return <GetStartedTray open={open} onClose={() => setOpen(false)} />;
}
