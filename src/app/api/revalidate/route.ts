import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

/*
  Sanity publish webhook target: busts every "sanity"-tagged fetch so
  content changes appear within seconds instead of waiting out the
  ISR window.

  Set up in manage.sanity.io → API → Webhooks:
    URL:    https://<domain>/api/revalidate?secret=<SECRET>
    Dataset: production, trigger on create/update/delete
  The secret defaults for the staging site; set SANITY_REVALIDATE_SECRET
  in Vercel to override.
*/
const SECRET = process.env.SANITY_REVALIDATE_SECRET ?? "sdr-revalidate";

export async function POST(request: NextRequest) {
  if (request.nextUrl.searchParams.get("secret") !== SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  revalidateTag("sanity", "max");
  return NextResponse.json({ ok: true, revalidated: true, now: Date.now() });
}
