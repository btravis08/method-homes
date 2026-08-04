"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { MEDIA_EASE } from "@/components/home/AnimatedMedia";
import { ArrowButton, ArrowLink, ArrowSwap } from "@/components/home/ArrowHover";
import { ProductCard } from "@/components/home/ProductCard";
import type { ProductCardData } from "@/components/home/ProductCard";
import { ArrowRight, ArrowUpRight, Close, FilterLines, Plus } from "@/components/icons";
import { SmartLink } from "@/components/SmartLink";
import { useMdUp } from "@/components/useMdUp";

/*
  Client half of the PLP: the FILTER & SORT row (comp 33416:33779),
  the Flexible Modal filter panel (33453:76463 / applied 33454:77058,
  groups from the Filter set 33187:6859), the product grid with story
  tiles, and a working LOAD MORE. The grid only ever shows complete
  rows: counts are trimmed so the 4-column desktop grid (stories span
  2×3) and the 2-column mobile grid both end on a full row, on load
  and after every filter change or load-more.
*/

export interface StoryData {
  title?: string;
  body?: string;
  ctaLabel?: string;
  url?: string;
  image?: string;
  placement?: "auto" | "center";
}

/* filterable facets carried alongside each card */
export interface CardMeta {
  productType?: string;
  gender?: string;
  price?: number;
  sizes?: string[];
  colors?: Array<{ label: string; hex?: string }>;
  postedAt?: string;
}

export interface ExplorerItem {
  card: ProductCardData;
  meta: CardMeta;
}

type SortKey = "new" | "trending" | "priceAsc" | "priceDesc";

interface FilterState {
  types: string[];
  genders: string[];
  sizes: string[];
  colors: string[];
}

const EMPTY_FILTERS: FilterState = { types: [], genders: [], sizes: [], colors: [] };

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "new", label: "NEW IN" },
  { key: "trending", label: "TRENDING" },
  { key: "priceAsc", label: "$ LOW TO HIGH" },
  { key: "priceDesc", label: "$ HIGH TO LOW" },
];

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];

const INITIAL_COUNT = 24;
const LOAD_STEP = 12;

/* ---------- helpers ---------- */

const appliedCount = (f: FilterState) =>
  f.types.length + f.genders.length + f.sizes.length + f.colors.length;

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

function matches(item: ExplorerItem, f: FilterState): boolean {
  const { meta } = item;
  if (f.types.length && !f.types.includes(meta.productType ?? "")) return false;
  if (f.genders.length && !f.genders.includes(meta.gender ?? "")) return false;
  if (f.sizes.length && !f.sizes.some((s) => (meta.sizes ?? []).includes(s)))
    return false;
  if (
    f.colors.length &&
    !f.colors.some((c) => (meta.colors ?? []).some((mc) => mc.label === c))
  )
    return false;
  return true;
}

function sortItems(items: ExplorerItem[], sort: SortKey | null): ExplorerItem[] {
  const price = (item: ExplorerItem) =>
    typeof item.meta.price === "number" ? item.meta.price : Infinity;
  switch (sort) {
    case "new":
      return [...items].sort(
        (a, b) =>
          Date.parse(b.meta.postedAt ?? "0") - Date.parse(a.meta.postedAt ?? "0"),
      );
    case "priceAsc":
      return [...items].sort((a, b) => price(a) - price(b));
    case "priceDesc":
      return [...items].sort((a, b) => price(b) - price(a));
    default:
      /* trending keeps the collection's arranged order */
      return items;
  }
}

/* Stories render only while >= 6 products remain beside them — mirror
   of the render pattern below */
function storiesShown(count: number, storyTotal: number): number {
  let p = 4;
  let s = 0;
  while (s < storyTotal && count - p >= 6) {
    p += 6;
    s += 1;
    if (s < storyTotal) p += 8;
  }
  return s;
}

/* Largest n <= target where every grid row is complete: products are
   1 cell, a story tile is 6 cells (2 cols x 3 rows) on desktop, and
   the 4-column grid closes when total cells % 4 == 0 (which also
   keeps the 2-column mobile grid even). Collections smaller than one
   row show everything — there is nothing to complete against. */
