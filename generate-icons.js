/**
 * generate-icons.js — Creates placeholder PNG icons for the extension.
 *
 * Run once with:  node generate-icons.js
 *
 * Produces:
 *   icons/icon16.png
 *   icons/icon48.png
 *   icons/icon128.png
 *
 * The icons are minimal colored squares with "FB" text, created using
 * raw PNG binary encoding (no external dependencies).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, bgR, bgG, bgB) {
  // Build raw RGBA pixel data
  const rawData = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.floor(width * 0.42);

  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte: None
    for (let x = 0; x < width; x++) {
      // Simple circle with "FB" shape
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Inside circle — draw background
        rawData.push(bgR, bgG, bgB, 255);
      } else if (dist <= radius + 1.5) {
        // Anti-aliased edge
        const alpha = Math.max(0, Math.min(255, Math.round((radius + 1.5 - dist) * 170)));
        rawData.push(bgR, bgG, bgB, alpha);
      } else {
        // Transparent
        rawData.push(0, 0, 0, 0);
      }
    }
  }

  // Draw "FB" text as simple pixel blocks (for sizes >= 48)
  if (width >= 48) {
    const scale = Math.floor(width / 48);
    const letterW = 4 * scale;
    const letterH = 7 * scale;
    const gap = 1 * scale;
    const totalW = letterW * 2 + gap;
    const offX = Math.floor((width - totalW) / 2);
    const offY = Math.floor((height - letterH) / 2);

    // F pattern (4x7 grid)
    const F = [
      [1,1,1,1],
      [1,0,0,0],
      [1,0,0,0],
      [1,1,1,0],
      [1,0,0,0],
      [1,0,0,0],
      [1,0,0,0],
    ];

    // B pattern (4x7 grid)
    const B = [
      [1,1,1,0],
      [1,0,0,1],
      [1,0,0,1],
      [1,1,1,0],
      [1,0,0,1],
      [1,0,0,1],
      [1,1,1,0],
    ];

    function drawLetter(pattern, startX, startY) {
      for (let py = 0; py < pattern.length; py++) {
        for (let px = 0; px < pattern[py].length; px++) {
          if (!pattern[py][px]) continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const drawX = startX + px * scale + sx;
              const drawY = startY + py * scale + sy;
              if (drawX >= 0 && drawX < width && drawY >= 0 && drawY < height) {
                const idx = (drawY * (width * 4 + 1)) + 1 + drawX * 4;
                rawData[idx] = 255;     // R
                rawData[idx + 1] = 255; // G
                rawData[idx + 2] = 255; // B
                rawData[idx + 3] = 255; // A
              }
            }
          }
        }
      }
    }

    drawLetter(F, offX, offY);
    drawLetter(B, offX + letterW + gap, offY);
  }

  // Compress raw data
  const compressed = zlib.deflateSync(Buffer.from(rawData));

  // Build PNG file
  const chunks = [];

  // PNG signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // Helper: create a PNG chunk
  function makeChunk(type, data) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const crcInput = Buffer.concat([typeBuffer, data]);
    const crc = crc32(crcInput);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc >>> 0, 0);

    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  chunks.push(makeChunk('IHDR', ihdr));

  // IDAT
  chunks.push(makeChunk('IDAT', compressed));

  // IEND
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

// CRC32 implementation
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate icons
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [16, 48, 128];
for (const size of sizes) {
  const png = createPNG(size, size, 233, 69, 96); // #e94560
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Created ${filePath} (${png.length} bytes)`);
}

console.log('Done!');
