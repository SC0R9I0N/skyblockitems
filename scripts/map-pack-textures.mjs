// Maps FurfSky Reborn resource-pack textures (assets/) onto the item dataset.
//
// Mapping: for each item id, firmskyblock/models/item/<id-lowercase>.json
// names the flat icon layers (layer0, layer1, ...) inside the
// cittofirmgenerated namespace; items without a model fall back to a texture
// named exactly like the id. 3D models (helmet_icon cubes, placed skulls)
// have no layerN entries and are skipped — those items keep their existing
// skull/wiki icons.
//
// Output: data/icons/<ITEM_ID>.png. Animated textures (sprite sheet +
// .png.mcmeta) are sliced into square frames and re-encoded as APNG, which
// Chromium plays natively in <img>, so the sbicon:// handler serves them
// unchanged. Static single-layer icons are copied verbatim; multi-layer
// icons are alpha-composited. mcmeta `interpolate` is ignored (frames play
// discretely).
//
// Dataset updates (data/items.json): mapped items get icon.kind = "texture"
// (pixelated rendering); the leather-dye tint is removed when the pack
// texture is already colored; meta.generatedAt is bumped so the bundled
// dataset outranks stale userData copies.
//
// Run after `npm run data` regenerates the dataset:  npm run data:pack

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_DIR = path.join(ROOT, 'assets', 'firmskyblock', 'models', 'item');
const TEX_ROOT = path.join(ROOT, 'assets', 'cittofirmgenerated', 'textures');
const ICONS_DIR = path.join(ROOT, 'data', 'icons');
const ITEMS_FILE = path.join(ROOT, 'data', 'items.json');

const TICKS_PER_SECOND = 20; // APNG delay = frametime ticks / 20

// Items never mapped to pack textures (user-rejected art). Their entries are
// restored to the pre-pack icon (kind derived from the remote icon url).
const EXCLUDE = new Set(['CROWN_OF_AVARICE']);

// ------------------------------------------------------------------- crc32

const crc32 =
  zlib.crc32 ??
  (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return (buf) => {
      let c = 0xffffffff;
      for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
  })();

// -------------------------------------------------------------- PNG decode

/** Decode a PNG buffer to 8-bit RGBA. Throws on exotic formats. */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8;
  let w = 0, h = 0, depth = 0, colorType = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (interlace) throw new Error('interlaced png unsupported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`color type ${colorType} unsupported`);
  if (depth !== 8 && !(colorType === 3 && [1, 2, 4].includes(depth)))
    throw new Error(`bit depth ${depth}/ct ${colorType} unsupported`);

  const stride = Math.ceil((w * channels * depth) / 8);
  const bpp = Math.max(1, Math.ceil((channels * depth) / 8));
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const lines = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = lines.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    prev = cur;
  }

  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (colorType === 6) {
        lines.copy(rgba, o, y * stride + x * 4, y * stride + x * 4 + 4);
      } else if (colorType === 2) {
        const i = y * stride + x * 3;
        rgba[o] = lines[i];
        rgba[o + 1] = lines[i + 1];
        rgba[o + 2] = lines[i + 2];
        rgba[o + 3] =
          trns && trns.readUInt16BE(0) === lines[i] && trns.readUInt16BE(2) === lines[i + 1] && trns.readUInt16BE(4) === lines[i + 2]
            ? 0
            : 255;
      } else if (colorType === 0) {
        const v = lines[y * stride + x];
        rgba[o] = rgba[o + 1] = rgba[o + 2] = v;
        rgba[o + 3] = trns && trns.readUInt16BE(0) === v ? 0 : 255;
      } else if (colorType === 4) {
        const i = y * stride + x * 2;
        rgba[o] = rgba[o + 1] = rgba[o + 2] = lines[i];
        rgba[o + 3] = lines[i + 1];
      } else {
        // palette
        const perByte = 8 / depth;
        const byte = lines[y * stride + Math.floor(x / perByte)];
        const shift = 8 - depth - (x % perByte) * depth;
        const idx = (byte >> shift) & ((1 << depth) - 1);
        rgba[o] = palette[idx * 3];
        rgba[o + 1] = palette[idx * 3 + 1];
        rgba[o + 2] = palette[idx * 3 + 2];
        rgba[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      }
    }
  }
  return { w, h, rgba };
}

