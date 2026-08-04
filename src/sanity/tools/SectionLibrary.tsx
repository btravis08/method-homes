"use client";

import { icons } from "@sanity/icons";
import { Card } from "@sanity/ui";
import type { Tool } from "sanity";
import { useColorSchemeValue } from "sanity";

/*
  "Sections" — the section library embedded in the Studio. The Studio
  and the site share an origin, so the tool is a thin frame over
  /library: one implementation, seen from either side. The Studio's
  appearance scheme rides along as ?scheme= so the library chrome
  matches (the iframe reloads on toggle — acceptable for a reference
  pane).
*/
function SectionLibraryPanel() {
  const scheme = useColorSchemeValue();
  return (
    <Card height="fill">
      <iframe
        key={scheme}
        src={`/library?scheme=${scheme}`}
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
