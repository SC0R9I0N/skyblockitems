# Skyblock Item Browser

A standalone **Electron + React** desktop app that browses every Hypixel Skyblock item in a
Minecraft-styled UI: square inventory slots, hover tooltips with §-color-coded lore, creative-mode
search bar, crafting recipes, pets, and persistent favorites.

![tabs] All Items · Weapons · Armor · Equipment · Pets · Pet Items · Misc · ★ Favorites

**v2 features:** dark mode · hide-vanilla-items filter · rarity-colored slot borders with hover
glow · Minecraft-styled calculator (`+ - * /`, parentheses, `1.5e3` notation) · automatic
level-100 pet stats per rarity · power stone sample stats at 1,000 Magical Power

## Download & install (no tools required)

**[⬇ Skyblock-Item-Browser-Setup.exe](https://github.com/SC0R9I0N/skyblockitems/raw/main/Skyblock-Item-Browser-Setup.exe)**
— one self-contained file in the repo root; download just it, double-click, done.

- Installs per-user (no admin prompt), creates a desktop shortcut, and launches the app when
  finished. The app runtime, item dataset, and all textures are bundled inside — nothing else
  to download or install first.
- Windows SmartScreen may warn because the installer isn't signed with a commercial
  certificate — click **More info → Run anyway**.
- At runtime the app only contacts a fixed allowlist of HTTPS hosts (Hypixel API, the two
  Skyblock wikis, mc-heads.net, raw.githubusercontent.com) to refresh item data and fetch the
  few icons that aren't bundled; nothing is sent anywhere.
- Updating later is one click: the **⬇ Update** button (bottom bar) compares your installed
  build against this repo, and only when they differ downloads the new installer, verifies
  its SHA-256 against the repo's `build-info.json`, and reinstalls/relaunches itself.

## Quick start

```bash
npm install          # install dependencies
npm run data         # generate data/items.json from live sources (~1 min, cached in .cache/)
                     # (required on fresh clones — the dataset is generated, not committed)
npm run dev          # launch the app in dev mode (Vite HMR + Electron)
```

Build a standalone executable:

```bash
npm run dist         # → release/Skyblock Item Browser Setup <version>.exe  (installer)
                     #   release/Skyblock Item Browser <version>.exe        (portable)
                     #   Skyblock-Item-Browser-Setup.exe  (repo-root copy for the
                     #   standalone download link above; keep it under 100 MiB)
                     #   build-info.json  (build stamp + installer SHA-256 — the in-app
                     #   ⬇ Update button needs it; always publish it WITH the exe)
```

The app icon lives at `build/icon.png` (electron-builder converts it per-platform).

Optional:

```bash
npm run data:icons   # pre-download every item icon into data/icons/ for a fully-offline build
npm run typecheck    # strict TypeScript check
```

## Architecture

```
┌──────────────────────────── build time ────────────────────────────┐
│ scripts/fetch-data.mjs                                             │
│   • api.hypixel.net/v2/resources/skyblock/items  (canonical items) │
│   • NotEnoughUpdates-REPO tarball  (lore, recipes, wiki links, pets)│
│   • PrismarineJS/minecraft-assets 1.8.8  (vanilla texture URLs,    │
│     verified per-path with a cached HEAD probe)                    │
│   • mc-heads.net  (skull-item icons via decoded texture hashes)    │
│   → data/items.json  (bundled into the app via extraResources)     │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────── run time ──────────────────────────────┐
│ electron/main.ts (main process)                                    │
│   • sbicon:// protocol — serves icons: bundled → userData cache →  │
│     remote download (then cached), so icons work offline after     │
│     first view                                                     │
│   • IPC: data:load / data:refresh (live Hypixel API re-merge)      │
│   • IPC: favorites:get / favorites:toggle → userData/favorites.json│
│   • IPC: wiki:extract — lazy MediaWiki intro extracts, cached      │
│ electron/preload.ts — contextBridge → window.sbApi (sandboxed)     │
│                                                                    │
│ src/ (renderer, React 19 + TypeScript + Vite)                      │
│   state/store.tsx      context + reducer: tab, query, selection,   │
│                        favorites; memoized live filtering           │
│   components/ItemGrid  windowed virtual grid of 54px MC slots      │
│   components/Tooltip   MC-style tooltip w/ §-code colored lore     │
│   components/DetailPanel  icon, lore, sources, crafting grid,      │
│                        "used in" chips, stats, wiki extract, fav   │
│   components/TabBar/SearchBar  MC buttons + creative search        │
│   mc/format.tsx        § color-code parser → styled spans          │
│   styles/minecraft.css beveled slots, panels, tooltip, scrollbar   │
└─────────────────────────────────────────────────────────────────────┘
```

### Data model (`data/items.json`)

```ts
interface SkyblockItem {
  id: string;              // ASPECT_OF_THE_END, PET_ENDER_DRAGON, ...
  name: string;
  category: string;        // raw Hypixel category (SWORD, ACCESSORY, PET, ...)
  tab: 'weapons'|'armor'|'equipment'|'pets'|'pet_items'|'misc';
  tier: string;            // COMMON..MYTHIC — drives name colors
  lore: string[];          // Minecraft §-coded lines
  stats?: Record<string, number>;
  npcSellPrice?: number;
  museum?: string;
  icon: { kind: 'skull'|'texture'|'none'; url?: string };
  tint?: string;           // leather armor dye "r,g,b" (CSS multiply blend)
  sources: string[];       // human-readable origin lines (drops, shops, forge, ...)
  recipe?: { slots: ({id, count}|null)[9]; count: number };
  wiki?: string[];         // wiki page URLs
  usedIn?: string[];       // reverse recipe index ("what it's used for")
  petInfo?: { type: string; rarities: string[] };
}
```

### Category → tab normalization

| Tab | Hypixel categories |
| --- | --- |
| Weapons | SWORD, BOW, LONGSWORD, WAND, GAUNTLET, ARROW, ARROW_POISON |
| Armor | HELMET, CHESTPLATE, LEGGINGS, BOOTS |
| Equipment | NECKLACE, CLOAK, BELT, GLOVES, BRACELET, ACCESSORY |
| Pets | (from NEU pet definitions) |
| Pet Items | PET_ITEM |
| Misc | everything else (tools, reforge stones, consumables, ...) |

### Favorites

Stored as JSON at `%APPDATA%/skyblock-item-browser/favorites.json` (Electron `userData`),
written atomically on every toggle and reloaded on startup. The ★ Favorites tab filters the
same grid; stars overlay favorited slots everywhere.

### Search

Live, case-insensitive substring match over `name + id` (precomputed lowercase key), memoized
per keystroke and rendered through `useDeferredValue`, so typing stays instant even across all
5,600+ items. `Ctrl+F` focuses the bar.

### v2 additions

- **Dark mode** — a `html.dark` class swaps the CSS custom-property theme (panels, slots,
  tooltips, buttons, search bar, overlay). Toggled from the tab bar; persisted with the other
  toggles in `%APPDATA%/Skyblock Item Browser/settings.json` via `settings:get/patch` IPC.
- **Hide vanilla items** — the pipeline flags items whose Hypixel id equals their Bukkit
  material (plus NEU's `vanilla` flag) as `isVanilla`; the store's filter composes it with tab
  + search filtering.
- **Rarity borders** — each slot sets a `--rarity` color (Common gray → Very Special gold);
  CSS `color-mix` builds the bevel from it and brightens the mix under dark mode; hover adds a
  glow shadow.
- **Calculator** — `src/calc/evaluate.ts` is a ~90-line tokenizer + recursive-descent parser
  (`+ - * /`, parentheses, unary minus, scientific notation; no `eval`). The panel is a
  self-contained component with keypad + keyboard input.
- **Pet level-100 stats** — the pipeline extracts per-rarity level-100 values (level-200 for
  pets that go higher) from NEU's `constants/petnums.json` into `item.petStats`; the detail
  panel shows a stat table and the pet's lore with `{STAT}`/`{0}`-style placeholders filled,
  switchable per rarity, memoized, with a persisted show/hide toggle.
- **Power stone 1000 MP samples** — power stone lore quotes stats at a reference MP; the panel
  rescales them with the standard multiplier `(ln(1 + 0.0019·MP))^1.2` (constant factor
  cancels in the ratio), lists unique flat bonuses separately, and is toggleable + memoized.

### How it runs standalone

`npm run dist` runs Vite (renderer → `dist/renderer`), esbuild (main/preload →
`dist-electron`), then electron-builder packages them with `data/items.json` as an extra
resource into an NSIS installer + portable exe (`release/`). The app needs no network to
browse (dataset is bundled); icons stream in on first view and are cached to disk, or can be
fully pre-bundled with `npm run data:icons`.

## Credits

- Item data: [Hypixel API](https://api.hypixel.net) · [NotEnoughUpdates repo](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO)
- Textures: [PrismarineJS/minecraft-assets](https://github.com/PrismarineJS/minecraft-assets) · [mc-heads.net](https://mc-heads.net)
- Font: [Monocraft](https://github.com/IdreesInc/Monocraft) (SIL OFL)

Not affiliated with Hypixel or Mojang.
