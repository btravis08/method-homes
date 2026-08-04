import { icons } from "@sanity/icons";
import type { Tool } from "sanity";

import { lazyPane } from "./lazy";

/* pane code (and its data imports) loads when the tool opens — see lazy.tsx */
export const designTokensTool: Tool = {
  name: "tokens",
  title: "Tokens",
  icon: icons["color-wheel"],
  component: lazyPane(() => import("./DesignTokensPane")),
};
