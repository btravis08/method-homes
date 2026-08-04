/**
 * Seeds the "legacyPage" singleton — the /legacy page's content —
 * pre-filled with the built-in design content so every image and
 * paragraph becomes replaceable in the Studio.
 *
 * Run locally (needs your Sanity login):
 *   npx sanity exec scripts/seed-legacy.ts --with-user-token
 *
 * Idempotent: a fixed document id, and asset uploads are de-duped by
 * Sanity content hashing. WARNING: re-running OVERWRITES the Legacy
 * page document — Studio edits made since the last run are lost.
 */
import { createReadStream } from "node:fs";
import path from "node:path";

import { getCliClient } from "sanity/cli";

const client = getCliClient({ apiVersion: "2026-07-01" });

let keyCounter = 0;
const key = () => `legacy${(keyCounter++).toString().padStart(3, "0")}`;

const image = (assetId: string) => ({
  _type: "image" as const,
  asset: { _type: "reference" as const, _ref: assetId },
});

/* uploads are de-duped server-side by content hash, so re-runs don't
   accumulate duplicate assets */
const uploaded = new Map<string, string>();
async function uploadImage(relPath: string): Promise<string> {
  const cached = uploaded.get(relPath);
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "public", relPath);
  const asset = await client.assets.upload("image", createReadStream(filePath), {
    filename: `legacy-${path.basename(relPath)}`,
  });
  console.log(`↑ ${relPath} → ${asset._id}`);
  uploaded.set(relPath, asset._id);
  return asset._id;
}

const MANTRA =
  "Every seam, every stitch, every fold of Sun Day Red, is sewn with the meticulousness, care, and unwavering focus that has defined Tiger Woods’ legendary career.";

const MARK_COPY =
  "When you wear these clothes, you wear the confidence to compete. You carry the legacy of a champion. You become part of the SUN DAY RED story.";

/* the gallery's ten layout slots, left to right (positions/sizes are
   code-owned — only imagery and captions live here) */
const GALLERY_CARDS: Array<[string, string]> = [
  ["figma/legacy/float-putt.jpg", "Practice Green, 2024"],
  ["figma/journal/stream-03.jpg", "Fitting Room, 2024"],
  ["figma/journal/stream-11.jpg", "Media Day, 2024"],
  ["figma/journal/stream-10.jpg", "St Andrews, 2022"],
  ["figma/legacy/float-crowd.jpg", "Riviera, 2024"],
  ["figma/journal/stream-05.jpg", "The Range, 2024"],
  ["figma/legacy/float-shoes.jpg", "Pebble Beach, 2024"],
  ["figma/legacy/hero.jpg", "Studio, 2024"],
  ["figma/journal/stream-06.jpg", "Sawgrass, 2024"],
  ["figma/legacy/float-putt.jpg", "Sunday, 2024"],
];

/* the full-bleed carousel: title, background, portrait, body */
const SLIDES: Array<[string, string, string, string]> = [
  [
    "Precision",
    "figma/journal/stream-10.jpg",
    "figma/legacy/float-putt.jpg",
    "Turpis id enim mi iaculis erat. Enim diam in cursus duis arcu aliquet. Sit nunc ut et lorem tellus vitae nibh dictum ornare.",
  ],
  [
    "Performance",
    "figma/journal/stream-06.jpg",
    "figma/journal/stream-11.jpg",
    "Enim diam in cursus duis arcu aliquet. Turpis id enim mi iaculis erat. Sit nunc ut et lorem tellus vitae nibh dictum ornare.",
  ],
  [
    "Quality",
    "figma/legacy/hero.jpg",
    "figma/journal/stream-03.jpg",
    "Sit nunc ut et lorem tellus vitae nibh dictum ornare. Turpis id enim mi iaculis erat. Enim diam in cursus duis arcu aliquet.",
  ],
  [
    "Comfort",
    "figma/legacy/float-crowd.jpg",
    "figma/journal/stream-01.jpg",
    "Turpis id enim mi iaculis erat. Enim diam in cursus duis arcu aliquet. Sit nunc ut et lorem tellus vitae nibh dictum ornare.",
  ],
  [
    "Craft",
    "figma/journal/stream-05.jpg",
    "figma/legacy/float-shoes.jpg",
    "Enim diam in cursus duis arcu aliquet. Sit nunc ut et lorem tellus vitae nibh dictum ornare. Turpis id enim mi iaculis erat.",
  ],
];

async function run() {
  const hero = await uploadImage("figma/legacy/hero.jpg");
  const mark = await uploadImage("figma/legacy/mark-emboss.svg");

  const cards = [];
  for (const [file, meta] of GALLERY_CARDS) {
    cards.push({
      _type: "galleryCard" as const,
      _key: key(),
      image: image(await uploadImage(file)),
      meta,
    });
  }

  const slides = [];
  for (const [title, bg, media, body] of SLIDES) {
    slides.push({
      _type: "legacySlide" as const,
      _key: key(),
      title,
      background: image(await uploadImage(bg)),
      media: image(await uploadImage(media)),
      body,
    });
  }

  await client.createOrReplace({
    _id: "legacyPage",
    _type: "legacyPage",
    hero: {
      wordLeft: "A New",
      wordRight: "Legacy",
      image: image(hero),
    },
    mantraTop: {
      eyebrow: "Our Mantra",
      copy: MANTRA,
      cta: "Shop Sun Day Red",
    },
    gallery: {
      cards,
      textLeft:
        "Pursue better, always. From first-light practice rounds to Sunday's final walk, every piece is built to move the way a champion moves.",
      textRight:
        "You carry the legacy of a champion. You become part of the Sun Day Red story — written one Sunday at a time.",
    },
    mantraBottom: {
      eyebrow: "Our Mantra",
      copy: MANTRA,
      cta: "Shop Sun Day Red",
    },
    slides,
    mark: {
      eyebrow: "Our Mark",
      copy: MARK_COPY,
      image: image(mark),
    },
    swirl: {
      centerImage: image(hero),
      cta: "Shop Sun Day Red",
    },
  });

  console.log('✓ "legacyPage" created — the /legacy page is now editable in the Studio');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
