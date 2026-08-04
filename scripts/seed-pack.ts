/**
 * Seeds the scaffolded sample pack (the sample-pack/ folder the
 * create-sdr-site CLI copies in) into the project's Sanity dataset:
 *   1. uploads sample-pack/images/* as assets (Sanity dedupes
 *      identical files, so re-runs don't multiply assets)
 *   2. builds the pack's documents (sample-pack/content.mjs) with
 *      those assets resolved, and createOrReplace's each one
 *
 * Run locally (needs your Sanity login):
 *   npx sanity exec scripts/seed-pack.ts --with-user-token
 *
 * Idempotent: fixed document ids, so re-running resets the pack's
 * documents to their shipped state.
 *
 * WARNING: re-running OVERWRITES the documents the pack manages
 * (including the "home" page and navigation). If content has been
 * edited in the Studio since the last seed, those edits are lost.
 */
import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getCliClient } from "sanity/cli";

const client = getCliClient({ apiVersion: "2026-07-01" });
const PACK_DIR = path.join(process.cwd(), "sample-pack");

async function run() {
  if (!existsSync(PACK_DIR)) {
    console.error(
      "No sample-pack/ folder here. Scaffolds created with a --pack " +
        "include one; this project was scaffolded without a pack.",
    );
    process.exit(1);
  }
  const meta = JSON.parse(readFileSync(path.join(PACK_DIR, "pack.json"), "utf8"));
  console.log(`Seeding sample pack: ${meta.title}\n${meta.blurb}\n`);

  /* 1 — assets */
  const imagesDir = path.join(PACK_DIR, "images");
  const assetIds: Record<string, string> = {};
  for (const file of readdirSync(imagesDir).sort()) {
    const asset = await client.assets.upload(
      "image",
      createReadStream(path.join(imagesDir, file)),
      { filename: file },
    );
    assetIds[file] = asset._id;
    console.log(`↑ ${file} → ${asset._id}`);
  }
  const img = (file: string) => {
    const id = assetIds[file];
    if (!id) throw new Error(`pack content references a missing image: ${file}`);
    return {
      _type: "image" as const,
      asset: { _type: "reference" as const, _ref: id },
    };
  };

  /* 2 — documents */
  const { default: buildDocuments } = await import(
    pathToFileURL(path.join(PACK_DIR, "content.mjs")).href
  );
  const docs: Array<{ _id: string; _type: string }> = buildDocuments(img);
  for (const doc of docs) {
    if (doc._id.includes("."))
      /* dotted ids are path/namespaced — invisible to the published
         perspective the site queries with */
      throw new Error(`refusing dotted document id: ${doc._id}`);
    await client.createOrReplace(doc);
    console.log(`✓ ${doc._id} (${doc._type})`);
  }
  console.log(`\nSeeded ${docs.length} documents. Open /studio to edit.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
