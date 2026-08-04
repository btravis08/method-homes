import { NextResponse } from "next/server";
import { createClient } from "next-sanity";

import { apiVersion, dataset, projectId } from "@/sanity/env";
import { pagePassphraseQuery } from "@/sanity/lib/queries";
import { GATE_COOKIE_MAX_AGE, gateCookieName, gateCookieValue } from "@/lib/gate";

/*
  Gated-page unlock: validates the submitted passphrase against the
  page document and sets the proof cookie (sha256(slug:passphrase),
  httpOnly). Reads bypass the CDN — a passphrase edited in the Studio
  moments ago must count immediately (same staleness gotcha as the
  preview secret).
*/

const gateClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
});

const safeSlug = (raw: FormDataEntryValue | null) => {
  const slug = typeof raw === "string" ? raw : "";
  return /^[a-zA-Z0-9-]{1,96}$/.test(slug) ? slug : null;
};

export async function POST(request: Request) {
  const form = await request.formData();
  const slug = safeSlug(form.get("slug"));
  const passphrase = form.get("passphrase");
  if (!slug || typeof passphrase !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const target = new URL(`/${slug}`, request.url);

  let expected: string | null = null;
  try {
    expected = await gateClient.fetch<string | null>(pagePassphraseQuery, {
      slug,
    });
  } catch {
    /* dataset unreachable — fall through to the mismatch path */
  }

  if (!expected?.trim() || passphrase !== expected) {
    target.searchParams.set("gate", "wrong");
    return NextResponse.redirect(target, 303);
  }

  const response = NextResponse.redirect(target, 303);
  response.cookies.set(gateCookieName(slug), gateCookieValue(slug, expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/${slug}`,
    maxAge: GATE_COOKIE_MAX_AGE,
  });
  return response;
}
