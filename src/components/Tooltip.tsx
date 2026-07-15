import { memo, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SkyblockItem } from '../types';
import { McText, tierColor } from '../mc/format';

interface Props {
  item: SkyblockItem;
  x: number;
  y: number;
  /** Panel the tooltip is confined to (falls back to the whole window). */
  host?: HTMLElement | null;
}

const MARGIN = 8; // minimum gap to every window edge
const GAP = 16; // gap between the cursor and the tooltip

/**
 * Hover tooltip: item name + lore lines. Location-aware — the real rendered
 * size is measured before paint, the tooltip flips to the left of the cursor
 * near the right edge (and vice versa), shifts up near the bottom and down
 * near the top, and is always clamped fully inside the window, so it never
 * covers the cursor target or leaves the viewport.
 */
export const Tooltip = memo(function Tooltip({ item, x, y, host }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Confine the tooltip to the host panel (the item grid card) intersected
    // with the viewport — it can then never cover the search bar, tab rail,
    // detail panel, or top bar, and never leaves the window.
    const hostRect = host?.getBoundingClientRect();
    const bLeft = Math.max(hostRect?.left ?? 0, 0) + MARGIN;
    const bTop = Math.max(hostRect?.top ?? 0, 0) + MARGIN;
    const bRight = Math.min(hostRect?.right ?? vw, vw) - MARGIN;
    const bBottom = Math.min(hostRect?.bottom ?? vh, vh) - MARGIN;

    // horizontal: prefer right of the cursor; flip to the left near the
    // right edge; clamp as a last resort (narrow windows)
    let left = x + GAP;
    if (left + width > bRight) left = x - GAP - width;
    left = Math.max(bLeft, Math.min(left, bRight - width));

    // vertical: follow the cursor; shift up near the bottom, down near the top
    let top = y - 12;
    if (top + height > bBottom) top = bBottom - height;
    if (top < bTop) top = bTop;

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  });

  const maxLines = 24;
  const lore = item.lore.slice(0, maxLines);
  // Portaled to <body>: an ancestor with backdrop-filter (the glass panels)
  // would otherwise become the containing block for position:fixed and
  // shift the tooltip by the panel's offset.
  return createPortal(
    <div ref={ref} className="mc-tooltip" style={{ left: -9999, top: -9999 }}>
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
    </div>,
    document.body,
  );
});
