import type { PortableTextBlock } from "next-sanity";
import type { SanityImageSource } from "@sanity/image-url";

export type ProjectCategory = "residential" | "predesigned" | "commercial";

export interface ProjectTestimonial {
  quote?: string;
  clientName?: string;
  clientDetail?: string;
  date?: string;
  rating?: number;
}

export interface Project {
  _id: string;
  _updatedAt?: string;
  title: string;
  slug: string;
  category: ProjectCategory;
  featured?: boolean;
  summary?: string;
  mainImage?: SanityImageSource & { alt?: string };
  gallery?: Array<SanityImageSource & { _key: string; alt?: string }>;
  location?: string;
  squareFeet?: number;
  bedrooms?: number;
  bathrooms?: number;
  completedYear?: number;
  /* case-study facts (AEO play 7): the series it was built from, the
     module count, contract-to-keys months, an optional cost band, and
     the site's coordinates for House.geo */
  series?: string;
  modules?: number;
  timelineMonths?: number;
  costBand?: string;
  geo?: { lat?: number; lng?: number } | null;
  challenge?: string;
  approach?: string;
  testimonial?: ProjectTestimonial | null;
  plans?: Array<{ _key: string; label?: string; url?: string; size?: number }>;
  body?: PortableTextBlock[];
}

export type ColorMode = "light" | "light-mid" | "dark-mid" | "dark";

export type SectionPad = "none" | "s" | "m" | "l";

interface SectionBase {
  _key: string;
  colorMode?: ColorMode;
  /* base64 blur preview of the section's main image (LQIP) */
  imageLqip?: string;
  /* vertical spacing around the section: 0 / 32 / 48 / 96 */
  paddingTop?: SectionPad;
  paddingBottom?: SectionPad;
  /* in-page anchor id (Sub-nav target), set on the wrapper */
  anchor?: string;
}

export interface SectionHero extends SectionBase {
  _type: "sectionHero";
  eyebrow?: string;
  headline?: string;
  align?: "left" | "center";
  primaryCta?: string;
  secondaryCta?: string;
  image?: SanityImageSource;
  /* restricted media block: image or autoplay video */
  mediaKind?: MediaKind;
  videoUrl?: string;
}

export type MediaKind = "image" | "look" | "videoPlayer" | "videoAutoplay" | "text";

/* Shared media-block fields: a media slot is an image or a video with
   a behavior (static / shop the look / click to play / autoplay) */
export interface MediaBlockFields {
  mediaKind?: MediaKind;
  videoUrl?: string;
  lookProducts?: Array<SliderProduct | null>;
}

export interface SectionFullWidth extends SectionBase, MediaBlockFields {
  _type: "sectionFullWidth";
  eyebrow?: string;
  headline?: string;
  align?: "left" | "center";
  primaryCta?: string;
  secondaryCta?: string;
  image?: SanityImageSource;
}

export interface SectionInfoSlider extends SectionBase {
  _type: "sectionInfoSlider";
  title?: string;
  cards?: Array<{
    _key: string;
    title?: string;
    body?: string;
    image?: SanityImageSource;
    mediaKind?: MediaKind;
    videoUrl?: string;
  }>;
}

export type ProductGender = "mens" | "womens";
export type ProductStatus = "active" | "draft" | "archived";

export interface ProductPricing {
  price?: number;
  compareAtPrice?: number;
  costPerItem?: number;
  chargeTax?: boolean;
}

export interface VariantInventory {
  track?: boolean;
  quantity?: number;
  continueSelling?: boolean;
}

export interface ProductVariant {
  name?: string;
  color?: string;
  image?: SanityImageSource;
  hoverImage?: SanityImageSource;
  selectedOptions?: Array<{ option?: string; value?: string }>;
  price?: number;
  compareAtPrice?: number;
  sku?: string;
  barcode?: string;
  inventory?: VariantInventory;
}

