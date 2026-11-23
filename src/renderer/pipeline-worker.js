'use strict';

/* global Processing, Encoders, Segmentation, Sine, Colors */

/**
 * Web Worker für die rechenintensive Bildverarbeitung, damit die Oberfläche
 * während der Berechnung bedienbar bleibt.
 */
importScripts('processing.js', 'encoders.js', 'segmentation.js', 'wasm/sine-wasm.js', 'sine.js', 'colors.js');

const handlers = {
  /**
   * Komplette Rasterverarbeitung eines Durchlaufs.
   * payload: { source, mask (Freistellen), lineMask (nur für die Motivkontur), s: Einstellungen }
   */
  async render({ source, mask, lineMask, textSource, s }) {
    if (s.mode === 'color') return renderColor({ source, mask, lineMask, textSource, s });
    let { w, h, bits, gray8, alpha8, alpha } = Processing.process(source, s, mask, textSource);
    if (textSource) textSource.close();
    // Wellen: Sinuswellen als Linien (SVG) plus gerastert (Rasterexporte, Vereinigen, Umrisslinie)
    let strokePath = null;
    if (s.mode === 'sine') {
      const mmPerPx = s.widthMm / w;
      strokePath = Sine.paths(gray8, w, h, s, mmPerPx);
      bits = Sine.rasterize(strokePath, w, h, s.sineStrokeMm / mmPerPx);
      gray8 = null;
    }
    // Motivkontur (nur Schwarz-Weiß-Modi)
    const contourMask = lineMask || mask;
    if (s.subjectLine && bits && contourMask) {
      Processing.addSubjectLine(bits, contourMask, w, h, s.subjectLineMm / (s.widthMm / w));
    }
    source.close();
    if (mask) mask.close();
    if (lineMask) lineMask.close();
    const r = { w, h, bits, gray8, alpha8 };
    // trace: Binärbild soll vektorisiert werden (die Bits gehen direkt an Potrace, kein PNG nötig)
    const out = { w, h, bits, gray8, alpha8: alpha8 || null, trace: false, imagePng: null, imageB64: null, sil: null, strokePath };

    if (!(s.outline && s.outlineOnly)) {
      if (s.mode === 'sine') {
        // fertig: die Wellen sind schon Vektorpfade
      } else if (s.mode === 'dither' || s.mode === 'relief') {
        out.imagePng = await Encoders.canvasBytes(Processing.resultCanvas(r, s.mode === 'relief' ? !!alpha8 : s.transparent), 'image/png');
        out.imageB64 = Encoders.toBase64(out.imagePng); // fürs SVG – teuer bei großen Bildern
      } else {
        out.trace = true;
      }
    }

    if (s.outline) out.sil = outlineSilhouette(s, w, h, bits, alpha, gray8);

    const transfer = [out.bits, out.gray8, out.alpha8, out.imagePng, out.sil && out.sil.bits]
      .filter(Boolean)
      .map((a) => a.buffer);
    return { result: out, transfer };
  },

  /**
   * Aktuelles Ergebnis mit einem Historie-Ergebnis vereinigen.
   * payload: { w, h, bits|gray8 (aktuelles Ergebnis, Kopie), baseEmpty (nur Umrisslinie),
   *            layer: { svg, mode, widthMm }, top: 'current'|'history', opacity: 0…1,
   *            gray (Graustufen ausgeben), vector (Ergebnis vektorisieren), transparent, ditherAlgo }
   * Rechnung in „Schwärze“ (0 = weiß, 255 = schwarz): Weiß ist durchsichtig, die obere Ebene wird
   * mit der Deckkraft abgeschwächt und wie Tinte auf die untere gelegt (Multiplizieren).
   */
  async merge(p) {
    const { w, h } = p;
    const n = w * h;
    const { dark: layer, aspectOff } = await layerDarkness(p.layer, w, h);
    const base = new Uint8Array(n);
    if (!p.baseEmpty) {
      if (p.gray8) for (let i = 0; i < n; i++) base[i] = 255 - p.gray8[i];
      else for (let i = 0; i < n; i++) base[i] = p.bits[i] ? 255 : 0;
    }
    const top = p.top === 'current' ? base : layer;
    const bottom = p.top === 'current' ? layer : base;
    const a = Math.min(1, Math.max(0, p.opacity));
    const gray = new Uint8ClampedArray(n); // Helligkeit: 0 = schwarz
    for (let i = 0; i < n; i++) gray[i] = ((255 - bottom[i]) * (255 - a * top[i])) / 255;

    const out = { w, h, bits: null, gray8: null, alpha8: null, trace: false, imagePng: null, imageB64: null, aspectOff };
    if (p.gray) {
      out.gray8 = gray;
      // Relief mit transparentem Hintergrund: bleibt durchsichtig, außer wo die Historie-Ebene etwas zeichnet
      if (p.alpha8 && p.alpha8.length === n) {
        const la = p.top === 'current' ? 1 : a; // Deckkraft der Historie-Ebene
        const alpha8 = new Uint8ClampedArray(n);
        for (let i = 0; i < n; i++) alpha8[i] = Math.max(p.alpha8[i], Math.min(255, layer[i] * la * 3));
        out.alpha8 = alpha8;
      }
      out.imagePng = await Encoders.canvasBytes(Processing.grayToCanvas(gray, w, h, out.alpha8), 'image/png');
    } else {
      // Nur bei voller oder keiner Deckkraft zweier Vektor-Ergebnisse bleibt es reines Schwarz-Weiß;
      // sonst entstehen Zwischentöne, die wie beim Foto-Modus gerastert werden
      const hard = a <= 0.001 || a >= 0.999;
      out.trace = p.vector && hard;
      out.bits = Processing.ditherGray(gray, w, h, out.trace ? 'threshold' : p.ditherAlgo);
      if (!out.trace) {
        out.imagePng = await Encoders.canvasBytes(Processing.bitsToCanvas(out.bits, w, h, p.transparent), 'image/png');
      }
    }
    if (out.imagePng) out.imageB64 = Encoders.toBase64(out.imagePng);
    const transfer = [out.bits, out.gray8, out.alpha8, out.imagePng].filter(Boolean).map((x) => x.buffer);
    return { result: out, transfer };
  },

  /** Vorschau des freigestellten Originals mit Klickpunkten (PNG-Bytes). */
  async cutout({ source, mask, markers, boxes, hideBackground }) {
    const blob = await Segmentation.cutoutPreview(source, mask, markers, boxes, hideBackground);
    source.close();
    if (mask) mask.close();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { result: bytes, transfer: [bytes.buffer] };
  },

  /** Himmel entfernen (Maske). */
  async skyMask({ source, tolerance, seeds, protect }) {
    const canvas = Segmentation.skyMask(source, tolerance, seeds, protect || null);
    source.close();
    if (protect) protect.close();
    const bitmap = canvas.transferToImageBitmap();
    return { result: bitmap, transfer: [bitmap] };
  },

  /** Farbbasierte Freistellmaske. */
  async colorMask({ source, tolerance, border, seeds }) {
    const canvas = Segmentation.colorMask(source, tolerance, border, seeds);
    source.close();
    const bitmap = canvas.transferToImageBitmap();
    return { result: bitmap, transfer: [bitmap] };
  },

  /** Freistellmaske verfeinern (Kante verschieben/glätten, Flecken und Löcher). */
  async refineMask({ mask, opts }) {
    const canvas = Segmentation.refineMask(mask, opts);
    mask.close();
    const bitmap = canvas.transferToImageBitmap();
    return { result: bitmap, transfer: [bitmap] };
  },
};

