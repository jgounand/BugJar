/**
 * generate-icons.js — Creates BugJar PNG icons (jar + bug) for the extension.
 *
 * Run once with:  node generate-icons.js
 *
 * Produces:
 *   icons/icon16.png
 *   icons/icon48.png
 *   icons/icon128.png
 *
 * Draws a glass mason jar with a ladybug inside.
 * Pure Node.js — no external dependencies.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── Color helpers ──────────────────────────────────────────────────

function rgba(r, g, b, a = 255) { return { r, g, b, a }; }
function hexRgba(hex, a = 255) {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgba((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, a);
}

function blendOver(dst, src) {
  const sa = src.a / 255;
  const da = dst.a / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return rgba(0, 0, 0, 0);
  return rgba(
    Math.round((src.r * sa + dst.r * da * (1 - sa)) / oa),
    Math.round((src.g * sa + dst.g * da * (1 - sa)) / oa),
    Math.round((src.b * sa + dst.b * da * (1 - sa)) / oa),
    Math.round(oa * 255),
  );
}

// ── Drawing primitives on a pixel buffer ───────────────────────────

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.pixels = new Array(w * h);
    for (let i = 0; i < w * h; i++) this.pixels[i] = rgba(0, 0, 0, 0);
  }

  _idx(x, y) { return y * this.w + x; }

  setPixel(x, y, color) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h) return;
    this.pixels[this._idx(ix, iy)] = blendOver(this.pixels[this._idx(ix, iy)], color);
  }

  /** Anti-aliased pixel (sub-pixel coverage) */
  setPixelAA(x, y, color, coverage) {
    if (coverage <= 0) return;
    const c = { ...color, a: Math.round(color.a * Math.min(1, coverage)) };
    this.setPixel(x, y, c);
  }

  /** Fill a circle (anti-aliased edge) */
  fillCircle(cx, cy, r, color) {
    const x0 = Math.floor(cx - r - 1);
    const x1 = Math.ceil(cx + r + 1);
    const y0 = Math.floor(cy - r - 1);
    const y1 = Math.ceil(cy + r + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d <= r - 0.5) {
          this.setPixel(x, y, color);
        } else if (d <= r + 0.5) {
          this.setPixelAA(x, y, color, r + 0.5 - d);
        }
      }
    }
  }

  /** Fill an ellipse (anti-aliased edge) */
  fillEllipse(cx, cy, rx, ry, color) {
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
        if (d <= 1 - 0.5 / Math.max(rx, ry)) {
          this.setPixel(x, y, color);
        } else if (d <= 1 + 0.5 / Math.max(rx, ry)) {
          const edge = (1 + 0.5 / Math.max(rx, ry) - d) * Math.max(rx, ry);
          this.setPixelAA(x, y, color, edge);
        }
      }
    }
  }

  /** Fill a rounded rectangle */
  fillRoundRect(x, y, w, h, r, color) {
    r = Math.min(r, w / 2, h / 2);
    for (let py = Math.floor(y - 1); py <= Math.ceil(y + h + 1); py++) {
      for (let px = Math.floor(x - 1); px <= Math.ceil(x + w + 1); px++) {
        // Determine distance to rounded rect
        let dx = 0, dy = 0;
        if (px < x + r) dx = x + r - px;
        else if (px > x + w - r) dx = px - (x + w - r);
        if (py < y + r) dy = y + r - py;
        else if (py > y + h - r) dy = py - (y + h - r);

        let inside;
        if (dx > 0 && dy > 0) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= r - 0.5) inside = 1;
          else if (d <= r + 0.5) inside = r + 0.5 - d;
          else inside = 0;
        } else if (px >= x - 0.5 && px <= x + w + 0.5 && py >= y - 0.5 && py <= y + h + 0.5) {
          inside = 1;
          // Edge AA
          if (px < x) inside = Math.min(inside, px - x + 0.5);
          if (px > x + w) inside = Math.min(inside, 0.5 - (px - x - w));
          if (py < y) inside = Math.min(inside, py - y + 0.5);
          if (py > y + h) inside = Math.min(inside, 0.5 - (py - y - h));
        } else {
          inside = 0;
        }

        if (inside > 0) this.setPixelAA(px, py, color, inside);
      }
    }
  }

  /** Stroke a rounded rectangle outline */
  strokeRoundRect(x, y, w, h, r, color, lineW = 1) {
    const outer = { x, y, w, h, r };
    const inner = { x: x + lineW, y: y + lineW, w: w - 2 * lineW, h: h - 2 * lineW, r: Math.max(0, r - lineW) };

    for (let py = Math.floor(y - 1); py <= Math.ceil(y + h + 1); py++) {
      for (let px = Math.floor(x - 1); px <= Math.ceil(x + w + 1); px++) {
        const dOuter = this._rrectDist(px, py, outer);
        const dInner = this._rrectDist(px, py, inner);
        // Inside outer and outside inner
        const oIn = Math.max(0, Math.min(1, 0.5 - dOuter));
        const iIn = Math.max(0, Math.min(1, 0.5 - dInner));
        const coverage = oIn * (1 - iIn);
        if (coverage > 0) this.setPixelAA(px, py, color, coverage);
      }
    }
  }

  _rrectDist(px, py, rect) {
    const { x, y, w, h, r } = rect;
    let dx = 0, dy = 0;
    if (px < x + r) dx = x + r - px;
    else if (px > x + w - r) dx = px - (x + w - r);
    if (py < y + r) dy = y + r - py;
    else if (py > y + h - r) dy = py - (y + h - r);

    if (dx > 0 && dy > 0) {
      return Math.sqrt(dx * dx + dy * dy) - r;
    }
    // Signed distance to axis-aligned box
    const ex = Math.max(x - px, px - (x + w));
    const ey = Math.max(y - py, py - (y + h));
    return Math.max(ex, ey);
  }

  /** Draw a thick line (AA) */
  drawLine(x0, y0, x1, y1, color, thickness = 1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const nx = -dy / len;
    const ny = dx / len;
    const half = thickness / 2;

    const minX = Math.floor(Math.min(x0, x1) - half - 1);
    const maxX = Math.ceil(Math.max(x0, x1) + half + 1);
    const minY = Math.floor(Math.min(y0, y1) - half - 1);
    const maxY = Math.ceil(Math.max(y0, y1) + half + 1);

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        // Project onto line
        const t = ((px - x0) * dx + (py - y0) * dy) / (len * len);
        const tc = Math.max(0, Math.min(1, t));
        const closestX = x0 + tc * dx;
        const closestY = y0 + tc * dy;
        const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
        if (dist <= half + 0.5) {
          const coverage = Math.max(0, Math.min(1, half + 0.5 - dist));
          this.setPixelAA(px, py, color, coverage);
        }
      }
    }
  }

  /** Draw a quadratic bezier curve */
  drawBezier(x0, y0, cx, cy, x1, y1, color, thickness = 1) {
    const steps = Math.max(20, Math.ceil(Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) * 2));
    let prevX = x0, prevY = y0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const px = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
      const py = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
      this.drawLine(prevX, prevY, px, py, color, thickness);
      prevX = px;
      prevY = py;
    }
  }

  /** Fill a trapezoid (for jar body shape) */
  fillTrapezoid(topX1, topX2, topY, botX1, botX2, botY, color) {
    for (let y = Math.floor(topY); y <= Math.ceil(botY); y++) {
      const t = (y - topY) / (botY - topY);
      const leftX = topX1 + t * (botX1 - topX1);
      const rightX = topX2 + t * (botX2 - topX2);
      for (let x = Math.floor(leftX - 0.5); x <= Math.ceil(rightX + 0.5); x++) {
        let coverage = 1;
        if (x < leftX) coverage = Math.max(0, x + 0.5 - (leftX - 0.5));
        else if (x > rightX) coverage = Math.max(0, (rightX + 0.5) - (x - 0.5));
        if (y < topY) coverage *= Math.max(0, y + 0.5 - (topY - 0.5));
        else if (y > botY) coverage *= Math.max(0, (botY + 0.5) - (y - 0.5));
        if (coverage > 0) this.setPixelAA(x, y, color, coverage);
      }
    }
  }
}

