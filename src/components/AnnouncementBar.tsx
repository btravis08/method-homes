"use client";

import { useState } from "react";

/*
  CMS announcement bar (siteSettings.announcement): fixed above the
  navigation, which offsets itself by --announce-h while the bar is
  live. Rendered SSR so it's visible from first paint with zero
  layout shift; an inline script right after the element hides it
  pre-paint for visitors who already dismissed this exact text (a new
  announcement reappears for everyone).
*/

export interface AnnouncementData {
  text: string;
  url?: string;
  colorMode?: "light" | "dark";
  dismissible?: boolean;
}

const STORAGE_KEY = "sdr-announcement-dismissed";

export function AnnouncementBar({ announcement }: { announcement: AnnouncementData }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, announcement.text);
    } catch {
      /* private mode — dismissal just won't persist */
    }
    document.documentElement.style.setProperty("--announce-h", "0px");
    setDismissed(true);
  };

  const inner = (
    <span className="label truncate font-medium">{announcement.text}</span>
  );

  return (
    <>
      <div
        id="announcement-bar"
        suppressHydrationWarning
        data-mode={announcement.colorMode ?? "dark"}
        className="fixed inset-x-0 top-0 z-[55] flex h-10 items-center justify-center gap-3 border-b border-line bg-surface px-12 text-ink"
      >
        {announcement.url ? (
          <a href={announcement.url} className="flex min-w-0 items-center underline-offset-4 hover:underline">
            {inner}
          </a>
        ) : (
          inner
        )}
        {announcement.dismissible !== false && (
          <button
            type="button"
            aria-label="Dismiss announcement"
            onClick={dismiss}
            className="label absolute right-4 top-1/2 -translate-y-1/2 font-medium text-ink-2 transition-colors hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})===${JSON.stringify(
            announcement.text,
          )}){var e=document.getElementById("announcement-bar");if(e)e.style.display="none";document.documentElement.style.setProperty("--announce-h","0px")}}catch(e){}`,
        }}
      />
    </>
  );
}
