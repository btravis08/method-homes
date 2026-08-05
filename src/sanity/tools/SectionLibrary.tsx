"use client";

import { icons } from "@sanity/icons";
import { Card } from "@sanity/ui";
import { useEffect, useState } from "react";
import type { Tool } from "sanity";
import { useColorSchemeValue } from "sanity";

/*
  "Sections" — the section library embedded in the Studio. The Studio
  and the site share an origin, so the tool is a thin frame over
  /library: one implementation, seen from either side. The Studio's
  appearance scheme AND its actual background color ride along so the
  library chrome matches the surrounding panes exactly (the site's
  surface tokens are close to, but not identical to, the Studio
  theme's grays).
*/
function SectionLibraryPanel() {
  const scheme = useColorSchemeValue();
  const [bg, setBg] = useState<string | null>(null);

  useEffect(() => {
    /* the Studio body carries the theme's resolved background */
    setBg(getComputedStyle(document.body).backgroundColor || null);
  }, [scheme]);

  const src = `/library?scheme=${scheme}${bg ? `&bg=${encodeURIComponent(bg)}` : ""}`;
  return (
    <Card height="fill">
      <iframe
        key={src}
        src={src}
        title="Section library"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </Card>
  );
}

export const sectionLibraryTool: Tool = {
  name: "sections",
  title: "Sections",
  icon: icons["th-large"],
  component: SectionLibraryPanel,
};
