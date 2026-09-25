"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
  Cloudflare Turnstile, loaded only when NEXT_PUBLIC_TURNSTILE_SITE_KEY
  is set AND the form reaches its last step — visitors who never
  submit never download it. "interaction-only" appearance: most people
  never see a widget; a challenge renders into the container only when
  Cloudflare wants one.
*/

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loading: Promise<void> | null = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const TURNSTILE_ENABLED = Boolean(SITE_KEY);

/* `container` is a callback ref: attach it to the element the widget
   (when Cloudflare wants to show one) renders into */
export function useTurnstile() {
  const [el, container] = useState<HTMLDivElement | null>(null);
  const token = useRef<string | undefined>(undefined);
  const widget = useRef<string | undefined>(undefined);
  const waiters = useRef<((t: string | undefined) => void)[]>([]);

  useEffect(() => {
    if (!SITE_KEY || !el) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widget.current = window.turnstile.render(el, {
          sitekey: SITE_KEY,
          appearance: "interaction-only",
          callback: (t: string) => {
            token.current = t;
            waiters.current.splice(0).forEach((w) => w(t));
          },
          "expired-callback": () => (token.current = undefined),
          "error-callback": () => waiters.current.splice(0).forEach((w) => w(undefined)),
        });
      })
      .catch(() => waiters.current.splice(0).forEach((w) => w(undefined)));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = undefined;
      token.current = undefined;
    };
  }, [el]);

  /* resolves with the current token, waiting up to `ms` for one */
  const getToken = useCallback(async (ms = 8000) => {
    if (!SITE_KEY) return undefined;
    if (token.current) return token.current;
    return new Promise<string | undefined>((resolve) => {
      const t = setTimeout(() => resolve(undefined), ms);
      waiters.current.push((v) => {
        clearTimeout(t);
        resolve(v);
      });
    });
  }, []);

  /* a token is single-use: after a submission attempt, ask for a new one */
  const reset = useCallback(() => {
    token.current = undefined;
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, []);

  return { container, getToken, reset };
}
