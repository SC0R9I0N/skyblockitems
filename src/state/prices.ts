import { useEffect, useReducer } from 'react';
import type { PriceInfo } from '../types';
import { TIER_ORDER } from './store';

// Session-side price memo; the main process holds the authoritative 10-minute
// disk cache, this avoids repeat IPC round-trips from hover tooltips. Entries
// older than the TTL are refetched but still shown while the refresh runs.
const TTL_MS = 10 * 60_000;
type Entry = { info: PriceInfo | null; fetchedAt: number };
const cache = new Map<string, Entry>();

/** highest game rarity in the list (hover tooltips price pets at this one) */
export function highestRarity(rarities: string[]): string | undefined {
  let best: string | undefined;
  for (const r of rarities) {
    if (best === undefined || (TIER_ORDER[r] ?? -1) > (TIER_ORDER[best] ?? -1)) best = r;
  }
  return best;
}

/** Imperative cached lookup (same cache as usePrice) for non-hook callers. */
export async function getPriceCached(
  itemId: string,
  rarity?: string,
): Promise<PriceInfo | null> {
  const key = rarity ? `${itemId}@${rarity}` : itemId;
  const entry = cache.get(key);
  if (entry && Date.now() - entry.fetchedAt < TTL_MS) return entry.info;
  const info = await window.sbApi.getPrice(itemId, rarity).catch(() => null);
  cache.set(key, { info, fetchedAt: Date.now() });
  return info;
}

/** the single number a component contributes to a build estimate */
export function priceValue(info: PriceInfo | null): number | null {
  if (!info) return null;
  if (info.kind === 'bazaar') return info.buy > 0 ? info.buy : null;
  return info.lowestBin ?? info.avg3d;
}

/**
 * Cached market-price lookup. Returns undefined while unresolved, null when
 * the item has no market data. `delayMs` debounces hover-driven lookups so
 * sweeping the cursor across the grid doesn't fire a request per slot.
 */
export function usePrice(
  itemId: string,
  rarity?: string,
  delayMs = 0,
): PriceInfo | null | undefined {
  const key = rarity ? `${itemId}@${rarity}` : itemId;
  const [, bump] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.fetchedAt < TTL_MS) return;
    let stale = false;
    const timer = setTimeout(() => {
      window.sbApi
        .getPrice(itemId, rarity)
        .catch(() => null)
        .then((res) => {
          cache.set(key, { info: res, fetchedAt: Date.now() });
          if (!stale) bump();
        });
    }, delayMs);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [key]);

  return cache.get(key)?.info;
}