function fullRowCount(target: number, storyTotal: number): number {
  if (target <= 4) return target;
  for (let n = target; n >= 4; n -= 1) {
    if ((n + 6 * storiesShown(n, storyTotal)) % 4 === 0) return n;
  }
  return target;
}

const chip = (selected: boolean) =>
  `label flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-xs px-3 font-medium transition-colors ${
    selected ? "bg-btn text-btn-fg" : "bg-surface-2 text-ink hover:bg-[#cacbc8]"
  }`;

/* ---------- shared pills ---------- */

function CtaPill({
  label,
  href,
  variant = "primary",
  down = false,
  onClick,
}: {
  label: string;
  href?: string;
  variant?: "primary" | "secondary";
  down?: boolean;
  onClick?: () => void;
}) {
  const className = `label flex h-10 w-fit shrink-0 items-center gap-3 whitespace-nowrap rounded-xs px-3.5 font-medium ${
    variant === "secondary" ? "bg-wash text-ink" : "bg-btn text-btn-fg"
  }`;
  const arrow =
    variant === "secondary" ? (
      <ArrowSwap dx={1} dy={-1}>
        <ArrowUpRight />
      </ArrowSwap>
    ) : (
      <ArrowSwap dx={down ? 0 : 1} dy={down ? 1 : 0}>
        <ArrowRight className={down ? "rotate-90" : undefined} />
      </ArrowSwap>
    );
  if (onClick)
    return (
      <ArrowButton type="button" onClick={onClick} className={className}>
        {label.toUpperCase()}
        {arrow}
      </ArrowButton>
    );
  return (
    <ArrowLink href={href ?? "#"} className={className}>
      {label.toUpperCase()}
      {arrow}
    </ArrowLink>
  );
}

/* ---------- story tile ---------- */

/* Editorial tile (Story Card V2 33795:57807). Desktop: spans 2 cols x
   3 rows, the inner block sticks while products scroll past. Mobile:
   full-width with a square image, 16px-padded full-width text, and
   the CTA right-aligned below. The imagery is dark-mode content, so
   the media wrapper carries data-mode="dark" for the fixed mobile
   bar to sample and invert against. */