export interface SliderProduct {
  _id: string;
  title?: string;
  slug?: string;
  /* legacy display string from the first content model */
  price?: string;
  pricing?: ProductPricing;
  status?: ProductStatus;
  gender?: ProductGender;
  tags?: string[];
  vendor?: string;
  productType?: string;
  postedAt?: string;
  options?: Array<{ name?: string; values?: string[] }>;
  variants?: ProductVariant[];
  thumb?: SanityImageSource;
  thumbLqip?: string;
  hoverImage?: SanityImageSource;
  /* manual collections this product belongs to (reverse lookup) */
  collectionIds?: string[];
}

/* shared SEO object (page/post/product/collection) */
export interface SeoDoc {
  title?: string | null;
  description?: string | null;
  ogImage?: SanityImageSource | null;
  noindex?: boolean | null;
  canonical?: string | null;
}

/* Full product for the PDP: the slider shape plus page content */
export interface ProductFull extends SliderProduct {
  seo?: SeoDoc | null;
  description?: PortableTextBlock[];
  /* links under the description; each opens the specifications drawer */
  detailLinks?: Array<{ _key?: string; label?: string; body?: PortableTextBlock[] }>;
  images?: SanityImageSource[];
  options?: Array<{ name?: string; values?: string[] }>;
  showFooterTagline?: boolean;
  pairsWellWith?: Array<SliderProduct | null>;
  sections?: PageSection[];
}

export type CollectionRuleField =
  | "tag"
  | "gender"
  | "vendor"
  | "productType"
  | "title"
  | "price";
export type CollectionRuleOperator = "eq" | "neq" | "contains" | "gt" | "lt";

export interface CollectionRule {
  field?: CollectionRuleField;
  operator?: CollectionRuleOperator;
  value?: string;
}

export type CollectionSort = "newest" | "priceAsc" | "priceDesc" | "titleAsc" | "manual";

export interface StoryDoc {
  _id?: string;
  title?: string;
  body?: string;
  ctaLabel?: string;
  url?: string;
  image?: SanityImageSource;
  placement?: "auto" | "center";
  tags?: string[];
}

export interface CollectionDoc {
  _id: string;
  title?: string;
  slug?: string;
  description?: string;
  image?: SanityImageSource;
  type?: "manual" | "smart";
  match?: "all" | "any";
  rules?: CollectionRule[];
  sortOrder?: CollectionSort;
  showFooterTagline?: boolean;
  seo?: SeoDoc | null;
  products?: Array<SliderProduct | null>;
  parent?: { title?: string; slug?: string } | null;
  subcategories?: Array<{ _id: string; title?: string; slug?: string } | null>;
  /* light form used inside discounts */
  productIds?: string[];
}

export type DiscountType = "percentage" | "fixedAmount" | "buyXGetY" | "freeShipping";

export interface Discount {
  _id: string;
  title?: string;
  status?: "active" | "draft";
  method?: "code" | "automatic";
  code?: string;
  type?: DiscountType;
  value?: number;
  appliesTo?: "all" | "collections" | "products";
  productIds?: string[];
  collections?: CollectionDoc[];
  startsAt?: string;
  endsAt?: string;
}

export interface StoreSettings {
  currency?: string;
  locale?: string;
  showCompareAt?: boolean;
  applyAutomaticDiscounts?: boolean;
  /* groups of equivalent search terms, flattened to string arrays */
  searchSynonyms?: string[][];
}

export interface SectionProductSlider extends SectionBase {
  _type: "sectionProductSlider";
  title?: string;
  source?: "auto" | "collection" | "manual";
  tag?: string;
  collection?: CollectionDoc | null;
  products?: Array<SliderProduct | null>;
}

export interface CarouselItem {
  _key?: string;
  title?: string;
  description?: string;
  image?: SanityImageSource;
}

export interface SectionCarousel extends SectionBase {
  _type: "sectionCarousel";
  eyebrow?: string;
  /* strings are legacy data from before items carried image/description */
  items?: Array<string | CarouselItem>;
  description?: string;
  image?: SanityImageSource;
}

