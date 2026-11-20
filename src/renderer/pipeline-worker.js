'use strict';

/* global Processing, Encoders, Segmentation */

/**
 * Web Worker für die rechenintensive Bildverarbeitung, damit die Oberfläche
 * während der Berechnung bedienbar bleibt.
 */
importScripts('processing.js', 'encoders.js', 'segmentation.js');

const handlers = {
  /**
   * Komplette Rasterverarbeitung eines Durchlaufs.
   * payload: { source, mask (Freistellen), lineMask (nur für die Motivkontur), s: Einstellungen }
   */
  async render({ source, mask, lineMask, textSource, s }) {
    const { w, h, bits, gray8, alpha } = Processing.process(source, s, mask, textSource);
    if (textSource) textSource.close();
    // Motivkontur (nur Schwarz-Weiß-Modi)
    const contourMask = lineMask || mask;
    if (s.subjectLine && bits && contourMask) {
      Processing.addSubjectLine(bits, contourMask, w, h, s.subjectLineMm / (s.widthMm / w));
    }
    source.close();
    if (mask) mask.close();
    if (lineMask) lineMask.close();
    const r = { w, h, bits, gray8 };
    const out = { w, h, bits, gray8, tracePng: null, imagePng: null, imageB64: null, sil: null };

    if (!(s.outline && s.outlineOnly)) {
      if (s.mode === 'dither' || s.mode === 'relief') {
        out.imagePng = await Encoders.canvasBytes(Processing.resultCanvas(r, s.transparent), 'image/png');
        out.imageB64 = Encoders.toBase64(out.imagePng); // fürs SVG – teuer bei großen Bildern
      } else {
        out.tracePng = await Encoders.canvasBytes(Processing.bitsToCanvas(bits, w, h, false), 'image/png');
      }
    }

    if (s.outline) {
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
      out.sil = {
        w: sil.w,
        h: sil.h,
        pad: sil.pad,
        png: await Encoders.canvasBytes(Processing.bitsToCanvas(sil.bits, sil.w, sil.h, false), 'image/png'),
      };
    }

    const transfer = [out.bits, out.gray8, out.tracePng, out.imagePng, out.sil && out.sil.png]
      .filter(Boolean)
      .map((a) => a.buffer);
    return { result: out, transfer };
  },

  /** Vorschau des freigestellten Originals mit Klickpunkten (PNG-Bytes). */
  async cutout({ source, mask, markers, boxes }) {
    const blob = await Segmentation.cutoutPreview(source, mask, markers, boxes);
    source.close();
    if (mask) mask.close();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { result: bytes, transfer: [bytes.buffer] };
  },

  /** Farbbasierte Freistellmaske. */
  async colorMask({ source, tolerance, border, seeds }) {
    const canvas = Segmentation.colorMask(source, tolerance, border, seeds);
    source.close();
    const bitmap = canvas.transferToImageBitmap();
    return { result: bitmap, transfer: [bitmap] };
  },
};

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  try {
    const { result, transfer } = await handlers[type](payload);
    self.postMessage({ ok: true, result }, transfer);
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