/** Silhouette für die Umrisslinie: Freistellmaske, sonst die gravierten bzw. nicht weißen Pixel. */
function outlineSilhouette(s, w, h, bits, alpha, gray8) {
  let src = bits;
  if (alpha) {
    src = new Uint8Array(alpha.length);
    for (let i = 0; i < alpha.length; i++) src[i] = alpha[i] >= 0.5 ? 1 : 0;
  } else if (gray8) {
    src = new Uint8Array(gray8.length);
    for (let i = 0; i < gray8.length; i++) src[i] = gray8[i] < 250 ? 1 : 0;
  }
  const mmPerPx = s.widthMm / w;
  const sil = Processing.silhouette(src, w, h, s.outlineOffsetMm / mmPerPx, s.outlineCloseMm / mmPerPx);
  return { w: sil.w, h: sil.h, pad: sil.pad, bits: sil.bits };
}

/**
 * Modus Farben: Bild in Farbflächen zerlegen (Colors.separate) und je sichtbarer Farbe eine
 * Binärmaske zum Vektorisieren liefern (colorMasks, Reihenfolge = colorLayers, von unten nach oben).
 * bits: alle sichtbaren Farben zusammen (für die Umrisslinie).
 */
function renderColor({ source, mask, lineMask, textSource, s }) {
  if (textSource) textSource.close();
  if (lineMask) lineMask.close();
  const { w, h, rgba, opaque } = Processing.processColor(source, s, mask);
  source.close();
  if (mask) mask.close();
  const mmPerPx = s.widthMm / w;
  const { labels, layers } = Colors.separate(rgba, opaque, w, h, {
    count: s.colorCount,
    palette: s.colorPalette,
    smoothPasses: (Number(s.colorSmoothMm) || 0) / mmPerPx,
    minAreaPx: (Number(s.colorMinAreaMm2) || 0) / (mmPerPx * mmPerPx),
    skipBg: !!s.colorSkipBg,
    edits: s.colorEdits,
  });
  const masks = Colors.layerMasks(labels, w, h, layers, (Number(s.colorOverlapMm) || 0) / mmPerPx, Processing.dilate);
  const bits = new Uint8Array(w * h);
  for (const m of masks) for (let i = 0; i < bits.length; i++) if (m.bits[i]) bits[i] = 1;
  let total = 0;
  for (const l of layers) total += l.area;
  const colorLayers = layers.map((l) => ({ ...l, share: total ? l.area / total : 0 }));
  const out = {
    w, h, bits, gray8: null, alpha8: null, trace: false, imagePng: null, imageB64: null, sil: null, strokePath: null,
    colorLayers,
    colorMasks: s.outline && s.outlineOnly ? [] : masks.map((m) => m.bits),
  };
  if (s.outline) {
    let src = null;
    if (mask) {
      src = new Uint8Array(w * h);
      for (let i = 0; i < src.length; i++) src[i] = opaque[i];
    }
    out.sil = outlineSilhouette(s, w, h, src || bits, null, null);
  }
  const transfer = [bits, ...out.colorMasks, out.sil && out.sil.bits].filter(Boolean).map((a) => a.buffer);
  return { result: out, transfer };
}

