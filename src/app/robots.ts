import type { MetadataRoute } from "next";

import designops from "../../designops.config.json";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/studio", "/api/", "/library"],
      },
    ],
    sitemap: `${designops.site.baseUrl}/sitemap.xml`,
  };
}
