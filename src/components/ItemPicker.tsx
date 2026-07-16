import { useMemo, useRef, useState } from 'react';
import type { SkyblockItem } from '../types';
import { tierColor } from '../mc/format';
import { ItemIcon } from './ItemIcon';

interface Props {
  /** pre-filtered pool the picker searches over */
  pool: SkyblockItem[];
  placeholder: string;
  onPick: (item: SkyblockItem) => void;
}

/** Search-as-you-type item selector: input + dropdown of the top matches. */
export function ItemPicker({ pool, placeholder, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SkyblockItem[] = [];
    for (const it of pool) {
      if ((it.searchKey ?? it.name.toLowerCase()).includes(q)) {
        out.push(it);
        if (out.length >= 12) break;
      }
    }
    return out;
  }, [pool, query]);

  return (
    <div className="picker">
      <input
        ref={inputRef}
        className="mc-input"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && matches.length > 0) {
            onPick(matches[0]);
            setQuery('');
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 && (
        <div className="picker-drop mc-panel">
          {matches.map((it) => (
            <button
              key={it.id}
              className="picker-row"
              // mousedown fires before the input's blur closes the dropdown
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(it);
                setQuery('');
                setOpen(false);
                inputRef.current?.blur();
              }}
            >
              <ItemIcon id={it.id} name={it.name} kind={it.icon.kind} tint={it.tint} size={20} />
              <span style={{ color: tierColor(it.tier) }}>{it.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
