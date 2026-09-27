/*
  Device-Back check for the Get Started sheet in real WebKit (Safari's
  engine), run from a GitHub Actions runner against production because
  the sandbox has neither WebKit nor a route to vercel.app.

    BASE=https://method-homes.vercel.app node scripts/webkit-back.mjs

  Opens /get-started on an iPhone profile, answers three steps, then
  walks the browser's Back and prints which step is showing after each
  pop together with the history entry's state — the same walk the
  Chromium check in the sandbox passes.
*/
import { devices, webkit, chromium } from "playwright";

const BASE = process.env.BASE ?? "https://method-homes.vercel.app";
const engine = process.env.ENGINE === "chromium" ? chromium : webkit;
const device = devices["iPhone 14"];

const browser = await engine.launch();
const ctx = await browser.newContext({ ...device, defaultBrowserType: undefined });
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error" || /PUSHSTATE|POP/.test(m.text())) console.log("console:", m.text().slice(0, 240));
});
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 240)));
await page.addInitScript(() => {
  const orig = history.pushState.bind(history);
  history.pushState = function (...a) {
    try {
      return orig(...a);
    } catch (e) {
      console.log("PUSHSTATE ERR " + e);
      throw e;
    }
  };
  window.addEventListener("popstate", (e) => console.log("POP state=" + JSON.stringify(e.state && { mhSheet: e.state.mhSheet, mhStep: e.state.mhStep, depth: e.state.mhSheetDepth, na: e.state.__NA })));
});

const title = async () => (await page.locator("[role=dialog] h1, [role=dialog] h2").first().textContent({ timeout: 4000 }).catch(() => "(no dialog heading)"))?.trim().slice(0, 60);
const hist = () =>
  page.evaluate(() => ({
    len: history.length,
    state: history.state && { mhSheet: history.state.mhSheet, mhStep: history.state.mhStep, depth: history.state.mhSheetDepth, na: history.state.__NA },
  }));
const report = async (label) => console.log(label, "|", await title(), "| dialog:", await page.locator("[role=dialog]").count(), "|", JSON.stringify(await hist()), "|", page.url());

await page.goto(`${BASE}/get-started`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[role=dialog]", { timeout: 20000 });
await page.waitForTimeout(800);
await report("step0");

await page.locator("[role=dialog] label", { hasText: /home/i }).first().tap();
await page.waitForTimeout(900);
await report("step1");

const cont = page.locator("[role=dialog] button", { hasText: /continue/i });
if (await cont.count()) {
  await cont.first().tap();
  await page.waitForTimeout(600);
}
await report("step2");

if (await page.locator("[role=dialog] input[type=radio]").count()) {
  await page.locator("[role=dialog] label").first().tap();
  await page.waitForTimeout(900);
}
await report("step3");

for (let i = 1; i <= 4; i++) {
  console.log(`--- back ${i} ---`);
  await page.goBack({ waitUntil: "commit" }).catch((e) => console.log("goBack err", e.message));
  await page.waitForTimeout(800);
  await report(`after back ${i}`);
}

await browser.close();
