import type { MetadataRoute } from "next";

import designops from "../../designops.config.json";

/*
  Everyone may read the public site; the Studio, API and the section
  library stay out of indexes. The answer-engine crawlers are named
  explicitly (the list is designops aeo.bots) so the intent to be read
  and cited by ChatGPT, Claude, Perplexity, Gemini et al. is
  unambiguous — a wildcard allow also admits them, but a named group
  survives a future "Disallow" added for some other bot.
*/
const PUBLIC = { allow: "/", disallow: ["/studio", "/api/", "/library"] };

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", ...PUBLIC },
      ...designops.aeo.bots.map((userAgent) => ({ userAgent, ...PUBLIC })),
    ],
    sitemap: `${designops.site.baseUrl}/sitemap.xml`,
  };
}
