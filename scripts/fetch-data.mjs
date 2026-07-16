// Data pipeline for the Skyblock Item Browser.
//
// Sources:
//   1. Hypixel API  (https://api.hypixel.net/v2/resources/skyblock/items)
//      - canonical item list: names, categories, tiers, stats, NPC prices, skull skins
//   2. NotEnoughUpdates repo (github.com/NotEnoughUpdates/NotEnoughUpdates-REPO)
//      - lore, crafting recipes, drop/shop/forge sources, wiki links, pets
//   3. PrismarineJS/minecraft-assets (1.8.8 textures) - vanilla item icons
//   4. mc-heads.net - rendered skull icons by texture hash
//   5. Skyblock wikis (hypixelskyblock.minecraft.wiki, wiki.hypixel.net)
//      - item sprites for items whose base material is a placeholder (paper),
//        and "Obtaining" sections for items NEU has no source info for
//
// Output: data/items.json  (bundled with the app)
// Flags:  --icons    also download every icon into data/icons/
//         --offline  reuse cached API/NEU downloads in .cache/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
const OUT_DIR = path.join(ROOT, 'data');
const ICONS_DIR = path.join(OUT_DIR, 'icons');
const ARGS = new Set(process.argv.slice(2));

const HYPIXEL_ITEMS_URL = 'https://api.hypixel.net/v2/resources/skyblock/items';
const NEU_TARBALL_URL =
  'https://codeload.github.com/NotEnoughUpdates/NotEnoughUpdates-REPO/tar.gz/refs/heads/master';
const TEXTURE_BASE =
  'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.8.8/';
const MC_HEADS = (hash) => `https://mc-heads.net/head/${hash}`;

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------- utilities

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'skyblock-item-browser-pipeline' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function cached(file, producer) {
  const p = path.join(CACHE, file);
  if (fs.existsSync(p) && (ARGS.has('--offline') || Date.now() - fs.statSync(p).mtimeMs < 86400e3)) {
    return fs.readFileSync(p);
  }
  const buf = await producer();
  fs.writeFileSync(p, buf);
  return buf;
}

function pLimit(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

// Minimal ustar/GNU tar reader (we only need file names + contents).
function* tarEntries(buf) {
  let off = 0;
  let longName = null;
  while (off + 512 <= buf.length) {
    const block = buf.subarray(off, off + 512);
    if (block.every((b) => b === 0)) break;
    const nameRaw = block.toString('utf8', 0, 100).replace(/\0.*$/, '');
    const size = parseInt(block.toString('utf8', 124, 136).replace(/\0.*$/, '').trim() || '0', 8);
    const type = String.fromCharCode(block[156]);
    const prefix = block.toString('utf8', 345, 500).replace(/\0.*$/, '');
    const dataStart = off + 512;
    const data = buf.subarray(dataStart, dataStart + size);
    off = dataStart + Math.ceil(size / 512) * 512;
    if (type === 'L') {
      longName = data.toString('utf8').replace(/\0.*$/, '');
      continue;
    }
    const name = longName ?? (prefix ? `${prefix}/${nameRaw}` : nameRaw);
    longName = null;
    if (type === '0' || type === '\0') yield { name, data };
  }
}

const stripCodes = (s) => (s ?? '').replace(/§[0-9a-fk-orA-FK-OR]/g, '');

function skullHashFromBase64(value) {
  try {
    const json = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    const url = json?.textures?.SKIN?.url;
    if (!url) return null;
    return url.split('/').pop();
  } catch {
    return null;
  }
}

function skullHashFromNbt(nbttag) {
  if (!nbttag || !nbttag.includes('SkullOwner')) return null;
  const m = nbttag.match(/Value:"([A-Za-z0-9+/=]+)"/);
  return m ? skullHashFromBase64(m[1]) : null;
}

// ------------------------------------------------- vanilla texture mapping
// Maps Bukkit 1.8 material names (what the Hypixel API uses) to texture paths
// inside minecraft-assets 1.8.8. Values are either a path string or a
// function of the metadata/durability value. Every resolved path is verified
// against the CDN (results cached), so a wrong guess degrades to a fallback.

const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'silver', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const DYES = ['dye_powder_black', 'dye_powder_red', 'dye_powder_green', 'dye_powder_brown',
  'dye_powder_blue', 'dye_powder_purple', 'dye_powder_cyan', 'dye_powder_silver',
  'dye_powder_gray', 'dye_powder_pink', 'dye_powder_lime', 'dye_powder_yellow',
  'dye_powder_light_blue', 'dye_powder_magenta', 'dye_powder_orange', 'dye_powder_white'];
const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'big_oak'];
const FLOWERS = ['flower_rose', 'flower_blue_orchid', 'flower_allium', 'flower_houstonia',
  'flower_tulip_red', 'flower_tulip_orange', 'flower_tulip_white', 'flower_tulip_pink',
  'flower_oxeye_daisy'];
const FISH = ['fish_cod_raw', 'fish_salmon_raw', 'fish_clownfish_raw', 'fish_pufferfish_raw'];

