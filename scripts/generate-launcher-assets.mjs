import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';

const NAVY = [5, 8, 22];
const NAVY_MID = [15, 27, 53];
const GOLD = [210, 180, 95];
const GOLD_LIGHT = [240, 217, 138];

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a.map((value, index) => Math.round(value + (b[index] - value) * t));

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0;
    rgba.copy(raw, rowOffset + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceToPolygon(x, y, polygon) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    minimum = Math.min(minimum, distanceToSegment(x, y, ax, ay, bx, by));
  }
  return minimum;
}

function starPolygon(cx, cy, outerRadius, innerRadius) {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
}

function shieldPolygon(scale = 1) {
  const cx = 0.5;
  return [
    [cx, 0.205],
    [cx + 0.19 * scale, 0.285],
    [cx + 0.19 * scale, 0.49],
    [cx + 0.175 * scale, 0.61],
    [cx + 0.115 * scale, 0.72],
    [cx, 0.805],
    [cx - 0.115 * scale, 0.72],
    [cx - 0.175 * scale, 0.61],
    [cx - 0.19 * scale, 0.49],
    [cx - 0.19 * scale, 0.285],
  ];
}

function drawLauncher(size, { maskable = false, round = false, monochrome = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const shield = shieldPolygon(maskable ? 0.84 : 1);
  const innerShield = shieldPolygon(maskable ? 0.60 : 0.72).map(([x, y]) => [x, 0.08 + y * 0.87]);
  const star = starPolygon(0.5, maskable ? 0.505 : 0.515, maskable ? 0.055 : 0.067, maskable ? 0.024 : 0.029);
  const strokeWidth = maskable ? 0.019 : 0.024;
  const innerStroke = 0.006;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const x = (px + 0.5) / size;
      const y = (py + 0.5) / size;
      const index = (py * size + px) * 4;

      const radial = clamp(1 - Math.hypot((x - 0.5) * 1.1, (y - 0.33) * 0.92));
      let color = monochrome ? [0, 0, 0] : mix(NAVY, NAVY_MID, radial * 0.72);
      let alpha = 255;

      if (!maskable && !round) {
        const radius = 0.215;
        const dx = Math.max(Math.abs(x - 0.5) - (0.5 - radius), 0);
        const dy = Math.max(Math.abs(y - 0.5) - (0.5 - radius), 0);
        const cornerDistance = Math.hypot(dx, dy);
        alpha = Math.round(255 * clamp((radius - cornerDistance) * size));
      }
      if (round && Math.hypot(x - 0.5, y - 0.5) > 0.5) alpha = 0;

      const inShield = pointInPolygon(x, y, shield);
      const shieldDistance = distanceToPolygon(x, y, shield);
      if (inShield && !monochrome) color = mix(color, [8, 16, 36], 0.86);
      if (shieldDistance <= strokeWidth) {
        const t = clamp(1 - shieldDistance / strokeWidth);
        color = monochrome ? [0, 0, 0] : mix(GOLD, GOLD_LIGHT, clamp((0.9 - y) * 0.9));
        alpha = Math.max(alpha, Math.round(255 * t));
      }

      const innerDistance = distanceToPolygon(x, y, innerShield);
      if (!monochrome && innerDistance <= innerStroke) {
        color = mix(color, GOLD_LIGHT, 0.58 * clamp(1 - innerDistance / innerStroke));
      }

      if (pointInPolygon(x, y, star)) {
        color = monochrome ? [0, 0, 0] : mix(GOLD, GOLD_LIGHT, clamp(1 - y));
        alpha = 255;
      }

      rgba[index] = color[0];
      rgba[index + 1] = color[1];
      rgba[index + 2] = color[2];
      rgba[index + 3] = alpha;
    }
  }

  return encodePng(size, size, rgba);
}

function writeAsset(path, size, options) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, drawLauncher(size, options));
  console.log(`Generated ${path} (${size}x${size})`);
}

const webAssets = [
  ['public/icons/bin-group-launcher-192.png', 192, {}],
  ['public/icons/bin-group-launcher-512.png', 512, {}],
  ['public/icons/bin-group-launcher-maskable-512.png', 512, { maskable: true }],
  ['public/icons/apple-touch-icon.png', 180, { maskable: true }],
  ['public/icons/favicon-32.png', 32, {}],
];
for (const [path, size, options] of webAssets) writeAsset(path, size, options);

const androidDensities = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};
for (const [density, size] of Object.entries(androidDensities)) {
  writeAsset(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`, size, { maskable: true });
  writeAsset(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`, size, { maskable: true, round: true });
}

writeAsset('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, { maskable: true });
