/**
 * AEO prompt insights — the "measure" half of the grader, modelled on
 * Webflow AEO analytics' Prompt Insights: run the prompts a buyer
 * would actually ask an answer engine, and record whether the brand is
 * MENTIONED in the answer (visibility score) and whether one of its
 * domains is CITED as a source (citation rate).
 *
 * Runs against the Claude API with the web_search server tool so the
 * answer reflects the live web, the way ChatGPT / Perplexity / Gemini
 * answers do. Skipped (recorded as not run) when ANTHROPIC_API_KEY is
 * absent — the rest of the grade still computes.
 *
 * One request per prompt, a few thousand tokens each: cents per run.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const MANUAL = path.join(process.cwd(), "src/design/aeo.prompts.manual.json");

/* no key: fall back to the hand-recorded run (src/design/
   aeo.prompts.manual.json) — what an answer engine said when someone
   asked it the tracked prompts, scored the same way */
function manualRun(reason) {
  if (!existsSync(MANUAL)) return { ran: false, reason, model: MODEL, results: [] };
  try {
    const m = JSON.parse(readFileSync(MANUAL, "utf8"));
    const results = (m.results ?? []).map((r) => ({ ...r, at: m.recordedAt, mentioned: Boolean(r.mentioned), cited: Boolean(r.cited), surfaced: Boolean(r.surfaced), citedUrls: r.citedUrls ?? [], sources: r.sources ?? [] }));
    if (!results.length) return { ran: false, reason, model: MODEL, results: [] };
    const n = results.length;
    const ageDays = Math.round((Date.now() - Date.parse(m.recordedAt)) / 86400e3);
    return {
      ran: true,
      manual: true,
      model: `${m.engine ?? "manual"} · recorded ${ageDays}d ago`,
      recordedAt: m.recordedAt,
      prompts: n,
      answered: n,
      visibility: Math.round((results.filter((r) => r.mentioned).length / n) * 100),
      citationRate: Math.round((results.filter((r) => r.cited).length / n) * 100),
      surfacedRate: Math.round((results.filter((r) => r.surfaced).length / n) * 100),
      results,
    };
  } catch (err) {
    return { ran: false, reason: `${reason}; manual file unreadable: ${err.message}`, model: MODEL, results: [] };
  }
}

/* host matches a brand domain (or a subdomain of one) */
function isBrandUrl(url, domains) {
  try {
    const host = new URL(url).host.replace(/^www\./, "");
    return domains.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export async function runPromptInsights({ prompts, brand, brandDomains }) {
  if (!process.env.ANTHROPIC_API_KEY) return manualRun("ANTHROPIC_API_KEY not set");
  if (!prompts?.length) {
    return { ran: false, reason: "no prompts configured (designops.config.json → aeo.prompts)", model: MODEL, results: [] };
  }

  const client = new Anthropic();
  const brandRe = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const results = [];

  for (const prompt of prompts) {
    const at = new Date().toISOString();
    try {
      /* adaptive thinking is the model's default — leave `thinking` out.
         The server-side refusal fallback keeps a declined prompt from
         taking the whole probe down. */
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system:
          "You are a general-purpose assistant answering a consumer's question the way an AI answer engine would: a direct, well-sourced answer in under 250 words. Use web search to ground the answer in current sources and cite them.",
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
        messages: [{ role: "user", content: prompt }],
      });

      let text = "";
      const cited = new Set();
      const seen = new Set();
      for (const block of res.content) {
        if (block.type === "text") {
          text += block.text + "\n";
          for (const c of block.citations ?? []) {
            if ("url" in c && c.url) {
              cited.add(c.url);
            }
          }
        } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === "web_search_result" && r.url) seen.add(r.url);
        }
      }

      const citedBrand = [...cited].filter((u) => isBrandUrl(u, brandDomains));
      const seenBrand = [...seen].filter((u) => isBrandUrl(u, brandDomains));
      results.push({
        prompt,
        at,
        refused: res.stop_reason === "refusal",
        mentioned: brandRe.test(text),
        cited: citedBrand.length > 0,
        /* surfaced by search but not cited: the engine found us and
           passed — a content-quality signal, not a discovery one */
        surfaced: seenBrand.length > 0,
        citedUrls: citedBrand.slice(0, 5),
        sources: [...cited].slice(0, 8),
        excerpt: text.trim().slice(0, 400),
        usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
      });
    } catch (err) {
      results.push({ prompt, at, error: String(err?.message ?? err).slice(0, 200), mentioned: false, cited: false, surfaced: false });
    }
  }

  const ok = results.filter((r) => !r.error && !r.refused);
  const n = ok.length || 1;
  return {
    ran: true,
    model: MODEL,
    prompts: prompts.length,
    answered: ok.length,
    visibility: Math.round((ok.filter((r) => r.mentioned).length / n) * 100),
    citationRate: Math.round((ok.filter((r) => r.cited).length / n) * 100),
    surfacedRate: Math.round((ok.filter((r) => r.surfaced).length / n) * 100),
    results,
  };
}
