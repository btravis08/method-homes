/**
 * AEO analytics · prompt insights — the "measure" half of the grader,
 * modelled on Webflow AEO's assessment snapshot. For each tracked
 * prompt (designops aeo.prompts, tagged by funnel stage) an answer
 * engine's reply is scored on:
 *
 *   mentioned      the brand is named                    → mention rate
 *   cited          one of our domains is given as a source → citation rate
 *   surfaced       our domain was among the sources consulted
 *   competitors    tracked competitors named              → share of voice
 *   messages       key messages conveyed (aeo.keyMessages) → message pull-through
 *   sentiment      0–100, how favourably the brand is portrayed
 *   accuracy       0–100, how factually right the brand description is
 *
 * Automated path: the Claude API with the web_search server tool
 * answers the prompt the way an answer engine would; a second,
 * structured call judges sentiment and accuracy against the brand
 * facts. Needs ANTHROPIC_API_KEY — otherwise the hand-recorded run in
 * src/design/aeo.prompts.manual.json stands in, scored by the same
 * formulas (prompts it does not cover count as not yet recorded).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const MANUAL = path.join(process.cwd(), "src/design/aeo.prompts.manual.json");

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* host matches a brand/competitor domain (or a subdomain of one) */
function hostMatches(url, domains) {
  try {
    const host = new URL(url).host.replace(/^www\./, "");
    return domains.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const promptText = (p) => (typeof p === "string" ? p : p.text);
const promptStage = (p) => (typeof p === "string" ? "consideration" : p.stage ?? "consideration");

/* which tracked competitors an answer names */
function competitorsIn(text, competitors) {
  return competitors
    .filter((c) => [c.name, ...(c.aliases ?? [])].some((n) => new RegExp(`\\b${esc(n)}\\b`, "i").test(text)) || (c.domain && new RegExp(esc(c.domain), "i").test(text)))
    .map((c) => c.name);
}

/* which key messages an answer carries (regex, deterministic) */
function messagesIn(text, keyMessages) {
  return keyMessages.filter((m) => new RegExp(m.pattern, "i").test(text)).map((m) => m.id);
}

/* roll per-prompt results into Webflow's six metrics */
export function summarize(results, { competitors, keyMessages }) {
  const answered = results.filter((r) => r.recorded !== false && !r.error && !r.refused);
  const n = answered.length;
  const mentioned = answered.filter((r) => r.mentioned);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  /* share of voice: our mentions as a share of every tracked-brand
     mention across the answers (brand + competitors) */
  const brandMentions = mentioned.length;
  const competitorMentions = answered.reduce((s, r) => s + (r.competitors?.length ?? 0), 0);
  const competitorTally = {};
  for (const r of answered) for (const c of r.competitors ?? []) competitorTally[c] = (competitorTally[c] ?? 0) + 1;
  const messageTally = Object.fromEntries(keyMessages.map((m) => [m.id, 0]));
  for (const r of mentioned) for (const id of r.messages ?? []) if (id in messageTally) messageTally[id]++;
  return {
    prompts: results.length,
    answered: n,
    unrecorded: results.filter((r) => r.recorded === false).length,
    mentionRate: pct(mentioned.length, n),
    /* visibility score is Webflow's analytics name for the same ratio */
    visibility: pct(mentioned.length, n),
    citationRate: pct(answered.filter((r) => r.cited).length, n),
    surfacedRate: pct(answered.filter((r) => r.surfaced).length, n),
    shareOfVoice: pct(brandMentions, brandMentions + competitorMentions),
    sentiment: avg(mentioned.map((r) => r.sentiment).filter((x) => typeof x === "number")),
    accuracy: avg(mentioned.map((r) => r.accuracy).filter((x) => typeof x === "number")),
    messagePullThrough: mentioned.length && keyMessages.length ? Math.round((mentioned.reduce((s, r) => s + (r.messages?.length ?? 0), 0) / (mentioned.length * keyMessages.length)) * 100) : 0,
    competitors: Object.entries(competitorTally)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, domain: competitors.find((c) => c.name === name)?.domain })),
    messages: keyMessages.map((m) => ({ id: m.id, label: m.label, count: messageTally[m.id], rate: mentioned.length ? Math.round((messageTally[m.id] / mentioned.length) * 100) : 0 })),
    byStage: Object.entries(
      answered.reduce((acc, r) => {
        const s = r.stage ?? "consideration";
        acc[s] ??= { prompts: 0, mentioned: 0, cited: 0 };
        acc[s].prompts++;
        if (r.mentioned) acc[s].mentioned++;
        if (r.cited) acc[s].cited++;
        return acc;
      }, {}),
    ).map(([stage, v]) => ({ stage, ...v, mentionRate: pct(v.mentioned, v.prompts) })),
  };
}

