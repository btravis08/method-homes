"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/*
  Client-side cart state behind the flyout (Flexible Modal in the
  library): quick-add (size selection), the populated bag, and the
  empty state. Purely presentational commerce for staging — no
  backend; items live in memory.
*/

export interface CartItem {
  id: string;
  title: string;
  price: number;
  image?: string;
  color?: string;
  size?: string;
  qty: number;
}

export interface QuickAddProduct {
  title: string;
  price?: string;
  image?: string;
  variants?: Array<{ name?: string; color?: string; image?: string }>;
  sizes?: string[];
}

export interface CartRecommendation {
  title: string;
  price?: string;
  image?: string;
  color?: string;
}

export type CartView = "quickAdd" | "cart";

interface CartState {
  items: CartItem[];
  count: number;
  subtotal: number;
  isOpen: boolean;
  view: CartView;
  quickAdd: QuickAddProduct | null;
  /* the size chosen in the quick-add flyout; populates the SIZE
     inputs ("SELECT" until chosen) */
  quickAddSize: string | null;
  setQuickAddSize: (size: string | null) => void;
  recommended: CartRecommendation[];
  openQuickAdd: (product: QuickAddProduct) => void;
  openCart: () => void;
  close: () => void;
  addItem: (item: Omit<CartItem, "qty" | "id">) => void;
  setQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  setRecommended: (items: CartRecommendation[]) => void;
}

export function parsePrice(price?: string): number {
  if (!price) return 0;
  return Number(price.replace(/[^0-9.]/g, "")) || 0;
}

export function formatPrice(value: number): string {
  return `$${value.toFixed(2).replace(/\.00$/, "")}`;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<CartView>("cart");
  const [quickAdd, setQuickAdd] = useState<QuickAddProduct | null>(null);
  const [quickAddSize, setQuickAddSize] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<CartRecommendation[]>([]);

  const openQuickAdd = useCallback((product: QuickAddProduct) => {
    setQuickAdd((prev) => {
      if (prev?.title !== product.title) setQuickAddSize(null);
      return product;
    });
    setView("quickAdd");
    setIsOpen(true);
  }, []);

  const openCart = useCallback(() => {
    setView("cart");
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const addItem = useCallback((item: Omit<CartItem, "qty" | "id">) => {
    const id = [item.title, item.color, item.size].filter(Boolean).join("|");
    setItems((prev) => {
      const existing = prev.find((entry) => entry.id === id);
      if (existing) {
        return prev.map((entry) =>
          entry.id === id ? { ...entry, qty: entry.qty + 1 } : entry,
        );
      }
      return [...prev, { ...item, id, qty: 1 }];
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((entry) => entry.id !== id)
        : prev.map((entry) => (entry.id === id ? { ...entry, qty } : entry)),
    );
  }, []);

  const removeItem = useCallback(
    (id: string) => setItems((prev) => prev.filter((entry) => entry.id !== id)),
    [],
  );

  const value = useMemo<CartState>(() => {
    const count = items.reduce((sum, entry) => sum + entry.qty, 0);
    const subtotal = items.reduce((sum, entry) => sum + entry.price * entry.qty, 0);
    return {
      items,
      count,
      subtotal,
      isOpen,
      view,
      quickAdd,
      quickAddSize,
      setQuickAddSize,
      recommended,
      openQuickAdd,
      openCart,
      close,
      addItem,
      setQty,
      removeItem,
      setRecommended,
    };
  }, [
    items,
    isOpen,
    view,
    quickAdd,
    quickAddSize,
    recommended,
    openQuickAdd,
    openCart,
    close,
    addItem,
    setQty,
    removeItem,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

const noop = () => {};

/* safe default so components render even outside the provider */
const FALLBACK: CartState = {
  items: [],
  count: 0,
  subtotal: 0,
  isOpen: false,
  view: "cart",
  quickAdd: null,
  quickAddSize: null,
  setQuickAddSize: noop,
  recommended: [],
  openQuickAdd: noop,
  openCart: noop,
  close: noop,
  addItem: noop,
  setQty: noop,
  removeItem: noop,
  setRecommended: noop,
};

export function useCart(): CartState {
  return useContext(CartContext) ?? FALLBACK;
}

/* Rendered by pages that carry contextual products (the PDP's pairs
   rail) so the cart can show "Customers also bought" */
export function RegisterCartRecommendations({
  items,
}: {
  items: CartRecommendation[];
}) {
  const { setRecommended } = useCart();
  const key = JSON.stringify(items);
  useEffect(() => {
    setRecommended(JSON.parse(key) as CartRecommendation[]);
    return () => setRecommended([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setRecommended]);
  return null;
}
