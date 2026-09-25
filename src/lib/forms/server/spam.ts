import type { Answers } from "../types";

/*
  Content heuristics for submissions that got past the honeypot and
  time-trap. They FLAG (status "spam", kept out of the Unread queue and
  never emailed) rather than reject: a false positive stays
  recoverable in the Studio's Spam list instead of silently losing a
  lead.
*/

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const MARKUP_RE = /<a\s|<\/a>|\[url=|\[\/url\]/i;
const NAME_KEYS = /(^|_)(first_name|last_name|name|organization)$/;

export function spamSignals(answers: Answers): string[] {
  const reasons = new Set<string>();
  let links = 0;
  for (const [key, value] of Object.entries(answers)) {
    const texts = Array.isArray(value) ? value : value ? [value] : [];
    for (const t of texts) {
      const found = t.match(URL_RE)?.length ?? 0;
      links += found;
      if (MARKUP_RE.test(t)) reasons.add("markup");
      if (found && NAME_KEYS.test(key)) reasons.add("link in name");
    }
  }
  if (links > 2) reasons.add("many links");
  return [...reasons];
}
