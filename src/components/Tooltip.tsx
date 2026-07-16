import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SkyblockItem } from '../types';
import { fmtCoins, McText, tierColor, titleCase } from '../mc/format';
import { highestRarity, usePrice } from '../state/prices';

interface Props {
  item: SkyblockItem;
  x: number;
  y: number;
  /** Panel the tooltip is confined to (falls back to the whole window). */
  host?: HTMLElement | null;
}

const MARGIN = 8; // minimum gap to every window edge
const GAP = 16; // gap between the cursor and the tooltip
const HOVER_PRICE_DELAY = 250; // ms before a hover triggers a price lookup

function PriceLine({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div className="mc-tooltip-line">
      <span style={{ color: '#AAAAAA' }}>{label}: </span>
      <span style={{ color: '#FFAA00' }}>{fmtCoins(value)} coins</span>
    </div>
  );
}

/**
 * Hover tooltip: item name + lore lines + market prices. Location-aware — the
 * real rendered size is measured before paint, the tooltip flips to the left
 * of the cursor near the right edge (and vice versa), shifts up near the
 * bottom and down near the top, and is always clamped fully inside the
 * window, so it never covers the cursor target or leaves the viewport.
 * Content taller than the max height scrolls with Ctrl + wheel.
 */
export const Tooltip = memo(function Tooltip({ item, x, y, host }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  // pets are priced at their highest rarity here; the detail panel breaks
  // the price down per rarity
  const petRarity = item.petInfo?.rarities?.length
    ? highestRarity(item.petInfo.rarities)
    : undefined;
  const price = usePrice(item.id, petRarity, HOVER_PRICE_DELAY);

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

    const sc = scrollRef.current;
    if (sc) setOverflowing(sc.scrollHeight > sc.clientHeight + 1);
  });

  // fresh item → back to the top of its lore
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [item.id]);

  // Ctrl + wheel scrolls the tooltip. The tooltip itself is pointer-events:
  // none (the cursor stays on the grid slot), so the wheel event is captured
  // at the window; preventDefault keeps the grid from scrolling underneath.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      const sc = scrollRef.current;
      if (!sc || sc.scrollHeight <= sc.clientHeight) return;
      e.preventDefault();
      sc.scrollTop += e.deltaY;
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  // Portaled to <body>: an ancestor with backdrop-filter (the glass panels)
  // would otherwise become the containing block for position:fixed and
  // shift the tooltip by the panel's offset.
  return createPortal(
    <div ref={ref} className="mc-tooltip" style={{ left: -9999, top: -9999 }}>
      <div ref={scrollRef} className="mc-tooltip-scroll">
        <div
          className={`mc-tooltip-title${item.maxEnchant ? ' chroma-text' : ''}`}
          style={item.maxEnchant ? undefined : { color: tierColor(item.tier) }}
        >
          {item.name}
        </div>
        {item.lore.map((line, i) => (
          <div key={i} className="mc-tooltip-line">
            <McText text={line} defaultColor="#AAAAAA" />
          </div>
        ))}
        {item.lore.length === 0 && (
          <div className="mc-tooltip-line" style={{ color: '#555555' }}>
            {item.category === 'PET' ? 'Pet' : 'Click for details'}
          </div>
        )}
        {price === undefined && (
          <div className="mc-tooltip-price">
            <div className="mc-tooltip-line" style={{ color: '#555555' }}>
              Loading prices…
            </div>
          </div>
        )}
        {price != null && (
          <div className="mc-tooltip-price">
            {price.kind === 'ah' ? (
              <>
                <PriceLine
                  label={petRarity ? `Lowest BIN (${titleCase(petRarity)})` : 'Lowest BIN'}
                  value={price.lowestBin}
                />
                <PriceLine label="3-Day Avg" value={price.avg3d} />
              </>
            ) : (
              <>
                <PriceLine label="Bazaar Buy" value={price.buy} />
                <PriceLine label="Bazaar Sell" value={price.sell} />
              </>
            )}
          </div>
        )}
      </div>
      {overflowing && <div className="mc-tooltip-hint">Ctrl + Scroll for more</div>}
    </div>,
    document.body,
  );
});