// ------------------------------------------------------- PNG / APNG encode

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
  return out;
}

function filteredScanlines(w, h, rgba) {
  const out = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    out[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(out, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return out;
}

/** Encode frames [{rgba, num, den}] as PNG (1 frame) or looping APNG. */
function encodePng(w, h, frames) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // depth
  ihdr[9] = 6; // RGBA
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (frames.length > 1) {
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(frames.length, 0); // num_plays 0 = loop forever
    parts.push(chunk('acTL', actl));
  }
  let seq = 0;
  frames.forEach((f, i) => {
    if (frames.length > 1) {
      const fctl = Buffer.alloc(26);
      fctl.writeUInt32BE(seq++, 0);
      fctl.writeUInt32BE(w, 4);
      fctl.writeUInt32BE(h, 8);
      fctl.writeUInt16BE(f.num, 20);
      fctl.writeUInt16BE(f.den, 22);
      // dispose_op NONE, blend_op SOURCE — each frame fully replaces the last
      parts.push(chunk('fcTL', fctl));
    }
    const z = zlib.deflateSync(filteredScanlines(w, h, f.rgba), { level: 9 });
    if (i === 0) parts.push(chunk('IDAT', z));
    else {
      const fdat = Buffer.alloc(4 + z.length);
      fdat.writeUInt32BE(seq++, 0);
      z.copy(fdat, 4);
      parts.push(chunk('fdAT', fdat));
    }
  });
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

// ------------------------------------------------------------- compositing

/** src-over blend src onto dst (both RGBA, same size), in place. */
function blendOver(dst, src) {
  for (let i = 0; i < dst.length; i += 4) {
    const sa = src[i + 3] / 255;
    if (sa === 0) continue;
    const da = dst[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) {
      dst[i + c] = Math.round((src[i + c] * sa + dst[i + c] * da * (1 - sa)) / oa);
    }
    dst[i + 3] = Math.round(oa * 255);
  }
}

function scaleNearest(rgba, w, h, W, H) {
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = Math.floor((y * h) / H);
    for (let x = 0; x < W; x++) {
      const sx = Math.floor((x * w) / W);
      rgba.copy(out, (y * W + x) * 4, (sy * w + sx) * 4, (sy * w + sx) * 4 + 4);
    }
  }
  return out;
}

function isGrayscale(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 16) continue;
    if (Math.abs(rgba[i] - rgba[i + 1]) > 8 || Math.abs(rgba[i + 1] - rgba[i + 2]) > 8) return false;
  }
  return true;
}

// ------------------------------------------------------------ pack lookups

function pngSize(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(24);
  fs.readSync(fd, head, 0, 24, 0);
  fs.closeSync(fd);
  return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
}

/** Resolve an item id to its icon source: flat texture layer refs (paths
 *  under the cittofirmgenerated textures/ root, no extension) and/or a
 *  firmament head model to render in 3D. Null when the pack has nothing. */
function layersFor(id) {
  const lid = id.toLowerCase();
  if (!/^[a-z0-9_.-]+$/.test(lid)) return null;
  const modelFile = path.join(MODELS_DIR, `${lid}.json`);
  if (fs.existsSync(modelFile)) {
    try {
      const model = JSON.parse(fs.readFileSync(modelFile, 'utf8'));
      const textures = model.textures ?? {};
      const refs = Object.keys(textures)
        .filter((k) => /^layer\d+$/.test(k))
        .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
        .map((k) => String(textures[k]))
        .filter((ref) => ref.startsWith('cittofirmgenerated:'))
        .map((ref) => ref.slice('cittofirmgenerated:'.length));

      // Some helmet items ship no flat icon: layer0 points at the 3D head
      // model's own skin (a cube-map sheet, useless as an icon). Render the
      // head model instead.
      const headRef = String(model['firmament:head_model'] ?? '');
      if (headRef.startsWith('cittofirmgenerated:')) {
        const headPath = path.join(
          ROOT, 'assets', 'cittofirmgenerated', 'models',
          `${headRef.slice('cittofirmgenerated:'.length)}.json`,
        );
        if (fs.existsSync(headPath)) {
          const head = JSON.parse(fs.readFileSync(headPath, 'utf8'));
          const skinRef = String(head.textures?.['0'] ?? '');
          if (!refs.length || `cittofirmgenerated:${refs[0]}` === skinRef) {
            return { headModel: head };
          }
        }
      }
      if (refs.length) return { layers: refs };
    } catch {
      /* malformed model — fall through */
    }
  }
  // Name-match fallback has no model vouching for it: only square textures
  // can be item icons (rejects 64x32 worn-armor layer sheets).
  const direct = path.join(TEX_ROOT, 'item', `${lid}.png`);
  if (fs.existsSync(direct)) {
    const { w, h } = pngSize(direct);
    const meta = fs.existsSync(`${direct}.mcmeta`);
    if (w === h || (meta && h > w && h % w === 0)) return { layers: [`item/${lid}`] };
    return { reject: true }; // sheet-shaped — also clean up any stale icon
  }
  return null;
}

