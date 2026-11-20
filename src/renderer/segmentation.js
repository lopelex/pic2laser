'use strict';

/**
 * Freistellen: erzeugt eine Maske (OffscreenCanvas, Alphakanal = Motiv) in Analyseauflösung.
 *  - "ai":    U²-Net (u2netp) im Main-Prozess, lokal und offline
 *  - "color": Hintergrund per Farbähnlichkeit vom Bildrand und/oder von Klickpunkten aus füllen
 */
const Segmentation = (() => {
  const MAX_SIDE = 2048;
  const AI_SIZE = 320;
  const MEAN = [0.485, 0.456, 0.406];
  const STD = [0.229, 0.224, 0.225];

  function analysisSize(bitmap) {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    return {
      w: Math.max(1, Math.round(bitmap.width * scale)),
      h: Math.max(1, Math.round(bitmap.height * scale)),
    };
  }

  function drawRgba(bitmap, w, h) {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  }

  /** Rohe KI-Maske (320×320, 0..1) – teuer, wird pro Bild zwischengespeichert. */
  async function aiRaw(bitmap) {
    const d = drawRgba(bitmap, AI_SIZE, AI_SIZE);
    let max = 0;
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2]);
    max = max || 1;
    const n = AI_SIZE * AI_SIZE;
    const input = new Float32Array(3 * n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      for (let c = 0; c < 3; c++) input[c * n + p] = (d[i + c] / max - MEAN[c]) / STD[c];
    }
    return window.api.segment(input);
  }

  /** Wandelt die rohe KI-Maske mit weicher Schwelle in eine Masken-Canvas um. */
  function aiMask(raw, bitmap, thresholdValue) {
    const small = new OffscreenCanvas(AI_SIZE, AI_SIZE);
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(AI_SIZE, AI_SIZE);
    const lo = Math.max(0, thresholdValue - 0.08);
    const hi = Math.min(1, thresholdValue + 0.08);
    for (let p = 0; p < raw.length; p++) {
      const t = Math.min(1, Math.max(0, (raw[p] - lo) / (hi - lo || 1)));
      img.data[p * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    sctx.putImageData(img, 0, 0);

    const { w, h } = analysisSize(bitmap);
    const mask = new OffscreenCanvas(w, h);
    const ctx = mask.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, w, h);
    return mask;
  }

  /**
   * Farbbasiertes Freistellen. tolerance 0..100.
   * seeds: [{x, y}] in relativen Koordinaten (0..1) – zusätzliche Hintergrundpunkte.
   */
  function colorMask(bitmap, tolerance, useBorder, seeds) {
    const { w, h } = analysisSize(bitmap);
    const d = drawRgba(bitmap, w, h);
    const maxDist = (tolerance / 100) * 200;
    const maxDist2 = maxDist * maxDist;
    const bg = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);

    const fill = (start) => {
      if (bg[start]) return;
      const r0 = d[start * 4], g0 = d[start * 4 + 1], b0 = d[start * 4 + 2];
      let sp = 0;
      const visit = (k) => {
        if (bg[k]) return;
        const dr = d[k * 4] - r0, dg = d[k * 4 + 1] - g0, db = d[k * 4 + 2] - b0;
        if (dr * dr + dg * dg + db * db <= maxDist2) {
          bg[k] = 1;
          stack[sp++] = k;
        }
      };
      bg[start] = 1;
      stack[sp++] = start;
      while (sp) {
        const i = stack[--sp];
        const x = i % w;
        if (x > 0) visit(i - 1);
        if (x < w - 1) visit(i + 1);
        if (i >= w) visit(i - w);
        if (i < (h - 1) * w) visit(i + w);
      }
    };

    if (useBorder) {
      for (let x = 0; x < w; x++) { fill(x); fill((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { fill(y * w); fill(y * w + w - 1); }
    }
    for (const s of seeds || []) {
      const x = Math.min(w - 1, Math.max(0, Math.round(s.x * (w - 1))));
      const y = Math.min(h - 1, Math.max(0, Math.round(s.y * (h - 1))));
      fill(y * w + x);
    }

    const mask = new OffscreenCanvas(w, h);
    const ctx = mask.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let p = 0; p < bg.length; p++) img.data[p * 4 + 3] = bg[p] ? 0 : 255;
    ctx.putImageData(img, 0, 0);

    // Kante leicht glätten
    const smooth = new OffscreenCanvas(w, h);
    const sctx = smooth.getContext('2d');
    sctx.filter = `blur(${Math.max(0.6, w / 1500)}px)`;
    sctx.drawImage(mask, 0, 0);
    return smooth;
  }

  /** Vorschau des Originals mit entferntem Hintergrund (und markierten Klickpunkten). */
  async function cutoutPreview(bitmap, mask, seeds) {
    const { w, h } = analysisSize(bitmap);
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    const r = Math.max(4, Math.round(Math.max(w, h) / 120));
    for (const s of seeds || []) {
      const x = s.x * w, y = s.y * h;
      ctx.lineWidth = Math.max(2, r / 3);
      ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = Math.max(1, r / 5);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r * 0.6, y - r * 0.6); ctx.lineTo(x + r * 0.6, y + r * 0.6);
      ctx.moveTo(x + r * 0.6, y - r * 0.6); ctx.lineTo(x - r * 0.6, y + r * 0.6); ctx.stroke();
    }
    return c.convertToBlob({ type: 'image/png' });
  }

  return { aiRaw, aiMask, colorMask, cutoutPreview };
})();
