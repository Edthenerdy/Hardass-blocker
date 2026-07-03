'use strict';
// Renders the Hardass Blocker mascot (a cute-but-tough granite rock) to PNG
// icons, dependency-free. Run: node tools/gen-icons.js
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) { raw[y * stride] = 0; rgba.copy(raw, y * stride + 1, y * w * 4, y * w * 4 + w * 4); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
function hex(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }

function roundRect(x0, y0, x1, y1, r) {
  return (px, py) => {
    if (px < x0 || px > x1 || py < y0 || py > y1) return false;
    if (px < x0 + r && py < y0 + r) return (px - (x0 + r)) ** 2 + (py - (y0 + r)) ** 2 <= r * r;
    if (px > x1 - r && py < y0 + r) return (px - (x1 - r)) ** 2 + (py - (y0 + r)) ** 2 <= r * r;
    if (px < x0 + r && py > y1 - r) return (px - (x0 + r)) ** 2 + (py - (y1 - r)) ** 2 <= r * r;
    if (px > x1 - r && py > y1 - r) return (px - (x1 - r)) ** 2 + (py - (y1 - r)) ** 2 <= r * r;
    return true;
  };
}
function circle(cx, cy, r) { return (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r; }
function capsule(ax, ay, bx, by, r) {
  return (px, py) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  };
}

function draw(size) {
  const buf = Buffer.alloc(size * size * 4, 0);
  const s = size / 120;
  const RED = hex('#FF3B30'), GRAN = hex('#A7ABB2'), SPK = hex('#7C8188'), INK = hex('#0E0E10'), BONE = hex('#F4F1EC');

  const housing = roundRect(20 * s, 20 * s, 100 * s, 100 * s, 20 * s);
  const pebble = roundRect(26 * s, 46 * s, 94 * s, 94 * s, 24 * s);
  const speckles = [[38, 58, 3], [82, 60, 2.5], [40, 86, 2.5], [82, 84, 3]].map(([x, y, r]) => circle(x * s, y * s, r * s));
  const browL = capsule(43 * s, 57 * s, 55 * s, 61 * s, 2.2 * s);
  const browR = capsule(77 * s, 57 * s, 65 * s, 61 * s, 2.2 * s);
  const eyeL = circle(50 * s, 70 * s, 5.5 * s), eyeR = circle(70 * s, 70 * s, 5.5 * s);
  const hlL = circle(48 * s, 68 * s, 1.8 * s), hlR = circle(68 * s, 68 * s, 1.8 * s);
  const mouth = capsule(54 * s, 84 * s, 66 * s, 84 * s, 1.9 * s);

  function colorAt(px, py) {
    if (hlL(px, py) || hlR(px, py)) return BONE;
    if (eyeL(px, py) || eyeR(px, py)) return INK;
    if (browL(px, py) || browR(px, py)) return INK;
    if (mouth(px, py)) return INK;
    if (pebble(px, py)) { for (const sp of speckles) if (sp(px, py)) return SPK; return GRAN; }
    if (housing(px, py)) return RED;
    return null;
  }

  const ss = 4, n = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = colorAt(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      if (a === 0) continue;
      const i = (y * size + x) * 4;
      buf[i] = Math.round(r / a); buf[i + 1] = Math.round(g / a); buf[i + 2] = Math.round(b / a); buf[i + 3] = Math.round(a / n * 255);
    }
  }
  return buf;
}

const outDir = path.join(__dirname, '..', 'extension', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), encodePng(size, size, draw(size)));
  console.log('wrote icon' + size + '.png');
}
