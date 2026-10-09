import designops from "../../../designops.config.json";

import { blockContent } from "./blockContent";
import { collection } from "./collection";
import { discount } from "./discount";
import { aeoAiSession, aeoBotHit } from "./aeoTraffic";
import { formSubmission } from "./formSubmission";
import { legacyPage } from "./legacyPage";
import { navigation } from "./navigation";
import { page } from "./page";
import { redirect } from "./redirect";
import { seo } from "./seo";
import { author, post, postCategory } from "./blog";
import { plan, series } from "./catalog";
import { glossary } from "./glossary";
import { commercialType, market } from "./markets";
import { model3d } from "./model3d";
import { press } from "./press";
import { product } from "./product";
import { project } from "./project";
import { sectionTypes } from "./sections";
import { siteSettings } from "./siteSettings";
import { story } from "./story";
import { teamMember } from "./teamMember";
import { storeSettings } from "./storeSettings";

/*
  Feature-modular schema registry. The BASE module (pages, sections,
  navigation, settings, redirects) always ships; commerce, blog and
  projects compose in behind designops.config.json feature flags —
  the same boundaries scaffold.manifest.json enumerates for the
  create-CLI. Flag off a module and its document types vanish from
  the Studio (existing documents keep living in the dataset).
*/

const base = [
  redirect,
  formSubmission,
  aeoBotHit,
  aeoAiSession,
  seo,
  page,
  legacyPage,
  navigation,
  siteSettings,
  blockContent,
  model3d,
  ...sectionTypes,
];

const commerce = [product, collection, discount, story, storeSettings];
const blog = [post, author, postCategory];
/* the Method catalog + service landers ride with the projects module:
   series/plans reference projects, markets list them, commercial types
   cite them as case studies, press clippings point at them */
const projects = [project, teamMember, series, plan, market, commercialType, press, glossary];

export const schemaTypes = [
  ...base,
  ...(designops.features.commerce ? commerce : []),
  ...(designops.features.blog ? blog : []),
  ...(designops.features.projects ? projects : []),
];