export interface SectionFiftyFifty extends SectionBase {
  _type: "sectionFiftyFifty";
  ratio?: "5:4" | "1:1" | "flex";
  panels?: Array<
    {
      _key: string;
      title?: string;
      /* image columns: link gates the arrow button + hover */
      url?: string;
      /* text-module columns */
      eyebrow?: string;
      body?: string;
      showEyebrow?: boolean;
      showButton?: boolean;
      ctaLabel?: string;
      image?: SanityImageSource;
    } & MediaBlockFields
  >;
}

export interface SectionTechSpecs extends SectionBase {
  _type: "sectionTechSpecs";
  title?: string;
  rows?: Array<{ _key: string; label?: string; value?: string }>;
  description?: string;
  stats?: Array<{ _key: string; value?: number; label?: string }>;
}

export interface SectionGallery extends SectionBase {
  _type: "sectionGallery";
  title?: string;
  slides?: Array<
    {
      _key: string;
      image?: SanityImageSource;
      /* natural aspect ratio of the image asset (w / h) */
      aspect?: number;
    } & MediaBlockFields
  >;
}

export interface SectionReviews extends SectionBase {
  _type: "sectionReviews";
  title?: string;
}

export interface SectionThreeD extends SectionBase {
  _type: "sectionThreeD";
  title?: string;
  image?: SanityImageSource;
}

export interface SectionRichText extends SectionBase {
  _type: "sectionRichText";
  body?: PortableTextBlock[];
}

export interface FaqItem {
  _key: string;
  question?: string;
  answer?: string;
}

export interface SectionFaq extends SectionBase {
  _type: "sectionFaq";
  eyebrow?: string;
  title?: string;
  intro?: string;
  items?: FaqItem[];
}

export interface SectionLink {
  label?: string;
  url?: string;
}

export interface SourceRef {
  _key: string;
  label?: string;
  url?: string;
  date?: string;
}

export interface SectionTextIntro extends SectionBase {
  _type: "sectionTextIntro";
  eyebrow?: string;
  headline?: string;
  body?: PortableTextBlock[];
  link?: SectionLink | null;
}

export interface StatFact {
  _key: string;
  value?: string;
  label?: string;
  /* 1-based index into sources[] */
  footnote?: number;
}

export interface SectionStats extends SectionBase {
  _type: "sectionStats";
  stats?: StatFact[];
  sources?: SourceRef[];
}

export interface FeatureItem {
  _key: string;
  icon?: SanityImageSource;
  title?: string;
  body?: string;
  link?: SectionLink | null;
}

export interface SectionFeatureList extends SectionBase {
  _type: "sectionFeatureList";
  eyebrow?: string;
  headline?: string;
  columns?: 3 | 4;
  items?: FeatureItem[];
}

export interface SectionCtaBand extends SectionBase {
  _type: "sectionCtaBand";
  headline?: string;
  body?: string;
  ctaPrimary?: SectionLink | null;
  ctaSecondary?: SectionLink | null;
}

export interface GridCard {
  _key: string;
  image?: (SanityImageSource & { alt?: string }) | null;
  eyebrow?: string;
  title?: string;
  body?: string;
  meta?: string;
  url?: string;
}

export interface SectionCardGrid extends SectionBase {
  _type: "sectionCardGrid";
  eyebrow?: string;
  headline?: string;
  link?: SectionLink | null;
  columns?: 2 | 3 | 4;
  cards?: GridCard[];
}

export interface ProcessStep {
  _key: string;
  title?: string;
  body?: string;
  duration?: string;
}

export interface SectionProcess extends SectionBase {
  _type: "sectionProcess";
  eyebrow?: string;
  headline?: string;
  link?: SectionLink | null;
  steps?: ProcessStep[];
}

export interface CompareRow {
  _key: string;
  label?: string;
  cells?: string[];
}

