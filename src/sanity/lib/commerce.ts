import type {
  CollectionRule,
  CollectionSort,
  Discount,
  SliderProduct,
  StoreSettings,
} from "@/sanity/types";

/*
  Commerce helpers: price formatting from store settings, smart
  collection rules (compiled to GROQ for fetching, evaluated in JS for
  discount scoping), and automatic-discount price resolution — the
  best (cheapest) discount wins, like Shopify.
*/

export function formatPrice(
  amount: number | string | undefined,
  settings?: StoreSettings | null,
): string | undefined {
  if (amount == null) return undefined;
  // legacy seed data stored display strings like "$198.00"
  if (typeof amount === "string") return amount;
  try {
    return new Intl.NumberFormat(settings?.locale ?? "en-US", {
      style: "currency",
      currency: settings?.currency ?? "USD",
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

/* Base price of a product (new numeric model, else legacy string) */
export function basePrice(product: SliderProduct): number | string | undefined {
  return product.pricing?.price ?? product.price;
}

/* ---------- smart collection rules ---------- */

/* Compile whitelisted rules into a parameterized GROQ filter — field
   and operator come from fixed maps, values are always bound params */
export function buildRulesFilter(
  rules: CollectionRule[],
  match: "all" | "any" = "all",
): { filter: string; params: Record<string, string | number> } {
  const params: Record<string, string | number> = {};
  const clauses = rules
    .map((rule, i) => {
      const param = `rv${i}`;
      const op = rule.operator ?? "eq";
      const raw = rule.value ?? "";
      switch (rule.field) {
        case "tag": {
          params[param] = raw;
          return op === "neq" ? `!($${param} in tags)` : `$${param} in tags`;
        }
        case "gender":
        case "vendor":
        case "productType": {
          params[param] = raw;
          if (op === "neq") return `${rule.field} != $${param}`;
          if (op === "contains") return `${rule.field} match $${param}`;
          return `${rule.field} == $${param}`;
        }
        case "title": {
          params[param] = op === "contains" ? `*${raw}*` : raw;
          if (op === "neq") return `title != $${param}`;
          if (op === "contains") return `title match $${param}`;
          return `title == $${param}`;
        }
        case "price": {
          const num = Number(raw);
          if (Number.isNaN(num)) return null;
          params[param] = num;
          if (op === "gt") return `pricing.price > $${param}`;
          if (op === "lt") return `pricing.price < $${param}`;
          if (op === "neq") return `pricing.price != $${param}`;
          return `pricing.price == $${param}`;
        }
        default:
          return null;
      }
    })
    .filter((clause): clause is string => Boolean(clause));
  const joiner = match === "any" ? " || " : " && ";
  return { filter: clauses.length ? `(${clauses.join(joiner)})` : "true", params };
}

export const COLLECTION_ORDER: Record<CollectionSort, string> = {
  newest: "postedAt desc, _createdAt desc",
  priceAsc: "pricing.price asc",
  priceDesc: "pricing.price desc",
  titleAsc: "title asc",
  manual: "postedAt desc", // manual order comes from the reference array
};

/* Evaluate the same rules in JS (used to scope discounts to smart
   collections without another round trip) */
export function productMatchesRules(
  product: SliderProduct,
  rules: CollectionRule[],
  match: "all" | "any" = "all",
): boolean {
  if (!rules.length) return false;
  const results = rules.map((rule) => {
    const op = rule.operator ?? "eq";
    const raw = rule.value ?? "";
    switch (rule.field) {
      case "tag": {
        const has = (product.tags ?? []).includes(raw);
        return op === "neq" ? !has : has;
      }
      case "gender":
      case "vendor":
      case "productType": {
        const actual = product[rule.field] ?? "";
        if (op === "neq") return actual !== raw;
        if (op === "contains")
          return actual.toLowerCase().includes(raw.toLowerCase());
        return actual === raw;
      }
      case "title": {
        const actual = product.title ?? "";
        if (op === "neq") return actual !== raw;
        if (op === "contains")
          return actual.toLowerCase().includes(raw.toLowerCase());
        return actual === raw;
      }
      case "price": {
        const num = Number(raw);
        const actual = product.pricing?.price;
        if (Number.isNaN(num) || actual == null) return false;
        if (op === "gt") return actual > num;
        if (op === "lt") return actual < num;
        if (op === "neq") return actual !== num;
        return actual === num;
      }
      default:
        return false;
    }
  });
  return match === "any" ? results.some(Boolean) : results.every(Boolean);
}

/* ---------- automatic discounts ---------- */

function discountInWindow(discount: Discount, now: Date): boolean {
  if (discount.startsAt && new Date(discount.startsAt) > now) return false;
  if (discount.endsAt && new Date(discount.endsAt) <= now) return false;
  return true;
}

function discountCovers(discount: Discount, product: SliderProduct): boolean {
  if (discount.appliesTo === "products")
    return (discount.productIds ?? []).includes(product._id);
  if (discount.appliesTo === "collections")
    return (discount.collections ?? []).some((collection) => {
      if (!collection) return false;
      if (collection.type === "smart")
        return productMatchesRules(
          product,
          collection.rules ?? [],
          collection.match ?? "all",
        );
      return (
        (collection.productIds ?? []).includes(product._id) ||
        (product.collectionIds ?? []).includes(collection._id)
      );
    });
  return true; // "all"
}

function applyDiscount(price: number, discount: Discount): number {
  if (discount.type === "percentage")
    return Math.max(0, price * (1 - (discount.value ?? 0) / 100));
  if (discount.type === "fixedAmount")
    return Math.max(0, price - (discount.value ?? 0));
  return price;
}

/* Resolve what a numeric price displays as after the best active
   automatic discount. Returns the final price and, when discounted or
   on compare-at sale, the original to strike through. */
export function resolveDisplayPrice(
  price: number | string | undefined,
  compareAt: number | undefined,
  product: SliderProduct,
  discounts: Discount[],
  settings?: StoreSettings | null,
): { price?: string; compareAt?: string } {
  if (typeof price !== "number") {
    return { price: formatPrice(price, settings) };
  }
  let final = price;
  if (settings?.applyAutomaticDiscounts !== false) {
    const now = new Date();
    for (const discount of discounts) {
      if (discount.method !== "automatic" || discount.status !== "active") continue;
      if (discount.type !== "percentage" && discount.type !== "fixedAmount") continue;
      if (!discountInWindow(discount, now)) continue;
      if (!discountCovers(discount, product)) continue;
      final = Math.min(final, applyDiscount(price, discount));
    }
  }
  const showCompare = settings?.showCompareAt !== false;
  const original =
    final < price ? price : showCompare && compareAt && compareAt > price ? compareAt : undefined;
  return {
    price: formatPrice(final, settings),
    compareAt: original != null ? formatPrice(original, settings) : undefined,
  };
}
