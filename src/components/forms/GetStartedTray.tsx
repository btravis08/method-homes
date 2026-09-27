"use client";

import { useCallback, useEffect, useRef } from "react";

import { IntakeForm } from "./IntakeForm";

/*
  The Get Started sheet (Figma: Intake/Tray). On phones a bottom tray
  that leaves a 64px sliver of the page visible above it, with a handle
  and rounded top corners; from md up a full-screen surface. The form
  engine inside supplies the header, progress, scrolling content and
  the footer pinned to the bottom edge. This component owns the scrim,
  the fixed positioning, the dialog semantics, Escape, the page scroll
  lock and the history entry that makes the device Back button step
  back inside the sheet rather than leave the page. Mounted only
  through LazyGetStarted so none of it ships until someone opens it.

  History: opening pushes one entry ({ mhSheet, mhSheetDepth: 0 }); the
  engine pushes one per forward step. Back pops a step; backing past the
  first step pops the sheet entry and this closes. Closing from the X,
  the scrim, Escape or Done unwinds those entries with history.go(), so
  a later Back leaves the page as the visitor expects.
*/
export default function GetStartedTray({
  open,
  onClose,
  persist = true,
}: {
  open: boolean;
  /* omitted in the section library, which renders the sheet from a
     server component and can't pass a function; there it just stays open */
  onClose?: () => void;
  persist?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const historyNav = Boolean(onClose);
  const closing = useRef(false);

  /* close = unwind our history entries; the resulting popstate (a
     state without mhSheet) is what actually calls onClose */
  const requestClose = useCallback(() => {
    if (!onClose) return;
    if (closing.current) return;
    const s = window.history.state as { mhSheet?: boolean; mhSheetDepth?: number } | null;
    if (historyNav && s?.mhSheet) {
      closing.current = true;
      window.history.go(-((s.mhSheetDepth ?? 0) + 1));
      /* if the browser doesn't deliver popstate (rare), don't stay stuck */
      setTimeout(() => {
        if (closing.current) {
          closing.current = false;
          onClose();
        }
      }, 400);
      return;
    }
    onClose();
  }, [onClose, historyNav]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (historyNav) {
      try {
        const s = (window.history.state ?? {}) as { mhSheet?: boolean; mhStep?: string };
        /* a reload keeps the entry's state: reuse a stale sheet entry
           instead of stacking a second one Back would have to cross */
        const base = { ...s, mhSheet: true, mhSheetDepth: 0, mhStep: undefined };
        if (s.mhSheet) window.history.replaceState(base, "", window.location.href);
        else window.history.pushState(base, "", window.location.href);
      } catch {
        /* ignore */
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    const onPop = (e: PopStateEvent) => {
      const s = e.state as { mhSheet?: boolean } | null;
      if (s?.mhSheet) return; // still inside the sheet — the engine handles the step
      closing.current = false;
      onClose?.();
    };
    window.addEventListener("keydown", onKey);
    if (historyNav) window.addEventListener("popstate", onPop);
    const t = setTimeout(() => panel.current?.focus({ preventScroll: true }), 50);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      clearTimeout(t);
    };
  }, [open, onClose, historyNav, requestClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] intake-sheet" data-mode="light">
      {/* scrim over the page; tapping it closes */}
      {onClose ? (
        <button type="button" aria-label="Close" onClick={requestClose} className="absolute inset-0 bg-black/50" />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-black/50" />
      )}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Get started"
        tabIndex={-1}
        /* bottom-0 of a fixed parent tracks the visual viewport on iOS
           (toolbars collapsing and all); the safe-area inset keeps the
           footer above the home indicator */
        className="absolute inset-x-0 bottom-0 top-16 flex flex-col overflow-hidden rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] outline-none md:top-0 md:rounded-none"
      >
        {/* handle (phones) */}
        <div className="flex h-3 shrink-0 items-center justify-center md:hidden" aria-hidden="true">
          <span className="h-1 w-12 rounded-full bg-line" />
        </div>
        <IntakeForm onClose={onClose ? requestClose : undefined} historyNav={historyNav} persist={persist} className="min-h-0 flex-1" />
      </div>
    </div>
  );
}
