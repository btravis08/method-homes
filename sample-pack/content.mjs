/**
 * Architecture-studio sample pack — the dataset seed-pack.ts creates.
 *
 * buildDocuments(img) returns the full document list; img(filename)
 * resolves a file from this pack's images/ folder to a Sanity image
 * object (seed-pack.ts uploads the files first and supplies the
 * resolver). Document _ids are fixed (and dot-free) so re-seeding is
 * idempotent.
 */

let keyCounter = 0;
const key = () => `pack${(keyCounter++).toString().padStart(3, "0")}`;
const ref = (id) => ({ _type: "reference", _ref: id });
const refk = (id) => ({ _type: "reference", _key: key(), _ref: id });
const block = (text, style = "normal") => ({
  _type: "block",
  _key: key(),
  style,
  markDefs: [],
  children: [{ _type: "span", _key: key(), marks: [], text }],
});

const PROJECTS = [
  {
    id: "project-hillside-house",
    title: "Hillside House",
    category: "residential",
    featured: true,
    location: "Bend, OR",
    squareFeet: 3200,
    bedrooms: 4,
    bathrooms: 3,
    completedYear: 2024,
    image: "project-01.jpg",
    summary:
      "A stepped single-family home that follows its slope instead of flattening it, with living spaces opening downhill toward the treeline.",
  },
  {
    id: "project-fold-house",
    title: "Fold House",
    category: "residential",
    featured: true,
    location: "Hood River, OR",
    squareFeet: 2400,
    bedrooms: 3,
    bathrooms: 2,
    completedYear: 2023,
    image: "project-02.jpg",
    summary:
      "A compact house organized under one folded roof plane, sized to its lot and to the gorge winds it turns its back on.",
  },
  {
    id: "project-north-fork-cabin",
    title: "North Fork Cabin",
    category: "residential",
    location: "Winthrop, WA",
    squareFeet: 980,
    bedrooms: 2,
    bathrooms: 1,
    completedYear: 2022,
    image: "project-03.jpg",
    summary:
      "An off-grid cabin built from a repeating timber bay, insulated for shoulder-season snow and framed in a single summer.",
  },
  {
    id: "project-mercantile-offices",
    title: "Mercantile Offices",
    category: "commercial",
    featured: true,
    location: "Portland, OR",
    squareFeet: 14500,
    completedYear: 2024,
    image: "project-04.jpg",
    summary:
      "A 1911 dry-goods warehouse re-plumbed as daylight offices — new cores, exposed heavy timber, and a public ground floor.",
  },
  {
    id: "project-ridgeline-retreat",
    title: "Ridgeline Retreat",
    category: "residential",
    location: "Sisters, OR",
    squareFeet: 2800,
    bedrooms: 3,
    bathrooms: 3,
    completedYear: 2023,
    image: "project-05.jpg",
    summary:
      "A long, low house set just below the ridge, its roof pitched to the view rather than the street.",
  },
  {
    id: "project-cannery-workspace",
    title: "Cannery Workspace",
    category: "commercial",
    location: "Astoria, OR",
    squareFeet: 8600,
    completedYear: 2022,
    image: "project-06.jpg",
    summary:
      "A waterfront cannery converted to maker studios, keeping the sawtooth roof and the smell of salt out of the insulation.",
  },
  {
    id: "project-saltbox-house",
    title: "Saltbox House",
    category: "residential",
    location: "Port Townsend, WA",
    squareFeet: 1900,
    bedrooms: 3,
    bathrooms: 2,
    completedYear: 2021,
    image: "project-07.jpg",
    summary:
      "A modern saltbox that borrows its massing from the neighborhood and spends the savings on glazing.",
  },
  {
    id: "project-meridian-gallery",
    title: "Meridian Gallery",
    category: "commercial",
    location: "Seattle, WA",
    squareFeet: 5200,
    completedYear: 2025,
    image: "project-08.jpg",
    summary:
      "A single-room gallery where the daylighting is the architecture: one north lantern, no fixtures visible.",
  },
];