export interface SectionCompare extends SectionBase {
  _type: "sectionCompare";
  eyebrow?: string;
  headline?: string;
  link?: SectionLink | null;
  headers?: string[];
  rows?: CompareRow[];
  sources?: SourceRef[];
}

export interface LinkRow {
  _key: string;
  title?: string;
  description?: string;
  url?: string;
}

export interface SectionLinkList extends SectionBase {
  _type: "sectionLinkList";
  eyebrow?: string;
  headline?: string;
  intro?: string;
  links?: LinkRow[];
}

export type InterstitialKind = "statement" | "image" | "floating" | "word" | "number";

export interface SectionInterstitial extends SectionBase {
  _type: "sectionInterstitial";
  kind?: InterstitialKind;
  text?: string;
  subline?: string;
  image?: (SanityImageSource & { alt?: string; caption?: string }) | null;
  floats?: Array<SanityImageSource & { _key: string; alt?: string }>;
}

export interface SectionHeroPage extends SectionBase {
  _type: "sectionHeroPage";
  headline?: string;
  lede?: string;
  ctaPrimary?: SectionLink | null;
  ctaSecondary?: SectionLink | null;
}

export interface SubNavAnchor {
  _key: string;
  label?: string;
  anchor?: string;
}

export interface SectionSubNav extends SectionBase {
  _type: "sectionSubNav";
  contextName?: string;
  anchors?: SubNavAnchor[];
  cta?: SectionLink | null;
}

export interface SpecRow {
  _key: string;
  label?: string;
  value?: string;
}

export interface SectionSpecTable extends SectionBase {
  _type: "sectionSpecTable";
  eyebrow?: string;
  headline?: string;
  body?: string;
  link?: SectionLink | null;
  rows?: SpecRow[];
}

export interface ExperimentVariant {
  _key: string;
  label?: string;
  sections?: PageSection[];
}

export interface SectionExperiment extends SectionBase {
  _type: "sectionExperiment";
  key?: string;
  note?: string;
  variants?: ExperimentVariant[];
}

export type PageSection =
  | SectionHero
  | SectionFullWidth
  | SectionInfoSlider
  | SectionProductSlider
  | SectionCarousel
  | SectionFiftyFifty
  | SectionRichText
  | SectionTechSpecs
  | SectionGallery
  | SectionReviews
  | SectionThreeD
  | SectionFaq
  | SectionTextIntro
  | SectionStats
  | SectionFeatureList
  | SectionCtaBand
  | SectionCardGrid
  | SectionProcess
  | SectionCompare
  | SectionLinkList
  | SectionInterstitial
  | SectionHeroPage
  | SectionSubNav
  | SectionSpecTable
  | SectionExperiment;

/* ---------- predesigned catalog (series + plans) ---------- */

export interface Range {
  min?: number;
  max?: number;
}

export interface FinishLevel {
  _key: string;
  name?: string;
  tagline?: string;
  from?: number;
  numbers?: { _key?: string; value?: string; label?: string }[];
  includes?: string[];
  optional?: string[];
}

export interface PlanCard {
  _id: string;
  name: string;
  slug: string;
  lede?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  modules?: number;
  stories?: number;
  priceFrom?: number;
  heroImage?: (SanityImageSource & { alt?: string }) | null;
  planImage?: (SanityImageSource & { alt?: string }) | null;
}

export interface Series {
  _id: string;
  _updatedAt?: string;
  name: string;
  slug: string;
  tagline?: string;
  lede?: string;
  heroImage?: (SanityImageSource & { alt?: string }) | null;
  heroLqip?: string;
  body?: PortableTextBlock[];
  gallery?: Array<SanityImageSource & { _key: string; alt?: string; caption?: string; aspect?: number }>;
  architect?: string;
  beds?: Range | null;
  baths?: Range | null;
  sqft?: Range | null;
  modules?: Range | null;
  storiesMax?: number;
  priceFrom?: number;
  priceBand?: string;
  priceNote?: string;
  timelineMonths?: Range | null;
  specs?: SpecRow[];
  finishLevels?: FinishLevel[];
  faq?: FaqItem[];
  sources?: SourceRef[];
  seo?: SeoDoc | null;
  plans?: PlanCard[];
}

