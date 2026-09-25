/*
  Cloudflare Turnstile (optional, invisible CAPTCHA). Off unless
  TURNSTILE_SECRET_KEY is set server-side AND
  NEXT_PUBLIC_TURNSTILE_SITE_KEY is set for the widget. When on, a
  registered form without a passing token is rejected (the visitor can
  retry), because the widget itself proved the browser can produce one.
*/
export const turnstileEnabled = () => Boolean(process.env.TURNSTILE_SECRET_KEY);

export async function verifyTurnstile(token: unknown, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(6000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    /* Cloudflare unreachable: fail open — the other layers still apply */
    return true;
  }
}
