import { useEffect, useMemo, useState } from 'react';
import type { Build, GearPiece, GearSlot, SkyblockItem } from '../types';
import { useStore } from '../state/store';
import { getPriceCached, priceValue } from '../state/prices';
import { fmtCoins, tierColor, titleCase } from '../mc/format';
import { ItemIcon } from './ItemIcon';
import { ItemPicker } from './ItemPicker';

const GEAR_LABELS: Record<GearSlot, string> = {
  item: 'Weapon / Item',
  helmet: 'Helmet',
  chestplate: 'Chestplate',
  leggings: 'Leggings',
  boots: 'Boots',
};
const ARMOR_SLOTS: GearSlot[] = ['helmet', 'chestplate', 'leggings', 'boots'];

const MASTER_STARS = [
  'FIRST_MASTER_STAR',
  'SECOND_MASTER_STAR',
  'THIRD_MASTER_STAR',
  'FOURTH_MASTER_STAR',
  'FIFTH_MASTER_STAR',
];

// Hypixel category -> NEU enchant-table key, where they differ
const CATEGORY_ENCH_TYPE: Record<string, string> = { SPADE: 'SHOVEL' };

/** the enchant-table type a gear slot enchants as (undefined = unknown) */
function slotEnchType(slot: GearSlot, item?: SkyblockItem): string | undefined {
  if (slot !== 'item') return slot.toUpperCase();
  const c = item?.category;
  return c ? (CATEGORY_ENCH_TYPE[c] ?? c) : undefined;
}

const enchantBase = (id: string) =>
  id.replace(/^ENCHANTMENT_/, '').replace(/_\d+$/, '').toLowerCase();
const isUltimate = (id: string) => enchantBase(id).startsWith('ultimate_');

// Potato books: weapons/armor only; adding them always applies the full
// stack (nobody stops short of the cap).
const MAX_HPB = 10;
const MAX_FUMING = 5;
const POTATO_CATEGORIES = new Set([
  'SWORD',
  'LONGSWORD',
  'BOW',
  'GAUNTLET',
  'WAND',
  'FISHING_WEAPON',
  'FISHING_ROD',
  'HELMET',
  'CHESTPLATE',
  'LEGGINGS',
  'BOOTS',
]);
const potatoEligible = (slot: GearSlot, item?: SkyblockItem) =>
  slot !== 'item' || POTATO_CATEGORIES.has(item?.category ?? '');

// Gemstone slot categories -> gem types they accept (Hypixel wiki).
const ALL_GEMS = ['RUBY', 'AMBER', 'TOPAZ', 'JADE', 'SAPPHIRE', 'AMETHYST', 'JASPER', 'OPAL', 'AQUAMARINE', 'CITRINE', 'ONYX', 'PERIDOT'];
const GEM_SLOT_ACCEPTS: Record<string, string[]> = {
  COMBAT: ['RUBY', 'AMETHYST', 'SAPPHIRE', 'JASPER', 'ONYX', 'OPAL'],
  DEFENSIVE: ['RUBY', 'AMETHYST', 'OPAL'],
  MINING: ['JADE', 'AMBER', 'TOPAZ'],
  UNIVERSAL: ALL_GEMS,
  CHISEL: ['AQUAMARINE', 'CITRINE', 'ONYX', 'PERIDOT'],
};
const slotAccepts = (slotType: string) => GEM_SLOT_ACCEPTS[slotType] ?? [slotType];
const gemTypeOf = (id: string) =>
  id.match(/^(?:ROUGH|FLAWED|FINE|FLAWLESS|PERFECT)_([A-Z]+)_GEM$/)?.[1];

const newPiece = (id: string): GearPiece => ({
  id,
  enchantments: [],
  upgrades: [],
});

