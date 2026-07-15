import type { AppSettings, TabId } from '../types';

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All Items' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'armor', label: 'Armor' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'cosmetics', label: 'Cosmetics' },
  { id: 'pets', label: 'Pets' },
  { id: 'pet_items', label: 'Pet Items' },
  { id: 'misc', label: 'Misc' },
  { id: 'favorites', label: '★ Favorites' },
];

interface Props {
  tab: TabId;
  counts: Partial<Record<TabId, number>>;
  settings: AppSettings;
  onChange: (tab: TabId) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export function TabBar({ tab, counts, settings, onChange, onUpdateSettings }: Props) {
  return (
    <div className="tab-bar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`mc-btn${tab === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {counts[t.id] != null && <span className="tab-count">{counts[t.id]}</span>}
        </button>
      ))}
      <div className="toolbar">
        <button
          className={`mc-btn${settings.darkMode ? ' active' : ''}`}
          title="Toggle dark mode"
          onClick={() => onUpdateSettings({ darkMode: !settings.darkMode })}
        >
          {settings.darkMode ? '☀ Light' : '🌙 Dark'}
        </button>
        <button
          className={`mc-btn${settings.hideVanilla ? ' active' : ''}`}
          title="Hide vanilla Minecraft items"
          onClick={() => onUpdateSettings({ hideVanilla: !settings.hideVanilla })}
        >
          Hide Vanilla
        </button>
      </div>
    </div>
  );
}