// ------------------------------------------------------ head model render

// Software-rasterizes the cuboid elements of a Minecraft block model into a
// GUI-style isometric icon (yaw 45°, pitch 30°): front (north) and east faces
// plus the top, with vanilla-ish face brightness. Z-buffered, so overlapping
// hat/shell layers and multi-cube models come out right.
const RENDER_SIZE = 64;
const FACE_LIGHT = { up: 1.0, down: 0.5, north: 0.8, south: 0.8, east: 0.6, west: 0.6 };

function renderHeadModel(model, skin) {
  const yaw = Math.PI / 4, pitch = -Math.PI / 6;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const project = ([x, y, z]) => {
    const rx = x * cy + z * sy;
    const rz = -x * sy + z * cy;
    return [rx, y * cp - rz * sp, y * sp + rz * cp]; // [screen x, screen y(up), depth]
  };

  // Face corners: A = uv (u1,v1), B = (u2,v1), D = (u1,v2), oriented as the
  // texture appears when the face is viewed from outside the cube.
  const faceQuad = (face, f, t) =>
    ({
      north: [[t[0], t[1], f[2]], [f[0], t[1], f[2]], [t[0], f[1], f[2]]],
      south: [[f[0], t[1], t[2]], [t[0], t[1], t[2]], [f[0], f[1], t[2]]],
      east: [[t[0], t[1], t[2]], [t[0], t[1], f[2]], [t[0], f[1], t[2]]],
      west: [[f[0], t[1], f[2]], [f[0], t[1], t[2]], [f[0], f[1], f[2]]],
      up: [[f[0], t[1], f[2]], [t[0], t[1], f[2]], [f[0], t[1], t[2]]],
      down: [[f[0], f[1], t[2]], [t[0], f[1], t[2]], [f[0], f[1], f[2]]],
    })[face];

  const quads = [];
  for (const el of model.elements ?? []) {
    for (const [face, spec] of Object.entries(el.faces ?? {})) {
      if (!faceQuad(face, el.from, el.to) || spec.texture === '#missing') continue;
      quads.push({ corners: faceQuad(face, el.from, el.to).map(project), uv: spec.uv, light: FACE_LIGHT[face] });
    }
  }
  if (!quads.length) return null;

  // Fit the projected model into the canvas.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const q of quads) {
    const [a, b, d] = q.corners;
    const c = [b[0] + d[0] - a[0], b[1] + d[1] - a[1]];
    for (const p of [a, b, d, c]) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    }
  }
  const scale = (RENDER_SIZE - 2) / Math.max(maxX - minX, maxY - minY);
  const toScreen = ([x, y, z]) => [
    (x - minX) * scale + (RENDER_SIZE - (maxX - minX) * scale) / 2,
    (maxY - y) * scale + (RENDER_SIZE - (maxY - minY) * scale) / 2,
    z,
  ];

  const out = Buffer.alloc(RENDER_SIZE * RENDER_SIZE * 4);
  const zbuf = new Float32Array(RENDER_SIZE * RENDER_SIZE).fill(Infinity);
  for (const q of quads) {
    const [a, b, d] = q.corners.map(toScreen);
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const adx = d[0] - a[0], ady = d[1] - a[1];
    const det = abx * ady - aby * adx;
    if (Math.abs(det) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], d[0], b[0] + adx)));
    const x1 = Math.min(RENDER_SIZE - 1, Math.ceil(Math.max(a[0], b[0], d[0], b[0] + adx)));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], d[1], b[1] + ady)));
    const y1 = Math.min(RENDER_SIZE - 1, Math.ceil(Math.max(a[1], b[1], d[1], b[1] + ady)));
    const [u1, v1, u2, v2] = q.uv;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const rx = px + 0.5 - a[0], ry = py + 0.5 - a[1];
        const s = (rx * ady - ry * adx) / det;
        const t = (abx * ry - aby * rx) / det;
        if (s < 0 || s > 1 || t < 0 || t > 1) continue;
        const z = a[2] + s * (b[2] - a[2]) + t * (d[2] - a[2]);
        const zi = py * RENDER_SIZE + px;
        if (z >= zbuf[zi]) continue;
        const u = u1 + s * (u2 - u1), v = v1 + t * (v2 - v1);
        const tx = Math.min(skin.w - 1, Math.max(0, Math.floor((u / 16) * skin.w)));
        const ty = Math.min(skin.h - 1, Math.max(0, Math.floor((v / 16) * skin.h)));
        const si = (ty * skin.w + tx) * 4;
        if (skin.rgba[si + 3] < 128) continue;
        zbuf[zi] = z;
        const oi = zi * 4;
        out[oi] = skin.rgba[si] * q.light;
        out[oi + 1] = skin.rgba[si + 1] * q.light;
        out[oi + 2] = skin.rgba[si + 2] * q.light;
        out[oi + 3] = 255;
      }
    }
  }
  return out;
}

