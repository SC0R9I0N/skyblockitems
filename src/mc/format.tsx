import { Fragment, memo } from 'react';

/** Minecraft § color codes -> hex */
export const MC_COLORS: Record<string, string> = {
  '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
  '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
  '8': '#555555', '9': '#5555FF', a: '#55FF55', b: '#55FFFF',
  c: '#FF5555', d: '#FF55FF', e: '#FFFF55', f: '#FFFFFF',
};

export const TIER_COLORS: Record<string, string> = {
  COMMON: '#FFFFFF',
  UNCOMMON: '#55FF55',
  RARE: '#5555FF',
  EPIC: '#AA00AA',
  LEGENDARY: '#FFAA00',
  MYTHIC: '#FF55FF',
  DIVINE: '#55FFFF',
  SPECIAL: '#FF5555',
  VERY_SPECIAL: '#FF5555',
  ULTIMATE: '#AA0000',
  SUPREME: '#AA0000',
  ADMIN: '#AA0000',
  UNOBTAINABLE: '#AA0000',
};

interface Span {
  text: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

export function parseMcString(line: string, defaultColor = '#FFFFFF'): Span[] {
  const spans: Span[] = [];
  let color = defaultColor;
  let bold = false;
  let italic = false;
  let underline = false;
  let strike = false;
  let buf = '';
  const flush = () => {
    if (buf) spans.push({ text: buf, color, bold, italic, underline, strike });
    buf = '';
  };
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '§' && i + 1 < line.length) {
      const code = line[i + 1].toLowerCase();
      i++;
      flush();
      if (code in MC_COLORS) {
        color = MC_COLORS[code];
        bold = italic = underline = strike = false;
      } else if (code === 'l') bold = true;
      else if (code === 'o') italic = true;
      else if (code === 'n') underline = true;
      else if (code === 'm') strike = true;
      else if (code === 'r') {
        color = defaultColor;
        bold = italic = underline = strike = false;
      }
      continue;
    }
    buf += line[i];
  }
  flush();
  return spans;
}

export const stripMc = (s: string) => s.replace(/§[0-9a-fk-orA-FK-OR]/g, '');

/** Renders one line of §-coded Minecraft text. */
export const McText = memo(function McText({
  text,
  defaultColor = '#FFFFFF',
}: {
  text: string;
  defaultColor?: string;
}) {
  if (!text) return <Fragment>{' '}</Fragment>;
  const spans = parseMcString(text, defaultColor);
  return (
    <Fragment>
      {spans.map((s, i) => (
        <span
          key={i}
          style={{
            color: s.color,
            fontWeight: s.bold ? 700 : undefined,
            fontStyle: s.italic ? 'italic' : undefined,
            textDecoration:
              [s.underline && 'underline', s.strike && 'line-through'].filter(Boolean).join(' ') ||
              undefined,
          }}
        >
          {s.text}
        </span>
      ))}
    </Fragment>
  );
});

export function tierColor(tier: string): string {
  return TIER_COLORS[tier] ?? '#FFFFFF';
}

/** Slot border colors per rarity (CLAUDE.md v2 spec). */
export const RARITY_BORDERS: Record<string, string> = {
  COMMON: '#999999',
  UNCOMMON: '#55FF55',
  RARE: '#5555FF',
  EPIC: '#AA00AA',
  LEGENDARY: '#FFAA00',
  MYTHIC: '#FF55FF',
  DIVINE: '#55FFFF',
  SPECIAL: '#FF5555',
  VERY_SPECIAL: '#FFD700',
};

export function rarityBorder(tier: string): string {
  return RARITY_BORDERS[tier] ?? '#AA0000';
}

export function titleCase(id: string): string {
  return id
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
