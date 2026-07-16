import { useEffect, useState } from 'react';
import type { PriceInfo, SkyblockItem } from '../types';
import { fmtCoins, tierColor } from '../mc/format';

function Coins({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="muted">—</span>;
  return (
    <span className="coin-value" title={`${Math.round(value).toLocaleString('en-US')} coins`}>
      {fmtCoins(value)}
    </span>
  );
}

type Slot = PriceInfo | null | 'loading';

export function PricePanel({ item }: { item: SkyblockItem }) {
  // pets are priced per rarity; everything else gets one unfiltered lookup
  const rarities = item.petInfo?.rarities?.length ? item.petInfo.rarities : [''];
  const [prices, setPrices] = useState<Record<string, Slot>>({});

  useEffect(() => {
    let stale = false;
    setPrices(Object.fromEntries(rarities.map((r) => [r, 'loading'])));
    for (const r of rarities) {
      window.sbApi
        .getPrice(item.id, r || undefined)
        .then((res) => !stale && setPrices((p) => ({ ...p, [r]: res })))
        .catch(() => !stale && setPrices((p) => ({ ...p, [r]: null })));
    }
    return () => {
      stale = true;
    };
  }, [item.id]);

  const slots = rarities.map((r) => prices[r] ?? 'loading');
  const loading = slots.some((s) => s === 'loading');
  const resolved = slots.filter((s): s is PriceInfo => s !== 'loading' && s !== null);

  const attribution = (
    <div className="price-attribution muted">
      Prices from{' '}
      <button
        className="chip clickable"
        onClick={() => window.sbApi.openExternal('https://sky.coflnet.com/data')}
      >
        sky.coflnet.com ↗
      </button>
    </div>
  );

  const single = slots.length === 1 ? slots[0] : null;

  return (
    <section>
      <h3 className="section-title">Market Prices</h3>
      {loading && resolved.length === 0 ? (
        <div className="muted">Checking the Auction House…</div>
      ) : resolved.length === 0 ? (
        <div className="muted">No auction or bazaar listings found for this item.</div>
      ) : slots.length > 1 ? (
        <div className="price-panel">
          <table className="price-table">
            <thead>
              <tr>
                <th />
                <th>Lowest BIN</th>
                <th>3-Day Avg</th>
              </tr>
            </thead>
            <tbody>
              {rarities.map((r) => {
                const s = prices[r] ?? 'loading';
                const ah = s !== 'loading' && s?.kind === 'ah' ? s : null;
                return (
                  <tr key={r}>
                    <td style={{ color: tierColor(r) }}>{r.replace(/_/g, ' ')}</td>
                    <td>{s === 'loading' ? '…' : <Coins value={ah?.lowestBin} />}</td>
                    <td>{s === 'loading' ? '…' : <Coins value={ah?.avg3d} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {attribution}
        </div>
      ) : single && single !== 'loading' ? (
        <div className="price-panel">
          {single.kind === 'ah' ? (
            <>
              <div className="price-row">
                <span className="price-label">Lowest BIN</span>
                <Coins value={single.lowestBin} />
              </div>
              <div className="price-row">
                <span className="price-label">3-Day Average</span>
                <Coins value={single.avg3d} />
              </div>
              {single.sales3d > 0 && (
                <div className="price-note muted">
                  {single.sales3d.toLocaleString('en-US')} sold in the last 3 days
                </div>
              )}
            </>
          ) : (
            <>
              <div className="price-row">
                <span className="price-label">Bazaar Buy (instant)</span>
                <Coins value={single.buy} />
              </div>
              <div className="price-row">
                <span className="price-label">Bazaar Sell (instant)</span>
                <Coins value={single.sell} />
              </div>
            </>
          )}
          {attribution}
        </div>
      ) : null}
    </section>
  );
}
