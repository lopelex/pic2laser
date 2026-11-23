'use strict';

/**
 * Ausgabe-Encoder. Alle Rasterformate erhalten die DPI-Angabe,
 * damit LightBurn die Bilder direkt in der richtigen Größe importiert.
 */
const Encoders = (() => {
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** Fügt einen pHYs-Chunk (Pixel pro Meter) direkt nach IHDR ein. */
  function pngWithDpi(bytes, dpi) {
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
    dv.setUint32(8, ppm);
    dv.setUint32(12, ppm);
    chunk[16] = 1; // Einheit: Meter
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));

    const IHDR_END = 8 + 25; // Signatur + IHDR-Chunk
    const out = new Uint8Array(bytes.length + chunk.length);
    out.set(bytes.subarray(0, IHDR_END), 0);
    out.set(chunk, IHDR_END);
    out.set(bytes.subarray(IHDR_END), IHDR_END + chunk.length);
    return out;
  }

  /** Setzt die Dichte im JFIF-Header (falls vorhanden). */
  function jpgWithDpi(bytes, dpi) {
    const out = new Uint8Array(bytes);
    const isJfif = out[2] === 0xff && out[3] === 0xe0 &&
      out[6] === 0x4a && out[7] === 0x46 && out[8] === 0x49 && out[9] === 0x46 && out[10] === 0;
    if (isJfif) {
      const d = Math.min(65535, Math.round(dpi));
      out[13] = 1; // Einheit: DPI
      out[14] = d >> 8; out[15] = d & 0xff;
      out[16] = d >> 8; out[17] = d & 0xff;
    }
    return out;
  }

  /** 1-Bit-BMP (schwarz/weiß) – klein und von LightBurn problemlos lesbar. */
  function bmp1bit(bits, w, h, dpi) {
    const rowBytes = Math.ceil(w / 32) * 4;
    const pixelSize = rowBytes * h;
    const offset = 14 + 40 + 8;
    const buf = new ArrayBuffer(offset + pixelSize);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    const ppm = Math.round(dpi / 0.0254);

    u8[0] = 0x42; u8[1] = 0x4d; // "BM"
    dv.setUint32(2, buf.byteLength, true);
    dv.setUint32(10, offset, true);
    dv.setUint32(14, 40, true);
    dv.setInt32(18, w, true);
    dv.setInt32(22, h, true); // bottom-up
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 1, true);
    dv.setUint32(30, 0, true);
    dv.setUint32(34, pixelSize, true);
    dv.setInt32(38, ppm, true);
    dv.setInt32(42, ppm, true);
    dv.setUint32(46, 2, true);
    dv.setUint32(50, 2, true);
    // Palette: Index 0 = schwarz, Index 1 = weiß
    dv.setUint32(54, 0x00000000, true);
    dv.setUint32(58, 0x00ffffff, true);

    for (let y = 0; y < h; y++) {
      const rowStart = offset + (h - 1 - y) * rowBytes;
      for (let x = 0; x < w; x++) {
        if (!bits[y * w + x]) u8[rowStart + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return u8;
  }

  /** 8-Bit-Graustufen-BMP (für Relief/Graustufengravur). */
  function bmp8gray(gray8, w, h, dpi) {
    const rowBytes = Math.ceil(w / 4) * 4;
    const pixelSize = rowBytes * h;
    const offset = 14 + 40 + 256 * 4;
    const buf = new ArrayBuffer(offset + pixelSize);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    const ppm = Math.round(dpi / 0.0254);
    u8[0] = 0x42; u8[1] = 0x4d;
    dv.setUint32(2, buf.byteLength, true);
    dv.setUint32(10, offset, true);
    dv.setUint32(14, 40, true);
    dv.setInt32(18, w, true);
    dv.setInt32(22, h, true);
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 8, true);
    dv.setUint32(34, pixelSize, true);
    dv.setInt32(38, ppm, true);
    dv.setInt32(42, ppm, true);
    dv.setUint32(46, 256, true);
    for (let i = 0; i < 256; i++) dv.setUint32(54 + i * 4, (i << 16) | (i << 8) | i, true);
    for (let y = 0; y < h; y++) {
      const row = offset + (h - 1 - y) * rowBytes;
      u8.set(gray8.subarray(y * w, y * w + w), row);
    }
    return u8;
  }

  async function canvasBytes(canvas, type, quality) {
    const blob = await canvas.convertToBlob({ type, quality });
    return new Uint8Array(await blob.arrayBuffer());
  }

  function toBase64(bytes) {
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(s);
  }

  const fmt = (n) => Number(n.toFixed(3)).toString();

  /**
   * Baut das SVG. Maße in mm, damit LightBurn die Größe übernimmt.
   *  fillPath:  Potrace-Pfad (schwarz gefüllt)       – Modi Fläche/Linien
   *  imageB64:  eingebettetes Rasterbild (PNG, Base64) – Modi Foto/Relief
   *  stroke:    { d, width } Linien ohne Füllung (Breite in Pixeln) – Modus Wellen
   *  outline:   { d, pad } Umrisslinie (rot, ohne Füllung → eigene LightBurn-Ebene)
   *  preview:   Linienbreite für die Bildschirmvorschau statt Haarlinie
   * Bewusst ohne weißes Hintergrund-Rechteck: LightBurn würde es sonst als eigene Form importieren.
   */
  function svgDocument({ w, h, widthMm, fillPath = null, imageB64 = null, stroke = null, outline = null, preview = false }) {
    const mmPerPx = widthMm / w;
    const pad = outline ? outline.pad : 0;
    const vbW = w + 2 * pad;
    const vbH = h + 2 * pad;
    const parts = [];
    if (fillPath) {
      parts.push(`  <path d="${fillPath}" fill="#000" fill-rule="evenodd" stroke="none"/>`);
    }
    if (stroke && stroke.d) {
      parts.push(`  <path d="${stroke.d}" fill="none" stroke="#000" stroke-width="${fmt(stroke.width)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    if (imageB64) {
      parts.push(`  <image width="${w}" height="${h}" style="image-rendering:pixelated" xlink:href="data:image/png;base64,${imageB64}"/>`);
    }
    if (outline && outline.d) {
      const stroke = preview
        ? 'stroke-width="2" vector-effect="non-scaling-stroke"'
        : `stroke-width="${fmt(0.1 / mmPerPx)}"`;
      parts.push(`  <path d="${outline.d}" transform="translate(${-pad} ${-pad})" fill="none" stroke="#ff0000" ${stroke}/>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${fmt(vbW * mmPerPx)}mm" height="${fmt(vbH * mmPerPx)}mm" viewBox="${-pad} ${-pad} ${vbW} ${vbH}">
${parts.join('\n')}
</svg>
`;
  }

  return { pngWithDpi, jpgWithDpi, bmp1bit, bmp8gray, canvasBytes, svgDocument, toBase64 };
})();
