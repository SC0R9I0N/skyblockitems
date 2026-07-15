import { useEffect, useMemo, useRef } from 'react';
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
    </div>
  );
}
