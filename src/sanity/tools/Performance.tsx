import { icons } from "@sanity/icons";
import type { Tool } from "sanity";

import { lazyPane } from "./lazy";

/* pane code (and its data imports) loads when the tool opens — see lazy.tsx */
export const performanceTool: Tool = {
  name: "performance",
  title: "Performance",
  icon: icons["dashboard"],
  component: lazyPane(() => import("./PerformancePane")),
};
