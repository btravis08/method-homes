"use client";

import { createContext, useContext, useEffect, useState } from "react";

/*
  Per-page toggle for the footer's "Earned Never Given" tagline art.
  The footer renders in the layout, so pages can't prop-drill into it;
  instead a page that wants the tagline mounts <FooterTagline show />
  (driven by its CMS document) and the footer reads the context.
  Default is off.
*/

const FooterTaglineContext = createContext<{
  show: boolean;
  setShow: (value: boolean) => void;
}>({ show: false, setShow: () => {} });

export function FooterTaglineProvider({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <FooterTaglineContext.Provider value={{ show, setShow }}>
      {children}
    </FooterTaglineContext.Provider>
  );
}

export function useFooterTagline() {
  return useContext(FooterTaglineContext).show;
}

/* Mounted by a page to turn the tagline on; resets on navigation */
export function FooterTagline({ show = true }: { show?: boolean }) {
  const { setShow } = useContext(FooterTaglineContext);
  useEffect(() => {
    setShow(show);
    return () => setShow(false);
  }, [show, setShow]);
  return null;
}
