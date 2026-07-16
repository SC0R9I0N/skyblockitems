import type { TabId } from '../types';

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All Items' },
  { id: 'new', label: '✨ New' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'armor', label: 'Armor' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'cosmetics', label: 'Cosmetics' },
  { id: 'pets', label: 'Pets' },
  { id: 'pet_items', label: 'Pet Items' },
  { id: 'enchants', label: 'Enchants' },
  { id: 'misc', label: 'Misc' },
  { id: 'favorites', label: '★ Favorites' },
];

interface Props {
  tab: TabId;
  counts: Partial<Record<TabId, number>>;
  onChange: (tab: TabId) => void;
}

/** Vertical category rail on the left side of the window. */
export function TabBar({ tab, counts, onChange }: Props) {
  return (
    <nav className="tab-bar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`mc-btn${tab === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span>{t.label}</span>
          {counts[t.id] != null && <span className="tab-count">{counts[t.id]}</span>}
        </button>
      ))}
    </nav>
  );
}
