import { memo, useState } from 'react';

interface Props {
  id: string;
  name: string;
  kind: 'skull' | 'texture' | 'wiki' | 'none';
  tint?: string; // "r,g,b"
  size: number;
}

/** Deterministic placeholder color per item id. */
function placeholderHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export const ItemIcon = memo(function ItemIcon({ id, name, kind, tint, size }: Props) {
  const [failed, setFailed] = useState(false);

  if (kind === 'none' || failed) {
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase();
    return (
      <span
        className="icon-placeholder"
        style={{
          width: size,
          height: size,
          fontSize: Math.max(10, size * 0.34),
          color: `hsl(${placeholderHue(id)}, 45%, 72%)`,
        }}
      >
        {initials}
      </span>
    );
  }

  const src = `sbicon://item/${encodeURIComponent(id)}`;
  const pixelated = kind === 'texture' || kind === 'wiki';

  return (
    <span className="icon-wrap" style={{ width: size, height: size }}>
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        onError={() => setFailed(true)}
        style={{ imageRendering: pixelated ? 'pixelated' : 'auto' }}
      />
      {tint && pixelated && (
        <span
          className="icon-tint"
          style={{
            backgroundColor: `rgb(${tint})`,
            WebkitMaskImage: `url("${src}")`,
            maskImage: `url("${src}")`,
          }}
        />
      )}
    </span>
  );
});