const TEX = {
  // tools / weapons (1.8 texture names match Bukkit's WOOD_/GOLD_ prefixes)
  WOOD_SPADE: 'items/wood_shovel', STONE_SPADE: 'items/stone_shovel',
  IRON_SPADE: 'items/iron_shovel', GOLD_SPADE: 'items/gold_shovel',
  DIAMOND_SPADE: 'items/diamond_shovel',
  BOW: 'items/bow_standby', FISHING_ROD: 'items/fishing_rod_uncast',
  CARROT_STICK: 'items/carrot_on_a_stick', FLINT_AND_STEEL: 'items/flint_and_steel',
  SHEARS: 'items/shears', WATCH: 'items/clock', COMPASS: 'items/compass',
  // food & drops
  RAW_FISH: (m) => `items/${FISH[m] ?? FISH[0]}`,
  COOKED_FISH: (m) => `items/${['fish_cod_cooked', 'fish_salmon_cooked'][m] ?? 'fish_cod_cooked'}`,
  PORK: 'items/porkchop_raw', GRILLED_PORK: 'items/porkchop_cooked',
  RAW_BEEF: 'items/beef_raw', COOKED_BEEF: 'items/beef_cooked',
  RAW_CHICKEN: 'items/chicken_raw', COOKED_CHICKEN: 'items/chicken_cooked',
  MUTTON: 'items/mutton_raw', COOKED_MUTTON: 'items/mutton_cooked',
  RABBIT: 'items/rabbit_raw', COOKED_RABBIT: 'items/rabbit_cooked',
  MUSHROOM_SOUP: 'items/mushroom_stew', RABBIT_STEW: 'items/rabbit_stew',
  CARROT_ITEM: 'items/carrot', POTATO_ITEM: 'items/potato',
  BAKED_POTATO: 'items/potato_baked', POISONOUS_POTATO: 'items/potato_poisonous',
  GOLDEN_CARROT: 'items/carrot_golden', SPECKLED_MELON: 'items/melon_speckled',
  GOLDEN_APPLE: 'items/apple_golden', MELON: 'items/melon',
  // materials
  SULPHUR: 'items/gunpowder', REDSTONE: 'items/redstone_dust',
  COAL: (m) => (m === 1 ? 'items/charcoal' : 'items/coal'),
  INK_SACK: (m) => `items/${DYES[m] ?? DYES[0]}`,
  SNOW_BALL: 'items/snowball', SLIME_BALL: 'items/slimeball',
  FERMENTED_SPIDER_EYE: 'items/spider_eye_fermented',
  EYE_OF_ENDER: 'items/ender_eye', EXP_BOTTLE: 'items/experience_bottle',
  FIREWORK: 'items/fireworks', FIREWORK_CHARGE: 'items/firework_charge',
  LEASH: 'items/lead', SEEDS: 'items/seeds_wheat',
  PUMPKIN_SEEDS: 'items/seeds_pumpkin', MELON_SEEDS: 'items/seeds_melon',
  SUGAR_CANE: 'items/reeds', NETHER_STALK: 'items/nether_wart',
  NETHER_BRICK_ITEM: 'items/netherbrick', CLAY_BRICK: 'items/brick',
  CLAY_BALL: 'items/clay_ball', QUARTZ: 'items/quartz',
  // books / maps / misc items
  BOOK: 'items/book_normal', ENCHANTED_BOOK: 'items/book_enchanted',
  BOOK_AND_QUILL: 'items/book_writable', EMPTY_MAP: 'items/map_empty',
  MAP: 'items/map_filled', POTION: 'items/potion_bottle_drinkable',
  GLASS_BOTTLE: 'items/potion_bottle_empty',
  BUCKET: 'items/bucket_empty', WATER_BUCKET: 'items/bucket_water',
  LAVA_BUCKET: 'items/bucket_lava', MILK_BUCKET: 'items/bucket_milk',
  MONSTER_EGG: 'items/spawn_egg', ARMOR_STAND: 'items/wooden_armorstand',
  MINECART: 'items/minecart_normal', STORAGE_MINECART: 'items/minecart_chest',
  POWERED_MINECART: 'items/minecart_furnace', HOPPER_MINECART: 'items/minecart_hopper',
  EXPLOSIVE_MINECART: 'items/minecart_tnt',
  IRON_BARDING: 'items/iron_horse_armor', GOLD_BARDING: 'items/gold_horse_armor',
  DIAMOND_BARDING: 'items/diamond_horse_armor',
  GOLD_RECORD: 'items/record_13', GREEN_RECORD: 'items/record_cat',
  RECORD_3: 'items/record_blocks', RECORD_4: 'items/record_chirp',
  RECORD_5: 'items/record_far', RECORD_6: 'items/record_mall',
  RECORD_7: 'items/record_mellohi', RECORD_8: 'items/record_stal',
  RECORD_9: 'items/record_strad', RECORD_10: 'items/record_ward',
  RECORD_11: 'items/record_11', RECORD_12: 'items/record_wait',
  WOOD_DOOR: 'items/door_wood', IRON_DOOR: 'items/door_iron',
  SPRUCE_DOOR_ITEM: 'items/door_spruce', BIRCH_DOOR_ITEM: 'items/door_birch',
  JUNGLE_DOOR_ITEM: 'items/door_jungle', ACACIA_DOOR_ITEM: 'items/door_acacia',
  DARK_OAK_DOOR_ITEM: 'items/door_dark_oak',
  CAULDRON_ITEM: 'items/cauldron', BREWING_STAND_ITEM: 'items/brewing_stand',
  FLOWER_POT_ITEM: 'items/flower_pot', BED: 'items/bed', SIGN: 'items/sign',
  BOAT: 'items/boat', CAKE: 'items/cake', HOPPER: 'items/hopper',
  // blocks
  WOOD: (m) => `blocks/planks_${WOODS[m] ?? 'oak'}`,
  LOG: (m) => `blocks/log_${WOODS[m & 3] ?? 'oak'}`,
  LOG_2: (m) => `blocks/log_${WOODS[4 + (m & 1)]}`,
  LEAVES: (m) => `blocks/leaves_${WOODS[m & 3] ?? 'oak'}`,
  LEAVES_2: (m) => `blocks/leaves_${WOODS[4 + (m & 1)]}`,
  SAPLING: (m) => `blocks/sapling_${['oak', 'spruce', 'birch', 'jungle', 'acacia', 'roofed_oak'][m] ?? 'oak'}`,
  WOOL: (m) => `blocks/wool_colored_${COLORS[m] ?? 'white'}`,
  CARPET: (m) => `blocks/wool_colored_${COLORS[m] ?? 'white'}`,
  STAINED_GLASS: (m) => `blocks/glass_${COLORS[m] ?? 'white'}`,
  STAINED_GLASS_PANE: (m) => `blocks/glass_${COLORS[m] ?? 'white'}`,
  STAINED_CLAY: (m) => `blocks/hardened_clay_stained_${COLORS[m] ?? 'white'}`,
  HARD_CLAY: 'blocks/hardened_clay',
  RED_ROSE: (m) => `blocks/${FLOWERS[m] ?? FLOWERS[0]}`,
  YELLOW_FLOWER: 'blocks/flower_dandelion',
  DOUBLE_PLANT: (m) => `blocks/double_plant_${['sunflower_front', 'syringa_top', 'grass_top', 'fern_top', 'rose_top', 'paeonia_top'][m] ?? 'rose_top'}`,
  LONG_GRASS: (m) => (m === 2 ? 'blocks/fern' : 'blocks/tallgrass'),
  DEAD_BUSH: 'blocks/deadbush', RED_MUSHROOM: 'blocks/mushroom_red',
  BROWN_MUSHROOM: 'blocks/mushroom_brown',
  HUGE_MUSHROOM_1: 'blocks/mushroom_block_skin_brown',
  HUGE_MUSHROOM_2: 'blocks/mushroom_block_skin_red',
  STONE: (m) => ['blocks/stone', 'blocks/stone_granite', 'blocks/stone_granite_smooth',
    'blocks/stone_diorite', 'blocks/stone_diorite_smooth', 'blocks/stone_andesite',
    'blocks/stone_andesite_smooth'][m] ?? 'blocks/stone',
  DIRT: (m) => ['blocks/dirt', 'blocks/coarse_dirt', 'blocks/dirt_podzol_side'][m] ?? 'blocks/dirt',
  SAND: (m) => (m === 1 ? 'blocks/red_sand' : 'blocks/sand'),
  SPONGE: (m) => (m === 1 ? 'blocks/sponge_wet' : 'blocks/sponge'),
  SANDSTONE: (m) => ['blocks/sandstone_normal', 'blocks/sandstone_carved', 'blocks/sandstone_smooth'][m] ?? 'blocks/sandstone_normal',
  RED_SANDSTONE: (m) => ['blocks/red_sandstone_normal', 'blocks/red_sandstone_carved', 'blocks/red_sandstone_smooth'][m] ?? 'blocks/red_sandstone_normal',
  QUARTZ_BLOCK: (m) => ['blocks/quartz_block_side', 'blocks/quartz_block_chiseled', 'blocks/quartz_block_lines'][m] ?? 'blocks/quartz_block_side',
  PRISMARINE: (m) => ['blocks/prismarine_rough', 'blocks/prismarine_bricks', 'blocks/prismarine_dark'][m] ?? 'blocks/prismarine_rough',
  SMOOTH_BRICK: (m) => ['blocks/stonebrick', 'blocks/stonebrick_mossy', 'blocks/stonebrick_cracked', 'blocks/stonebrick_carved'][m] ?? 'blocks/stonebrick',
  SMOOTH_STAIRS: 'blocks/stonebrick', COBBLESTONE_STAIRS: 'blocks/cobblestone',
  MOSSY_COBBLESTONE: 'blocks/cobblestone_mossy', COBBLE_WALL: 'blocks/cobblestone',
  ENDER_STONE: 'blocks/end_stone', MYCEL: 'blocks/mycelium_side',
  WATER_LILY: 'blocks/waterlily', GRASS: 'blocks/grass_side',
  PACKED_ICE: 'blocks/ice_packed', SNOW_BLOCK: 'blocks/snow',
  MELON_BLOCK: 'blocks/melon_side', PUMPKIN: 'blocks/pumpkin_face_off',
  JACK_O_LANTERN: 'blocks/pumpkin_face_on', CACTUS: 'blocks/cactus_side',
  TNT: 'blocks/tnt_side', BOOKSHELF: 'blocks/bookshelf',
  NOTE_BLOCK: 'blocks/noteblock', JUKEBOX: 'blocks/jukebox_side',
  FURNACE: 'blocks/furnace_front_off', DISPENSER: 'blocks/dispenser_front_horizontal',
  DROPPER: 'blocks/dropper_front_horizontal', HAY_BLOCK: 'blocks/hay_block_side',
  SLIME_BLOCK: 'blocks/slime', ANVIL: 'blocks/anvil_base',
  BEACON: 'blocks/beacon', DAYLIGHT_DETECTOR: 'blocks/daylight_detector_top',
  ENCHANTMENT_TABLE: 'blocks/enchanting_table_side',
  ENDER_PORTAL_FRAME: 'blocks/endframe_side', MOB_SPAWNER: 'blocks/mob_spawner',
  REDSTONE_LAMP_OFF: 'blocks/redstone_lamp_off',
  REDSTONE_TORCH_ON: 'blocks/redstone_torch_on', TORCH: 'blocks/torch_on',
  LEVER: 'blocks/lever', TRIPWIRE_HOOK: 'blocks/trip_wire_source',
  WORKBENCH: 'blocks/crafting_table_front',
  PISTON_BASE: 'blocks/piston_side', PISTON_STICKY_BASE: 'blocks/piston_top_sticky',
  IRON_FENCE: 'blocks/iron_bars', THIN_GLASS: 'blocks/glass',
  NETHER_BRICK: 'blocks/nether_brick', NETHER_FENCE: 'blocks/nether_brick',
  NETHER_BRICK_STAIRS: 'blocks/nether_brick', NETHERRACK: 'blocks/netherrack',
  SOUL_SAND: 'blocks/soul_sand', GLOWSTONE: 'blocks/glowstone',
  SEA_LANTERN: 'blocks/sea_lantern', WEB: 'blocks/web', VINE: 'blocks/vine',
  LADDER: 'blocks/ladder', GLASS: 'blocks/glass', ICE: 'blocks/ice',
  RAILS: 'blocks/rail_normal', POWERED_RAIL: 'blocks/rail_golden',
  DETECTOR_RAIL: 'blocks/rail_detector', ACTIVATOR_RAIL: 'blocks/rail_activator',
  TRAP_DOOR: 'blocks/trapdoor', IRON_TRAPDOOR: 'blocks/iron_trapdoor',
  STEP: (m) => ['blocks/stone_slab_side', 'blocks/sandstone_normal', 'blocks/planks_oak',
    'blocks/cobblestone', 'blocks/brick', 'blocks/stonebrick', 'blocks/nether_brick',
    'blocks/quartz_block_side'][m] ?? 'blocks/stone_slab_side',
  WOOD_STEP: (m) => `blocks/planks_${WOODS[m] ?? 'oak'}`,
  WOOD_STAIRS: 'blocks/planks_oak', SPRUCE_WOOD_STAIRS: 'blocks/planks_spruce',
  BIRCH_WOOD_STAIRS: 'blocks/planks_birch', JUNGLE_WOOD_STAIRS: 'blocks/planks_jungle',
  ACACIA_STAIRS: 'blocks/planks_acacia', DARK_OAK_STAIRS: 'blocks/planks_big_oak',
  QUARTZ_STAIRS: 'blocks/quartz_block_side', SANDSTONE_STAIRS: 'blocks/sandstone_normal',
  RED_SANDSTONE_STAIRS: 'blocks/red_sandstone_normal', BRICK_STAIRS: 'blocks/brick',
  FENCE: 'blocks/planks_oak', FENCE_GATE: 'blocks/planks_oak',
  SPRUCE_FENCE: 'blocks/planks_spruce', SPRUCE_FENCE_GATE: 'blocks/planks_spruce',
  BIRCH_FENCE: 'blocks/planks_birch', BIRCH_FENCE_GATE: 'blocks/planks_birch',
  JUNGLE_FENCE: 'blocks/planks_jungle', JUNGLE_FENCE_GATE: 'blocks/planks_jungle',
  ACACIA_FENCE: 'blocks/planks_acacia', ACACIA_FENCE_GATE: 'blocks/planks_acacia',
  DARK_OAK_FENCE: 'blocks/planks_big_oak', DARK_OAK_FENCE_GATE: 'blocks/planks_big_oak',
  WOOD_BUTTON: 'blocks/planks_oak', STONE_BUTTON: 'blocks/stone',
  WOOD_PLATE: 'blocks/planks_oak', STONE_PLATE: 'blocks/stone',
  IRON_PLATE: 'items/heavy_weighted_pressure_plate',
  GOLD_PLATE: 'items/light_weighted_pressure_plate',
  DIODE: 'items/repeater', REDSTONE_COMPARATOR: 'items/comparator',
  COMMAND: 'blocks/command_block',
};