// ── Draw the BugJar icon at a given size ──────────────────────────

function drawBugJar(size) {
  const c = new Canvas(size, size);
  const s = size / 128; // Scale factor (design space is 128x128)

  // Colors
  const jarFill     = hexRgba('#a8e6cf', 100);   // Translucent green glass
  const jarStroke   = hexRgba('#3dab82', 255);    // Jar outline
  const jarShine    = hexRgba('#ffffff', 90);      // Glass highlight
  const lidColor    = hexRgba('#7f8c8d', 255);    // Metallic lid
  const lidHighlight= hexRgba('#b0bec5', 255);    // Lid highlight
  const lidDark     = hexRgba('#5d6d6e', 255);    // Lid shadow
  const neckFill    = hexRgba('#c8f0dc', 120);    // Jar neck glass
  const bugBody     = hexRgba('#e94560', 255);    // Red bug body
  const bugDark     = hexRgba('#2c3e50', 255);    // Dark parts (head, dots, legs)
  const bugDots     = hexRgba('#1a252f', 255);    // Bug spots

  // ── Jar body (tapered shape) ──
  // Neck opening
  const neckL = 38 * s, neckR = 90 * s, neckTop = 18 * s, neckBot = 34 * s;
  // Body widens slightly below neck
  const bodyTopL = 32 * s, bodyTopR = 96 * s, bodyTopY = 40 * s;
  // Body bottom with rounded corners
  const bodyBotL = 32 * s, bodyBotR = 96 * s, bodyBotY = 108 * s;
  const bodyCornerR = 10 * s;

  // Fill jar body area
  c.fillTrapezoid(neckL, neckR, neckBot, bodyTopL, bodyTopR, bodyTopY, jarFill);
  c.fillRoundRect(bodyTopL, bodyTopY, bodyTopR - bodyTopL, bodyBotY - bodyTopY, bodyCornerR, jarFill);

  // Jar outline — left side
  c.drawLine(neckL, neckBot, bodyTopL - 1 * s, bodyTopY + 4 * s, jarStroke, 2.2 * s);
  c.drawLine(bodyTopL - 1 * s, bodyTopY + 4 * s, bodyBotL, bodyBotY - bodyCornerR, jarStroke, 2.2 * s);
  // Bottom
  c.drawBezier(bodyBotL, bodyBotY - bodyCornerR, bodyBotL, bodyBotY + 2 * s, 64 * s, bodyBotY + 4 * s, jarStroke, 2.2 * s);
  c.drawBezier(64 * s, bodyBotY + 4 * s, bodyBotR, bodyBotY + 2 * s, bodyBotR, bodyBotY - bodyCornerR, jarStroke, 2.2 * s);
  // Right side
  c.drawLine(bodyBotR, bodyBotY - bodyCornerR, bodyTopR + 1 * s, bodyTopY + 4 * s, jarStroke, 2.2 * s);
  c.drawLine(bodyTopR + 1 * s, bodyTopY + 4 * s, neckR, neckBot, jarStroke, 2.2 * s);

  // Glass shine on left side
  c.drawLine(37 * s, 44 * s, 36 * s, 95 * s, jarShine, 2.5 * s);

  // ── Jar neck ──
  c.fillRoundRect(neckL, neckTop, neckR - neckL, neckBot - neckTop, 2 * s, neckFill);
  c.strokeRoundRect(neckL, neckTop, neckR - neckL, neckBot - neckTop, 2 * s, jarStroke, 1.5 * s);

  // ── Jar lid ──
  const lidX = 33 * s, lidY = 10 * s, lidW = 62 * s, lidH = 10 * s, lidR = 3 * s;
  c.fillRoundRect(lidX, lidY, lidW, lidH, lidR, lidColor);
  // Lid highlight stripe
  c.drawLine(lidX + 2 * s, lidY + 2.5 * s, lidX + lidW - 2 * s, lidY + 2.5 * s, lidHighlight, 1.5 * s);
  // Lid bottom shadow
  c.drawLine(lidX + 2 * s, lidY + lidH - 1.5 * s, lidX + lidW - 2 * s, lidY + lidH - 1.5 * s, lidDark, 1 * s);
  // Lid outline
  c.strokeRoundRect(lidX, lidY, lidW, lidH, lidR, lidDark, 1.2 * s);

  // ── Bug (ladybug style) ──
  const bugCX = 64 * s;
  const bugCY = 72 * s;

  // Bug legs (drawn first, behind body)
  const legThick = Math.max(1, 1.5 * s);
  // Left legs
  c.drawBezier(bugCX - 8 * s, bugCY - 8 * s, bugCX - 16 * s, bugCY - 12 * s, bugCX - 20 * s, bugCY - 16 * s, bugDark, legThick);
  c.drawBezier(bugCX - 9 * s, bugCY - 1 * s, bugCX - 18 * s, bugCY - 1 * s, bugCX - 22 * s, bugCY - 4 * s, bugDark, legThick);
  c.drawBezier(bugCX - 8 * s, bugCY + 7 * s, bugCX - 16 * s, bugCY + 10 * s, bugCX - 20 * s, bugCY + 13 * s, bugDark, legThick);
  // Right legs
  c.drawBezier(bugCX + 8 * s, bugCY - 8 * s, bugCX + 16 * s, bugCY - 12 * s, bugCX + 20 * s, bugCY - 16 * s, bugDark, legThick);
  c.drawBezier(bugCX + 9 * s, bugCY - 1 * s, bugCX + 18 * s, bugCY - 1 * s, bugCX + 22 * s, bugCY - 4 * s, bugDark, legThick);
  c.drawBezier(bugCX + 8 * s, bugCY + 7 * s, bugCX + 16 * s, bugCY + 10 * s, bugCX + 20 * s, bugCY + 13 * s, bugDark, legThick);

  // Antennae
  const antThick = Math.max(1, 1.3 * s);
  c.drawBezier(bugCX - 3 * s, bugCY - 16 * s, bugCX - 8 * s, bugCY - 24 * s, bugCX - 12 * s, bugCY - 26 * s, bugDark, antThick);
  c.drawBezier(bugCX + 3 * s, bugCY - 16 * s, bugCX + 8 * s, bugCY - 24 * s, bugCX + 12 * s, bugCY - 26 * s, bugDark, antThick);
  // Antenna tips
  c.fillCircle(bugCX - 12 * s, bugCY - 26 * s, 1.5 * s, bugDark);
  c.fillCircle(bugCX + 12 * s, bugCY - 26 * s, 1.5 * s, bugDark);

  // Bug head
  c.fillCircle(bugCX, bugCY - 13 * s, 5.5 * s, bugDark);

  // Bug body (ellipse)
  c.fillEllipse(bugCX, bugCY, 10 * s, 14 * s, bugBody);

  // Wing line (center split)
  c.drawLine(bugCX, bugCY - 13 * s, bugCX, bugCY + 13 * s, bugDark, Math.max(1, 1.2 * s));

  // Bug spots
  if (size >= 32) {
    const spotR = Math.max(1, 2 * s);
    c.fillCircle(bugCX - 4.5 * s, bugCY - 5 * s, spotR, bugDots);
    c.fillCircle(bugCX + 4.5 * s, bugCY - 5 * s, spotR, bugDots);
    c.fillCircle(bugCX - 4 * s, bugCY + 3 * s, spotR * 0.85, bugDots);
    c.fillCircle(bugCX + 4 * s, bugCY + 3 * s, spotR * 0.85, bugDots);
    if (size >= 48) {
      c.fillCircle(bugCX - 3 * s, bugCY + 9 * s, spotR * 0.7, bugDots);
      c.fillCircle(bugCX + 3 * s, bugCY + 9 * s, spotR * 0.7, bugDots);
    }
  }

  return c;
}

// ── PNG encoder (no dependencies) ─────────────────────────────────

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function canvasToPNG(canvas) {
  const { w, h, pixels } = canvas;
  // Build raw scanlines with filter byte
  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0); // filter: None
    for (let x = 0; x < w; x++) {
      const p = pixels[y * w + x];
      raw.push(p.r, p.g, p.b, p.a);
    }
  }

  const compressed = zlib.deflateSync(Buffer.from(raw));
  const chunks = [];

  // PNG signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  chunks.push(makeChunk('IHDR', ihdr));

  // IDAT
  chunks.push(makeChunk('IDAT', compressed));

  // IEND
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

// ── Main ──────────────────────────────────────────────────────────

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [16, 48, 128];
for (const size of sizes) {
  const canvas = drawBugJar(size);
  const png = canvasToPNG(canvas);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Created ${filePath} (${png.length} bytes)`);
}

console.log('\nAll icons generated!');
