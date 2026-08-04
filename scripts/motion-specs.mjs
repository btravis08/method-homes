/**
 * Motion specs — replayable assertions for the choreography a still
 * screenshot can't judge. Each spec drives the section's bare frame
 * route in a real browser and measures computed values, exactly the
 * checks used to verify these animations when they were built. The
 * audit runs them and records pass/fail per section; a TIMED section
 * with passing motion specs is verified, not just exempted.
 *
 * Contract: run(page, origin, slug) resolves on pass, throws with a
 * useful message on fail. Each spec gets a fresh 1440×900 page.
 */

const wheel = async (page, steps, dy = 400, settle = 60) => {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(settle);
  }
};

export const MOTION_SPECS = {
  "legacy-hero": [
    {
      name: "intro resolves to full bleed with words pinned and inverted",
      async run(page) {
        /* enter 2.1s + hold 1s + split 2s + margin */
        await page.waitForTimeout(6500);
        const r = await page.evaluate(() => {
          const words = [...document.querySelectorAll("p")].filter((p) =>
            ["A New", "Legacy"].includes(p.textContent.trim()),
          );
          const img = document.querySelector('img[alt="Sun Day Red campaign"]');
          const film = img?.closest("div")?.getBoundingClientRect();
          return {
            count: words.length,
            left: Math.round(words[0]?.getBoundingClientRect().left ?? -1),
            right: Math.round(words[1]?.getBoundingClientRect().right ?? -1),
            colors: words.map((w) => getComputedStyle(w).color),
            filmW: Math.round(film?.width ?? 0),
            vw: window.innerWidth,
          };
        });
        if (r.count !== 2) throw new Error(`expected 2 words, saw ${r.count}`);
        if (r.filmW < r.vw - 4) throw new Error(`film ${r.filmW}px, viewport ${r.vw}px`);
        if (r.left > 40) throw new Error(`left word at ${r.left}px, expected pinned near edge`);
        if (r.right < r.vw - 40) throw new Error(`right word ends at ${r.right}px`);
        if (!r.colors.every((c) => c === "rgb(255, 255, 255)"))
          throw new Error(`words not inverted: ${r.colors.join(" / ")}`);
      },
    },
  ],

  "split-text": [
    {
      name: "words resolve blur-to-sharp in a ~2s staggered pass",
      async run(page) {
        /* In the isolated frame the paragraph loads in-view, so the
           reveal fires immediately — time the pass from first
           movement to full resolution. (The below-fold trigger point
           is exercised on the real /legacy page, not here.) */
        const opacities = () =>
          page.evaluate(() => {
            const p = [...document.querySelectorAll("p")].find((el) =>
              el.textContent.replace(/\u00a0/g, " ").startsWith("Every seam"),
            );
            if (!p) return null;
            return [...p.querySelectorAll("span")].map((s) =>
              parseFloat(getComputedStyle(s).opacity),
            );
          });
        const t0 = Date.now();
        let firstMove = null;
        let sawStagger = false;
        for (;;) {
          const ops = await opacities();
          if (!ops) throw new Error("mantra paragraph not found");
          const moving = ops.filter((o) => o > 0.05 && o < 0.95).length;
          if (firstMove === null && ops.some((o) => o > 0.05)) firstMove = Date.now();
          if (moving >= 3) sawStagger = true;
          if (ops.every((o) => o > 0.99)) break;
          if (Date.now() - t0 > 8000) throw new Error("reveal never completed");
          await page.waitForTimeout(100);
        }
        if (firstMove === null) throw new Error("reveal never started");
        const took = (Date.now() - firstMove) / 1000;
        if (took > 3.2) throw new Error(`reveal took ${took.toFixed(1)}s (spec ~2s)`);
        if (!sawStagger)
          throw new Error("words snapped in together — no overlapping stagger observed");
      },
    },
  ],

  "floating-gallery": [
    {
      name: "track scrubs linearly and seats the opening at pin",
      async run(page) {
        await page.waitForTimeout(1500);
        const sample = () =>
          page.evaluate(() => {
            const wrap = document.querySelector('div[class*="h-\\[550vh\\]"]');
            const track = wrap?.querySelector('div[style*="will-change"]');
            if (!wrap || !track) return null;
            const m = new DOMMatrix(getComputedStyle(track).transform);
            return { top: wrap.getBoundingClientRect().top, x: m.e };
          });
        const points = [];
        for (let i = 0; i < 14; i++) {
          await page.mouse.wheel(0, 300);
          await page.waitForTimeout(90);
          const s = await sample();
          if (s) points.push(s);
        }
        const moving = points.filter((p, i) => i && Math.abs(p.x - points[i - 1].x) > 1);
        if (moving.length < 4) throw new Error("track is not scrubbing with scroll");
        /* linear fit x = a·top + b; at top=0 the track must be seated */
        const n = points.length;
        const mt = points.reduce((s, p) => s + p.top, 0) / n;
        const mx = points.reduce((s, p) => s + p.x, 0) / n;
        const a =
          points.reduce((s, p) => s + (p.top - mt) * (p.x - mx), 0) /
          points.reduce((s, p) => s + (p.top - mt) ** 2, 0);
        const seatAtPin = mx - a * mt;
        if (Math.abs(seatAtPin) > 40)
          throw new Error(`track at ${seatAtPin.toFixed(0)}px when pinned (spec 0)`);
      },
    },
  ],

  "full-bleed-carousel": [
    {
      name: "autoplays to the next slide after the dwell",
      async run(page) {
        await page.waitForTimeout(1200);
        const counter = () =>
          page.evaluate(
            () =>
              [...document.querySelectorAll("span")]
                .map((s) => s.textContent.trim())
                .find((t) => /^0\d$/.test(t)) ?? null,
          );
        const first = await counter();
        if (first !== "01") throw new Error(`expected slide 01, saw ${first}`);
        /* dwell 6s + transition 2s + margin */
        await page.waitForTimeout(9500);
        const second = await counter();
        if (second === "01") throw new Error("carousel did not advance after the dwell");
      },
    },
  ],
};
