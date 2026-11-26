import { useSyncExternalStore } from "react";
import { session } from "../../shared/api/client";
import type { Listing } from "../../types";
export function cartKey() {
  return `janjaemi:cart:${session("buyer")?.company.id ?? "guest"}`;
}
export function readCart(): Listing[] {
  try {
    return JSON.parse(localStorage.getItem(cartKey()) ?? "[]") as Listing[];
  } catch {
    return [];
  }
}
export function addCart(l: Listing) {
  const cart = readCart();
  if (!cart.some((x) => x.id === l.id)) writeCart([...cart, l]);
}

export function writeCart(items: Listing[]) {
  localStorage.setItem(cartKey(), JSON.stringify(items));
  window.dispatchEvent(new Event("janjaemi-cart"));
}

const subscribe = (listener: () => void) => { window.addEventListener('janjaemi-cart', listener); return () => window.removeEventListener('janjaemi-cart', listener); };
export function useInCart(id: number) { return useSyncExternalStore(subscribe, () => readCart().some(item => item.id === id)); }
