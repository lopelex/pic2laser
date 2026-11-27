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

  /** 24-Bit-BMP aus RGBA-Pixeln (Modus Farben; Transparenz vorher auf Weiß setzen). */
  function bmp24(rgba, w, h, dpi) {
    const rowBytes = Math.ceil((w * 3) / 4) * 4;
    const pixelSize = rowBytes * h;
    const offset = 14 + 40;
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
    dv.setUint16(28, 24, true);
    dv.setUint32(34, pixelSize, true);
    dv.setInt32(38, ppm, true);
    dv.setInt32(42, ppm, true);
    for (let y = 0; y < h; y++) {
      const row = offset + (h - 1 - y) * rowBytes;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, o = row + x * 3;
        u8[o] = rgba[i + 2]; u8[o + 1] = rgba[i + 1]; u8[o + 2] = rgba[i];
      }
    }
    return u8;
  }

  const fmt = (n) => Number(n.toFixed(3)).toString();
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /**
   * Baut das SVG. Maße in mm, damit LightBurn die Größe übernimmt.
   *  fillPath:  Potrace-Pfad (schwarz gefüllt)       – Modi Fläche/Linien
   *  imageB64:  eingebettetes Rasterbild (PNG, Base64) – Modi Foto/Relief
   *  stroke:    { d, width } Linien ohne Füllung (Breite in Pixeln) – Modus Wellen
   *  colors:    [{ d, hex, label }] Farbebenen von unten nach oben – Modus Farben. Je Farbe eine
   *             Inkscape-Ebene (Gruppe) mit gefülltem Pfad: LightBurn legt je Farbe eine Ebene an,
   *             Stickprogramme (z. B. Ink/Stitch) übernehmen Farbe und Reihenfolge als Garnwechsel
   *  layers:    [{ id, label, color, items }] Ebenen von unten nach oben – Vereinigen: je Bild eine
   *             Inkscape-Ebene, Vektoren in der Farbe der Ebene (LightBurn: eigene Ebene je Farbe),
   *             Rasterbilder unverändert (items siehe parseSvg)
   *  outline:   { d, pad } Umrisslinie (rot, ohne Füllung → eigene LightBurn-Ebene)
   *  preview:   Linienbreite für die Bildschirmvorschau statt Haarlinie
   * Bewusst ohne weißes Hintergrund-Rechteck: LightBurn würde es sonst als eigene Form importieren.
   */
  function svgDocument({ w, h, widthMm, fillPath = null, imageB64 = null, stroke = null, colors = null, layers = null, outline = null, preview = false }) {
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
    if (colors) {
      colors.forEach((c, i) => {
        if (!c.d) return;
        parts.push(`  <g id="farbe-${i + 1}" inkscape:groupmode="layer" inkscape:label="${esc(c.label || c.hex)}">
    <path d="${c.d}" fill="${c.hex}" fill-rule="evenodd" stroke="none"/>
  </g>`);
      });
    }
    if (imageB64) {
      parts.push(`  <image width="${w}" height="${h}" style="image-rendering:pixelated" xlink:href="data:image/png;base64,${imageB64}"/>`);
    }
    if (layers) {
      layers.forEach((l, i) => {
        if (!l.items.length) return;
        const body = l.items.map((it) => `    ${itemMarkup(it, l.color)}`).join('\n');
        parts.push(`  <g id="${esc(l.id || `ebene-${i + 1}`)}" inkscape:groupmode="layer" inkscape:label="${esc(l.label)}">
${body}
  </g>`);
      });
    }
    if (outline && outline.d) {
      const stroke = preview
        ? 'stroke-width="2" vector-effect="non-scaling-stroke"'
        : `stroke-width="${fmt(0.1 / mmPerPx)}"`;
      parts.push(`  <path d="${outline.d}" transform="translate(${-pad} ${-pad})" fill="none" stroke="#ff0000" ${stroke}/>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"${colors || layers ? ' xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"' : ''} width="${fmt(vbW * mmPerPx)}mm" height="${fmt(vbH * mmPerPx)}mm" viewBox="${-pad} ${-pad} ${vbW} ${vbH}">
${parts.join('\n')}
</svg>
`;
  }

  const IDENTITY = [1, 0, 0, 1, 0, 0];
  const isIdentity = (m) => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9);
  /** Matrix-Produkt a · b (SVG-Reihenfolge [a b c d e f]). */
  const mul = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];

  /** Ein Element einer Ebene als SVG (Vektoren in der Farbe der Ebene). */
  function itemMarkup(it, color) {
    const tf = it.m && !isIdentity(it.m) ? ` transform="matrix(${it.m.map(fmt).join(' ')})"` : '';
    if (it.kind === 'fill') return `<path d="${it.d}"${tf} fill="${color}" fill-rule="evenodd" stroke="none"/>`;
    if (it.kind === 'stroke') {
      return `<path d="${it.d}"${tf} fill="none" stroke="${color}" stroke-width="${fmt(it.width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    // Rasterbild: Weiß wirkt in der Vorschau durchsichtig (Multiplizieren wie beim Vereinigen)
    return `<image x="${fmt(it.x)}" y="${fmt(it.y)}" width="${fmt(it.w)}" height="${fmt(it.h)}"${tf} style="image-rendering:${it.smooth ? 'auto' : 'pixelated'};mix-blend-mode:multiply" xlink:href="data:image/png;base64,${it.b64}"/>`;
  }

  /**
   * Liest ein von svgDocument erzeugtes SVG (auch mit Ebenen) für das Vereinigen.
   * Ergebnis: { pad, w0, h0, items: [{ kind: 'fill'|'stroke'|'image', d|b64, width, x, y, w, h, m,
   *             color (Vektoren), group: { id, label } | null (Inkscape-Ebene) }],
   *             outline: { d, x, y } | null } – Koordinaten im Pixelraum des Ergebnisses (ohne Rand),
   * m = Transformation des Elements (Ebenen-Gruppen eingerechnet). null, wenn nicht lesbar.
   */
  function parseSvg(svg) {
    svg = String(svg || '');
    const vb = /viewBox="([-\d.e]+) ([-\d.e]+) ([\d.e]+) ([\d.e]+)"/.exec(svg);
    if (!vb) return null;
    const pad = -Number(vb[1]);
    const w0 = Number(vb[3]) - 2 * pad, h0 = Number(vb[4]) - 2 * pad;
    if (!(w0 > 0 && h0 > 0)) return null;
    const attrs = (t) => {
      const a = {};
      for (const m of t.matchAll(/([\w:-]+)="([^"]*)"/g)) a[m[1]] = m[2];
      return a;
    };
    const matrixOf = (t) => {
      if (!t) return IDENTITY;
      let m = /matrix\(([^)]*)\)/.exec(t);
      if (m) {
        const v = m[1].trim().split(/[\s,]+/).map(Number);
        return v.length === 6 && v.every(Number.isFinite) ? v : IDENTITY;
      }
      m = /translate\(([-\d.e]+)[\s,]+([-\d.e]+)\)/.exec(t);
      return m ? [1, 0, 0, 1, Number(m[1]), Number(m[2])] : IDENTITY;
    };
    const items = [];
    let outline = null;
    const stack = [IDENTITY];
    const groups = [null]; // oberste Ebene (Inkscape-Ebene) je Verschachtelungstiefe
    for (const tag of svg.matchAll(/<(\/?)(g|path|image)\b([^>]*?)(\/?)>/g)) {
      const [, close, name, rest, selfClose] = tag;
      if (name === 'g') {
        if (close) {
          if (stack.length > 1) { stack.pop(); groups.pop(); }
        } else if (!selfClose) {
          const ga = attrs(rest);
          stack.push(mul(stack[stack.length - 1], matrixOf(ga.transform)));
          groups.push(groups[groups.length - 1] || (ga['inkscape:groupmode'] === 'layer' ? { id: ga.id || '', label: ga['inkscape:label'] || ga.id || '' } : null));
        }
        continue;
      }
      if (close) continue;
      const a = attrs(rest);
      const m = mul(stack[stack.length - 1], matrixOf(a.transform));
      const group = groups[groups.length - 1];
      if (name === 'image') {
        const href = /^data:image\/png;base64,(.+)$/.exec(a['xlink:href'] || a.href || '');
        if (!href) continue;
        items.push({
          kind: 'image', b64: href[1], m, group,
          x: Number(a.x) || 0, y: Number(a.y) || 0, w: Number(a.width) || w0, h: Number(a.height) || h0,
          smooth: /image-rendering:auto/.test(a.style || ''),
        });
      } else if (a.d) {
        if (a.fill === 'none' && /^#(f00|ff0000)$/i.test(a.stroke || '')) {
          // Umrisslinie (rot) – eigene Behandlung
          outline = { d: a.d, x: m[4], y: m[5] };
        } else if (a.fill === 'none') {
          items.push({ kind: 'stroke', d: a.d, width: Number(a['stroke-width']) || 1, m, color: a.stroke || '#000000', group });
        } else {
          items.push({ kind: 'fill', d: a.d, m, color: a.fill || '#000000', group });
        }
      }
    }
    return { pad, w0, h0, items, outline };
  }

  /**
   * Pfad mit einer Transformation aus gleichmäßiger Skalierung und Verschiebung umrechnen
   * (m = [s, 0, 0, s, tx, ty]); absolute und relative Befehle, auch Bögen (A). Andere Matrizen:
   * null (dann bleibt die Transformation als Attribut).
   */
  function transformPath(d, m) {
    if (isIdentity(m)) return d;
    if (Math.abs(m[1]) > 1e-9 || Math.abs(m[2]) > 1e-9 || Math.abs(m[0] - m[3]) > 1e-9) return null;
    const sc = m[0], tx = m[4], ty = m[5];
    const toks = String(d).match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    const n = (v) => fmt(v);
    const out = [];
    let cmd = null, i = 0, first = true;
    const ARGS = { M: 2, L: 2, T: 2, C: 6, S: 4, Q: 4, H: 1, V: 1, A: 7, Z: 0 };
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i])) { cmd = toks[i++]; out.push(cmd); if (cmd.toUpperCase() === 'Z') continue; }
      if (!cmd) return null;
      const up = cmd.toUpperCase(), k = ARGS[up];
      // ein relatives „m“ am Pfadanfang gilt als absolut
      const rel = cmd !== up && !(first && up === 'M');
      first = false;
      if (k === undefined) return null;
      if (!k) continue;
      const v = toks.slice(i, i + k).map(Number);
      if (v.length < k || v.some((x) => !Number.isFinite(x))) return null;
      i += k;
      const X = (x) => n(x * sc + (rel ? 0 : tx)), Y = (y) => n(y * sc + (rel ? 0 : ty));
      if (up === 'H') out.push(X(v[0]));
      else if (up === 'V') out.push(Y(v[0]));
      else if (up === 'A') out.push(n(v[0] * Math.abs(sc)), n(v[1] * Math.abs(sc)), n(v[2]), n(v[3]), n(v[4]), X(v[5]), Y(v[6]));
      else for (let j = 0; j < k; j += 2) out.push(X(v[j]), Y(v[j + 1]));
    }
    return out.join(' ');
  }

  return { pngWithDpi, jpgWithDpi, bmp1bit, bmp8gray, bmp24, canvasBytes, svgDocument, parseSvg, transformPath, mulMatrix: mul, toBase64 };
})();
