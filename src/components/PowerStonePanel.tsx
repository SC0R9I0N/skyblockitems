import { useMemo } from 'react';
import type { PowerStoneInfo } from '../types';
import { MC_COLORS } from '../mc/format';
import { useStore } from '../state/store';

const SAMPLE_MP = 1000;

// Standard accessory-power scaling: stats scale with (ln(1 + 0.0019·MP))^1.2.
// The lore quotes values at refMp, so the constant factor cancels in the ratio.
const mult = (mp: number) => Math.pow(Math.log(1 + 0.0019 * mp), 1.2);

const fmt = (n: number) =>
  Number(n.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * Magical Power sample stats (per CLAUDE.md v2): rescales the stone's quoted
 * stats to 1000 MP. Scaled values are memoized per stone.
 */
export function PowerStonePanel({ stone }: { stone: PowerStoneInfo }) {
  const { settings, updateSettings } = useStore();
  const show = settings.showPowerStats;

  const scaled = useMemo(() => {
    const scale = mult(SAMPLE_MP) / mult(stone.refMp);
    return stone.stats.map((s) => ({ ...s, sample: s.value * scale }));
  }, [stone]);

  return (
    <section>
      <h3 className="section-title">
        Magical Power · {SAMPLE_MP.toLocaleString('en-US')} MP Sample
        <button
          className="section-toggle"
          onClick={() => updateSettings({ showPowerStats: !show })}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </h3>
      {show && (
        <div className="stat-panel">
          {stone.power && (
            <div className="mc-tooltip-line" style={{ color: '#FFAA00' }}>
              {stone.power} Power
            </div>
          )}
          <table>
            <tbody>
              <tr>
                <td style={{ color: '#555577' }} />
                <td style={{ color: '#555577' }}>@{stone.refMp.toLocaleString('en-US')} MP</td>
                <td style={{ color: '#FFFF55' }}>@{SAMPLE_MP.toLocaleString('en-US')} MP</td>
              </tr>
              {scaled.map((s) => (
                <tr key={s.name}>
                  <td style={{ color: MC_COLORS[s.color] ?? '#AAAAAA' }}>{s.name}</td>
                  <td>+{fmt(s.value)}</td>
                  <td style={{ color: '#55FF55' }}>+{fmt(s.sample)}</td>
                </tr>
              ))}
              {stone.unique.map((s) => (
                <tr key={`u-${s.name}`}>
                  <td style={{ color: MC_COLORS[s.color] ?? '#AAAAAA' }}>{s.name}</td>
                  <td colSpan={2} style={{ color: '#FF55FF' }}>
                    +{fmt(s.value)} (unique bonus, flat)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="panel-note">scaling: (ln(1 + 0.0019·MP))^1.2 — unique bonuses don't scale</div>
        </div>
      )}
    </section>
  );
}