const POSTS = [
  {
    id: "post-passive-cooling",
    title: "Notes on Passive Cooling",
    slug: "notes-on-passive-cooling",
    image: "post-01.jpg",
    excerpt:
      "Why the cheapest cooling system on every project we build is the one drawn into the section, not the mechanical schedule.",
    body: [
      "Every summer the same call comes in: the house is warm, can we add equipment. The honest answer is usually that the building itself was never asked to do any of the work.",
      "Orientation, overhangs and mass",
      "The section does more than the thermostat. A roof overhang sized to the sun path shades the glass in July and admits it in January — it has no moving parts and never needs a filter.",
      "Cross-ventilation is a plan decision. Two operable openings on opposite pressure faces will move more air than most ducted systems, provided the plan lets the air through.",
    ],
    bodyStyles: ["normal", "h2", "normal", "normal"],
  },
  {
    id: "post-house-that-ages",
    title: "A House That Ages Well",
    slug: "a-house-that-ages-well",
    image: "post-02.jpg",
    excerpt:
      "Materials that look better at year twenty than year one, and the details that get them there.",
    body: [
      "Weathering is not a defect. Cedar grays, steel streaks, concrete mottles — a house designed for those changes reads as settled rather than shabby.",
      "Detailing for time",
      "The difference between patina and damage is almost always a drip edge. Water that is directed ages a material evenly; water that wanders stains it.",
    ],
    bodyStyles: ["normal", "h2", "normal"],
  },
  {
    id: "post-studio-expansion",
    title: "The Studio Is Growing",
    slug: "the-studio-is-growing",
    image: "post-03.jpg",
    excerpt:
      "Two new desks, a materials library with actual daylight, and room to pin up a full project side by side.",
    body: [
      "After six years in two rooms we have taken the floor next door. The pin-up wall is finally longer than the projects on it.",
      "The materials library moves out of the flat files and into the daylight, where samples can be judged in the light they will live in.",
    ],
    bodyStyles: ["normal", "normal"],
  },
];

