import { useDeferredValue, useMemo } from 'react';
import { useStore } from './state/store';
import { TabBar } from './components/TabBar';
import { ItemGrid } from './components/ItemGrid';
import { SearchBar } from './components/SearchBar';
import { DetailPanel } from './components/DetailPanel';
import type { TabId } from './types';

export default function App() {
  const store = useStore();
  const deferredItems = useDeferredValue(store.visibleItems);

  const counts = useMemo(() => {
    const pool = store.settings.hideVanilla
      ? store.items.filter((it) => !it.isVanilla)
      : store.items;
    const c: Partial<Record<TabId, number>> = { all: pool.length };
    for (const it of pool) c[it.tab] = (c[it.tab] ?? 0) + 1;
    c.favorites = store.favorites.size;
    return c;
  }, [store.items, store.favorites, store.settings.hideVanilla]);

  if (store.loading) {
    return (
      <div className="splash">
        <div className="splash-text mc-shadow">Loading items...</div>
      </div>
    );
  }

  if (store.error) {
    return (
      <div className="splash">
        <div className="splash-text mc-shadow">Failed to load item data</div>
        <div className="muted" style={{ maxWidth: 560 }}>{store.error}</div>
        <button className="mc-btn" onClick={() => location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="top-bar">
        <div className="toolbar">
          <button
            className={`mc-btn${store.settings.darkMode ? ' active' : ''}`}
            title="Toggle dark mode"
            onClick={() => store.updateSettings({ darkMode: !store.settings.darkMode })}
          >
            {store.settings.darkMode ? '☀ Light' : '🌙 Dark'}
          </button>
          <button
            className={`mc-btn${store.settings.hideVanilla ? ' active' : ''}`}
            title="Hide vanilla Minecraft items"
            onClick={() => store.updateSettings({ hideVanilla: !store.settings.hideVanilla })}
          >
            Hide Vanilla
          </button>
        </div>
      </div>
      <div className="main-row">
        <TabBar tab={store.tab} counts={counts} onChange={store.setTab} />
        <ItemGrid
          items={deferredItems}
          selectedId={store.selectedId}
          favorites={store.favorites}
          onSelect={store.select}
          onToggleFavorite={store.toggleFavorite}
        />
        {store.selected && (
          <DetailPanel
            item={store.selected}
            byId={store.byId}
            favorited={store.favorites.has(store.selected.id)}
            onToggleFavorite={store.toggleFavorite}
            onSelect={store.select}
            onClose={() => store.select(null)}
          />
        )}
      </div>
      <SearchBar
        query={store.query}
        resultCount={store.visibleItems.length}
        refreshing={store.refreshing}
        onChange={store.setQuery}
        onRefresh={store.refresh}
      />
    </div>
  );
}
