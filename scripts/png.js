// Minimal PNG decoder (non-interlaced, any color type, bit depth <= 8) returning RGBA pixels.
// Enough for comparing PokeAPI sprites without pulling in a dependency.
const zlib = require('node:zlib');

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG');
  let offset = 8;
  let header;
  let palette = null;
  let transparency = null;
  const data = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: chunk.readUInt32BE(0),
        height: chunk.readUInt32BE(4),
        depth: chunk[8],
        colorType: chunk[9],
        interlace: chunk[12],
      };
    } else if (type === 'PLTE') palette = chunk;
    else if (type === 'tRNS') transparency = chunk;
    else if (type === 'IDAT') data.push(chunk);
    else if (type === 'IEND') break;
    offset += length + 12;
  }

  const { width, height, depth, colorType, interlace } = header;
  if (interlace || depth > 8) throw new Error('Unsupported PNG (interlaced or 16-bit)');
  const channels = CHANNELS[colorType];
  const bitsPerPixel = channels * depth;
  const bytesPerPixel = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const raw = zlib.inflateSync(Buffer.concat(data));

  // Undo the per-scanline filters.
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bytesPerPixel ? out[x - bytesPerPixel] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bytesPerPixel ? prev[x - bytesPerPixel] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = value & 0xff;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  const sample = (row, index) => {
    if (depth === 8) return row[index];
    const bitOffset = index * depth;
    return (row[bitOffset >> 3] >> (8 - depth - (bitOffset & 7))) & ((1 << depth) - 1);
  };
  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 3) {
        const i = sample(row, x);
        rgba[o] = palette[i * 3];
        rgba[o + 1] = palette[i * 3 + 1];
        rgba[o + 2] = palette[i * 3 + 2];
        rgba[o + 3] = transparency && i < transparency.length ? transparency[i] : 255;
      } else if (colorType === 0 || colorType === 4) {
        const g = sample(row, x * channels) * (255 / ((1 << depth) - 1));
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = colorType === 4 ? row[x * 2 + 1] : 255;
      } else {
        rgba[o] = row[x * channels];
        rgba[o + 1] = row[x * channels + 1];
        rgba[o + 2] = row[x * channels + 2];
        rgba[o + 3] = colorType === 6 ? row[x * 4 + 3] : 255;
      }
    }
  }
  return { width, height, rgba };
}

// Share of visible pixels that differ noticeably between two images (0 = identical, 1 = nothing alike).
function pixelDifference(a, b) {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let visible = 0;
  let different = 0;
  for (let o = 0; o < a.rgba.length; o += 4) {
    const va = a.rgba[o + 3] > 32;
    const vb = b.rgba[o + 3] > 32;
    if (!va && !vb) continue;
    visible++;
    if (va !== vb) different++;
    else {
      const d = Math.abs(a.rgba[o] - b.rgba[o]) + Math.abs(a.rgba[o + 1] - b.rgba[o + 1]) + Math.abs(a.rgba[o + 2] - b.rgba[o + 2]);
      if (d > 48) different++;
    }
  }
  return visible ? different / visible : 0;
}

module.exports = { decodePng, pixelDifference };
