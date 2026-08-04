import { NextRequest, NextResponse } from "next/server";

import { searchCatalog } from "@/sanity/lib/search";

/* Live search behind the flyout: ?q= → product cards + collections.
   Same pipeline as /search, small payload, briefly cacheable. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const results = await searchCatalog(q);
  return NextResponse.json(results, {
    headers: { "Cache-Control": "public, max-age=30, s-maxage=120" },
  });
}
