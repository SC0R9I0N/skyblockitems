import { memo } from 'react';
import type { SkyblockItem } from '../types';
import { McText, tierColor } from '../mc/format';

interface Props {
  item: SkyblockItem;
  x: number;
  y: number;
}

/** Minecraft-style hover tooltip: item name + lore lines. */
export const Tooltip = memo(function Tooltip({ item, x, y }: Props) {
  const maxLines = 24;
  const lore = item.lore.slice(0, maxLines);
  const clampedX = Math.min(x + 18, window.innerWidth - 340);
  const top = Math.max(8, Math.min(y - 12, window.innerHeight - 80 - lore.length * 18));
  return (
    <div className="mc-tooltip" style={{ left: clampedX, top }}>
      <div className="mc-tooltip-title" style={{ color: tierColor(item.tier) }}>
        {item.name}
      </div>
      {lore.map((line, i) => (
        <div key={i} className="mc-tooltip-line">
          <McText text={line} defaultColor="#AAAAAA" />
        </div>
      ))}
      {item.lore.length > maxLines && <div className="mc-tooltip-line" style={{ color: '#555555' }}>...</div>}
      {item.lore.length === 0 && (
        <div className="mc-tooltip-line" style={{ color: '#555555' }}>
          {item.category === 'PET' ? 'Pet' : 'Click for details'}
        </div>
      )}
    </div>
  );
});
