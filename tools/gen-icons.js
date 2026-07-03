'use strict';
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

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
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * w * 4, y * w * 4 + w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function hex(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }

function roundRectTest(x0, y0, x1, y1, r) {
  return (px, py) => {
    if (px < x0 || px > x1 || py < y0 || py > y1) return false;
    if (px < x0 + r && py < y0 + r) return (px - (x0 + r)) ** 2 + (py - (y0 + r)) ** 2 <= r * r;
    if (px > x1 - r && py < y0 + r) return (px - (x1 - r)) ** 2 + (py - (y0 + r)) ** 2 <= r * r;
    if (px < x0 + r && py > y1 - r) return (px - (x0 + r)) ** 2 + (py - (y1 - r)) ** 2 <= r * r;
    if (px > x1 - r && py > y1 - r) return (px - (x1 - r)) ** 2 + (py - (y1 - r)) ** 2 <= r * r;
    return true;
  };
}

function draw(size) {
  const buf = Buffer.alloc(size * size * 4, 0);
  const s = size / 120;
  const red = hex('#FF3B30');
  const ink = hex('#0E0E10');

  const housing = roundRectTest(20 * s, 20 * s, 100 * s, 100 * s, 20 * s);
  const bar = roundRectTest(34 * s, 54 * s, 88 * s, 66 * s, 6 * s);
  const ccx = 44 * s, ccy = 60 * s, ccr = 12 * s;
  const circle = (px, py) => (px - ccx) ** 2 + (py - ccy) ** 2 <= ccr * ccr;

  const ss = 4, n = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let covRed = 0, covInk = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss, py = y + (sy + 0.5) / ss;
          if (!housing(px, py)) continue;
          if (bar(px, py) || circle(px, py)) covInk++; else covRed++;
        }
      }
      const i = (y * size + x) * 4;
      if (covRed + covInk === 0) continue;
      const rA = covRed / n, iA = covInk / n;
      const a = rA + iA;
      buf[i] = Math.round((red[0] * rA + ink[0] * iA) / a);
      buf[i + 1] = Math.round((red[1] * rA + ink[1] * iA) / a);
      buf[i + 2] = Math.round((red[2] * rA + ink[2] * iA) / a);
      buf[i + 3] = Math.round(a * 255);
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
