"use client";

import { useEffect } from "react";

import { buildTables, read } from "@/components/dev/tokenMatch";

/*
  Headless half of the inspector: mounted on the library's frame route
  when ?audit=1, it hangs window.__sdrAudit() off the page so the
  audit script can sweep every element through the SAME matching
  engine the hover panel uses — one definition of "off-token".

  Only the library's own frame route mounts this, and only with the
  flag, so nothing on the site ever carries it.
*/

export interface AuditFinding {
  selector: string;
  kind: "surface" | "ink" | "type" | "padding" | "gap" | "radius";
  value: string;
}

export interface AuditResult {
  elements: number;
  findings: AuditFinding[];
}

declare global {
  interface Window {
    __sdrAudit?: () => AuditResult;
  }
}

/* a short, human-readable path to the offending element */
function describe(el: Element): string {
  const bits: string[] = [];
  let cur: Element | null = el;
  for (let i = 0; cur && i < 3; i++) {
    const cls = (cur.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(".");
    bits.unshift(cur.tagName.toLowerCase() + (cls ? `.${cls}` : ""));
    cur = cur.parentElement;
  }
  return bits.join(" > ");
}

export function TokenAuditBridge() {
  useEffect(() => {
    window.__sdrAudit = () => {
      const tables = buildTables();
      const findings: AuditFinding[] = [];
      /* skip our own chrome and anything invisible — an off-token
         value nobody can see isn't drift worth reporting */
      const all = [...document.querySelectorAll<HTMLElement>("body *")].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
      });

      for (const el of all) {
        const r = read(el, tables);
        const push = (kind: AuditFinding["kind"], m: { token: string | null; value: string }) => {
          if (m.token === null) findings.push({ selector: describe(el), kind, value: m.value });
        };
        push("surface", r.background);
        push("ink", r.color);
        /* only judge type where there's actual text to style */
        if (el.textContent?.trim() && !el.children.length) push("type", r.type);
        r.padding.forEach((p) => push("padding", p));
        r.gap.forEach((g) => push("gap", g));
        push("radius", r.radius);
      }
      return { elements: all.length, findings };
    };
    return () => {
      delete window.__sdrAudit;
    };
  }, []);

  return null;
}