function StoryTile({
  story,
  position,
}: {
  story: StoryData;
  position: "left" | "right" | "center";
}) {
  const columnStart =
    position === "right" ? "lg:col-start-3" : position === "center" ? "lg:col-start-2" : "";
  return (
    <div className={`col-span-2 lg:row-span-3 ${columnStart}`}>
      <div className="sticky top-0 flex flex-col bg-surface pb-16 lg:pb-0">
        <SmartLink
          href={story.url ?? "#"}
          data-mode="dark"
          className="group block overflow-hidden"
        >
          <div
            aria-hidden
            className="aspect-square w-full bg-surface-2 bg-cover bg-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 lg:aspect-[4/3]"
            style={story.image ? { backgroundImage: `url(${story.image})` } : undefined}
          />
        </SmartLink>
        {/* mobile: stacked, full-width text, CTA right-aligned below;
            desktop: text left, button top-aligned right */}
        <div className="flex flex-col gap-16 p-4 lg:flex-row lg:items-start lg:justify-between lg:gap-16 lg:p-6">
          {/* explicit width: the Figma --spacing scale shadows Tailwind's
              named container sizes, so max-w-md would compute to 8px */}
          <div className="flex flex-col gap-[1.125rem] lg:max-w-[28rem]">
            <p className="font-display text-title-xs capitalize text-ink">{story.title}</p>
            {story.body && <p className="text-body-sm text-ink-2">{story.body}</p>}
          </div>
          <div className="self-end lg:self-start">
            <CtaPill
              label={story.ctaLabel ?? "Explore the Collection"}
              href={story.url ?? "#"}
              variant="secondary"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- filter panel ---------- */

function FilterGroup({
  title,
  children,
  more,
  onMore,
}: {
  title: string;
  children: React.ReactNode;
  more?: boolean;
  onMore?: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 border-t border-line p-4 md:p-6">
      <p className="text-body-md font-medium text-ink">{title}</p>
      {children}
      {more && (
        <button
          type="button"
          onClick={onMore}
          className="label flex w-fit items-center gap-1.5 font-medium text-ink"
        >
          <span className="underline underline-offset-4">LOAD MORE</span>
          <Plus size={12} />
        </button>
      )}
    </div>
  );
}

function FilterPanel({
  open,
  onClose,
  items,
  facets,
  applied,
  sort,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  items: ExplorerItem[];
  facets: {
    types: string[];
    genders: string[];
    sizes: string[];
    colors: Array<{ label: string; hex?: string }>;
  };
  applied: FilterState;
  sort: SortKey | null;
  onApply: (filters: FilterState, sort: SortKey | null) => void;
}) {
  const [draft, setDraft] = useState<FilterState>(applied);
  const [draftSort, setDraftSort] = useState<SortKey | null>(sort);
  const mdUp = useMdUp();
  /* per-group visible caps, expanded by each LOAD MORE */
  const [caps, setCaps] = useState({ types: 6, sizes: 6, colors: 5 });

  /* re-seed the draft from the applied state every time it opens */
  useEffect(() => {
    if (open) {
      setDraft(applied);
      setDraftSort(sort);
    }
  }, [open, applied, sort]);

  /* scroll lock + escape while open */
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const resultCount = useMemo(
    () => items.filter((item) => matches(item, draft)).length,
    [items, draft],
  );

  const appliedChips: Array<{ group: keyof FilterState; value: string }> = [
    ...draft.types.map((value) => ({ group: "types" as const, value })),
    ...draft.genders.map((value) => ({ group: "genders" as const, value })),
    ...draft.sizes.map((value) => ({ group: "sizes" as const, value })),
    ...draft.colors.map((value) => ({ group: "colors" as const, value })),
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <m.button
            key="filter-scrim"
            type="button"
            aria-label="Close filters"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [...MEDIA_EASE] }}
            data-nav-overlay
            className="fixed inset-0 z-[80] cursor-default bg-[rgba(29,29,29,0.5)] backdrop-blur-md"
          />
          <m.aside
            key="filter-panel"
            data-mode="light"
            data-nav-overlay
            role="dialog"
            aria-label="Filter & sort"
            /* mobile: rises from the bottom; md+: slides from the left */
            initial={mdUp ? { x: "-100%" } : { y: "100%" }}
            animate={{ x: "0%", y: "0%" }}
            exit={mdUp ? { x: "-100%" } : { y: "100%" }}
            transition={{ duration: 0.6, ease: [...MEDIA_EASE] }}
            className="fixed inset-y-0 left-0 z-[90] flex w-[28.0625rem] max-w-full flex-col bg-surface text-ink"
          >
            {/* header */}
            <div className="flex w-full shrink-0 items-center justify-between p-4 md:p-6">
              <p className="label font-medium text-ink">FILTER &amp; SORT</p>
              <button type="button" aria-label="Close" onClick={onClose} className="text-ink">
                <Close size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* applied filters */}
              {appliedChips.length > 0 && (
                <FilterGroup title="Applied Filters">
                  <div className="flex flex-wrap gap-2">
                    {appliedChips.map(({ group, value }) => (
                      <button
                        key={`${group}-${value}`}
                        type="button"
                        onClick={() =>
                          setDraft({ ...draft, [group]: toggle(draft[group], value) })
                        }
                        className={chip(false)}
                      >
                        {value.toUpperCase()}
                        <Close size={10} />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraft(EMPTY_FILTERS)}
                    className="label w-fit font-medium text-ink underline underline-offset-4"
                  >
                    CLEAR ALL
                  </button>
                </FilterGroup>
              )}

              {/* sort by */}
              <FilterGroup title="Sort By">
                <div className="flex flex-wrap gap-2">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() =>
                        setDraftSort(draftSort === option.key ? null : option.key)
                      }
                      className={chip(draftSort === option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </FilterGroup>

              {/* product type */}
              {facets.types.length > 0 && (
                <FilterGroup
                  title="Product Type"
                  more={facets.types.length > caps.types}
                  onMore={() => setCaps({ ...caps, types: facets.types.length })}
                >
                  <div className="flex flex-wrap gap-2">
                    {facets.types.slice(0, caps.types).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setDraft({ ...draft, types: toggle(draft.types, type) })}
                        className={`${chip(draft.types.includes(type))} min-w-[7.5rem]`}
                      >
                        {type.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </FilterGroup>
              )}

              {/* gender */}
              {facets.genders.length > 0 && (
                <FilterGroup title="Gender">
                  <div className="flex flex-wrap gap-2">
                    {facets.genders.map((gender) => (
                      <button
                        key={gender}
                        type="button"
                        onClick={() =>
                          setDraft({ ...draft, genders: toggle(draft.genders, gender) })
                        }
                        className={`${chip(draft.genders.includes(gender))} min-w-[6rem]`}
                      >
                        {gender === "mens" ? "MEN" : gender === "womens" ? "WOMEN" : gender.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </FilterGroup>
              )}

              {/* size */}
              {facets.sizes.length > 0 && (
                <FilterGroup
                  title="Size"
                  more={facets.sizes.length > caps.sizes}
                  onMore={() => setCaps({ ...caps, sizes: facets.sizes.length })}
                >
                  <div className="grid grid-cols-3 gap-2">
                    {facets.sizes.slice(0, caps.sizes).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setDraft({ ...draft, sizes: toggle(draft.sizes, size) })}
                        className={`flex items-center justify-center py-4 font-mono text-[0.875rem] uppercase leading-none transition-colors ${
                          draft.sizes.includes(size)
                            ? "bg-btn text-btn-fg"
                            : "bg-surface-2 text-ink hover:bg-[#cacbc8]"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </FilterGroup>
              )}

              {/* color */}
              {facets.colors.length > 0 && (
                <FilterGroup
                  title="Color"
                  more={facets.colors.length > caps.colors}
                  onMore={() => setCaps({ ...caps, colors: facets.colors.length })}
                >
                  <div className="flex flex-col items-start gap-2">
                    {facets.colors.slice(0, caps.colors).map((color) => (
                      <button
                        key={color.label}
                        type="button"
                        onClick={() =>
                          setDraft({ ...draft, colors: toggle(draft.colors, color.label) })
                        }
                        className={`label flex items-center gap-1.5 rounded-xs border bg-surface px-4 py-3 font-medium text-ink transition-colors ${
                          draft.colors.includes(color.label) ? "border-ink" : "border-line"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="size-3 rounded-full border border-line-2"
                          style={{ backgroundColor: color.hex ?? "#e1e1de" }}
                        />
                        {color.label.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </FilterGroup>
              )}
            </div>

            {/* view results */}
            <div className="shrink-0 border-t border-line bg-surface p-4 md:p-6">
              <button
                type="button"
                onClick={() => {
                  onApply(draft, draftSort);
                  onClose();
                }}
                className="flex h-[2.875rem] w-full items-center justify-center rounded-xs bg-btn font-mono text-[0.875rem] uppercase leading-none text-btn-fg md:h-12"
              >
                View Results [{resultCount}]
              </button>
            </div>
          </m.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------- grid ---------- */

/* Grid pattern: one row of four products, then a story row (story
   spans 2 cols x 3 rows with six products in the 2x3 beside it — only
   when six remain, so it always has a full column to stick against),
   then at least two full product rows before the next story. */
function CollectionGrid({
  cards,
  stories,
}: {
  cards: ProductCardData[];
  stories: StoryData[];
}) {
  const cells: React.ReactNode[] = [];
  let p = 0;
  let s = 0;
  let side = 0; // alternation counter for auto-placed stories
  const pushProducts = (count: number) => {
    for (const card of cards.slice(p, p + count)) {
      cells.push(<ProductCard key={card._key} product={card} />);
    }
    p += count;
  };
  pushProducts(4); // opening row
  while (s < stories.length && cards.length - p >= 6) {
    const story = stories[s];
    const position =
      story.placement === "center"
        ? "center"
        : ((side++ % 2 === 1 ? "right" : "left") as "left" | "right");
    cells.push(<StoryTile key={`story-${s}`} story={story} position={position} />);
    pushProducts(6); // the 2x3 beside (or around) the story
    s += 1;
    if (s < stories.length) pushProducts(8); // >=2 rows between stories
  }
  pushProducts(cards.length - p); // remainder
  return (
    /* dense flow: a right/center story tile starts at a later column,
       and default auto-placement never backtracks — the cells above-
       left of it would stay empty; dense backfills them with the next
       products (all product cells are 1x1, so order stays sensible) */
    <div className="grid grid-flow-row-dense grid-cols-2 gap-px overflow-x-clip lg:grid-cols-4">
      {cells}
    </div>
  );
}

/* ---------- explorer ---------- */

export function CollectionExplorer({
  items,
  stories,
}: {
  items: ExplorerItem[];
  stories: StoryData[];
}) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [visibleTarget, setVisibleTarget] = useState(INITIAL_COUNT);

  /* facet options come from the catalog itself */
  const facets = useMemo(() => {
    const types = new Set<string>();
    const genders = new Set<string>();
    const sizes = new Set<string>();
    const colors = new Map<string, string | undefined>();
    for (const item of items) {
      if (item.meta.productType) types.add(item.meta.productType);
      if (item.meta.gender) genders.add(item.meta.gender);
      for (const size of item.meta.sizes ?? []) sizes.add(size);
      for (const color of item.meta.colors ?? [])
        if (!colors.has(color.label)) colors.set(color.label, color.hex);
    }
    const sizeRank = (size: string) => {
      const i = SIZE_ORDER.indexOf(size.toUpperCase());
      if (i !== -1) return i;
      const n = parseFloat(size);
      return Number.isNaN(n) ? 100 : 10 + n / 100;
    };
    return {
      types: [...types].sort(),
      genders: [...genders].sort(),
      sizes: [...sizes].sort((a, b) => sizeRank(a) - sizeRank(b)),
      colors: [...colors].map(([label, hex]) => ({ label, hex })),
    };
  }, [items]);

  const filtered = useMemo(
    () => sortItems(items.filter((item) => matches(item, filters)), sort),
    [items, filters, sort],
  );

  const storyList = appliedCount(filters) === 0 ? stories : [];
  const maxShown = fullRowCount(filtered.length, storyList.length);
  const shown = fullRowCount(Math.min(visibleTarget, filtered.length), storyList.length);
  const cards = filtered.slice(0, shown).map((item) => item.card);

  const apply = (next: FilterState, nextSort: SortKey | null) => {
    setFilters(next);
    setSort(nextSort);
    setVisibleTarget(INITIAL_COUNT);
  };

  const removeApplied = (group: keyof FilterState, value: string) =>
    apply({ ...filters, [group]: toggle(filters[group], value) }, sort);

  const appliedChips: Array<{ group: keyof FilterState; value: string }> = [
    ...filters.types.map((value) => ({ group: "types" as const, value })),
    ...filters.genders.map((value) => ({ group: "genders" as const, value })),
    ...filters.sizes.map((value) => ({ group: "sizes" as const, value })),
    ...filters.colors.map((value) => ({ group: "colors" as const, value })),
  ];

  return (
    <>
      {/* filter & count row (comp 33416:33779) */}
      <div className="label flex w-full items-center justify-between px-4 py-8 font-medium text-ink md:px-6">
        <div className="flex items-center gap-3 md:gap-8">
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
          >
            FILTER &amp; SORT
            <FilterLines size={10} />
          </button>
          {/* desktop/tablet: applied chips inline; mobile: count chip */}
          {appliedChips.length > 0 && (
            <>
              <div className="hidden items-center gap-3 md:flex">
                {appliedChips.map(({ group, value }) => (
                  <button
                    key={`${group}-${value}`}
                    type="button"
                    onClick={() => removeApplied(group, value)}
                    className={chip(false)}
                  >
                    {value === "mens" ? "MEN" : value === "womens" ? "WOMEN" : value.toUpperCase()}
                    <Close size={10} />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => apply(EMPTY_FILTERS, sort)}
                  className={chip(false)}
                >
                  CLEAR
                  <Close size={10} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className={`${chip(false)} md:hidden`}
              >
                {appliedChips.length}
              </button>
            </>
          )}
        </div>
        <p>{filtered.length} RESULTS</p>
      </div>

      <CollectionGrid cards={cards} stories={storyList} />

      {/* load more — only while more complete rows remain */}
      {shown < maxShown && (
        <div className="flex w-full justify-center py-14">
          <CtaPill
            label="Load More Products"
            down
            onClick={() => setVisibleTarget((count) => count + LOAD_STEP)}
          />
        </div>
      )}
      {shown >= maxShown && <div className="pb-14" />}

      <FilterPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        items={items}
        facets={facets}
        applied={filters}
        sort={sort}
        onApply={apply}
      />
    </>
  );
}
