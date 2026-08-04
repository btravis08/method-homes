import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "alsdve2t",
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  },
});
