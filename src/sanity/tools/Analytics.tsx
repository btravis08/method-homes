import { icons } from "@sanity/icons";
import type { Tool } from "sanity";

import { lazyPane } from "./lazy";

/* Performance · AEO · Traffic in one tool; pane code and its bundled
   report JSON load when the tool opens — see lazy.tsx */
export const analyticsTool: Tool = {
  name: "analytics",
  title: "Analytics",
  icon: icons["bar-chart"],
  component: lazyPane(() => import("./AnalyticsPane")),
};