// Verified-texture cache so re-runs don't re-probe the CDN.
const verifyCachePath = path.join(CACHE, 'texture-verify.json');
const verifyCache = fs.existsSync(verifyCachePath)
  ? JSON.parse(fs.readFileSync(verifyCachePath, 'utf8'))
  : {};
const texLimit = pLimit(16);

async function textureExists(texPath) {
  if (texPath in verifyCache) return verifyCache[texPath];
  const ok = await texLimit(async () => {
    try {
      const res = await fetch(TEXTURE_BASE + texPath + '.png', { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  });
  verifyCache[texPath] = ok;
  return ok;
}

async function resolveTexture(material, meta) {
  const candidates = [];
  const mapped = TEX[`${material}:${meta}`] ?? TEX[material];
  if (typeof mapped === 'function') candidates.push(mapped(meta ?? 0));
  else if (typeof mapped === 'string') candidates.push(mapped);
  const lower = material.toLowerCase();
  candidates.push(`items/${lower}`, `blocks/${lower}`);
  for (const c of candidates) {
    if (await textureExists(c)) return TEXTURE_BASE + c + '.png';
  }
  return null;
}

// ------------------------------------------------------------ source lines

const fmtCoins = (n) => Number(n).toLocaleString('en-US');
const fmtDuration = (s) => {
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
};

function costToText(cost) {
  const parts = [];
  for (const c of Array.isArray(cost) ? cost : [cost]) {
    if (typeof c !== 'string') continue;
    const [id, n] = c.split(':');
    if (id === 'SKYBLOCK_COIN') parts.push(`${fmtCoins(n)} coins`);
    else parts.push(`${n ? n + 'x ' : ''}${titleCase(id)}`);
  }
  return parts.join(', ');
}

function titleCase(id) {
  return String(id ?? '')
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function sourcesFromNeu(neu) {
  const out = [];
  if (!neu) return out;
  if (neu.crafttext) out.push(neu.crafttext);
  const recipes = [...(neu.recipes ?? [])];
  if (neu.recipe) recipes.push({ type: 'crafting', ...neu.recipe });
  for (const r of recipes) {
    switch (r.type) {
      case 'crafting':
      case undefined:
        out.push('Crafted (see recipe below)');
        break;
      case 'npc_shop':
        out.push(`Sold by an NPC shop${r.cost ? ` for ${costToText(r.cost)}` : ''}`);
        break;
      case 'drops': {
        const mob = stripCodes(r.name) || 'mobs';
        out.push(`Drops from ${mob}${r.level ? ` (Lv ${r.level})` : ''}`);
        break;
      }
      case 'forge':
        out.push(`Forged in the Dwarven Forge${r.duration ? ` (${fmtDuration(r.duration)})` : ''}`);
        break;
      case 'trade':
        out.push(`Trade${r.cost ? `: costs ${costToText(r.cost)}` : ''}`);
        break;
      case 'katgrade':
        out.push(`Upgraded by Kat${r.coins ? ` for ${fmtCoins(r.coins)} coins` : ''}${r.time ? ` (${fmtDuration(r.time)})` : ''}`);
        break;
    }
  }
  return [...new Set(out)].slice(0, 8);
}

function craftingGrid(neu) {
  const r = neu?.recipe ?? (neu?.recipes ?? []).find((x) => x.type === 'crafting');
  if (!r) return null;
  const slots = [];
  for (const row of ['A', 'B', 'C']) {
    for (const col of [1, 2, 3]) {
      const v = r[`${row}${col}`];
      if (!v) {
        slots.push(null);
        continue;
      }
      const [id, count] = v.split(':');
      slots.push({ id: normalizeIngredient(id), count: count ? Math.round(Number(count)) : 1 });
    }
  }
  return slots.some(Boolean) ? { slots, count: r.count ?? 1 } : null;
}

// NEU ingredient ids may be pet ids like "ENDER_DRAGON;4" or enchanted books
// like "CLEAVE;5" — map to our PET_* / ENCHANTMENT_*_* ids.
function normalizeIngredient(id) {
  if (id.includes(';')) {
    const [base, lvl] = id.split(';');
    if (neuItems.get(id)?.itemid === 'minecraft:enchanted_book') {
      return `ENCHANTMENT_${base}_${lvl}`;
    }
    return 'PET_' + base;
  }
  return id;
}

// Vanilla Minecraft items: Hypixel gives them ids identical to their Bukkit
// material, optionally with a variant suffix — dash or colon (RED_ROSE:2 is
// the vanilla Allium). NEU also flags some.
function isVanillaItem(h, neu) {
  if (neu?.vanilla === true) return true;
  if (!h.material) return false;
  if (h.id === h.material) return true;
  const m = h.id.match(/^(.+)[-:](\d+)$/);
  return m != null && m[1] === h.material;
}

// Power stones state their stats at a reference Magical Power in the lore,
// e.g. "At §62,000 Magical Power§7:" followed by "+1,851.86 Intelligence"
// lines. We store those reference values; the app rescales them to any MP
// with the standard multiplier (ln(1 + 0.0019*MP))^1.2 (the constant factor
// cancels in the ratio).
function parsePowerStone(lore) {
  if (!lore?.length || !lore.some((l) => stripCodes(l).trim() === 'Power Stone')) return null;
  const statLine = (line) => {
    // Hypixel embeds Private Use Area icon glyphs in lore; drop them.
    const clean = stripCodes(line)
      .replace(/[-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const m = clean.match(/^\+?(-?[\d,.]+)\s+(.+)$/);
    if (!m) return null;
    const colorMatch = line.match(/§([0-9a-f])/);
    return {
      name: m[2].trim(),
      value: Number(m[1].replace(/,/g, '')),
      color: colorMatch ? colorMatch[1] : '7',
    };
  };
  let refMp = null;
  const stats = [];
  const unique = [];
  let power;
  for (let i = 0; i < lore.length; i++) {
    const plain = stripCodes(lore[i]).trim();
    const mpMatch = plain.match(/^At ([\d,]+) Magical Power:$/);
    if (mpMatch) {
      refMp = Number(mpMatch[1].replace(/,/g, ''));
      for (let j = i + 1; j < lore.length && stripCodes(lore[j]).trim(); j++) {
        const s = statLine(lore[j]);
        if (s) stats.push(s);
      }
    }
    if (/^Unique Power Bonus:$/.test(plain)) {
      for (let j = i + 1; j < lore.length && stripCodes(lore[j]).trim(); j++) {
        const s = statLine(lore[j]);
        if (s) unique.push(s);
      }
    }
    const powerMatch = plain.match(/^(.+?) power\.$/);
    if (powerMatch) power = powerMatch[1].trim();
  }
  if (refMp == null || stats.length === 0) return null;
  return { power, refMp, stats, unique };
}

// Level-100 pet stats per rarity from NEU's petnums constants. Falls back to
// the highest listed level when 100 is absent (e.g. level-200 pets).
function petStatsFor(type) {
  const entry = petNums[type];
  if (!entry) return null;
  const out = {};
  for (const [rarity, levels] of Object.entries(entry)) {
    if (!levels || typeof levels !== 'object') continue;
    const keys = Object.keys(levels).filter((k) => /^\d+$/.test(k));
    if (!keys.length) continue;
    const level = keys.includes('100') ? '100' : String(Math.max(...keys.map(Number)));
    const at = levels[level];
    if (!at?.statNums) continue;
    out[rarity] = { level: Number(level), stats: at.statNums, other: at.otherNums ?? [] };
  }
  return Object.keys(out).length ? out : null;
}

// ------------------------------------------------------------- wiki lookups
// Community wiki has upscaled item sprites (PageImages) and full-page plain
// text extracts (TextExtracts). The official wiki has renders via PageImages
// but no TextExtracts, so it only serves as an image fallback.

const WIKI_COMMUNITY = 'https://hypixelskyblock.minecraft.wiki';
const WIKI_OFFICIAL = 'https://wiki.hypixel.net';
const WIKI_TTL = 7 * 86400e3; // retry misses after a week; keep hits forever

const wikiLimit = pLimit(5);

async function wikiJson(url) {
  return wikiLimit(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { 'user-agent': 'skyblock-item-browser-pipeline' },
        });
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        if (!res.ok) return null;
        return await res.json();
      } catch {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    return null;
  });
}

function loadWikiCache(file) {
  const p = path.join(CACHE, file);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}
const saveWikiCache = (file, obj) =>
  fs.writeFileSync(path.join(CACHE, file), JSON.stringify(obj));

// Wiki page title for an item on the given wiki: prefer its NEU wiki link,
// fall back to the item name (redirects=1 resolves most of those).
function wikiTitleFor(item, origin) {
  for (const link of item.wiki ?? []) {
    try {
      const u = new URL(link);
      if (u.origin !== origin) continue;
      const t = decodeURIComponent(u.pathname.split('/').pop() ?? '').replace(/_/g, ' ').trim();
      if (t) return t;
    } catch {}
  }
  const name = stripCodes(item.name ?? '').trim();
  return name || null;
}

// Batched PageImages query: requested title -> image URL.
async function batchPageImages(origin, titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const json = await wikiJson(
      `${origin}/api.php?action=query&format=json&prop=pageimages&piprop=original|thumbnail` +
        `&pithumbsize=96&redirects=1&titles=${encodeURIComponent(chunk.join('|'))}`,
    );
    if (!json?.query) continue;
    const rename = new Map();
    for (const n of json.query.normalized ?? []) rename.set(n.from, n.to);
    for (const r of json.query.redirects ?? []) rename.set(r.from, r.to);
    const resolveTitle = (t) => {
      let cur = t;
      for (let guard = 0; rename.has(cur) && guard < 5; guard++) cur = rename.get(cur);
      return cur;
    };
    const byTitle = new Map();
    for (const p of Object.values(json.query.pages ?? {})) {
      const img = p.original?.source ?? p.thumbnail?.source;
      if (img) byTitle.set(p.title, img);
    }
    for (const t of chunk) {
      const img = byTitle.get(resolveTitle(t));
      if (img) out.set(t, img);
    }
  }
  return out;
}

// Batched imageinfo query on File: titles: requested title -> file URL.
// Community uploads follow a `File:<Item Name>.png` convention that resolves
// (via redirects) even when the item's article has no usable page image.
async function batchFileImages(origin, fileTitles) {
  const out = new Map();
  for (let i = 0; i < fileTitles.length; i += 50) {
    const chunk = fileTitles.slice(i, i + 50);
    const json = await wikiJson(
      `${origin}/api.php?action=query&format=json&prop=imageinfo&iiprop=url` +
        `&redirects=1&titles=${encodeURIComponent(chunk.join('|'))}`,
    );
    if (!json?.query) continue;
    const rename = new Map();
    for (const n of json.query.normalized ?? []) rename.set(n.from, n.to);
    for (const r of json.query.redirects ?? []) rename.set(r.from, r.to);
    const resolveTitle = (t) => {
      let cur = t;
      for (let guard = 0; rename.has(cur) && guard < 5; guard++) cur = rename.get(cur);
      return cur;
    };
    const byTitle = new Map();
    for (const p of Object.values(json.query.pages ?? {})) {
      const url = p.imageinfo?.[0]?.url;
      if (url) byTitle.set(p.title, url);
    }
    for (const t of chunk) {
      const url = byTitle.get(resolveTitle(t));
      if (url) out.set(t, url);
    }
  }
  return out;
}

// Plain-text "Obtaining" section -> short source lines.
function parseObtaining(extract) {
  const clean = extract
    .replace(/[\uE000-\uF8FF]/g, '') // Hypixel PUA icon glyphs
    .replace(/\u00a0/g, ' ');
  const head = clean.match(/^== *(Obtaining|Source|Sources) *==\s*$/m);
  if (!head) return null;
  let body = clean.slice(head.index + head[0].length);
  const next = body.match(/^== [^=].* ==\s*$/m);
  if (next) body = body.slice(0, next.index);
  const lines = [];
  for (const raw of body.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    const sub = line.match(/^===+ *(.+?) *===+$/);
    if (sub) line = sub[1] + ':';
    line = line.replace(/\s+/g, ' ');
    if (line.length > 220) line = line.slice(0, 217) + '...';
    lines.push(line);
    if (lines.length >= 10) break;
  }
  return lines.length ? lines : null;
}

// TextExtracts drops tables, so a section that is only a table leaves bare
// sub-heading lines ("Mob Drops:"). Drop headings with no content under
// them; if nothing survives, keep a single honest summary line instead.
function cleanupWikiSources(lines) {
  const isHeading = (l) => /^[^:]{1,40}:$/.test(l);
  const out = lines.filter((l, i) => !isHeading(l) || (i + 1 < lines.length && !isHeading(lines[i + 1])));
  if (out.length) return out;
  const kinds = lines.map((l) => l.replace(/:$/, '')).filter(Boolean);
  return kinds.length ? [`Obtained via ${kinds.join(', ')} (see wiki for the drop table)`] : null;
}

async function fetchObtaining(title) {
  const json = await wikiJson(
    `${WIKI_COMMUNITY}/api.php?action=query&format=json&prop=extracts&explaintext=1` +
      `&redirects=1&titles=${encodeURIComponent(title)}`,
  );
  const page = Object.values(json?.query?.pages ?? {})[0];
  return page?.extract ? parseObtaining(page.extract) : null;
}

const RARITY_NAMES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];

const TAB_WEAPONS = new Set(['SWORD', 'BOW', 'LONGSWORD', 'WAND', 'GAUNTLET', 'ARROW', 'ARROW_POISON', 'FISHING_WEAPON']);
const TAB_ARMOR = new Set(['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS']);
const TAB_EQUIP = new Set(['NECKLACE', 'CLOAK', 'BELT', 'GLOVES', 'BRACELET']);

function tabFor(category, id = '') {
  // Hypixel's COSMETIC category covers pet/armor/barn/greenhouse/minion
  // skins; armor dyes come from NEU (the API doesn't list them) as DYE_*.
  if (category === 'COSMETIC' || id.startsWith('DYE_')) return 'cosmetics';
  if (TAB_WEAPONS.has(category)) return 'weapons';
  if (TAB_ARMOR.has(category)) return 'armor';
  if (category === 'ACCESSORY') return 'accessories';
  if (TAB_EQUIP.has(category)) return 'equipment';
  if (category === 'PET_ITEM') return 'pet_items';
  if (category === 'PET') return 'pets';
  return 'misc';
}

// -------------------------------------------------------------------- main

console.log('[1/8] Hypixel API items...');
const hypixel = JSON.parse(
  (await cached('hypixel-items.json', () => fetchBuffer(HYPIXEL_ITEMS_URL))).toString('utf8'),
);
if (!hypixel.success) throw new Error('Hypixel API returned success=false');
console.log(`      ${hypixel.items.length} items`);

console.log('[2/8] NEU repo tarball...');
const tarball = await cached('neu.tar.gz', () => fetchBuffer(NEU_TARBALL_URL));
const neuItems = new Map();
let petNums = {};
for (const { name, data } of tarEntries(zlib.gunzipSync(tarball))) {
  if (name.endsWith('/constants/petnums.json')) {
    try {
      petNums = JSON.parse(data.toString('utf8'));
    } catch {}
    continue;
  }
  const m = name.match(/\/items\/(.+)\.json$/);
  if (!m) continue;
  try {
    neuItems.set(m[1], JSON.parse(data.toString('utf8')));
  } catch {
    /* skip malformed */
  }
}
console.log(`      ${neuItems.size} NEU item files, ${Object.keys(petNums).length} pets with stat curves`);

console.log('[3/8] building items...');
const items = [];

for (const h of hypixel.items) {
  const neu = neuItems.get(h.id);
  let icon = { kind: 'none' };
  const skinHash =
    (h.skin?.value && skullHashFromBase64(h.skin.value)) || skullHashFromNbt(neu?.nbttag);
  if (skinHash) {
    icon = { kind: 'skull', url: MC_HEADS(skinHash) };
  } else if (h.material) {
    const url = await resolveTexture(h.material, h.durability ?? 0);
    if (url) icon = { kind: 'texture', url };
  }
  const item = {
    id: h.id,
    // some API names carry %%color%% templating (e.g. "%%red%%Volcanic Rock")
    name: (h.name ?? stripCodes(neu?.displayname) ?? titleCase(h.id)).replace(/%%[a-z_]+%%/g, '').trim(),
    category: h.category ?? 'NONE',
    tab: tabFor(h.category ?? 'NONE', h.id),
    tier: h.tier ?? 'COMMON',
    lore: neu?.lore ?? [],
    stats: h.stats && Object.keys(h.stats).length ? h.stats : undefined,
    npcSellPrice: h.npc_sell_price,
    museum: h.museum_data?.category,
    icon,
    tint: h.color, // "r,g,b" leather dye
    sources: sourcesFromNeu(neu),
    recipe: craftingGrid(neu),
    wiki: neu?.info?.filter((u) => typeof u === 'string' && u.startsWith('http')),
    isVanilla: isVanillaItem(h, neu) || undefined,
    powerStone: parsePowerStone(neu?.lore) ?? undefined,
  };
  items.push(item);
}

console.log('[4/8] pets from NEU...');
const petFiles = new Map(); // type -> [{rarity, json}]
for (const [internal, json] of neuItems) {
  const m = internal.match(/^([A-Z0-9_]+);(\d)$/);
  if (!m || !json.nbttag?.includes('petInfo')) continue;
  const list = petFiles.get(m[1]) ?? [];
  list.push({ rarity: Number(m[2]), json });
  petFiles.set(m[1], list);
}
const existingIds = new Set(items.map((i) => i.id));
for (const [type, variants] of petFiles) {
  variants.sort((a, b) => b.rarity - a.rarity);
  const best = variants[0];
  const hash = skullHashFromNbt(best.json.nbttag);
  const id = `PET_${type}`;
  if (existingIds.has(id)) continue;
  items.push({
    id,
    name: stripCodes(best.json.displayname).replace(/^\[Lvl \{LVL\}\]\s*/, '') || titleCase(type),
    category: 'PET',
    tab: 'pets',
    tier: RARITY_NAMES[best.rarity] ?? 'COMMON',
    lore: best.json.lore ?? [],
    icon: hash ? { kind: 'skull', url: MC_HEADS(hash) } : { kind: 'none' },
    sources: sourcesFromNeu(best.json),
    recipe: craftingGrid(best.json),
    wiki: best.json.info?.filter((u) => typeof u === 'string' && u.startsWith('http')),
    petInfo: { type, rarities: variants.map((v) => RARITY_NAMES[v.rarity]).reverse() },
    petStats: petStatsFor(type) ?? undefined,
  });
}
console.log(`      ${petFiles.size} pets`);

// Armor dyes exist only in NEU — the Hypixel items API doesn't list them.
// Their rarity is the last lore line ("§5§lEPIC DYE").
console.log('[4.5/8] armor dyes from NEU...');
let dyeCount = 0;
for (const [internal, json] of neuItems) {
  if (!internal.startsWith('DYE_') || existingIds.has(internal)) continue;
  const hash = skullHashFromNbt(json.nbttag);
  const rarityWord = stripCodes(json.lore?.at(-1) ?? '').trim().split(/\s+/)[0];
  items.push({
    id: internal,
    name: stripCodes(json.displayname) || titleCase(internal),
    category: 'COSMETIC',
    tab: tabFor('COSMETIC', internal),
    tier: RARITY_NAMES.includes(rarityWord) ? rarityWord : 'COMMON',
    lore: json.lore ?? [],
    icon: hash ? { kind: 'skull', url: MC_HEADS(hash) } : { kind: 'none' },
    sources: sourcesFromNeu(json),
    recipe: craftingGrid(json),
    wiki: json.info?.filter((u) => typeof u === 'string' && u.startsWith('http')),
  });
  dyeCount++;
}
console.log(`      ${dyeCount} dyes`);

// Enchanted books exist in NEU as one file per enchant level (CLEAVE;6).
// Their app ids follow the bazaar product convention ENCHANTMENT_<NAME>_<LVL>
// so market prices resolve without any mapping. The book's tier is the color
// of its "Enchanted Book" displayname; its real name is the first lore line.
console.log('[4.6/8] enchanted books from NEU...');
const COLOR_TIER = { f: 'COMMON', 7: 'COMMON', a: 'UNCOMMON', 9: 'RARE', 5: 'EPIC', 6: 'LEGENDARY', d: 'MYTHIC', b: 'DIVINE' };
let bookCount = 0;
const bookLevels = new Map(); // enchant base -> [{ level, item }]
for (const [internal, json] of neuItems) {
  const m = internal.match(/^([A-Z0-9_]+);(\d+)$/);
  if (!m || json.itemid !== 'minecraft:enchanted_book') continue;
  const id = `ENCHANTMENT_${m[1]}_${m[2]}`;
  if (existingIds.has(id)) continue;
  existingIds.add(id);
  const colorCode = (json.displayname?.match(/§([0-9a-f])/) ?? [])[1];
  const item = {
    id,
    name: stripCodes(json.lore?.[0] ?? '').trim() || `${titleCase(m[1])} ${m[2]}`,
    category: 'ENCHANTED_BOOK',
    tab: 'enchants',
    tier: COLOR_TIER[colorCode] ?? 'COMMON',
    lore: json.lore ?? [],
    icon: { kind: 'texture', url: TEXTURE_BASE + 'items/book_enchanted.png' },
    sources: sourcesFromNeu(json),
    recipe: craftingGrid(json),
    wiki: json.info?.filter((u) => typeof u === 'string' && u.startsWith('http')),
  };
  items.push(item);
  const levels = bookLevels.get(m[1]) ?? [];
  levels.push({ level: Number(m[2]), item });
  bookLevels.set(m[1], levels);
  bookCount++;
}
// Each enchantment's highest level renders with chroma text (like Hypixel
// shows maxed enchants).
for (const levels of bookLevels.values()) {
  levels.sort((a, b) => b.level - a.level)[0].item.maxEnchant = true;
}
console.log(`      ${bookCount} enchanted books (${bookLevels.size} enchantments)`);

// First-seen ledger driving the "New" tab: ids the pipeline has never seen
// before get today's date. Seed the ledger once with
// scripts/seed-item-dates.mjs (it reconstructs this year's additions from
// NEU git history); without it, no dates are stamped.
console.log('[4.7/8] item added-dates...');
{
  const DATES_FILE = path.join(OUT_DIR, 'item-dates.json');
  let ledger = null;
  try {
    ledger = JSON.parse(fs.readFileSync(DATES_FILE, 'utf8'));
  } catch {
    console.log('      no data/item-dates.json — run scripts/seed-item-dates.mjs once to enable the New tab');
  }
  if (ledger) {
    const today = new Date().toISOString().slice(0, 10);
    // One-time backfill: the first run that includes enchanted books must not
    // flood the "New" tab with 700+ ids, so they get an old sentinel date.
    // Once the ledger knows the books, genuinely new enchants get real dates.
    // (Threshold, not zero: a stray Hypixel item id can share the prefix.)
    const backfillBooks =
      Object.keys(ledger).filter((k) => k.startsWith('ENCHANTMENT_')).length < 10;
    let freshIds = 0;
    for (const it of items) {
      if (!ledger[it.id]) {
        ledger[it.id] =
          backfillBooks && it.id.startsWith('ENCHANTMENT_') ? '2019-01-01' : today;
        freshIds++;
      }
      it.addedAt = ledger[it.id];
    }
    fs.writeFileSync(DATES_FILE, JSON.stringify(ledger, null, 1));
    console.log(`      ${freshIds} first-seen today; ${Object.keys(ledger).length} ids tracked`);
  }
}

console.log('[5/8] wiki item sprites (paper/missing icons)...');
{
  const needsIcon = (it) =>
    it.icon.kind === 'none' ||
    (it.icon.kind === 'texture' && it.icon.url.endsWith('items/paper.png'));
  const iconCache = loadWikiCache('wiki-icons.json');
  const now = Date.now();
  const pending = items.filter((it) => {
    if (!needsIcon(it)) return false;
    const c = iconCache[it.id];
    return !c || (c.url == null && now - c.t > WIKI_TTL);
  });
  const unresolved = () => pending.filter((it) => !iconCache[it.id]?.url);
  const store = (titleToItems, images) => {
    for (const [title, list] of titleToItems) {
      const url = images.get(title);
      if (url) for (const it of list) iconCache[it.id] = { url, t: now };
    }
  };
  const groupBy = (list, titleOf) => {
    const m = new Map();
    for (const it of list) {
      const t = titleOf(it);
      if (!t) continue;
      const arr = m.get(t) ?? [];
      arr.push(it);
      m.set(t, arr);
    }
    return m;
  };

  // 1. Community wiki page images (pixel-art sprites, directly fetchable).
  {
    const g = groupBy(unresolved(), (it) => wikiTitleFor(it, WIKI_COMMUNITY));
    if (g.size) store(g, await batchPageImages(WIKI_COMMUNITY, [...g.keys()]));
  }
  // 2. Community wiki File:<Item Name>.png — catches items whose article
  //    redirects to a shared page with no page image (e.g. gemstone crystals).
  {
    const g = groupBy(unresolved(), (it) => {
      const name = stripCodes(it.name).trim();
      return name ? `File:${name}.png` : null;
    });
    if (g.size) store(g, await batchFileImages(WIKI_COMMUNITY, [...g.keys()]));
  }
  // 3. Official wiki page images. wiki.hypixel.net rejects programmatic image
  //    downloads with 403 (Cloudflare hotlink protection), so these URLs are
  //    only usable once scrape-wiki-icons.cjs has downloaded the bytes into
  //    data/icons/ through a real browser session.
  {
    const g = groupBy(unresolved(), (it) => wikiTitleFor(it, WIKI_OFFICIAL));
    if (g.size) store(g, await batchPageImages(WIKI_OFFICIAL, [...g.keys()]));
  }

  for (const it of pending) if (!iconCache[it.id]?.url) iconCache[it.id] = { url: null, t: now };
  const bundledIcon = (id) =>
    ['gif', 'png'].some((ext) => fs.existsSync(path.join(ICONS_DIR, `${id}.${ext}`)));
  let replaced = 0;
  let bundled = 0;
  for (const it of items) {
    if (!needsIcon(it)) continue;
    const url = iconCache[it.id]?.url;
    if (url) {
      it.icon = { kind: 'wiki', url };
      replaced++;
    } else if (bundledIcon(it.id)) {
      // scraped image shipped inside data/icons/ — no remote URL needed
      it.icon = { kind: 'wiki' };
      bundled++;
    }
  }
  saveWikiCache('wiki-icons.json', iconCache);
  console.log(`      ${replaced} icons from wiki urls, ${bundled} from bundled scrapes (${pending.length} looked up)`);
}

console.log('[6/8] wiki "Obtaining" sections (items with no sources)...');
{
  const srcCache = loadWikiCache('wiki-sources.json');
  const now = Date.now();
  const candidates = items.filter((it) => it.sources.length === 0);
  const pending = candidates.filter((it) => {
    const c = srcCache[it.id];
    return !c || (c.lines == null && now - c.t > WIKI_TTL);
  });
  let done = 0;
  await Promise.all(
    pending.map(async (it) => {
      const title = wikiTitleFor(it, WIKI_COMMUNITY);
      const lines = title ? await fetchObtaining(title) : null;
      srcCache[it.id] = { lines, t: now };
      if (++done % 250 === 0) {
        console.log(`      ${done}/${pending.length} pages fetched`);
        saveWikiCache('wiki-sources.json', srcCache);
      }
    }),
  );
  let filled = 0;
  for (const it of candidates) {
    const lines = srcCache[it.id]?.lines;
    const cleaned = lines?.length ? cleanupWikiSources(lines) : null;
    if (cleaned?.length) {
      it.sources = cleaned;
      it.sourcesFromWiki = true;
      filled++;
    }
  }
  saveWikiCache('wiki-sources.json', srcCache);
  console.log(`      ${filled}/${candidates.length} empty-source items filled from the wiki`);
}

console.log('[7/8] reverse "used in" index...');
const usedIn = new Map();
for (const it of items) {
  const ingredientIds = new Set();
  for (const slot of it.recipe?.slots ?? []) {
    if (slot) ingredientIds.add(slot.id);
  }
  const neu = neuItems.get(it.id);
  for (const r of neu?.recipes ?? []) {
    if (r.type === 'forge') {
      for (const inp of r.inputs ?? []) ingredientIds.add(normalizeIngredient(inp.split(':')[0]));
    }
  }
  for (const ing of ingredientIds) {
    const list = usedIn.get(ing) ?? [];
    if (list.length < 40 && !list.includes(it.id)) list.push(it.id);
    usedIn.set(ing, list);
  }
}
for (const it of items) {
  const u = usedIn.get(it.id);
  if (u?.length) it.usedIn = u;
}

fs.writeFileSync(verifyCachePath, JSON.stringify(verifyCache));

const iconStats = items.reduce((a, i) => ((a[i.icon.kind] = (a[i.icon.kind] ?? 0) + 1), a), {});
console.log('      icon kinds:', JSON.stringify(iconStats));

console.log('[8/8] writing data/items.json...');
const payload = {
  meta: {
    generatedAt: new Date().toISOString(),
    itemCount: items.length,
    sources: ['api.hypixel.net', 'NotEnoughUpdates-REPO', 'minecraft-assets 1.8.8', 'mc-heads.net',
      'hypixelskyblock.minecraft.wiki', 'wiki.hypixel.net'],
  },
  items,
};
fs.writeFileSync(path.join(OUT_DIR, 'items.json'), JSON.stringify(payload));
console.log(`      wrote ${items.length} items (${(fs.statSync(path.join(OUT_DIR, 'items.json')).size / 1e6).toFixed(1)} MB)`);

if (ARGS.has('--icons')) {
  console.log('[icons] downloading all icons...');
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  const dl = pLimit(12);
  let done = 0;
  let failed = 0;
  await Promise.all(
    items
      .filter((i) => i.icon.url)
      .map((i) =>
        dl(async () => {
          const dest = path.join(ICONS_DIR, `${i.id}.png`);
          if (fs.existsSync(dest)) return;
          try {
            fs.writeFileSync(dest, await fetchBuffer(i.icon.url));
          } catch {
            failed++;
          }
          if (++done % 500 === 0) console.log(`        ${done} downloaded`);
        }),
      ),
  );
  console.log(`[icons] done (${failed} failed)`);
}
console.log('Pipeline complete.');
