export type TabId =
  | 'all'
  | 'new'
  | 'weapons'
  | 'armor'
  | 'equipment'
  | 'accessories'
  | 'cosmetics'
  | 'pets'
  | 'pet_items'
  | 'misc'
  | 'favorites';

export interface IconInfo {
  kind: 'skull' | 'texture' | 'wiki' | 'none';
  url?: string;
}

export interface RecipeSlot {
  id: string;
  count: number;
}

export interface Recipe {
  slots: (RecipeSlot | null)[]; // 9 crafting slots, row-major
  count: number;
}

export interface PowerStoneStat {
  name: string;
  value: number;
  color: string; // MC color code char
}

export interface PowerStoneInfo {
  power?: string;
  refMp: number; // MP the lore stats are quoted at
  stats: PowerStoneStat[];
  unique: PowerStoneStat[]; // flat bonuses, not MP-scaled
}

export interface PetStatsEntry {
  level: number; // 100, or the pet's max if different
  stats: Record<string, number>;
  other: number[]; // ability numbers filling {0}..{n} lore placeholders
}

/** live market data from the Coflnet API, resolved in the main process */
export type PriceInfo =
  | { kind: 'ah'; lowestBin: number | null; avg3d: number | null; sales3d: number }
  | { kind: 'bazaar'; buy: number; sell: number };

export type SortKey = 'name' | 'rarity' | 'release';

export interface AppSettings {
  darkMode: boolean;
  hideVanilla: boolean;
  showPetStats: boolean;
  showPowerStats: boolean;
  sortKey: SortKey;
  sortAsc: boolean;
}

export interface SkyblockItem {
  id: string;
  name: string;
  category: string;
  tab: Exclude<TabId, 'all' | 'favorites' | 'new'>;
  tier: string;
  lore: string[];
  stats?: Record<string, number>;
  npcSellPrice?: number;
  museum?: string;
  icon: IconInfo;
  tint?: string; // "r,g,b" leather dye color
  sources: string[];
  /** sources came from the wiki's Obtaining section rather than NEU */
  sourcesFromWiki?: boolean;
  recipe?: Recipe | null;
  wiki?: string[];
  usedIn?: string[];
  petInfo?: { type: string; rarities: string[] };
  isVanilla?: boolean;
  /** ISO date (YYYY-MM-DD) the item was first seen in the game's data */
  addedAt?: string;
  powerStone?: PowerStoneInfo;
  petStats?: Record<string, PetStatsEntry>;
  /** precomputed lowercase search key (added client-side) */
  searchKey?: string;
}

export interface Dataset {
  meta: { generatedAt: string; itemCount: number; refreshedAt?: string };
  items: SkyblockItem[];
}

declare global {
  interface Window {
    sbApi: {
      loadData: () => Promise<string>;
      refreshData: () => Promise<string>;
      getFavorites: () => Promise<string[]>;
      toggleFavorite: (id: string) => Promise<string[]>;
      wikiExtract: (id: string, urls: string[]) => Promise<{ url: string; text: string } | null>;
      getPrice: (id: string, rarity?: string) => Promise<PriceInfo | null>;
      openExternal: (url: string) => Promise<void>;
      getSettings: () => Promise<AppSettings>;
      patchSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
      checkUpdate: () => Promise<{
        updateAvailable: boolean;
        localVersion: string;
        remoteVersion: string;
        remoteBuiltAt: string | null;
      }>;
      applyUpdate: () => Promise<{ started: boolean }>;
      onUpdateProgress: (cb: (pct: number) => void) => () => void;
    };
  }
}
