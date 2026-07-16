# Skyblock Item Browser

**A standalone desktop encyclopedia for every Hypixel Skyblock item — wrapped in a faithful Minecraft-style UI.**

![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D6)
![Electron](https://img.shields.io/badge/Electron-43-47848F)
![React](https://img.shields.io/badge/React-19-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)
![License](https://img.shields.io/badge/license-MIT-green)

Browse 5,600+ items in square inventory slots with §-color-coded lore tooltips, live-filter them
with a creative-mode search bar, inspect crafting recipes and sources, check **live auction-house
and bazaar prices**, compute level-100 pet stats, and keep persistent favorites — all offline-capable
and installed from a single executable.

---

## Table of Contents

- [Installation](#installation)
- [Features](#features)
- [Development](#development)
- [Architecture](#architecture)
  - [Process Model](#process-model)
  - [Data Pipeline](#data-pipeline)
  - [Data Model](#data-model)
  - [Category Normalization](#category-normalization)
- [Runtime Storage](#runtime-storage)
- [Network Access & Privacy](#network-access--privacy)
- [Building & Releasing](#building--releasing)
- [Troubleshooting](#troubleshooting)
- [Credits](#credits)
- [License & Disclaimer](#license--disclaimer)

---

## Installation

### For users (no tools required)

**[⬇ Download Skyblock-Item-Browser-Setup.exe](https://github.com/SC0R9I0N/skyblockitems/raw/main/Skyblock-Item-Browser-Setup.exe)**

1. Download the installer (one self-contained file — the runtime, item dataset, and textures are all bundled).
2. Double-click it. It installs per-user (no admin prompt), creates a desktop shortcut, and launches the app.

> [!NOTE]
> Windows SmartScreen may warn because the installer is not signed with a commercial
> certificate. Click **More info → Run anyway**.

### Requirements

| | |
| --- | --- |
| OS | Windows 10 / 11, x64 |
| Disk | ~310 MB installed |
| Network | Optional — browsing works fully offline; live prices, data refresh, and updates need HTTPS access |

### Updating

The **⬇ Update** button in the bottom bar compares your installed build against this repository.
Only when they differ does it download the new installer, verify its SHA-256 against the
repository's `build-info.json`, and silently reinstall and relaunch itself.

---

## Features

### Browsing

- **Minecraft-styled grid** — a windowed virtual grid of inventory slots with rarity-colored,
  hover-glowing borders (Common gray through Very Special gold; brightness adapts to dark mode).
- **Lore tooltips** — full §-color-coded lore plus market prices on hover; long tooltips cap at a
  maximum height and scroll with **Ctrl + mouse wheel**.
- **Tabs** — All Items · ✨ New · Weapons · Armor · Equipment · Accessories · Cosmetics · Pets ·
  Pet Items · Enchants · Misc · ★ Favorites. The **New** tab surfaces items recently added to
  the game; **Enchants** lists every enchanted book (154 enchantments, one entry per level).
- **Instant search** — live, case-insensitive substring match over name + ID, memoized per
  keystroke and rendered through `useDeferredValue` so typing stays smooth across the full
  dataset. `Ctrl+F` focuses the bar.
- **Sorting** — by name, rarity, or release date, ascending or descending.
- **Hide vanilla items** — one toggle filters out plain Minecraft items; composes with tab,
  search, and sort state.

### Item details

Clicking a slot opens a detail panel with the item's lore tooltip, rarity and category,
**where it comes from** (drops, shops, forge, and an interactive crafting grid), **what it's
used for** (reverse-recipe chips, museum donations, NPC sell price), a stats table, and a lazily
fetched wiki summary with a link to the official wiki.

### Live market prices

Every tradeable item shows a **Market Prices** card sourced from the
[Coflnet SkyBlock API](https://sky.coflnet.com/data):

- **Auction items** — lowest BIN plus a volume-weighted **3-day average** with the sales count.
- **Pets** — a per-rarity price table (each rarity priced independently).
- **Bazaar items** — instant buy / sell prices.
- Prices also appear directly in the **hover tooltip** (pets priced at their highest rarity there);
  hover lookups are debounced so sweeping the cursor across the grid stays quiet.
- Values are cached for 10 minutes on disk; a network failure falls back to the last cached value.

### Calculators & computed stats

- **Pet stats at level 100** — per-rarity level-100 values (level 200 where applicable) with
  ability placeholders filled in, extracted from NotEnoughUpdates constants.
- **Power stone samples at 1,000 MP** — lore stats rescaled with the standard magical-power
  multiplier `(ln(1 + 0.0019·MP))^1.2`, with unique flat bonuses listed separately.
- **Calculator panel** — Minecraft-styled keypad supporting `+ - * /`, parentheses, unary minus,
  and scientific notation (`1.5e3`), implemented as a ~90-line tokenizer + recursive-descent
  parser (no `eval`).

### Personalization

- **Dark mode** — a full CSS custom-property theme swap (panels, slots, tooltips, search, tabs).
- **Favorites** — starred anywhere, listed in the ★ Favorites tab, written atomically to disk,
  and restored on startup.
- All toggles (theme, vanilla filter, stat panels, sort) persist across restarts.

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org) 20+ (24 LTS recommended) and npm
- Windows for packaging the NSIS installer (`npm run dist`)

### Setup

```bash
npm install          # install dependencies
npm run data         # generate data/items.json from live sources (~1 min, cached in .cache/)
npm run dev          # launch in dev mode (Vite HMR + Electron)
```

> [!IMPORTANT]
> `data/items.json` is generated, not committed — `npm run data` is required on fresh clones.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the app with hot reload (Vite dev server + Electron) |
| `npm run data` | Regenerate the item dataset from live sources |
| `npm run data:icons` | Pre-download every item icon into `data/icons/` for a fully offline build |
| `npm run data:pack` | Map FurfSky Reborn resource-pack textures (incl. animated) onto items |
| `npm run data:dates` | Fetch item release dates (powers the New tab and release sort) |
| `npm run data:scrape` | Scrape wiki item sprites (runs under Electron) |
| `npm run typecheck` | Strict TypeScript check across renderer + main |
| `npm run build` | Bundle renderer (Vite) and main/preload (esbuild) |
| `npm run dist` | Package installer + portable exe (electron-builder / NSIS) |

---

## Architecture

### Process Model

```
┌────────────────────────────── run time ─────────────────────────────┐
│ electron/main.ts  (main process — all disk & network access)       │
│   • sbicon:// protocol  icon serving: bundled → disk cache →       │
│     allowlisted remote download (cached; offline after first view) │
│   • IPC data:load / data:refresh   dataset load + live re-merge    │
│   • IPC price:get                  Coflnet market prices (cached)  │
│   • IPC wiki:extract               MediaWiki intro extracts (cached)│
│   • IPC favorites:* / settings:*   atomic JSON persistence         │
│   • IPC update:check / update:apply  SHA-256-verified self-update  │
│                                                                     │
│ electron/preload.ts  contextBridge → window.sbApi                  │
│   (sandboxed, contextIsolation: true, nodeIntegration: false)      │
│                                                                     │
│ src/  (renderer — React 19 + TypeScript + Vite; no network access, │
│        locked by CSP `connect-src 'self'`)                         │
│   state/store.tsx        context + reducer: tab, query, sort,      │
│                          selection, favorites; memoized filtering  │
│   components/ItemGrid    windowed virtual grid of MC slots         │
│   components/Tooltip     §-code colored lore tooltip               │
│   components/DetailPanel icon, lore, prices, sources, recipe,      │
│                          stats, wiki, favorite                     │
│   components/PricePanel  lowest BIN / 3-day avg / bazaar card      │
│   components/Calculator  standalone calculator panel               │
│   mc/format.tsx          § color-code parser → styled spans        │
│   styles/minecraft.css   themed slots, panels, tooltips            │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Pipeline

`scripts/fetch-data.mjs` (build time) merges four sources into `data/items.json`, which is
bundled into the app as an extra resource:

| Source | Contributes |
| --- | --- |
| [Hypixel API](https://api.hypixel.net/v2/resources/skyblock/items) | Canonical item list: names, categories, tiers, stats, NPC prices |
| [NotEnoughUpdates-REPO](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO) | Lore, recipes, wiki links, pet definitions, level-100 pet stats |
| [PrismarineJS/minecraft-assets](https://github.com/PrismarineJS/minecraft-assets) + FurfSky Reborn | Item textures (verified per path; pack textures mapped by `data:pack`) |
| [mc-heads.net](https://mc-heads.net) | Skull-item icons via decoded texture hashes |

At runtime, **Refresh** re-fetches the Hypixel item list and merges it over the bundled dataset
(new items appear with basic entries and land in the New tab); the merged copy is stored in
user data and only shadows the bundle while it is at least as new.

### Data Model

```ts
interface SkyblockItem {
  id: string;              // canonical Hypixel ID: ASPECT_OF_THE_END, PET_ENDER_DRAGON, ...
  name: string;
  category: string;        // raw Hypixel category (SWORD, ACCESSORY, PET, ...)
  tab: 'weapons' | 'armor' | 'equipment' | 'accessories'
     | 'cosmetics' | 'pets' | 'pet_items' | 'misc';
  tier: string;            // COMMON .. VERY_SPECIAL — drives name/border colors
  lore: string[];          // Minecraft §-coded lines
  stats?: Record<string, number>;
  npcSellPrice?: number;
  museum?: string;
  icon: { kind: 'skull' | 'texture' | 'wiki' | 'none'; url?: string };
  tint?: string;           // leather armor dye "r,g,b" (CSS multiply blend)
  sources: string[];       // human-readable origin lines
  recipe?: { slots: ({ id: string; count: number } | null)[]; count: number };
  wiki?: string[];         // wiki page URLs
  usedIn?: string[];       // reverse recipe index
  petInfo?: { type: string; rarities: string[] };
  petStats?: Record<string, PetStatsEntry>;   // per-rarity level-100 stats
  powerStone?: PowerStoneInfo;                // MP-scaled stat definitions
  isVanilla?: boolean;
  addedAt?: string;        // ISO date first seen (powers New tab / release sort)
}
```

Live prices are **not** part of the dataset; they are resolved on demand in the main process as:

```ts
type PriceInfo =
  | { kind: 'ah'; lowestBin: number | null; avg3d: number | null; sales3d: number }
  | { kind: 'bazaar'; buy: number; sell: number };
```

### Category Normalization

| Tab | Hypixel categories |
| --- | --- |
| Weapons | `SWORD`, `BOW`, `LONGSWORD`, `WAND`, `GAUNTLET`, `ARROW`, `ARROW_POISON`, `FISHING_WEAPON` |
| Armor | `HELMET`, `CHESTPLATE`, `LEGGINGS`, `BOOTS` |
| Equipment | `NECKLACE`, `CLOAK`, `BELT`, `GLOVES`, `BRACELET` |
| Accessories | `ACCESSORY` |
| Cosmetics | `COSMETIC` (skins) + `DYE_*` armor dyes |
| Pets | from NEU pet definitions |
| Pet Items | `PET_ITEM` |
| Enchants | enchanted books from NEU (`ENCHANTMENT_<NAME>_<LEVEL>`, one item per level) |
| Misc | everything else (tools, reforge stones, consumables, …) |

---

## Runtime Storage

All persistence lives in Electron's user-data directory —
`%APPDATA%\Skyblock Item Browser` — as plain JSON (no registry, no telemetry):

| File | Contents | Notes |
| --- | --- | --- |
| `favorites.json` | Favorited item IDs | Written atomically on every toggle |
| `settings.json` | Theme, filters, stat-panel and sort preferences | Merged over defaults on load |
| `items.json` | Refreshed dataset copy | Used only while newer than the bundled dataset |
| `priceCache.json` | Market prices per item (+ pet rarity) | 10-minute TTL |
| `wikiCache.json` | Wiki intro extracts | 7-day TTL |
| `iconCache/` | Downloaded item icons | Keyed by source URL; enables offline reuse |

Uninstalling removes the app; delete the folder above to remove all user data.

---

## Network Access & Privacy

The renderer has **no network access at all** (CSP `connect-src 'self'`; sandboxed, context-isolated).
All requests are plain HTTPS `GET`s made by the main process against a fixed host allowlist:

| Host | Purpose |
| --- | --- |
| `api.hypixel.net` | Item dataset refresh |
| `sky.coflnet.com` | Auction / bazaar prices (item ID + rarity only; credentials omitted) |
| `wiki.hypixel.net`, `hypixelskyblock.minecraft.wiki` | Wiki summaries |
| `mc-heads.net`, `raw.githubusercontent.com` | Icon downloads, update checks |

No account, credential, username, UUID, hardware ID, or telemetry of any kind is collected,
stored, or transmitted. Requests carry only public item identifiers; external links open in
your default browser and are restricted to the same allowlist.

---

## Building & Releasing

```bash
npm run dist
```

produces, in order:

1. `dist/renderer/` — Vite production bundle of the UI
2. `dist-electron/` — esbuild bundles of the main and preload scripts
3. `release/Skyblock Item Browser Setup <version>.exe` — NSIS one-click installer
   and `release/Skyblock Item Browser <version>.exe` — portable build
4. `Skyblock-Item-Browser-Setup.exe` — repo-root copy backing the download link
   (keep under 100 MiB for GitHub raw hosting)
5. `build-info.json` — build stamp with the installer's SHA-256

> [!IMPORTANT]
> The in-app updater compares build IDs and verifies the installer hash, so
> `Skyblock-Item-Browser-Setup.exe` and `build-info.json` **must always be published together,
> from the same build**.

The app icon lives at `build/icon.png`; electron-builder converts it per platform.

---

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| SmartScreen blocks the installer | **More info → Run anyway** (unsigned installer; see [Installation](#installation)) |
| `npm run dev` fails with a missing dataset | Run `npm run data` first — `data/items.json` is generated, not committed |
| Market prices show "No auction or bazaar listings found" | The item is untradeable, or the price API is unreachable; prices reappear on the next open once connectivity returns |
| Icons missing while offline | Icons stream on first view; run `npm run data:icons` before packaging for a fully offline build |
| Update button reports no update | The updater compares build IDs, not versions — it only offers builds published to this repository |
| Slow first launch | Windows scans freshly installed binaries (Defender/SmartScreen); launches after the first are much faster. Set `SB_TRACE=1` and run the exe from a terminal to print startup timings |

---

## Credits

- **Item data** — [Hypixel API](https://api.hypixel.net) · [NotEnoughUpdates-REPO](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO)
- **Market prices** — [Coflnet SkyBlock API](https://sky.coflnet.com/data)
- **Textures** — [PrismarineJS/minecraft-assets](https://github.com/PrismarineJS/minecraft-assets) · [FurfSky Reborn](https://furfsky.net) · [mc-heads.net](https://mc-heads.net)
- **Font** — [Monocraft](https://github.com/IdreesInc/Monocraft) (SIL OFL)

## License & Disclaimer

Released under the [MIT License](package.json).

This is an unofficial fan project. It is **not affiliated with, endorsed by, or associated with
Hypixel Inc. or Mojang/Microsoft**. Minecraft is a trademark of Mojang Synergies AB. All item
names and game data belong to their respective owners.
