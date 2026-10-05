// פענוח PNG מינימלי, בלי תלויות (רק fs+zlib המובנים של Node). נתמכים:
// colorType 6 (RGBA) ו-2 (RGB), bitDepth 8, ללא אינטרלייס — זה מכסה גם
// את תמונות המגדל/מלבן (RGBA) וגם צילומי מסך של Playwright (RGB או
// RGBA, תלוי בדף). משותף בין tools/measure-tower-base-zones.js
// ל-tools/run-regression.js — אל תשכפלו את המפענח, require מכאן.
"use strict";
const fs = require("fs");
const zlib = require("zlib");

function readPng(filePath) {
  const buf = fs.readFileSync(filePath);
  const sig = buf.subarray(0, 8);
  const expectedSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!sig.equals(expectedSig)) throw new Error(`${filePath}: not a PNG file`);

  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idatChunks = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 8 + length + 4; // length + type + data + crc
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2) || interlace !== 0) {
    throw new Error(
      `${filePath}: unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}) — this decoder only supports 8-bit RGB/RGBA, non-interlaced PNGs`
    );
  }

  const srcBpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * srcBpp;
  const recon = Buffer.alloc(height * stride);

  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (stride + 1)];
    const srcStart = y * (stride + 1) + 1;
    const dstStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const filt = raw[srcStart + x];
      const a = x >= srcBpp ? recon[dstStart + x - srcBpp] : 0;
      const b = y > 0 ? recon[dstStart - stride + x] : 0;
      const c = y > 0 && x >= srcBpp ? recon[dstStart - stride + x - srcBpp] : 0;
      let v;
      switch (filterType) {
        case 0: v = filt; break;
        case 1: v = filt + a; break;
        case 2: v = filt + b; break;
        case 3: v = filt + Math.floor((a + b) / 2); break;
        case 4: v = filt + paeth(a, b, c); break;
        default: throw new Error(`${filePath}: unknown PNG filter type ${filterType} at row ${y}`);
      }
      recon[dstStart + x] = v & 0xff;
    }
  }

  // תמיד מחזיר RGBA (alpha=255 מומצא אם המקור היה RGB), כדי שקוד קורא
  // לא יצטרך לדעת/לבדוק colorType בעצמו.
  if (srcBpp === 4) return { width, height, pixels: recon };
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += 3) {
    rgba[i * 4] = recon[j];
    rgba[i * 4 + 1] = recon[j + 1];
    rgba[i * 4 + 2] = recon[j + 2];
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, pixels: rgba };
}

module.exports = { readPng };