export default function buildDocuments(img) {
  const imgk = (file) => ({ ...img(file), _key: key() });

  const projects = PROJECTS.map((p, i) => ({
    _id: p.id,
    _type: "project",
    title: p.title,
    slug: { _type: "slug", current: p.id.replace("project-", "") },
    category: p.category,
    featured: Boolean(p.featured),
    summary: p.summary,
    mainImage: { ...img(p.image), alt: `${p.title} — exterior` },
    gallery: [
      { ...img(PROJECTS[(i + 1) % PROJECTS.length].image), _key: key(), alt: `${p.title} — detail` },
      { ...img(PROJECTS[(i + 2) % PROJECTS.length].image), _key: key(), alt: `${p.title} — interior` },
    ],
    location: p.location,
    squareFeet: p.squareFeet,
    ...(p.bedrooms ? { bedrooms: p.bedrooms } : {}),
    ...(p.bathrooms ? { bathrooms: p.bathrooms } : {}),
    completedYear: p.completedYear,
    body: [block(p.summary)],
  }));

  const author = {
    _id: "author-studio",
    _type: "author",
    name: "Meridian North Studio",
    role: "Principal's desk",
    bio: "Notes from the studio floor — process, materials, and the occasional site mud.",
  };

  const categories = [
    {
      _id: "post-category-studio-notes",
      _type: "postCategory",
      title: "Studio Notes",
      slug: { _type: "slug", current: "studio-notes" },
      description: "Process, announcements, and life at the studio.",
    },
    {
      _id: "post-category-field-guide",
      _type: "postCategory",
      title: "Field Guide",
      slug: { _type: "slug", current: "field-guide" },
      description: "How and why we build the way we do.",
    },
  ];

  const posts = POSTS.map((p, i) => ({
    _id: p.id,
    _type: "post",
    title: p.title,
    slug: { _type: "slug", current: p.slug },
    heroImage: img(p.image),
    excerpt: p.excerpt,
    body: p.body.map((text, j) => block(text, p.bodyStyles[j])),
    author: ref("author-studio"),
    categories: [refk(i === 2 ? "post-category-studio-notes" : "post-category-field-guide")],
    publishedAt: new Date(Date.UTC(2026, 5, 1) + i * 12 * 86400000).toISOString(),
    featured: i === 0,
  }));

  const home = {
    _id: "page-home",
    _type: "page",
    title: "Homepage",
    slug: { _type: "slug", current: "home" },
    sections: [
      {
        _type: "sectionHero",
        _key: key(),
        colorMode: "dark",
        eyebrow: "Meridian North Studio",
        headline: "Buildings That Belong",
        primaryCta: "See the Work",
        image: img("hero.jpg"),
      },
      {
        _type: "sectionInfoSlider",
        _key: key(),
        colorMode: "light",
        title: "The Work",
        cards: [
          ["Residential", "project-01.jpg"],
          ["Commercial", "project-04.jpg"],
          ["Adaptive Reuse", "project-06.jpg"],
          ["In Progress", "project-08.jpg"],
        ].map(([title, file]) => ({
          _type: "infoCard",
          _key: key(),
          title,
          image: img(file),
          mediaKind: "image",
        })),
      },
      {
        _type: "sectionCarousel",
        _key: key(),
        colorMode: "light",
        eyebrow: "Selected projects",
        items: PROJECTS.filter((p) => p.featured).map((p) => ({
          _type: "carouselItem",
          _key: key(),
          title: p.title,
          description: p.summary,
          image: img(p.image),
        })),
      },
      {
        _type: "sectionFullWidth",
        _key: key(),
        colorMode: "dark",
        eyebrow: "Practice",
        headline: "Drawn by Hand, Built to Last",
        primaryCta: "About the Studio",
        image: img("craft.jpg"),
        mediaKind: "image",
      },
      {
        _type: "sectionFiftyFifty",
        _key: key(),
        colorMode: "light",
        ratio: "5:4",
        panels: [
          { _type: "panel", _key: key(), image: img("studio.jpg"), mediaKind: "image" },
          {
            _type: "panel",
            _key: key(),
            mediaKind: "text",
            eyebrow: "The studio",
            body: "We are a small practice working across the Northwest — houses, workplaces, and the occasional building that refuses a category. Every project starts with the site and ends with the details.",
          },
        ],
      },
    ],
  };

  const navigation = {
    _id: "navigation",
    _type: "navigation",
    items: [
      {
        _type: "navItem",
        _key: key(),
        title: "Work",
        layout: "cards",
        cards: [
          { _type: "navCard", _key: key(), title: "Residential", image: imgk("project-01.jpg"), url: "/projects" },
          { _type: "navCard", _key: key(), title: "Commercial", image: imgk("project-04.jpg"), url: "/projects" },
          { _type: "navCard", _key: key(), title: "All Projects", image: imgk("project-08.jpg"), url: "/projects" },
        ],
      },
      {
        _type: "navItem",
        _key: key(),
        title: "Journal",
        layout: "cards",
        cards: POSTS.map((p) => ({
          _type: "navCard",
          _key: key(),
          title: p.title,
          image: imgk(p.image),
          url: `/journal/${p.slug}`,
        })),
      },
    ],
    companyLinks: [
      { _type: "navLink", _key: key(), label: "Projects", url: "/projects" },
      { _type: "navLink", _key: key(), label: "Journal", url: "/journal" },
    ],
  };

  const siteSettings = {
    _id: "siteSettings",
    _type: "siteSettings",
    companyName: "Meridian North Studio",
    tagline: "Architecture for the Northwest",
    phone: "(503) 555-0117",
    email: "studio@example.com",
    address: "1200 SE Morrison St\nPortland, OR 97214",
  };

  return [...projects, author, ...categories, ...posts, home, navigation, siteSettings];
}
