import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluate, formatResult } from '../calc/evaluate';

interface Props {
  query: string;
  resultCount: number;
  refreshing: boolean;
  onChange: (q: string) => void;
  onRefresh: () => void;
}

// Only calculator-legal characters, so item searches never trigger it.
const CALC_CHARSET = /^[\d+\-*/().eE\s]+$/;
// Require an actual operation (or scientific notation) so plain numbers
// like "3" still behave as ordinary searches.
const HAS_OPERATION = /[+*/()]|\d\s*-|-\s*\d|\d[eE][+-]?\d/;

/** Live inline calculation for the search query; null when it isn't math. */
function tryCalculate(query: string): number | null {
  const q = query.trim();
  if (!q || !CALC_CHARSET.test(q) || !HAS_OPERATION.test(q) || !/\d/.test(q)) return null;
  try {
    return evaluate(q);
  } catch {
    return null;
  }
}

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'uptodate' }
  | { phase: 'downloading'; pct: number }
  | { phase: 'restarting' }
  | { phase: 'error'; message: string };

/**
 * Checks GitHub for a build different from the one running; when one exists,
 * downloads the verified installer and hands off to it (the app restarts
 * itself). Does nothing but report "up to date" when nothing changed.
 */
function UpdateButton() {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' });
  const revertTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(revertTimer.current), []);

  const revertSoon = (ms: number) => {
    window.clearTimeout(revertTimer.current);
    revertTimer.current = window.setTimeout(() => setState({ phase: 'idle' }), ms);
  };

  const run = async () => {
    setState({ phase: 'checking' });
    let unsubscribe: (() => void) | undefined;
    try {
      const check = await window.sbApi.checkUpdate();
      if (!check.updateAvailable) {
        setState({ phase: 'uptodate' });
        revertSoon(4000);
        return;
      }
      setState({ phase: 'downloading', pct: 0 });
      unsubscribe = window.sbApi.onUpdateProgress((pct) => setState({ phase: 'downloading', pct }));
      const { started } = await window.sbApi.applyUpdate();
      // `started` means the installer is running; the app is about to quit
      // and relaunch itself. A false here means the remote changed back
      // between check and apply — treat it as up to date.
      setState(started ? { phase: 'restarting' } : { phase: 'uptodate' });
      if (!started) revertSoon(4000);
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
      revertSoon(6000);
    } finally {
      unsubscribe?.();
    }
  };

  const busy = state.phase === 'checking' || state.phase === 'downloading' || state.phase === 'restarting';
  const label =
    state.phase === 'checking'
      ? 'Checking...'
      : state.phase === 'uptodate'
        ? 'Up to date ✓'
        : state.phase === 'downloading'
          ? `Downloading ${state.pct}%`
          : state.phase === 'restarting'
            ? 'Restarting...'
            : state.phase === 'error'
              ? 'Update failed'
              : '⬇ Update';
  const title =
    state.phase === 'error'
      ? state.message
      : 'Check GitHub for a newer build and install it (only updates when something changed)';

  return (
    <button className="mc-btn refresh-btn" onClick={run} disabled={busy} title={title}>
      {label}
    </button>
  );
}

/**
 * Creative-mode style search bar, pinned to the bottom of the window.
 * Doubles as a calculator: typing a math expression (e.g. `(2+3)*1.5e3`)
 * shows the result inline; Enter replaces the expression with the result.
 */
export function SearchBar({ query, resultCount, refreshing, onChange, onRefresh }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const calcResult = useMemo(() => tryCalculate(query), [query]);

  // Ctrl+F / plain typing focuses search, like creative inventory.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        className="mc-input"
        type="text"
        placeholder="Search items... or calculate: (2 + 3) * 1.5e3"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && calcResult != null) onChange(String(calcResult));
        }}
        spellCheck={false}
      />
      {calcResult != null ? (
        <span className="search-calc mc-shadow">= {formatResult(calcResult)}</span>
      ) : (
        <span className="search-count mc-shadow">{resultCount} items</span>
      )}
      <button className="mc-btn refresh-btn" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing...' : '⟳ Refresh Data'}
      </button>
      <UpdateButton />
    </div>
  );
}