export interface Plan extends PlanCard {
  _updatedAt?: string;
  body?: PortableTextBlock[];
  photos?: Array<SanityImageSource & { _key: string; alt?: string; caption?: string; aspect?: number }>;
  dimensions?: { _key: string; label?: string; value?: string }[];
  moduleImage?: SanityImageSource | null;
  pdf?: { url?: string; size?: number; originalFilename?: string } | null;
  seo?: SeoDoc | null;
  series?: {
    _id: string;
    name: string;
    slug: string;
    priceFrom?: number;
    priceBand?: string;
    priceNote?: string;
    timelineMonths?: Range | null;
    /* sibling plans in the same series, for the "other plans" row */
    plans?: PlanCard[];
  } | null;
}

export interface Page {
  _id: string;
  /* last publish — the page's dateModified (visible freshness line +
     WebPage.dateModified) */
  _updatedAt?: string;
  title: string;
  slug: string;
  showFooterTagline?: boolean;
  protected?: boolean;
  seo?: SeoDoc | null;
  sections?: PageSection[];
  heroImage?: SanityImageSource & { alt?: string };
  body?: PortableTextBlock[];
}

/* ---------- navigation ---------- */

export interface NavLinkDoc {
  _key?: string;
  label?: string;
  url?: string;
  collection?: { title?: string; slug?: string } | null;
}

export interface NavColumnDoc {
  _key?: string;
  title?: string;
  links?: NavLinkDoc[];
}

export interface NavProductDoc {
  _id: string;
  title?: string;
  thumb?: SanityImageSource;
  hoverImage?: SanityImageSource;
}

export interface NavCardDoc {
  _key?: string;
  title?: string;
  image?: SanityImageSource;
  url?: string;
}

export interface NavItemDoc {
  _key?: string;
  title?: string;
  layout?: "columns" | "products" | "cards" | "none";
  columns?: NavColumnDoc[];
  products?: Array<NavProductDoc | null>;
  cards?: NavCardDoc[];
  imageCollection?: { title?: string; image?: SanityImageSource; slug?: string } | null;
  imageTitle?: string;
  image?: SanityImageSource;
}

export interface NavigationDoc {
  items?: NavItemDoc[];
  companyLinks?: NavLinkDoc[];
}

export interface SiteSettings {
  companyName?: string;
  tagline?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  sameAs?: string[];
  announcement?: {
    enabled?: boolean;
    text?: string;
    url?: string;
    colorMode?: "light" | "dark";
    dismissible?: boolean;
    startsAt?: string;
    endsAt?: string;
  } | null;
}

/* alias used by the site layout (settings doc as fetched) */
export type SiteSettingsDoc = SiteSettings;

/* The Legacy page singleton (/legacy) — content only; geometry and
   choreography are code-owned with built-in fallbacks per field */
export interface LegacyTextBlockDoc {
  eyebrow?: string;
  copy?: string;
  cta?: string;
}

export interface LegacyGalleryCardDoc {
  _key?: string;
  image?: SanityImageSource;
  meta?: string;
}

export interface LegacySlideDoc {
  _key?: string;
  title?: string;
  background?: SanityImageSource;
  media?: SanityImageSource;
  body?: string;
}

export interface LegacyPageDoc {
  hero?: { wordLeft?: string; wordRight?: string; image?: SanityImageSource };
  mantraTop?: LegacyTextBlockDoc;
  gallery?: {
    cards?: LegacyGalleryCardDoc[];
    textLeft?: string;
    textRight?: string;
  };
  mantraBottom?: LegacyTextBlockDoc;
  slides?: LegacySlideDoc[];
  mark?: { eyebrow?: string; copy?: string; image?: SanityImageSource };
  swirl?: { centerImage?: SanityImageSource; cta?: string };
}
