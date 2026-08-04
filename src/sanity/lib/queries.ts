import { groq } from "next-sanity";

const projectFields = groq`
  _id,
  title,
  "slug": slug.current,
  category,
  featured,
  summary,
  mainImage,
  location,
  squareFeet,
  bedrooms,
  bathrooms,
  completedYear
`;

export const allProjectsQuery = groq`
  *[_type == "project"] | order(completedYear desc, _createdAt desc) {
    ${projectFields}
  }
`;

export const projectsByCategoryQuery = groq`
  *[_type == "project" && category == $category]
    | order(completedYear desc, _createdAt desc) {
    ${projectFields}
  }
`;

export const featuredProjectsQuery = groq`
  *[_type == "project" && featured == true]
    | order(completedYear desc, _createdAt desc)[0...3] {
    ${projectFields}
  }
`;

export const projectBySlugQuery = groq`
  *[_type == "project" && slug.current == $slug][0] {
    ${projectFields},
    gallery,
    body
  }
`;

/* Active products only (legacy documents without a status count as
   active) */
const activeFilter = groq`(!defined(status) || status == "active")`;

/* Full card projection: commerce fields + the SDR colorway visuals.
   collectionIds reverse-looks-up manual collection membership so
   collection-scoped discounts can resolve on the card. */
const sliderProductFields = groq`
  _id, title, "slug": slug.current, price, pricing, status, gender, tags, vendor, productType, postedAt,
  options[] { name, values },
  variants[] {
    // cards/quick-add render name, swatch + imagery and price
    // overrides — sku/inventory stay on the PDP query only.
    // NOTE: GROQ comments are // only; a /* */ here broke every
    // query embedding these fields (the site silently fell back)
    name, color, image, hoverImage, price, compareAtPrice
  },
  "thumb": images[0],
  "thumbLqip": images[0].asset->metadata.lqip,
  "hoverImage": images[1],
  "collectionIds": *[_type == "collection" && ^._id in products[]._ref]._id
`;

const lookProductFields = groq`
  _id, title, price, pricing, gender,
  variants[] { name, color, image },
  "thumb": images[0]
`;

const innerSectionFields = groq`
  _key,
  _type,
  colorMode,
  paddingTop,
  paddingBottom,
  eyebrow,
  headline,
  align,
  primaryCta,
  secondaryCta,
  title,
  description,
  items,
  body,
  image,
  source,
  tag,
  ratio,
  mediaKind,
  "imageLqip": image.asset->metadata.lqip,
  "videoUrl": video.asset->url,
  lookProducts[]->{ ${lookProductFields} },
  cards[] {
    _key, title, body, image, mediaKind,
    "videoUrl": video.asset->url
  },
  collection->{ _id, title, type, match, rules, sortOrder },
  products[]->{ ${sliderProductFields} },
  panels[] {
    _key, title, eyebrow, body, image, mediaKind, url,
    showEyebrow, showButton, ctaLabel,
    "videoUrl": video.asset->url,
    lookProducts[]->{ ${lookProductFields} }
  },
  rows[] { _key, label, value },
  stats[] { _key, value, label },
  slides[] {
    _key, image, mediaKind,
    "aspect": image.asset->metadata.dimensions.aspectRatio,
    "videoUrl": video.asset->url,
    lookProducts[]->{ ${lookProductFields} }
  }
`;

/* experiments carry nested section stacks; they cannot nest further,
   so one level of innerSectionFields is exact */
const sectionFields = groq`
  ${innerSectionFields},
  key,
  note,
  variants[] {
    _key,
    label,
    sections[] { ${innerSectionFields} }
  }
`;

/* Products for automatic sliders: filtered by tag, newest post first */
export const productsByTagQuery = groq`
  *[_type == "product" && ${activeFilter} && ($productTag == "all" || $productTag in tags)]
    | order(postedAt desc, _createdAt desc)[0...24] {
    ${sliderProductFields}
  }
`;

/* Products referenced by a manual collection, in the arranged order */
export const collectionProductsQuery = groq`
  *[_type == "collection" && _id == $collectionId][0]
    .products[]->{ ${sliderProductFields} }
`;

/* Smart collections inject a compiled rules filter (see
   buildRulesFilter — fields/operators are whitelisted, values are
   bound params) and an order from COLLECTION_ORDER. */
export const smartCollectionProductsQuery = (filter: string, order: string) => groq`
  *[_type == "product" && ${activeFilter} && ${filter}]
    | order(${order})[0...24] {
    ${sliderProductFields}
  }
`;

/* Active automatic price discounts, with enough collection context to
   scope them per product without extra round trips */
export const automaticDiscountsQuery = groq`
  *[_type == "discount" && method == "automatic" && status == "active"
    && type in ["percentage", "fixedAmount"]] {
    _id, title, status, method, type, value, appliesTo, startsAt, endsAt,
    "productIds": products[]._ref,
    collections[]->{ _id, type, match, rules, "productIds": products[]._ref }
  }
`;

/* Product page (PDP): the full product plus its page-builder sections
   and the pairs-well-with references */
export const productBySlugQuery = groq`
  *[_type == "product" && slug.current == $slug && ${activeFilter}][0] {
    ${sliderProductFields},
    description,
    detailLinks[] { _key, label, body },
    images,
    options[] { name, values },
    showFooterTagline,
    seo,
    pairsWellWith[]->{ ${sliderProductFields} },
    sections[] { ${sectionFields} }
  }
`;

/* Collection page: the document with its story cards; products resolve
   separately (smart rules or the manual reference list) */
