"use client";

/*
  Inline scheduling for qualified leads on the thank-you screen. Points
  at NEXT_PUBLIC_BOOKING_URL — a Calendly event link (Cal.com links work
  too, they honor the same name/email params) — and prefills the
  visitor's name and email so booking is one click. Rendered only after
  a successful submit and only when the definition's qualify() passes,
  so the iframe never loads for anyone who won't see it.
*/
export const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL;
export const BOOKING_ENABLED = Boolean(BOOKING_URL);

export function bookingHref(params: { name?: string; email?: string }) {
  if (!BOOKING_URL) return undefined;
  try {
    const url = new URL(BOOKING_URL);
    if (params.name) url.searchParams.set("name", params.name);
    if (params.email) url.searchParams.set("email", params.email);
    if (url.hostname.endsWith("calendly.com")) {
      url.searchParams.set("hide_gdpr_banner", "1");
      url.searchParams.set("embed_type", "Inline");
      if (typeof window !== "undefined") url.searchParams.set("embed_domain", window.location.hostname);
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function BookingEmbed({ name, email, className }: { name?: string; email?: string; className?: string }) {
  const href = bookingHref({ name, email });
  if (!href) return null;
  return (
    <div className={className}>
      <iframe
        src={href}
        title="Book a call"
        loading="lazy"
        className="h-[44rem] w-full rounded-xs border border-line bg-surface"
        allow="payment"
      />
      <p className="mt-md text-body-sm text-ink-3">
        Calendar not loading?{" "}
        <a href={href} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4">
          Open it in a new tab
        </a>
        .
      </p>
    </div>
  );
}
