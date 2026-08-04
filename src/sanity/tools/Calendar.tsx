import { icons } from "@sanity/icons";
import type { Tool } from "sanity";

import { lazyPane } from "./lazy";

/* pane code (and its data imports) loads when the tool opens — see lazy.tsx */
export const calendarTool: Tool = {
  name: "calendar",
  title: "Calendar",
  icon: icons["calendar"],
  component: lazyPane(() => import("./CalendarPane")),
};