export const collectionBySlugQuery = groq`
  *[_type == "collection" && slug.current == $slug][0] {
    _id, title, "slug": slug.current, description, image,
    type, match, rules, sortOrder, showFooterTagline,
    seo,
    "parent": parent->{ title, "slug": slug.current },
    subcategories[]->{ _id, title, "slug": slug.current }
  }
`;

/* Story cards tagged for a collection: $keys carries the slug plus its
   parts (mens-pants matches both "mens" and "pants"); "all" matches
   everywhere */
export const storiesForCollectionQuery = groq`
  *[_type == "story" && (count(tags[@ in $keys]) > 0 || "all" in tags)]
    | order(_createdAt asc) {
    _id, title, body, ctaLabel, url, image, placement
  }
`;

/* Chip row: every collection, Shop All first */
export const collectionsListQuery = groq`
  *[_type == "collection" && defined(slug.current)]
    | order(slug.current == "shop-all" desc, title asc) {
    _id, title, "slug": slug.current
  }
`;

export const navigationQuery = groq`
  *[_type == "navigation"][0] {
    items[] {
      _key, title, layout,
      columns[] {
        _key, title,
        links[] { _key, label, url, collection->{ title, "slug": slug.current } }
      },
      products[]->{ _id, title, "thumb": images[0], "hoverImage": images[1] },
      cards[] { _key, title, image, url },
      imageCollection->{ title, image, "slug": slug.current },
      imageTitle, image
    },
    companyLinks[] { _key, label, url, collection->{ title, "slug": slug.current } }
  }
`;

export const storeSettingsQuery = groq`
  *[_type == "storeSettings"][0] {
    currency, locale, showCompareAt, applyAutomaticDiscounts,
    "searchSynonyms": searchSynonyms[].terms
  }
`;

export const pageBySlugQuery = groq`
  *[_type == "page" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    showFooterTagline,
    protected,
    seo,
    sections[] { ${sectionFields} },
    heroImage,
    body
  }
`;

// gate check only — never include this in a render projection (the
// value would serialize into client props / preview payloads)
export const pagePassphraseQuery = groq`
  *[_type == "page" && slug.current == $slug][0].passphrase
`;

// The Legacy page singleton — content only; the page's choreography
// and geometry live in code, and missing fields fall back to the
// built-in design content
export const legacyPageQuery = groq`
  *[_type == "legacyPage"][0] {
    hero { wordLeft, wordRight, image },
    mantraTop { eyebrow, copy, cta },
    gallery {
      cards[] { _key, image, meta },
      textLeft,
      textRight
    },
    mantraBottom { eyebrow, copy, cta },
    slides[] { _key, title, background, media, body },
    mark { eyebrow, copy, image },
    swirl { centerImage, cta }
  }
`;

export const siteSettingsQuery = groq`
  *[_type == "siteSettings"][0] {
    companyName,
    tagline,
    phone,
    email,
    address,
    announcement
  }
`;

// Catalog search: title/vendor/type prefix match plus exact tag.
// Callers pass $q with a trailing * (GROQ match wildcard) and $plain
// as the bare lowercased term.
export const productSearchQuery = groq`
  *[_type == "product" && (!defined(status) || status == "active")
    && (title match $q || vendor match $q || productType match $q || $plain in tags)]
    | order(title asc) [0...24] { ${sliderProductFields} }
`;

export const collectionSearchQuery = groq`
  *[_type == "collection" && defined(slug.current) && title match $q]
    | order(title asc) [0...12] { _id, title, "slug": slug.current }
`;


// ---------- Blog (Honors Journal posts) ----------
export const postBySlugQuery = groq`
  *[_type == "post" && slug.current == $slug][0]{
    title, "slug": slug.current, heroImage, excerpt, body, publishedAt,
    seoTitle,
    seo,
    tags,
    "author": author->{name, role, avatar},
    "categories": categories[]->{title, "slug": slug.current}
  }
`;

// posts sharing any of the current post's categories, newest first
export const relatedPostsQuery = groq`
  *[_type == "post" && slug.current != $slug && defined(slug.current)
    && count((categories[]->slug.current)[@ in $categorySlugs]) > 0]
    | order(publishedAt desc)[0...3]{
    title, "slug": slug.current, heroImage, excerpt, publishedAt,
    "category": categories[0]->title
  }
`;

// ---------- category archives (paginated) ----------
export const postCategoryBySlugQuery = groq`
  *[_type == "postCategory" && slug.current == $slug][0]{
    title, "slug": slug.current, description
  }
`;

export const postsByCategoryQuery = groq`
  *[_type == "post" && defined(slug.current)
    && $slug in categories[]->slug.current]
    | order(publishedAt desc)[$from...$to]{
    title, "slug": slug.current, heroImage, excerpt, publishedAt,
    "author": author->name
  }
`;

export const postsByCategoryCountQuery = groq`
  count(*[_type == "post" && defined(slug.current)
    && $slug in categories[]->slug.current])
`;

// newest posts for the RSS feed
export const rssPostsQuery = groq`
  *[_type == "post" && defined(slug.current) && defined(publishedAt)]
    | order(publishedAt desc)[0...50]{
    title, "slug": slug.current, excerpt, publishedAt, tags,
    "categories": categories[]->title,
    "author": author->name
  }
`;

// landing-stream cards: newest posts with their first category slug
export const journalPostsQuery = groq`
  *[_type == "post" && defined(slug.current) && defined(heroImage)]
    | order(publishedAt desc)[0...24]{
    title, "slug": slug.current, heroImage,
    "category": categories[0]->slug.current
  }
`;

export const postSlugsQuery = groq`
  *[_type == "post" && defined(slug.current)].slug.current
`;
