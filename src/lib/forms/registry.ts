import { intakeForm } from "./definitions/intake";
import type { FormDef } from "./types";

/*
  Server-side lookup of every multi-step form /api/forms accepts. A
  form posted with a registered id is validated against its definition;
  anything else falls through to the simple newsletter/contact path.
  Client code should import the one definition it renders, not this
  registry, so pages only ship the form they use.
*/
export const FORMS: Record<string, FormDef> = {
  [intakeForm.id]: intakeForm,
};
