import { useEffect, useState } from 'react';
import type { SkyblockItem } from '../types';
import { McText, rarityBorder, tierColor, titleCase } from '../mc/format';
import { ItemIcon } from './ItemIcon';
import { CraftingGrid } from './CraftingGrid';
import { PetStatsPanel } from './PetStatsPanel';
import { PowerStonePanel } from './PowerStonePanel';

interface Props {
  item: SkyblockItem;
  byId: Map<string, SkyblockItem>;
  favorited: boolean;
  onToggleFavorite: (id: string) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const isOfficialWiki = (url: string) => {
  try {
    return new URL(url).host === 'wiki.hypixel.net';
  } catch {
    return false;
  }
};

export function DetailPanel({ item, byId, favorited, onToggleFavorite, onSelect, onClose }: Props) {
  const [wiki, setWiki] = useState<{ url: string; text: string } | null | 'loading'>(null);
  // Only the official wiki is linked in the UI; community-wiki URLs stay in
  // the data because they feed the summary text and icon lookups.
  const officialLinks = item.wiki?.filter(isOfficialWiki) ?? [];

  useEffect(() => {
    setWiki(item.wiki?.length ? 'loading' : null);
    if (!item.wiki?.length) return;
    let stale = false;
    window.sbApi
      .wikiExtract(item.id, item.wiki)
      .then((res) => !stale && setWiki(res))
      .catch(() => !stale && setWiki(null));
    return () => {
      stale = true;
    };
  }, [item.id]);

  return (
    <aside className="detail mc-panel">
      <button className="mc-btn close-btn" onClick={onClose}>
        ✕
      </button>

      <div className="detail-head">
        <div
          className="mc-slot big rar"
          style={{ '--rarity': rarityBorder(item.tier) } as React.CSSProperties}
        >
          <ItemIcon id={item.id} name={item.name} kind={item.icon.kind} tint={item.tint} size={56} />
        </div>
        <div>
          <h2 className="detail-name mc-shadow" style={{ color: tierColor(item.tier) }}>
            {item.name}
          </h2>
          <div className="detail-sub">
            <span style={{ color: tierColor(item.tier) }}>{item.tier.replace(/_/g, ' ')}</span>
            {' · '}
            {titleCase(item.category)}
          </div>
        </div>
      </div>

      <button
        className={`mc-btn fav-btn${favorited ? ' active' : ''}`}
        onClick={() => onToggleFavorite(item.id)}
      >
        {favorited ? '★ Remove from Favorites' : '☆ Add to Favorites'}
      </button>

      {item.petInfo && (
        <section>
          <h3 className="section-title">Rarities</h3>
          <div className="chip-row">
            {item.petInfo.rarities.map((r) => (
              <span key={r} className="chip" style={{ color: tierColor(r) }}>
                {r}
              </span>
            ))}
          </div>
        </section>
      )}

      {item.petStats && <PetStatsPanel key={`pet-${item.id}`} item={item} />}
      {item.powerStone && <PowerStonePanel key={`ps-${item.id}`} stone={item.powerStone} />}

      {item.lore.length > 0 && (
        <section className="lore-box">
          {item.lore.map((line, i) => (
            <div key={i} className="mc-tooltip-line">
              <McText text={line} defaultColor="#AAAAAA" />
            </div>
          ))}
        </section>
      )}

      <section>
        <h3 className="section-title">Where it comes from</h3>
        {item.sources.length > 0 ? (
          <>
            <ul className="source-list">
              {item.sources.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            {item.sourcesFromWiki && (
              <div className="muted source-attribution">From the Hypixel Skyblock Wiki</div>
            )}
          </>
        ) : (
          <div className="muted">No source data — check the wiki link below.</div>
        )}
        {item.recipe && (
          <CraftingGrid recipe={item.recipe} result={item} byId={byId} onSelect={onSelect} />
        )}
      </section>

      {(item.usedIn?.length || item.npcSellPrice || item.museum) && (
        <section>
          <h3 className="section-title">What it's used for</h3>
          {item.usedIn && item.usedIn.length > 0 && (
            <div className="chip-row">
              {item.usedIn.map((id) => {
                const target = byId.get(id);
                return (
                  <button
                    key={id}
                    className="chip clickable"
                    style={target ? { color: tierColor(target.tier) } : undefined}
                    onClick={() => target && onSelect(id)}
                  >
                    {target?.name ?? titleCase(id)}
                  </button>
                );
              })}
            </div>
          )}
          <ul className="source-list">
            {item.museum && <li>Museum donation ({titleCase(item.museum)})</li>}
            {item.npcSellPrice != null && item.npcSellPrice > 0 && (
              <li>Sells to NPC for {item.npcSellPrice.toLocaleString('en-US')} coins</li>
            )}
          </ul>
        </section>
      )}

      {item.stats && (
        <section>
          <h3 className="section-title">Stats</h3>
          <table className="stats-table">
            <tbody>
              {Object.entries(item.stats).map(([k, v]) => (
                <tr key={k}>
                  <td>{titleCase(k)}</td>
                  <td style={{ color: v >= 0 ? '#55FF55' : '#FF5555' }}>
                    {v > 0 ? `+${v}` : v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h3 className="section-title">Wiki</h3>
        {wiki === 'loading' && <div className="muted">Loading wiki summary...</div>}
        {wiki && wiki !== 'loading' && <p className="wiki-text">{wiki.text}</p>}
        {officialLinks.length === 0 && <div className="muted">No wiki page linked.</div>}
        <div className="chip-row">
          {officialLinks.map((url) => (
            <button key={url} className="chip clickable" onClick={() => window.sbApi.openExternal(url)}>
              {new URL(url).hostname} ↗
            </button>
          ))}
        </div>
      </section>

      <div className="detail-id muted">{item.id}</div>
    </aside>
  );
}
