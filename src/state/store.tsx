import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { AppSettings, Dataset, SkyblockItem, TabId } from '../types';
import { stripMc } from '../mc/format';

/** game rarity order, lowest first (unknown tiers sort last) */
export const TIER_ORDER: Record<string, number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  EPIC: 3,
  LEGENDARY: 4,
  MYTHIC: 5,
  DIVINE: 6,
  SUPREME: 6, // pre-rename Divine
  SPECIAL: 7,
  VERY_SPECIAL: 8,
  UNOBTAINABLE: 9,
};

const DEFAULT_SETTINGS: AppSettings = {
  darkMode: false,
  hideVanilla: false,
  showPetStats: true,
  showPowerStats: true,
  sortKey: 'name',
  sortAsc: true,
};

interface State {
  items: SkyblockItem[];
  byId: Map<string, SkyblockItem>;
  tab: TabId;
  query: string;
  selectedId: string | null;
  favorites: Set<string>;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  meta: Dataset['meta'] | null;
  settings: AppSettings;
}

type Action =
  | { type: 'loaded'; dataset: Dataset; favorites: string[] }
  | { type: 'error'; message: string }
  | { type: 'setTab'; tab: TabId }
  | { type: 'setQuery'; query: string }
  | { type: 'select'; id: string | null }
  | { type: 'favorites'; ids: string[] }
  | { type: 'refreshing'; value: boolean }
  | { type: 'settings'; settings: AppSettings };

const initial: State = {
  items: [],
  byId: new Map(),
  tab: 'all',
  query: '',
  selectedId: null,
  favorites: new Set(),
  loading: true,
  refreshing: false,
  error: null,
  meta: null,
  settings: DEFAULT_SETTINGS,
};

function indexDataset(dataset: Dataset) {
  const items = dataset.items;
  for (const it of items) {
    it.name = stripMc(it.name); // admin items embed § codes in their names
    it.searchKey = `${it.name} ${it.id}`.toLowerCase();
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return { items, byId: new Map(items.map((i) => [i.id, i])) };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded': {
      const { items, byId } = indexDataset(action.dataset);
      return {
        ...state,
        items,
        byId,
        favorites: new Set(action.favorites),
        loading: false,
        refreshing: false,
        error: null,
        meta: action.dataset.meta,
      };
    }
    case 'error':
      return { ...state, loading: false, refreshing: false, error: action.message };
    case 'setTab':
      return { ...state, tab: action.tab };
    case 'setQuery':
      return { ...state, query: action.query };
    case 'select':
      return { ...state, selectedId: action.id };
    case 'favorites':
      return { ...state, favorites: new Set(action.ids) };
    case 'refreshing':
      return { ...state, refreshing: action.value };
    case 'settings':
      return { ...state, settings: action.settings };
  }
}

interface Store extends State {
  visibleItems: SkyblockItem[];
  selected: SkyblockItem | null;
  setTab: (tab: TabId) => void;
  setQuery: (q: string) => void;
  select: (id: string | null) => void;
  toggleFavorite: (id: string) => void;
  refresh: () => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    (async () => {
      try {
        const [text, favorites, settings] = await Promise.all([
          window.sbApi.loadData(),
          window.sbApi.getFavorites(),
          window.sbApi.getSettings(),
        ]);
        dispatch({ type: 'settings', settings });
        dispatch({ type: 'loaded', dataset: JSON.parse(text), favorites });
      } catch (e) {
        dispatch({ type: 'error', message: String(e) });
      }
    })();
  }, []);

  // Dark mode is a document-level class so CSS variables cascade everywhere.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.settings.darkMode);
  }, [state.settings.darkMode]);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      dispatch({ type: 'settings', settings: { ...state.settings, ...patch } });
      window.sbApi
        .patchSettings(patch)
        .then((settings) => dispatch({ type: 'settings', settings }));
    },
    [state.settings],
  );

  const setTab = useCallback((tab: TabId) => dispatch({ type: 'setTab', tab }), []);
  const setQuery = useCallback((query: string) => dispatch({ type: 'setQuery', query }), []);
  const select = useCallback((id: string | null) => dispatch({ type: 'select', id }), []);

  const toggleFavorite = useCallback((id: string) => {
    window.sbApi.toggleFavorite(id).then((ids) => dispatch({ type: 'favorites', ids }));
  }, []);

  const refresh = useCallback(() => {
    dispatch({ type: 'refreshing', value: true });
    window.sbApi
      .refreshData()
      .then(async (text) =>
        dispatch({
          type: 'loaded',
          dataset: JSON.parse(text),
          favorites: await window.sbApi.getFavorites(),
        }),
      )
      .catch((e) => dispatch({ type: 'error', message: String(e) }));
  }, []);

  // Favorites only affect the visible set on the Favorites tab. Keeping the
  // array identity stable on other tabs preserves the grid's scroll/hover
  // state when a favorite is toggled (e.g. via the hover-F hotkey).
  const favKey = state.tab === 'favorites' ? state.favorites : null;
  const visibleItems = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    const hideVanilla = state.settings.hideVanilla;
    // "New" = added during the CURRENT calendar year, evaluated at run time
    const thisYear = String(new Date().getFullYear());
    const filtered = state.items.filter((it) => {
      if (hideVanilla && it.isVanilla) return false;
      if (state.tab === 'favorites') {
        if (!state.favorites.has(it.id)) return false;
      } else if (state.tab === 'new') {
        if (it.addedAt?.slice(0, 4) !== thisYear) return false;
      } else if (state.tab !== 'all' && it.tab !== state.tab) {
        return false;
      }
      return !q || it.searchKey!.includes(q);
    });

    const { sortKey, sortAsc } = state.settings;
    const byName = (a: SkyblockItem, b: SkyblockItem) => a.name.localeCompare(b.name);
    let cmp: (a: SkyblockItem, b: SkyblockItem) => number;
    if (sortKey === 'rarity')
      cmp = (a, b) => (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99) || byName(a, b);
    else if (sortKey === 'release')
      cmp = (a, b) =>
        (a.addedAt ?? '0000').localeCompare(b.addedAt ?? '0000') || byName(a, b);
    else cmp = byName; // 'name' + any legacy persisted value
    filtered.sort(sortAsc ? cmp : (a, b) => cmp(b, a));
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- favKey stands in for state.favorites
  }, [state.items, state.tab, state.query, favKey, state.settings.hideVanilla, state.settings.sortKey, state.settings.sortAsc]);

  const selected = state.selectedId ? state.byId.get(state.selectedId) ?? null : null;

  const store: Store = {
    ...state,
    visibleItems,
    selected,
    setTab,
    setQuery,
    select,
    toggleFavorite,
    refresh,
    updateSettings,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