/* no key: the hand-recorded run, matched to the configured prompts */
function manualRun(reason, cfg) {
  if (!existsSync(MANUAL)) return { ran: false, reason, model: MODEL, results: [] };
  try {
    const m = JSON.parse(readFileSync(MANUAL, "utf8"));
    const byPrompt = new Map((m.results ?? []).map((r) => [r.prompt.trim().toLowerCase(), r]));
    const results = cfg.prompts.map((p) => {
      const text = promptText(p);
      const r = byPrompt.get(text.trim().toLowerCase());
      if (!r) return { prompt: text, stage: promptStage(p), recorded: false, mentioned: false, cited: false, surfaced: false, competitors: [], messages: [] };
      return {
        prompt: text,
        stage: promptStage(p),
        at: m.recordedAt,
        mentioned: Boolean(r.mentioned),
        cited: Boolean(r.cited),
        surfaced: Boolean(r.surfaced),
        competitors: r.competitors ?? competitorsIn(r.excerpt ?? "", cfg.competitors),
        messages: r.messages ?? messagesIn(r.excerpt ?? "", cfg.keyMessages),
        sentiment: typeof r.sentiment === "number" ? r.sentiment : undefined,
        accuracy: typeof r.accuracy === "number" ? r.accuracy : undefined,
        citedUrls: r.citedUrls ?? [],
        sources: r.sources ?? [],
        excerpt: r.excerpt,
      };
    });
    if (!results.some((r) => r.recorded !== false)) return { ran: false, reason, model: MODEL, results: [] };
    const ageDays = Math.round((Date.now() - Date.parse(m.recordedAt)) / 86400e3);
    return {
      ran: true,
      manual: true,
      model: `${m.engine ?? "manual"} · recorded ${ageDays}d ago`,
      recordedAt: m.recordedAt,
      ...summarize(results, cfg),
      results,
    };
  } catch (err) {
    return { ran: false, reason: `${reason}; manual file unreadable: ${err.message}`, model: MODEL, results: [] };
  }
}

/* second call: sentiment + accuracy of the brand's portrayal, judged
   against the brand facts, as structured JSON */
async function judge(client, { answer, brand, facts }) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["sentiment", "accuracy", "note"],
          properties: {
            sentiment: { type: "integer", minimum: 0, maximum: 100, description: "How favourably the answer portrays the brand: 0 hostile, 50 neutral, 100 glowing." },
            accuracy: { type: "integer", minimum: 0, maximum: 100, description: "How factually correct the answer's statements about the brand are, against the facts given. 100 = nothing wrong." },
            note: { type: "string", maxLength: 240, description: "One sentence: what was wrong or missing, if anything." },
          },
        },
      },
    },
    system: `You audit how an AI answer engine portrayed the company "${brand}". Known facts about the company:\n${facts.map((f) => `- ${f}`).join("\n")}\nJudge only the statements about ${brand}; ignore other companies.`,
    messages: [{ role: "user", content: `Answer to audit:\n\n${answer}` }],
  });
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(text);
}

export async function runPromptInsights(cfg) {
  const { prompts, brand, brandDomains, competitors = [], keyMessages = [] } = cfg;
  const full = { prompts, brand, brandDomains, competitors, keyMessages };
  if (!process.env.ANTHROPIC_API_KEY) return manualRun("ANTHROPIC_API_KEY not set", full);
  if (!prompts?.length) return { ran: false, reason: "no prompts configured (designops.config.json → aeo.prompts)", model: MODEL, results: [] };

  const client = new Anthropic();
  const brandRe = new RegExp(esc(brand), "i");
  const facts = keyMessages.map((m) => m.label);
  const results = [];

  for (const p of prompts) {
    const prompt = promptText(p);
    const stage = promptStage(p);
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
          for (const c of block.citations ?? []) if ("url" in c && c.url) cited.add(c.url);
        } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === "web_search_result" && r.url) seen.add(r.url);
        }
      }
      const mentioned = brandRe.test(text);
      const row = {
        prompt,
        stage,
        at,
        refused: res.stop_reason === "refusal",
        mentioned,
        cited: [...cited].some((u) => hostMatches(u, brandDomains)),
        surfaced: [...seen].some((u) => hostMatches(u, brandDomains)),
        competitors: competitorsIn(text, competitors),
        messages: mentioned ? messagesIn(text, keyMessages) : [],
        citedUrls: [...cited].filter((u) => hostMatches(u, brandDomains)).slice(0, 5),
        sources: [...cited].slice(0, 8),
        excerpt: text.trim().slice(0, 400),
        usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
      };
      if (mentioned && !row.refused) {
        try {
          const j = await judge(client, { answer: text, brand, facts });
          row.sentiment = j.sentiment;
          row.accuracy = j.accuracy;
          row.judgeNote = j.note;
        } catch (err) {
          row.judgeError = String(err?.message ?? err).slice(0, 120);
        }
      }
      results.push(row);
    } catch (err) {
      results.push({ prompt, stage, at, error: String(err?.message ?? err).slice(0, 200), mentioned: false, cited: false, surfaced: false, competitors: [], messages: [] });
    }
  }

  return { ran: true, model: MODEL, ...summarize(results, full), results };
}