/**
 * Gespeichertes Ergebnis-SVG (siehe Encoders.svgDocument) auf w × h zeichnen und als Schwärze
 * (0 = weiß/durchsichtig, 255 = schwarz) zurückgeben. Gleiches Seitenverhältnis → deckungsgleich,
 * sonst mittig eingepasst. Die Umrisslinie des Eintrags wird nur übernommen, wenn sie sein
 * einziger Inhalt ist („nur Umrisslinie“) – sonst bliebe von ihr nur ein abgeschnittenes Stück.
 */
async function layerDarkness(layer, w, h) {
  const svg = String(layer.svg || '');
  const vb = /viewBox="([-\d.e]+) ([-\d.e]+) ([\d.e]+) ([\d.e]+)"/.exec(svg);
  if (!vb) throw new Error('Das Ergebnis des Historie-Eintrags ist nicht lesbar.');
  const pad = -Number(vb[1]);
  const w0 = Number(vb[3]) - 2 * pad, h0 = Number(vb[4]) - 2 * pad;
  if (!(w0 > 0 && h0 > 0)) throw new Error('Das Ergebnis des Historie-Eintrags ist nicht lesbar.');
  const fill = /<path d="([^"]*)" fill="#000"/.exec(svg);
  const stroke = /<path d="([^"]*)" fill="none" stroke="#000" stroke-width="([\d.e]+)"/.exec(svg);
  const image = /<image [^>]*xlink:href="data:image\/png;base64,([^"]+)"/.exec(svg);
  const outline = /<path d="([^"]*)" transform="translate\(([-\d.e]+) ([-\d.e]+)\)" fill="none"/.exec(svg);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sc = Math.min(w / w0, h / h0);
  ctx.setTransform(sc, 0, 0, sc, (w - w0 * sc) / 2, (h - h0 * sc) / 2);
  if (image) {
    const b64 = atob(image[1]);
    const bytes = new Uint8Array(b64.length);
    for (let i = 0; i < b64.length; i++) bytes[i] = b64.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    // Punktmuster beim Vergrößern nicht verwischen; Relief und Verkleinern glätten
    ctx.imageSmoothingEnabled = layer.mode === 'relief' || sc < 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w0, h0);
    bmp.close();
  }
  if (fill) {
    ctx.fillStyle = '#000';
    ctx.fill(new Path2D(fill[1]), 'evenodd');
  }
  if (stroke) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, Number(stroke[2]));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(new Path2D(stroke[1]));
  }
  if (!fill && !image && !stroke && outline) {
    ctx.translate(Number(outline[2]), Number(outline[3]));
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, 0.2 / ((layer.widthMm || 100) / w0)); // wie in den Rasterexporten
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(outline[1]));
  }
  const d = ctx.getImageData(0, 0, w, h).data;
  const dark = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < dark.length; p++, i += 4) dark[p] = ((255 - d[i]) * d[i + 3] + 127) / 255;
  return { dark, aspectOff: Math.abs(w0 / h0 - w / h) > 0.02 * (w / h) };
}

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  try {
    const { result, transfer } = await handlers[type](payload);
    self.postMessage({ ok: true, result }, transfer);
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
