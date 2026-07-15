import { useMemo, useState } from 'react';
import type { SkyblockItem } from '../types';
import { McText, tierColor, titleCase } from '../mc/format';
import { useStore } from '../state/store';

const fmt = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString('en-US') : Number(n.toFixed(2)).toLocaleString('en-US');

// NEU pet lore templates: {LVL}, {STAT_NAME}, and {0}..{n} ability numbers.
function fillLore(lore: string[], level: number, stats: Record<string, number>, other: number[]) {
  return lore.map((line) =>
    line.replace(/\{([A-Z_]+|\d+)\}/g, (whole, key: string) => {
      if (key === 'LVL') return String(level);
      if (/^\d+$/.test(key)) {
        const v = other[Number(key)];
        return v != null ? fmt(v) : whole;
      }
      const v = stats[key];
      return v != null ? fmt(v) : whole;
    }),
  );
}

/**
 * Automatic level-100 pet stats (per CLAUDE.md v2): shows the pet's computed
 * level-100 values per rarity, plus the full tooltip lore with placeholders
 * substituted. Values come precomputed from NEU's stat curves; substitution
 * is memoized per item+rarity.
 */
export function PetStatsPanel({ item }: { item: SkyblockItem }) {
  const { settings, updateSettings } = useStore();
  const rarities = Object.keys(item.petStats ?? {});
  const [rarity, setRarity] = useState(() => rarities[rarities.length - 1]);
  const entry = item.petStats?.[rarity] ?? item.petStats?.[rarities[rarities.length - 1]];

  const filledLore = useMemo(
    () => (entry ? fillLore(item.lore, entry.level, entry.stats, entry.other) : []),
    [item, entry],
  );

  if (!entry) return null;
  const show = settings.showPetStats;

  return (
    <section>
      <h3 className="section-title">
        Level {entry.level} Stats
        <button
          className="section-toggle"
          onClick={() => updateSettings({ showPetStats: !show })}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </h3>
      {show && (
        <>
          {rarities.length > 1 && (
            <div className="chip-row">
              {rarities.map((r) => (
                <button
                  key={r}
                  className={`chip clickable${r === rarity ? ' selected' : ''}`}
                  style={{ color: tierColor(r) }}
                  onClick={() => setRarity(r)}
                >
                  {r.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}
          <div className="stat-panel">
            <table>
              <tbody>
                {Object.entries(entry.stats).map(([k, v]) => (
                  <tr key={k}>
                    <td>{titleCase(k)}</td>
                    <td style={{ color: v >= 0 ? '#55FF55' : '#FF5555' }}>
                      {v >= 0 ? '+' : ''}
                      {fmt(v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filledLore.length > 0 && <div style={{ height: 8 }} />}
            {filledLore.map((line, i) => (
              <div key={i} className="mc-tooltip-line">
                <McText text={line} defaultColor="#AAAAAA" />
              </div>
            ))}
            <div className="panel-note">
              Level {entry.level} · {rarity?.replace(/_/g, ' ')} · from NEU stat curves
            </div>
          </div>
        </>
      )}
    </section>
  );
}