// Reforge-stone applicability: NEU types are coarser than Hypixel categories.
const REFORGE_ALIASES: Record<string, string[]> = {
  LONGSWORD: ['SWORD'],
  GAUNTLET: ['SWORD'],
  DRILL: ['PICKAXE'],
  FISHING_ROD: ['ROD'],
  FISHING_WEAPON: ['ROD'],
  CLOAK: ['CLOAK', 'EQUIPMENT'],
  BELT: ['BELT', 'EQUIPMENT'],
  NECKLACE: ['EQUIPMENT'],
  GLOVES: ['EQUIPMENT'],
  BRACELET: ['EQUIPMENT'],
};

function reforgeMatches(stone: SkyblockItem, slot: GearSlot, item?: SkyblockItem): boolean {
  const types = stone.reforgeTypes;
  if (!types) return true; // no data — keep the stone available
  if (slot !== 'item') return types.includes('ARMOR') || types.includes(slot.toUpperCase());
  const c = item?.category;
  if (!c) return true;
  return (REFORGE_ALIASES[c] ?? [c]).some((t) => types.includes(t));
}

function newBuild(): Build {
  return {
    id: crypto.randomUUID(),
    name: 'New Build',
    updatedAt: new Date().toISOString(),
    gear: {},
  };
}

/** accept builds saved by older versions (string gear, global enchant list) */
function normalizeBuild(raw: any): Build {
  const gear: Build['gear'] = {};
  for (const slot of Object.keys(GEAR_LABELS) as GearSlot[]) {
    const g = raw?.gear?.[slot];
    if (typeof g === 'string') gear[slot] = newPiece(g);
    else if (g && typeof g.id === 'string') {
      gear[slot] = {
        id: g.id,
        enchantments: Array.isArray(g.enchantments) ? g.enchantments : [],
        reforge: typeof g.reforge === 'string' ? g.reforge : undefined,
        upgrades: Array.isArray(g.upgrades) ? g.upgrades : [],
        gemstones: Array.isArray(g.gemstones) ? g.gemstones : undefined,
        hotPotatoBooks: typeof g.hotPotatoBooks === 'number' ? g.hotPotatoBooks : 0,
        fumingPotatoBooks: typeof g.fumingPotatoBooks === 'number' ? g.fumingPotatoBooks : 0,
      };
    }
  }
  // legacy build-level fields land on the first filled slot
  const firstPiece =
    gear.item ?? gear.helmet ?? gear.chestplate ?? gear.leggings ?? gear.boots;
  if (Array.isArray(raw?.enchantments) && raw.enchantments.length && firstPiece) {
    firstPiece.enchantments = [...new Set([...firstPiece.enchantments, ...raw.enchantments])];
  }
  if (typeof raw?.reforge === 'string' && firstPiece && !firstPiece.reforge) {
    firstPiece.reforge = raw.reforge;
  }
  if (Array.isArray(raw?.upgrades) && raw.upgrades.length && firstPiece) {
    firstPiece.upgrades = [...firstPiece.upgrades, ...raw.upgrades];
  }
  return {
    id: String(raw?.id ?? crypto.randomUUID()),
    name: String(raw?.name ?? 'Unnamed Build'),
    updatedAt: String(raw?.updatedAt ?? new Date().toISOString()),
    gear,
    petId: raw?.petId,
    petRarity: raw?.petRarity,
    petItemId: raw?.petItemId,
    catacombsLevel: raw?.catacombsLevel,
    dungeonStars: raw?.dungeonStars,
    masterStars: raw?.masterStars,
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo;

interface EstimateRow {
  label: string;
  name: string;
  value: number | null;
}

/** resolve market prices for every priceable component of a build */
function useEstimate(build: Build | null, byId: Map<string, SkyblockItem>) {
  const [rows, setRows] = useState<EstimateRow[] | null>([]);
  const partsKey = JSON.stringify(
    build && [build.gear, build.petId, build.petRarity, build.petItemId, build.masterStars],
  );

  useEffect(() => {
    if (!build) {
      setRows([]);
      return;
    }
    const parts: { label: string; id: string; rarity?: string; count?: number }[] = [];
    for (const [slot, piece] of Object.entries(build.gear)) {
      if (!piece) continue;
      const label = GEAR_LABELS[slot as GearSlot];
      parts.push({ label, id: piece.id });
      for (const id of piece.enchantments) parts.push({ label: 'Enchant', id });
      if (piece.reforge) parts.push({ label: `${label} reforge`, id: piece.reforge });
      for (const id of piece.upgrades) parts.push({ label: `${label} upgrade`, id });
      for (const id of piece.gemstones ?? []) {
        if (id) parts.push({ label: `${label} gemstone`, id });
      }
      if (potatoEligible(slot as GearSlot, byId.get(piece.id))) {
        const hpb = clamp(piece.hotPotatoBooks ?? 0, 0, MAX_HPB);
        const fuming = clamp(piece.fumingPotatoBooks ?? 0, 0, MAX_FUMING);
        if (hpb > 0) parts.push({ label, id: 'HOT_POTATO_BOOK', count: hpb });
        if (fuming > 0) parts.push({ label, id: 'FUMING_POTATO_BOOK', count: fuming });
      }
    }
    for (let i = 0; i < clamp(build.masterStars ?? 0, 0, 5); i++) {
      parts.push({ label: 'Master Star', id: MASTER_STARS[i] });
    }
    if (build.petId) parts.push({ label: 'Pet', id: build.petId, rarity: build.petRarity });
    if (build.petItemId) parts.push({ label: 'Pet Item', id: build.petItemId });

    if (parts.length === 0) {
      setRows([]);
      return;
    }
    let stale = false;
    setRows(null); // loading
    Promise.all(
      parts.map(async (p) => {
        const count = p.count ?? 1;
        const unit = priceValue(await getPriceCached(p.id, p.rarity));
        return {
          label: p.label,
          name: `${byId.get(p.id)?.name ?? titleCase(p.id)}${count > 1 ? ` ×${count}` : ''}`,
          value: unit == null ? null : unit * count,
        };
      }),
    ).then((resolved) => !stale && setRows(resolved));
    return () => {
      stale = true;
    };
    // partsKey captures every input above
  }, [partsKey]);

  return rows;
}

function Coins({ value }: { value: number | null }) {
  if (value == null) return <span className="muted">no data</span>;
  return (
    <span className="coin-value" title={`${Math.round(value).toLocaleString('en-US')} coins`}>
      {fmtCoins(value)}
    </span>
  );
}

/** a picked single item: icon + name + clear button */
function Picked({ id, byId, onClear }: { id: string; byId: Map<string, SkyblockItem>; onClear: () => void }) {
  const it = byId.get(id);
  return (
    <div className="picked-row">
      {it && <ItemIcon id={it.id} name={it.name} kind={it.icon.kind} tint={it.tint} size={20} />}
      <span style={it ? { color: tierColor(it.tier) } : undefined}>{it?.name ?? titleCase(id)}</span>
      <button className="chip clickable picked-clear" onClick={onClear}>
        ✕
      </button>
    </div>
  );
}

/** a filled gear slot: the item plus its own enchant list, rule-filtered */
function GearPieceEditor({
  slot,
  piece,
  byId,
  enchantPool,
  reforgePool,
  upgradePool,
  gemPool,
  onChange,
  onClear,
}: {
  slot: GearSlot;
  piece: GearPiece;
  byId: Map<string, SkyblockItem>;
  enchantPool: SkyblockItem[];
  reforgePool: SkyblockItem[];
  upgradePool: SkyblockItem[];
  gemPool: SkyblockItem[];
  onChange: (piece: GearPiece) => void;
  onClear: () => void;
}) {
  const item = byId.get(piece.id);
  const type = slotEnchType(slot, item);

  const reforgeOptions = useMemo(
    () => reforgePool.filter((stone) => reforgeMatches(stone, slot, item)),
    [reforgePool, slot, item],
  );

  // Enchants offered for this piece: must apply to this item type, must not
  // conflict with an already-applied enchant (pools + one-ultimate rule).
  // Books NEU has no applicability data for stay available everywhere.
  const options = useMemo(() => {
    const existingBases = new Set(piece.enchantments.map(enchantBase));
    const conflictBases = new Set<string>();
    for (const id of piece.enchantments) {
      for (const c of byId.get(id)?.enchConflicts ?? []) conflictBases.add(c);
    }
    const hasUltimate = piece.enchantments.some(isUltimate);
    return enchantPool.filter((book) => {
      if (book.enchApplies && (!type || !book.enchApplies.includes(type))) return false;
      const base = enchantBase(book.id);
      if (existingBases.has(base)) return true; // level swap
      if (isUltimate(book.id) && hasUltimate) return false;
      if (conflictBases.has(base)) return false;
      if ((book.enchConflicts ?? []).some((c) => existingBases.has(c))) return false;
      return true;
    });
  }, [enchantPool, piece.enchantments, type, byId]);

  const addEnchant = (book: SkyblockItem) => {
    const base = enchantBase(book.id);
    onChange({
      ...piece,
      enchantments: [...piece.enchantments.filter((e) => enchantBase(e) !== base), book.id],
    });
  };

  return (
    <div className="gear-piece">
      <div className="gear-piece-head">
        <Picked id={piece.id} byId={byId} onClear={onClear} />
        {potatoEligible(slot, item) && (
          <div className="chip-row">
          {(piece.hotPotatoBooks ?? 0) > 0 ? (
            <button
              className="chip clickable"
              title="Remove"
              onClick={() => onChange({ ...piece, hotPotatoBooks: 0 })}
            >
              🥔 Hot Potato Books ×{MAX_HPB} ✕
            </button>
          ) : (
            <button
              className="chip clickable"
              onClick={() => onChange({ ...piece, hotPotatoBooks: MAX_HPB })}
            >
              + Hot Potato Books (×{MAX_HPB})
            </button>
          )}
          {(piece.fumingPotatoBooks ?? 0) > 0 ? (
            <button
              className="chip clickable"
              title="Remove"
              onClick={() => onChange({ ...piece, fumingPotatoBooks: 0 })}
            >
              🥔 Fuming Potato Books ×{MAX_FUMING} ✕
            </button>
          ) : (
            <button
              className="chip clickable"
              onClick={() => onChange({ ...piece, fumingPotatoBooks: MAX_FUMING })}
            >
              + Fuming Potato Books (×{MAX_FUMING})
            </button>
          )}
        </div>
        )}
      </div>
      <div className="piece-group">
        <span className="piece-group-label">Enchants</span>
        <div className="piece-group-body">
        <ItemPicker
          pool={options}
          placeholder="Add an enchanted book... (conflicting ones are hidden)"
          onPick={addEnchant}
        />
        {piece.enchantments.length > 0 && (
        <div className="chip-row">
          {piece.enchantments.map((id) => (
            <button
              key={id}
              className="chip clickable"
              style={{ color: tierColor(byId.get(id)?.tier ?? 'COMMON') }}
              title="Remove"
              onClick={() =>
                onChange({ ...piece, enchantments: piece.enchantments.filter((x) => x !== id) })
              }
            >
              {byId.get(id)?.name ?? titleCase(id)} ✕
            </button>
          ))}
        </div>
        )}
        </div>
      </div>
      <div className="piece-group">
        <span className="piece-group-label">Reforge</span>
        <div className="piece-group-body">
        {piece.reforge ? (
          <Picked
            id={piece.reforge}
            byId={byId}
            onClear={() => onChange({ ...piece, reforge: undefined })}
          />
        ) : (
          <ItemPicker
            pool={reforgeOptions}
            placeholder="Add a reforge stone... (non-matching ones are hidden)"
            onPick={(it) => onChange({ ...piece, reforge: it.id })}
          />
        )}
        </div>
      </div>
      <div className="piece-group">
        <span className="piece-group-label">Upgrades</span>
        <div className="piece-group-body">
        <ItemPicker
          pool={upgradePool}
          placeholder="Add an upgrade item (Recombobulator, Art of War, ...)"
          onPick={(it) => onChange({ ...piece, upgrades: [...piece.upgrades, it.id] })}
        />
        {piece.upgrades.length > 0 && (
        <div className="chip-row">
          {piece.upgrades.map((id, i) => (
            <button
              key={`${id}-${i}`}
              className="chip clickable"
              style={{ color: tierColor(byId.get(id)?.tier ?? 'COMMON') }}
              title="Remove"
              onClick={() =>
                onChange({ ...piece, upgrades: piece.upgrades.filter((_, idx) => idx !== i) })
              }
            >
              {byId.get(id)?.name ?? titleCase(id)} ✕
            </button>
          ))}
        </div>
        )}
        </div>
      </div>
      {(item?.gemstoneSlots?.length ?? 0) > 0 && (
      <div className="piece-group">
        <span className="piece-group-label">Gemstones</span>
        <div className="piece-group-body">
        {(item?.gemstoneSlots ?? []).map((slotType, i) => {
          const socketed = piece.gemstones?.[i] ?? null;
          const setGem = (gemId: string | null) => {
            const gems = [...(piece.gemstones ?? [])];
            while (gems.length < (item?.gemstoneSlots?.length ?? 0)) gems.push(null);
            gems[i] = gemId;
            onChange({ ...piece, gemstones: gems });
          };
          const accepted = slotAccepts(slotType);
          return (
            <div key={i} className="picked-with-rarity">
              <span className="slot-sub-label">{titleCase(slotType)} slot:</span>
              {socketed ? (
                <Picked id={socketed} byId={byId} onClear={() => setGem(null)} />
              ) : (
                <div className="gem-picker">
                  <ItemPicker
                    pool={gemPool.filter((g) => {
                      const t = gemTypeOf(g.id);
                      return t != null && accepted.includes(t);
                    })}
                    placeholder={`Add a ${accepted.length === 1 ? titleCase(accepted[0]).toLowerCase() : titleCase(slotType).toLowerCase()} gemstone...`}
                    onPick={(g) => setGem(g.id)}
                  />
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
      )}
    </div>
  );
}

export function BuildsPanel() {
  const store = useStore();
  const byId = store.byId;
  const [builds, setBuilds] = useState<Build[]>([]);
  const [draft, setDraft] = useState<Build | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    window.sbApi.listBuilds().then((list) => setBuilds((list as unknown[]).map(normalizeBuild)));
  }, []);

  const pools = useMemo(() => {
    const items = store.items;
    return {
      item: items.filter((it) => it.tab !== 'enchants' && it.category !== 'PET'),
      helmet: items.filter((it) => it.category === 'HELMET'),
      chestplate: items.filter((it) => it.category === 'CHESTPLATE'),
      leggings: items.filter((it) => it.category === 'LEGGINGS'),
      boots: items.filter((it) => it.category === 'BOOTS'),
      enchants: items.filter((it) => it.tab === 'enchants'),
      reforges: items.filter((it) => it.category === 'REFORGE_STONE'),
      gemstones: items.filter((it) => /_GEM$/.test(it.id)),
      upgrades: items.filter((it) => it.tab !== 'enchants' && it.category !== 'PET'),
      pets: items.filter((it) => it.tab === 'pets'),
      petItems: items.filter((it) => it.tab === 'pet_items'),
    };
  }, [store.items]);

  const set = (patch: Partial<Build>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setGear = (slot: GearSlot, piece: GearPiece | undefined) =>
    setDraft((d) => (d ? { ...d, gear: { ...d.gear, [slot]: piece } } : d));

  const save = async () => {
    if (!draft) return;
    const toSave = {
      ...draft,
      name: draft.name.trim() || 'Unnamed Build',
      updatedAt: new Date().toISOString(),
    };
    const list = (await window.sbApi.saveBuild(toSave)) as unknown[];
    setBuilds(list.map(normalizeBuild));
    setDraft(toSave);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const remove = async (id: string) => {
    const list = (await window.sbApi.deleteBuild(id)) as unknown[];
    setBuilds(list.map(normalizeBuild));
    if (draft?.id === id) setDraft(null);
  };

  // A build is EITHER a weapon/item OR an armor set — never both. Filled
  // slots from older builds are always shown so they can be cleared.
  const hasWeapon = !!draft?.gear.item;
  const hasArmor = ARMOR_SLOTS.some((s) => draft?.gear[s]);

  const isDungeonBuild = useMemo(() => {
    if (!draft) return false;
    if (draft.catacombsLevel || draft.dungeonStars || draft.masterStars) return true;
    return Object.values(draft.gear).some((piece) => {
      const it = piece ? byId.get(piece.id) : undefined;
      return it?.lore.some((l) => /DUNGEON/i.test(l)) ?? false;
    });
  }, [draft, byId]);

  const estimate = useEstimate(draft, byId);
  const total = (estimate ?? []).reduce((sum, r) => sum + (r.value ?? 0), 0);
  const unpriced = (estimate ?? []).filter((r) => r.value == null).length;

  return (
    <section className="builds-view mc-panel">
      <div className="builds-head">
        <h2 className="mc-shadow">Builds</h2>
        {draft && (
          <>
            {savedFlash && <span className="muted">Saved ✓</span>}
            <button className="mc-btn" onClick={save}>
              💾 Save Build
            </button>
          </>
        )}
        <button className="mc-btn" onClick={() => setDraft(newBuild())}>
          + New Build
        </button>
      </div>

      <div className="builds-body">
        <aside className="builds-list">
          {builds.length === 0 && <div className="muted">No saved builds yet.</div>}
          {builds.map((b) => (
            <div key={b.id} className={`build-row${draft?.id === b.id ? ' active' : ''}`}>
              <button className="build-row-main" onClick={() => setDraft(structuredClone(b))}>
                <span className="build-row-name">{b.name}</span>
                <span className="muted">{new Date(b.updatedAt).toLocaleDateString()}</span>
              </button>
              <button className="chip clickable" title="Delete build" onClick={() => remove(b.id)}>
                ✕
              </button>
            </div>
          ))}
        </aside>

        <div className="builds-editor">
          {!draft ? (
            <div className="muted">Select a build on the left, or create a new one.</div>
          ) : (
            <>
              <div className="build-field">
                <label>Build name</label>
                <input
                  className="mc-input"
                  value={draft.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </div>

              <div className="builds-cols">
              <div className="builds-col">
              <section className="build-card">
              <h3 className="section-title">Gear — a weapon/item OR an armor set</h3>
              <div className={`build-field${draft.gear.item ? '' : ' inline'}`}>
                <label>{GEAR_LABELS.item}</label>
                {draft.gear.item ? (
                  <GearPieceEditor
                    slot="item"
                    piece={draft.gear.item}
                    byId={byId}
                    enchantPool={pools.enchants}
                    reforgePool={pools.reforges}
                    upgradePool={pools.upgrades}
                    gemPool={pools.gemstones}
                    onChange={(p) => setGear('item', p)}
                    onClear={() => setGear('item', undefined)}
                  />
                ) : hasArmor ? (
                  <div className="muted">Clear the armor pieces to build around a single item instead.</div>
                ) : (
                  <ItemPicker
                    pool={pools.item}
                    placeholder="Search for an item or weapon..."
                    onPick={(it) => setGear('item', newPiece(it.id))}
                  />
                )}
              </div>

              {hasWeapon ? (
                <div className="muted">Clear the weapon/item to build an armor set instead.</div>
              ) : (
                ARMOR_SLOTS.map((slot) => (
                  <div key={slot} className={`build-field${draft.gear[slot] ? '' : ' inline'}`}>
                    <label>{GEAR_LABELS[slot]}</label>
                    {draft.gear[slot] ? (
                      <GearPieceEditor
                        slot={slot}
                        piece={draft.gear[slot]!}
                        byId={byId}
                        enchantPool={pools.enchants}
                        reforgePool={pools.reforges}
                        upgradePool={pools.upgrades}
                        gemPool={pools.gemstones}
                        onChange={(p) => setGear(slot, p)}
                        onClear={() => setGear(slot, undefined)}
                      />
                    ) : (
                      <ItemPicker
                        pool={pools[slot]}
                        placeholder={`Search for a ${slot}...`}
                        onPick={(it) => setGear(slot, newPiece(it.id))}
                      />
                    )}
                  </div>
                ))
              )}
              </section>
              </div>

              <div className="builds-col side">
              <section className="build-card">
              <h3 className="section-title">Pet</h3>
              <div className={`build-field${draft.petId ? '' : ' inline'}`}>
                <label>Pet</label>
                {draft.petId ? (
                  <div className="picked-with-rarity">
                    <Picked
                      id={draft.petId}
                      byId={byId}
                      onClear={() => set({ petId: undefined, petRarity: undefined })}
                    />
                    <select
                      className="mc-select"
                      value={draft.petRarity ?? ''}
                      onChange={(e) => set({ petRarity: e.target.value || undefined })}
                    >
                      <option value="">Rarity...</option>
                      {(byId.get(draft.petId)?.petInfo?.rarities ?? []).map((r) => (
                        <option key={r} value={r}>
                          {titleCase(r)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <ItemPicker
                    pool={pools.pets}
                    placeholder="Search pets..."
                    onPick={(it) => set({ petId: it.id, petRarity: it.petInfo?.rarities?.at(-1) })}
                  />
                )}
              </div>
              <div className={`build-field${draft.petItemId ? '' : ' inline'}`}>
                <label>Pet item</label>
                {draft.petItemId ? (
                  <Picked id={draft.petItemId} byId={byId} onClear={() => set({ petItemId: undefined })} />
                ) : (
                  <ItemPicker
                    pool={pools.petItems}
                    placeholder="Search pet items..."
                    onPick={(it) => set({ petItemId: it.id })}
                  />
                )}
              </div>
              </section>

              {isDungeonBuild && (
                <section className="build-card">
                  <h3 className="section-title">Dungeons</h3>
                  <div className="build-num-row">
                    <div className="build-field">
                      <label>Catacombs level</label>
                      <input
                        type="number"
                        className="mc-input num"
                        min={0}
                        max={50}
                        value={draft.catacombsLevel ?? 0}
                        onChange={(e) => set({ catacombsLevel: clamp(Number(e.target.value), 0, 50) })}
                      />
                    </div>
                    <div className="build-field">
                      <label>Dungeon stars</label>
                      <input
                        type="number"
                        className="mc-input num"
                        min={0}
                        max={5}
                        value={draft.dungeonStars ?? 0}
                        onChange={(e) => set({ dungeonStars: clamp(Number(e.target.value), 0, 5) })}
                      />
                    </div>
                    <div className="build-field">
                      <label>Master stars</label>
                      <input
                        type="number"
                        className="mc-input num"
                        min={0}
                        max={5}
                        value={draft.masterStars ?? 0}
                        onChange={(e) => set({ masterStars: clamp(Number(e.target.value), 0, 5) })}
                      />
                    </div>
                  </div>
                </section>
              )}

              <section className="build-card">
              <h3 className="section-title">Estimated price</h3>
              <div className="price-panel">
                {estimate === null && <div className="muted">Fetching market prices…</div>}
                {estimate !== null && estimate.length === 0 && (
                  <div className="muted">Add components above to estimate a total.</div>
                )}
                {estimate !== null &&
                  estimate.map((r, i) => (
                    <div key={i} className="price-row">
                      <span className="price-label">
                        {r.label}: {r.name}
                      </span>
                      <Coins value={r.value} />
                    </div>
                  ))}
                {estimate !== null && estimate.length > 0 && (
                  <>
                    <div className="price-row estimate-total">
                      <span className="price-label">Estimated total</span>
                      <Coins value={total > 0 ? total : null} />
                    </div>
                    <div className="price-note muted">
                      {unpriced > 0 && `${unpriced} component${unpriced > 1 ? 's' : ''} had no market data. `}
                      Dungeon stars and Catacombs level are not market-priced; master stars are
                      priced automatically.
                    </div>
                  </>
                )}
              </div>
              </section>
              </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
