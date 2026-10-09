import { icons } from "@sanity/icons";
import { defineField, defineType } from "sanity";

/*
  A 3D model for the bespoke interactive plan viewer — deliberately
  NOT attached to a series or floor plan (Bryce, 2026-10-09: "i am not
  going to upload models to the series. this will be a bespoke
  interactive component"). The source IFC is uploaded here; the
  model-pipeline workflow (dispatched with this document's slug) reads
  it, writes the web GLB back into `model` and records the north
  rotation. The viewer component references one of these documents.
*/
export const model3d = defineType({
  name: "model3d",
  icon: icons["cube"],
  title: "3D model",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (rule) => rule.required(), description: "e.g. “Method sample home”, “Cabin — Model 2”." }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name", maxLength: 64 },
      validation: (rule) => rule.required(),
      description: "Names the pipeline output (public/models/<slug>.glb) — pass it to the model-pipeline workflow.",
    }),
    defineField({ name: "description", title: "Notes", type: "text", rows: 3, description: "Where the model came from, what it represents, anything the conversion should know." }),
    defineField({
      name: "sourceModel",
      title: "Source model (IFC)",
      type: "file",
      options: { accept: ".ifc,application/x-step,model/ifc" },
      description: "The BIM export (IFC 2x3 or 4; tens of MB is fine). Never served to visitors — the model-pipeline workflow reads it from here and writes the web GLB below.",
    }),
    defineField({
      name: "keepMaterials",
      title: "Keep source siding materials",
      type: "boolean",
      initialValue: true,
      description: "Pass the IFC's wall/siding surface styles through instead of the category recolour. Roof, glass and floors still get the viewer's treatment.",
    }),
    defineField({
      name: "model",
      title: "Web model (GLB)",
      type: "file",
      options: { accept: ".glb,model/gltf-binary" },
      description: "Written by the pipeline (ifc-to-glb.py → gltf-transform). Under 2 MB. Powers the viewer.",
    }),
    defineField({ name: "northDeg", title: "North rotation (°)", type: "number", description: "Set by the pipeline from the IFC's TrueNorth; override to turn the model so plan view is north-up." }),
  ],
  preview: {
    select: { title: "name", slug: "slug.current", hasModel: "model.asset", hasSource: "sourceModel.asset" },
    prepare: ({ title, slug, hasModel, hasSource }) => ({
      title,
      subtitle: [slug, hasModel ? "GLB ready" : hasSource ? "IFC uploaded — run the pipeline" : "no files"].filter(Boolean).join(" · "),
    }),
  },
});