/** Load a texture layer: decoded frames + play sequence from its mcmeta. */
function loadLayer(ref) {
  const file = path.join(TEX_ROOT, `${ref}.png`);
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  const img = decodePng(bytes);

  let frameCount = 1;
  let frameH = img.h;
  let seq = [{ index: 0, time: 1 }];
  const metaFile = `${file}.mcmeta`;
  if (fs.existsSync(metaFile) && img.h > img.w && img.h % img.w === 0) {
    frameCount = img.h / img.w;
    frameH = img.w;
    let anim = {};
    try {
      anim = JSON.parse(fs.readFileSync(metaFile, 'utf8')).animation ?? {};
    } catch {
      /* malformed mcmeta — default timing */
    }
    const frametime = Math.max(1, anim.frametime ?? 1);
    const list = Array.isArray(anim.frames) && anim.frames.length ? anim.frames : [...Array(frameCount).keys()];
    seq = list
      .map((e) =>
        typeof e === 'object'
          ? { index: e.index ?? 0, time: Math.max(1, e.time ?? frametime) }
          : { index: e, time: frametime },
      )
      .filter((e) => e.index >= 0 && e.index < frameCount);
    if (!seq.length) seq = [{ index: 0, time: frametime }];
  }

  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(img.rgba.subarray(i * img.w * frameH * 4, (i + 1) * img.w * frameH * 4));
  }
  return { w: img.w, h: frameH, frames, seq, bytes };
}

// -------------------------------------------------------------------- main

const dataset = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
fs.mkdirSync(ICONS_DIR, { recursive: true });

// When un-mapping an item (excluded / bad shape), fall back to the remote
// icon and re-derive the icon kind the dataset pipeline would have assigned.
function unmapItem(item) {
  let removed = false;
  for (const ext of ['png', 'gif']) {
    const file = path.join(ICONS_DIR, `${item.id}.${ext}`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      removed = true;
    }
  }
  if (item.icon?.url) {
    const host = new URL(item.icon.url).host;
    item.icon.kind = host === 'mc-heads.net' ? 'skull' : host.includes('wiki') ? 'wiki' : 'texture';
  } else if (removed) {
    item.icon = { kind: 'none' };
  }
  return removed;
}

let mapped = 0, animated = 0, composited = 0, copied = 0, rendered3d = 0, tintsDropped = 0, failed = 0, unmapped = 0;
const failures = [];
const badShape = [];

