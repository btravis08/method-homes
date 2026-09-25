/* one id per set of answers; retries reuse it so /api/forms can drop
   duplicates. Dash-only (document ids must never contain a dot). Kept
   in its own module: the footer newsletter imports it on every page,
   and nothing else from lib/forms should ride along. */
export function newSubmissionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}
