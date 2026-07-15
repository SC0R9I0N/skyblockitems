import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { SkyblockItem } from '../types';
import { ItemIcon } from './ItemIcon';
import { Tooltip } from './Tooltip';
import { rarityBorder } from '../mc/format';

const CELL = 58; // 54px slot + 4px gutter (modern theme; classic slots packed at 54)

interface SlotProps {
  item: SkyblockItem;
  style: React.CSSProperties;
  selected: boolean;
  favorited: boolean;
  onSelect: (id: string) => void;
  onHover: (item: SkyblockItem | null, x: number, y: number) => void;
}

const Slot = memo(function Slot({ item, style, selected, favorited, onSelect, onHover }: SlotProps) {
  return (
    <div
      className={`mc-slot rar${selected ? ' selected' : ''}`}
      style={{ ...style, '--rarity': rarityBorder(item.tier) } as React.CSSProperties}
      onClick={() => onSelect(item.id)}
      onMouseEnter={(e) => onHover(item, e.clientX, e.clientY)}
      onMouseMove={(e) => onHover(item, e.clientX, e.clientY)}
      onMouseLeave={() => onHover(null, 0, 0)}
    >
      <ItemIcon id={item.id} name={item.name} kind={item.icon.kind} tint={item.tint} size={40} />
      {favorited && <span className="fav-star">★</span>}
    </div>
  );
});

interface Props {
  items: SkyblockItem[];
  selectedId: string | null;
  favorites: Set<string>;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

const isTypingTarget = (el: Element | null) =>
  el instanceof HTMLElement &&
  (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

/** Windowed Minecraft-style inventory grid; renders only visible rows. */
export function ItemGrid({ items, selectedId, favorites, onSelect, onToggleFavorite }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hover, setHover] = useState<{ item: SkyblockItem; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: el.clientWidth, h: el.clientHeight }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset scroll + hover when the item set changes (tab switch / search):
  // a hovered slot can unmount without firing mouseleave, stranding the tooltip.
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
    setScrollTop(0);
    setHover(null);
  }, [items]);

  const onHover = useCallback((item: SkyblockItem | null, x: number, y: number) => {
    setHover(item ? { item, x, y } : null);
  }, []);

  // Pressing F over a hovered item toggles its favorite — like Minecraft's
  // hover hotkeys. Ignored while typing (search bar keeps plain F, and
  // Ctrl+F still focuses search).
  const hoverRef = useRef<SkyblockItem | null>(null);
  hoverRef.current = hover?.item ?? null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;
      if (!hoverRef.current) return;
      e.preventDefault();
      onToggleFavorite(hoverRef.current.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggleFavorite]);

  const cols = Math.max(1, Math.floor((size.w - 16) / CELL));
  const rows = Math.ceil(items.length / cols);
  const firstRow = Math.max(0, Math.floor(scrollTop / CELL) - 2);
  const lastRow = Math.min(rows, Math.ceil((scrollTop + size.h) / CELL) + 2);

  const slots = [];
  for (let r = firstRow; r < lastRow; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= items.length) break;
      const item = items[idx];
      slots.push(
        <Slot
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          favorited={favorites.has(item.id)}
          onSelect={onSelect}
          onHover={onHover}
          style={{ position: 'absolute', left: c * CELL + 8, top: r * CELL + 8 }}
        />,
      );
    }
  }

  return (
    <div className="grid-outer mc-panel-inset">
      <div
        ref={ref}
        className="grid-scroll"
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        onMouseLeave={() => setHover(null)}
      >
        <div style={{ position: 'relative', height: rows * CELL + 16 }}>{slots}</div>
        {items.length === 0 && <div className="grid-empty">No items found</div>}
      </div>
      {hover && <Tooltip item={hover.item} x={hover.x} y={hover.y} host={ref.current} />}
    </div>
  );
}
