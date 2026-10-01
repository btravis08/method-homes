import { icons } from "@sanity/icons";
import type { Tool } from "sanity";

import { lazyPane } from "./lazy";

/* pane code (and the bundled report JSON) loads when the tool opens */
export const aeoTool: Tool = {
  name: "aeo",
  title: "AEO",
  icon: icons["sparkles"],
  component: lazyPane(() => import("./AeoPane")),
};