for (const item of dataset.items) {
  if (EXCLUDE.has(item.id)) {
    if (unmapItem(item)) unmapped++;
    continue;
  }
  const source = layersFor(item.id);
  if (!source) continue;
  if (source.reject) {
    badShape.push(item.id);
    if (unmapItem(item)) unmapped++;
    continue;
  }

  let outBytes = null;
  let firstFrame = null; // final-look RGBA, for the tint check
  try {
    if (source.headModel) {
      const skinRef = String(source.headModel.textures?.['0'] ?? '').slice('cittofirmgenerated:'.length);
      const skinLayer = loadLayer(skinRef);
      if (!skinLayer) continue;
      const skin = { w: skinLayer.w, h: skinLayer.h * skinLayer.frames.length, rgba: null };
      skin.rgba = Buffer.concat(skinLayer.frames);
      const rgba = renderHeadModel(source.headModel, skin);
      if (!rgba) continue;
      outBytes = encodePng(RENDER_SIZE, RENDER_SIZE, [{ rgba }]);
      firstFrame = rgba;
      rendered3d++;
      fs.writeFileSync(path.join(ICONS_DIR, `${item.id}.png`), outBytes);
      const gifTwin = path.join(ICONS_DIR, `${item.id}.gif`);
      if (fs.existsSync(gifTwin)) fs.unlinkSync(gifTwin);
      item.icon = { ...item.icon, kind: 'texture' };
      mapped++;
      continue;
    }

    const layers = source.layers.map(loadLayer).filter(Boolean);
    if (!layers.length) continue;
    // A non-square static frame is a sheet (armor layer, skin), not an icon.
    if (layers.some((l) => l.w !== l.h)) {
      badShape.push(item.id);
      if (unmapItem(item)) unmapped++;
      continue;
    }
    const isAnimated = layers.some((l) => l.seq.length > 1);

    if (!isAnimated && layers.length === 1) {
      outBytes = layers[0].bytes; // preserve original encoding
      firstFrame = layers[0].frames[0];
      copied++;
    } else {
      const W = Math.max(...layers.map((l) => l.w));
      const H = Math.max(...layers.map((l) => l.h));
      const driver = layers.find((l) => l.seq.length > 1) ?? layers[0];
      const frames = driver.seq.map((step, i) => {
        const canvas = Buffer.alloc(W * H * 4);
        for (const layer of layers) {
          const s = layer.seq.length > 1 ? layer.seq[i % layer.seq.length] : layer.seq[0];
          let frame = layer.frames[s.index] ?? layer.frames[0];
          if (layer.w !== W || layer.h !== H) frame = scaleNearest(frame, layer.w, layer.h, W, H);
          blendOver(canvas, frame);
        }
        return { rgba: canvas, num: step.time, den: TICKS_PER_SECOND };
      });
      outBytes = encodePng(W, H, frames);
      firstFrame = frames[0].rgba;
      if (isAnimated) animated++;
      if (layers.length > 1) composited++;
    }
  } catch (e) {
    failed++;
    if (failures.length < 10) failures.push(`${item.id}: ${e.message}`);
    continue;
  }

  fs.writeFileSync(path.join(ICONS_DIR, `${item.id}.png`), outBytes);
  // sbicon:// prefers .gif — remove a stale scraped gif so the pack icon wins
  const gifTwin = path.join(ICONS_DIR, `${item.id}.gif`);
  if (fs.existsSync(gifTwin)) fs.unlinkSync(gifTwin);

  item.icon = { ...item.icon, kind: 'texture' };
  if (item.tint && firstFrame && !isGrayscale(firstFrame)) {
    delete item.tint; // pack texture is pre-colored; dye overlay would double-tint
    tintsDropped++;
  }
  mapped++;
}

dataset.meta.generatedAt = new Date().toISOString();
dataset.meta.texturePack = 'FurfSky Reborn';
fs.writeFileSync(ITEMS_FILE, JSON.stringify(dataset));

console.log(`[pack] ${mapped} items mapped to FurfSky Reborn textures`);
console.log(`[pack]   ${copied} copied verbatim, ${animated} animated (APNG), ${composited} multi-layer composites, ${rendered3d} head models rendered`);
console.log(`[pack]   ${tintsDropped} leather tints dropped (pre-colored textures)`);
if (unmapped) console.log(`[pack]   ${unmapped} un-mapped (excluded or non-icon shape)`);
if (badShape.length) console.log(`[pack]   sheet-shaped textures rejected: ${badShape.join(', ')}`);
if (failed) console.log(`[pack]   ${failed} failed:\n  ${failures.join('\n  ')}`);
console.log(`[pack] dataset updated (${dataset.meta.generatedAt})`);
