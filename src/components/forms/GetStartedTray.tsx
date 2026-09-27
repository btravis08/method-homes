"use client";

import { useEffect, useRef } from "react";

import { IntakeForm } from "./IntakeForm";

/*
  The Get Started sheet (Figma: Intake/Tray). On phones a bottom tray
  that leaves a 64px sliver of the page visible above it, with a handle
  and rounded top corners; from md up a full-screen surface. The form
  engine inside supplies the header, progress, scrolling content and
  the footer pinned to the bottom edge. This component owns the scrim,
  the fixed positioning, the dialog semantics, Escape, and the page
  scroll lock. Mounted only through LazyGetStarted so none of it ships
  until someone opens it.
*/
export default function GetStartedTray({ open, onClose, persist = true }: { open: boolean; onClose: () => void; persist?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => panel.current?.focus({ preventScroll: true }), 50);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" data-mode="light">
      {/* scrim over the page; tapping it closes */}
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50" />
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
        <IntakeForm onClose={onClose} persist={persist} className="min-h-0 flex-1" />
      </div>
    </div>
  );
}
