"use client";

import { useState } from "react";

import { LazyGetStartedTray } from "./LazyForms";

/*
  The section library's Get Started entry. The registry is server code
  and cannot hand the sheet a close handler, so this small client
  wrapper owns the open state — which is what gives the preview the
  header X, the Done button and the device-Back history mirroring the
  live sheet has (all three switch on `onClose`). Closing leaves a
  Start button to reopen it, like /get-started.
*/
export function IntakePreview() {
  const [open, setOpen] = useState(true);
  return (
    <div className="relative flex h-svh w-full items-center justify-center bg-surface-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="label inline-flex h-14 items-center justify-center rounded-md bg-btn px-2xl font-medium text-btn-fg transition-opacity hover:opacity-80"
        >
          Start
        </button>
      ) : null}
      <LazyGetStartedTray open={open} onClose={() => setOpen(false)} persist={false} />
    </div>
  );
}
