/**
 * Web Worker für die rechenintensive Bildverarbeitung, damit die Oberfläche
 * während der Berechnung bedienbar bleibt.
 */

import { Colors } from './colors.js';
import { Encoders } from './encoders.js';
import { Processing } from './processing.js';
import { Segmentation } from './segmentation.js';
import { Sine } from './sine.js';

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
      // Freigestellter Hintergrund bleibt leer (sonst zeichnete Weiß dort gerade Linien). Ohne „Weiße
      // Flächen auslassen“ soll Weiß im Motiv aber Linien behalten: Motiv höchstens 253 (unter der
      // Weiß-Schwelle 253,5 der Wellen), Hintergrund 255, dann nur ≥ 253,5 auslassen.
      let src = gray8, ss = s;
      if (alpha && !s.sineSkipWhite) {
        src = new Uint8Array(gray8.length);
        for (let i = 0; i < src.length; i++) src[i] = alpha[i] >= 0.5 ? Math.min(gray8[i], 253) : 255;
        ss = { ...s, sineSkipWhite: true };
      }
      strokePath = Sine.paths(src, w, h, ss, mmPerPx);
      bits = Sine.rasterize(strokePath, w, h, s.sineStrokeMm / mmPerPx);
      gray8 = null;
    }
    // Motivkontur. Wellen: der Ring geht zusätzlich einzeln zurück – er wird als gefüllte Fläche
    // vektorisiert (die Wellen selbst sind Linien ohne Füllung)
    const contourMask = lineMask || mask;
    let contourBits = null;
    if (s.subjectLine && bits && contourMask) {
      const widthPx = s.subjectLineMm / (s.widthMm / w);
      if (s.mode === 'sine') {
        contourBits = Processing.addSubjectLine(new Uint8Array(w * h), contourMask, w, h, widthPx);
        for (let i = 0; i < bits.length; i++) if (contourBits[i]) bits[i] = 1;
      } else {
        Processing.addSubjectLine(bits, contourMask, w, h, widthPx);
      }
    }
    source.close();
    if (mask) mask.close();
    if (lineMask) lineMask.close();
    const r = { w, h, bits, gray8, alpha8 };
    // trace: Binärbild soll vektorisiert werden (die Bits gehen direkt an Potrace, kein PNG nötig)
    const out = { w, h, bits, gray8, alpha8: alpha8 || null, trace: false, imagePng: null, imageB64: null, sil: null, strokePath, contourBits };

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

    const transfer = [out.bits, out.gray8, out.alpha8, out.imagePng, out.sil && out.sil.bits, out.contourBits]
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

    const out = { w, h, bits: null, gray8: null, alpha8: null, trace: false, imagePng: null, imageB64: null, topImageB64: null, aspectOff };
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
    // Eigene Ebene der oberen Seite bei Überblenden zwischen 0 und 100 %: abgeschwächt und gerastert
    // (Graustufen bei Relief), Weiß durchsichtig – die untere Ebene bleibt unverändert
    if (a > 0.001 && a < 0.999) {
      const tg = new Uint8ClampedArray(n);
      for (let i = 0; i < n; i++) tg[i] = 255 - a * top[i];
      let canvas;
      if (p.gray) {
        const alpha = new Uint8ClampedArray(n);
        for (let i = 0; i < n; i++) alpha[i] = 255 - tg[i] > 0 ? 255 : 0;
        canvas = Processing.grayToCanvas(tg, w, h, alpha);
      } else {
        canvas = Processing.bitsToCanvas(Processing.ditherGray(tg, w, h, p.ditherAlgo), w, h, true);
      }
      out.topImageB64 = Encoders.toBase64(await Encoders.canvasBytes(canvas, 'image/png'));
    }
    const transfer = [out.bits, out.gray8, out.alpha8, out.imagePng].filter(Boolean).map((x) => x.buffer);
    return { result: out, transfer };
  },

  /** Vorschau des freigestellten Originals mit Klickpunkten (PNG-Bytes). */
  async cutout({ source, mask, markers, boxes, hideBackground, faceBoxes }) {
    const blob = await Segmentation.cutoutPreview(source, mask, markers, boxes, hideBackground, faceBoxes || []);
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
  const { w, h, rgba, opaque, textKeep, textColors } = Processing.processColor(source, s, mask);
  source.close();
  const mmPerPx = s.widthMm / w;
  // Motivkontur: eigene schwarze Ebene ganz oben; die Farbflächen darunter sparen sie aus
  const contourMask = lineMask || mask;
  let contourBits = null;
  if (s.subjectLine && contourMask) {
    contourBits = Processing.addSubjectLine(new Uint8Array(w * h), contourMask, w, h, s.subjectLineMm / mmPerPx);
    if (!contourBits.some(Boolean)) contourBits = null;
  }
  if (mask) mask.close();
  if (lineMask) lineMask.close();
  const { labels, layers } = Colors.separate(rgba, opaque, w, h, {
    count: s.colorCount,
    palette: s.colorPalette,
    smoothPasses: (Number(s.colorSmoothMm) || 0) / mmPerPx,
    minAreaPx: (Number(s.colorMinAreaMm2) || 0) / (mmPerPx * mmPerPx),
    skipBg: !!s.colorSkipBg,
    edits: s.colorEdits,
    keep: textKeep,
    textColors,
  });
  const masks = Colors.layerMasks(labels, w, h, layers, (Number(s.colorOverlapMm) || 0) / mmPerPx, Processing.dilate);
  const bits = new Uint8Array(w * h);
  for (const m of masks) for (let i = 0; i < bits.length; i++) if (m.bits[i]) bits[i] = 1;
  if (contourBits) {
    for (const m of masks) for (let i = 0; i < bits.length; i++) if (contourBits[i]) m.bits[i] = 0;
    for (let i = 0; i < bits.length; i++) if (contourBits[i]) bits[i] = 1;
  }
  let total = 0;
  for (const l of layers) total += l.area;
  const colorLayers = layers.map((l) => ({ ...l, share: total ? l.area / total : 0 }));
  const out = {
    w, h, bits, gray8: null, alpha8: null, trace: false, imagePng: null, imageB64: null, sil: null, strokePath: null,
    colorLayers,
    colorMasks: s.outline && s.outlineOnly ? [] : masks.map((m) => m.bits),
    // Motivkontur als letzte Maske (wird im Hauptprozess zur Ebene „Motivkontur“)
    colorContour: !!contourBits && !(s.outline && s.outlineOnly),
  };
  if (out.colorContour) out.colorMasks.push(contourBits);
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
  const doc = Encoders.parseSvg(layer.svg);
  if (!doc) throw new Error('Das Ergebnis des Historie-Eintrags ist nicht lesbar.');
  const { w0, h0, items, outline } = doc;

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sc = Math.min(w / w0, h / h0);
  const fit = [sc, 0, 0, sc, (w - w0 * sc) / 2, (h - h0 * sc) / 2];
  const use = (m) => ctx.setTransform(...Encoders.mulMatrix(fit, m));
  for (const it of items) {
    use(it.m);
    if (it.kind === 'image') {
      const b64 = atob(it.b64);
      const bytes = new Uint8Array(b64.length);
      for (let i = 0; i < b64.length; i++) bytes[i] = b64.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      // Punktmuster beim Vergrößern nicht verwischen; Relief und Verkleinern glätten
      ctx.imageSmoothingEnabled = layer.mode === 'relief' || it.smooth || sc < 1;
      ctx.imageSmoothingQuality = 'high';
      // Weiß ist durchsichtig: Bilder dunkeln nur ab (wie beim Vereinigen gerechnet)
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(bmp, it.x, it.y, it.w, it.h);
      ctx.globalCompositeOperation = 'source-over';
      bmp.close();
    } else if (it.kind === 'fill') {
      ctx.fillStyle = '#000';
      ctx.fill(new Path2D(it.d), 'evenodd');
    } else {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = Math.max(1, it.width);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke(new Path2D(it.d));
    }
  }
  if (!items.length && outline) {
    use([1, 0, 0, 1, outline.x, outline.y]);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, 0.2 / ((layer.widthMm || 100) / w0)); // wie in den Rasterexporten
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(outline.d));
  }
  const d = ctx.getImageData(0, 0, w, h).data;
  const dark = new Uint8Array(w * h);
  // dunkelster Kanal: auch farbige Ebenen (z. B. blaue Vektoren eines vereinigten Eintrags) zählen voll
  for (let p = 0, i = 0; p < dark.length; p++, i += 4) dark[p] = ((255 - Math.min(d[i], d[i + 1], d[i + 2])) * d[i + 3] + 127) / 255;
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
