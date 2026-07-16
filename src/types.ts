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
  | 'enchants'
  | 'misc'
  | 'favorites'
  | 'builds';

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

/** gear slots a build can fill: one main item and/or a full armor set */
export type GearSlot = 'item' | 'helmet' | 'chestplate' | 'leggings' | 'boots';

/** one selected gear item and everything applied to it */
export interface GearPiece {
  id: string;
  enchantments: string[]; // ENCHANTMENT_<NAME>_<LVL> item ids
  reforge?: string; // reforge stone item id
  upgrades: string[]; // modifier item ids (recomb, Art of War, ...)
  /** socketed gemstone item ids, index-aligned with the item's gemstoneSlots */
  gemstones?: (string | null)[];
  /** applied Hot Potato Books (0 or the full 10; weapons/armor only) */
  hotPotatoBooks?: number;
  /** applied Fuming Potato Books (0 or the full 5; weapons/armor only) */
  fumingPotatoBooks?: number;
}

/** a saved hypothetical build (Builds tab) */
export interface Build {
  id: string;
  name: string;
  updatedAt: string; // ISO
  /** either the 'item' slot OR armor slots — the editor enforces the choice */
  gear: Partial<Record<GearSlot, GearPiece>>;
  petId?: string; // PET_*
  petRarity?: string;
  petItemId?: string;
  catacombsLevel?: number;
  dungeonStars?: number; // 0-5
  masterStars?: number; // 0-5
}

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
  tab: Exclude<TabId, 'all' | 'favorites' | 'new' | 'builds'>;
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
  /** enchanted book at its enchantment's highest level — name renders chroma */
  maxEnchant?: boolean;
  /** enchanted book: item types it can be applied to (NEU enchant tables) */
  enchApplies?: string[];
  /** enchanted book: mutually exclusive enchant names (lowercase bases) */
  enchConflicts?: string[];
  /** reforge stone: item types it applies to (NEU, e.g. SWORD, ARMOR, ROD) */
  reforgeTypes?: string[];
  /** gemstone sockets, one entry per slot (RUBY, COMBAT, UNIVERSAL, ...) */
  gemstoneSlots?: string[];
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
      listBuilds: () => Promise<Build[]>;
      saveBuild: (build: Build) => Promise<Build[]>;
      deleteBuild: (id: string) => Promise<Build[]>;
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
