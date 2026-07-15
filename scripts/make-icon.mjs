// Renders build/icon.png (1024x1024): modern rounded-square app icon with a
// faceted gem centerpiece. Pure procedural rasterization (4x supersampled,
// no image dependencies). Run: node scripts/make-icon.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png');
const SIZE = 1024;
const SS = 4; // supersample factor
const N = SIZE * SS;

// ----------------------------------------------------------------- helpers
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** signed distance to a rounded rectangle centered at 0,0 */
function roundedRect(u, v, hw, hh, r) {
  const qx = Math.abs(u) - hw + r;
  const qy = Math.abs(v) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** point in convex polygon (vertices in order) */
function inPoly(u, v, pts) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const cross = (x2 - x1) * (v - y1) - (y2 - y1) * (u - x1);
    if (cross !== 0) {
      const s = Math.sign(cross);
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

/** 4-point star sparkle intensity at distance dx,dy (axis-aligned) */
function sparkle(dx, dy, size) {
  const ax = Math.abs(dx) / size;
  const ay = Math.abs(dy) / size;
  const star = Math.max(0, 1 - (ax + ay * 6)) + Math.max(0, 1 - (ay + ax * 6));
  return clamp01(star) ** 2;
}

// ------------------------------------------------------------------ palette
const BG0 = hex('#6d28d9'); // violet, top-left
const BG1 = hex('#312e81'); // indigo, mid
const BG2 = hex('#181638'); // deep indigo, bottom-right
const GOLD = hex('#f6c645');

// gem facet polygons in unit space (y down), painted in order
const T = -0.36, G = -0.04, C = 0.55; // table y, girdle y, culet y
const FACETS = [
  // crown (lit from the top-left, matching the tile glow)
  { pts: [[-0.34, T], [0.34, T], [0.17, G], [-0.17, G]], col: hex('#d9f7ff') }, // table
  { pts: [[-0.66, G], [-0.34, T], [-0.17, G]], col: hex('#8edcf2') }, // left bezel
  { pts: [[0.66, G], [0.34, T], [0.17, G]], col: hex('#5fc9e8') }, // right bezel
  // pavilion
  { pts: [[-0.66, G], [-0.22, G], [0, C]], col: hex('#57bfe2') },
  { pts: [[-0.22, G], [0.22, G], [0, C]], col: hex('#a5e9fa') },
  { pts: [[0.22, G], [0.66, G], [0, C]], col: hex('#2e9fd0') },
];
// thin girdle highlight
const GIRDLE = { pts: [[-0.66, G - 0.008], [0.66, G - 0.008], [0.66, G + 0.008], [-0.66, G + 0.008]], col: hex('#eefcff') };

const GEM_SCALE = 0.68; // gem size within the tile
const GEM_CY = 0.0; // gem center offset

const SPARKLES = [
  { x: 0.52, y: -0.5, s: 0.1, col: GOLD, a: 0.95 },
  { x: -0.58, y: 0.38, s: 0.065, col: GOLD, a: 0.8 },
  { x: 0.62, y: 0.18, s: 0.045, col: hex('#ffffff'), a: 0.7 },
];

// ------------------------------------------------------------------ render
const img = Buffer.alloc(N * N * 4);
const TILE_HW = 0.94, TILE_R = 0.30;

for (let py = 0; py < N; py++) {
  const v = ((py + 0.5) / N) * 2 - 1;
  for (let px = 0; px < N; px++) {
    const u = ((px + 0.5) / N) * 2 - 1;
    const o = (py * N + px) * 4;

    // tile mask
    if (roundedRect(u, v, TILE_HW, TILE_HW, TILE_R) > 0) continue; // transparent

    // background: diagonal gradient + top-left radial glow + vignette
    const t = clamp01((u + v + 2) / 4);
    let col = t < 0.5 ? mix(BG0, BG1, t * 2) : mix(BG1, BG2, (t - 0.5) * 2);
    const glow = Math.exp(-(((u + 0.55) ** 2 + (v + 0.6) ** 2) * 1.4));
    col = mix(col, [255, 255, 255], glow * 0.14);
    const edge = clamp01((Math.max(Math.abs(u), Math.abs(v)) - 0.62) / 0.35);
    col = mix(col, [8, 7, 22], edge * 0.35);

    // gem drop shadow (soft ellipse tucked under the pavilion tip)
    const sdx = u / 0.44, sdy = (v - 0.47) / 0.1;
    const sh = Math.exp(-(sdx * sdx + sdy * sdy) * 1.7);
    col = mix(col, [5, 4, 18], sh * 0.5);

    // gem facets
    const gu = u / GEM_SCALE, gv = (v - GEM_CY) / GEM_SCALE;
    for (const f of [...FACETS, GIRDLE]) {
      if (inPoly(gu, gv, f.pts)) {
        col = f.col;
        // vertical sheen inside the gem
        const sheen = clamp01(0.5 - gv * 0.55) * 0.12;
        col = mix(col, [255, 255, 255], sheen);
      }
    }

    // specular streak across the crown (diagonal, additive, gem area only)
    if (inPoly(gu, gv, [[-0.66, G], [0.34, T], [0.05, T], [-0.66, G + 0.001]]) === false) {
      const d = Math.abs(gu * 0.5 + gv * 1.2 + 0.36);
      if (Math.abs(gu) < 1 && gv > T && gv < C) {
        const spec = Math.max(0, 1 - d * 7);
        if (spec > 0 && (inPoly(gu, gv, [[-0.34, T], [0.34, T], [0.17, G], [-0.17, G]]) || inPoly(gu, gv, [[-0.66, G], [-0.34, T], [-0.17, G]]))) {
          col = mix(col, [255, 255, 255], spec * 0.5);
        }
      }
    }

    // sparkles
    for (const s of SPARKLES) {
      const i = sparkle(u - s.x, v - s.y, s.s) * s.a;
      if (i > 0) col = mix(col, s.col, Math.min(1, i * 1.4));
      const coreGlow = Math.exp(-(((u - s.x) ** 2 + (v - s.y) ** 2) / (s.s * s.s * 0.5))) * 0.35 * s.a;
      col = mix(col, s.col, coreGlow);
    }

    img[o] = Math.round(col[0]);
    img[o + 1] = Math.round(col[1]);
    img[o + 2] = Math.round(col[2]);
    img[o + 3] = 255;
  }
}

// -------------------------------------------------------------- downsample
const out = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * N + x * SS + sx) * 4;
        const al = img[i + 3] / 255;
        r += img[i] * al;
        g += img[i + 1] * al;
        b += img[i + 2] * al;
        a += al;
      }
    }
    const o = (y * SIZE + x) * 4;
    const inv = a > 0 ? 1 / a : 0;
    out[o] = Math.round(r * inv);
    out[o + 1] = Math.round(g * inv);
    out[o + 2] = Math.round(b * inv);
    out[o + 3] = Math.round((a / (SS * SS)) * 255);
  }
}

// ------------------------------------------------------------------ encode
const crc32 = zlib.crc32;
function chunk(type, data) {
  const buf = Buffer.alloc(12 + data.length);
  buf.writeUInt32BE(data.length, 0);
  buf.write(type, 4, 'ascii');
  data.copy(buf, 8);
  buf.writeUInt32BE(crc32(buf.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
  return buf;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
fs.writeFileSync(
  OUT,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
console.log(`wrote ${OUT} (${SIZE}x${SIZE})`);
