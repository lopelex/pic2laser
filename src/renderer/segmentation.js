'use strict';

/**
 * Freistellen: erzeugt eine Maske (OffscreenCanvas, Alphakanal = Motiv) in Analyseauflösung.
 *  - KI-Methoden: rohe Maske aus ai.js, hier mit weicher Schwelle aufbereitet
 *  - "color": Hintergrund per Farbähnlichkeit vom Bildrand und/oder von Klickpunkten aus füllen
 */
const Segmentation = (() => {
  const MAX_SIDE = 2048;

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

  /** Wandelt eine rohe KI-Maske { data (0..1), w, h } mit weicher Schwelle in eine Masken-Canvas um. */
  function aiMask(raw, bitmap, thresholdValue) {
    const small = new OffscreenCanvas(raw.w, raw.h);
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(raw.w, raw.h);
    const lo = Math.max(0, thresholdValue - 0.08);
    const hi = Math.min(1, thresholdValue + 0.08);
    const data = raw.data;
    for (let p = 0; p < data.length; p++) {
      const t = Math.min(1, Math.max(0, (data[p] - lo) / (hi - lo || 1)));
      img.data[p * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    sctx.putImageData(img, 0, 0);

    const { w, h } = analysisSize(bitmap);
    if (w === raw.w && h === raw.h) return small;
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

  /**
   * Vorschau des Originals mit entferntem Hintergrund.
   * markers: [{ x, y, positive }] – Klickpunkte (grün = Motiv, rot = Hintergrund).
   */
  async function cutoutPreview(bitmap, mask, markers, boxes = [], hideBackground = false) {
    const { w, h } = analysisSize(bitmap);
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (mask && hideBackground) {
      // Hintergrund ausblenden (transparent)
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    } else if (mask) {
      // Entfernten Hintergrund rot schraffieren – zwischen den Streifen bleibt das Bild sichtbar
      const { bin, edge } = maskOutline(mask, w, h);
      const sw = Math.max(2, Math.round(Math.max(w, h) / 260)); // Streifenbreite (schmal, Hintergrund bleibt gut sichtbar)
      const hatch = new OffscreenCanvas(w, h);
      const hctx = hatch.getContext('2d');
      hctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
      hctx.lineWidth = sw;
      hctx.beginPath();
      for (let d = -h; d < w + h; d += sw * 5) {
        hctx.moveTo(d, 0);
        hctx.lineTo(d + h, h);
      }
      hctx.stroke();
      hctx.globalCompositeOperation = 'destination-out';
      hctx.drawImage(bin, 0, 0); // nur außerhalb des Motivs
      ctx.drawImage(hatch, 0, 0);

      // Schnittlinie mit hellem Saum (auf hellem und dunklem Grund sichtbar)
      ctx.save();
      ctx.shadowColor = 'rgba(255, 255, 255, 0.95)';
      ctx.shadowBlur = Math.max(2, sw / 2);
      ctx.drawImage(edge, 0, 0);
      ctx.drawImage(edge, 0, 0);
      ctx.restore();
    }
    drawMarkers(ctx, w, h, markers);
    // erkannte Schrift-/Logobereiche als gestrichelte Rahmen
    if (boxes.length) {
      ctx.save();
      ctx.lineWidth = Math.max(2, Math.round(Math.max(w, h) / 400));
      ctx.setLineDash([ctx.lineWidth * 3, ctx.lineWidth * 2]);
      ctx.strokeStyle = '#3b82f6';
      for (const b of boxes) ctx.strokeRect(b.x1 * w, b.y1 * h, (b.x2 - b.x1) * w, (b.y2 - b.y1) * h);
      ctx.restore();
    }
    return c.convertToBlob({ type: 'image/png' });
  }

  /** Binäre Maske (Motiv deckend) und ihre Randlinie als Canvas. */
  function maskOutline(mask, w, h) {
    const src = new OffscreenCanvas(w, h);
    const sctx = src.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(mask, 0, 0, w, h);
    const a = sctx.getImageData(0, 0, w, h).data;
    const inside = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) inside[p] = a[p * 4 + 3] >= 128 ? 1 : 0;

    const bin = new OffscreenCanvas(w, h);
    const bctx = bin.getContext('2d');
    const bimg = bctx.createImageData(w, h);
    const edge = new OffscreenCanvas(w, h);
    const ectx = edge.getContext('2d');
    const eimg = ectx.createImageData(w, h);
    const lw = Math.max(1, Math.round(Math.max(w, h) / 600));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (!inside[p]) continue;
        bimg.data[p * 4 + 3] = 255;
        // Randpixel: innerhalb, aber mit einem Nachbarn außerhalb (im Abstand lw)
        let border = false;
        for (let d = 1; d <= lw && !border; d++) {
          if ((x >= d && !inside[p - d]) || (x < w - d && !inside[p + d]) ||
              (y >= d && !inside[p - d * w]) || (y < h - d && !inside[p + d * w])) border = true;
        }
        if (border) {
          eimg.data[p * 4] = 220; eimg.data[p * 4 + 1] = 38; eimg.data[p * 4 + 2] = 38; eimg.data[p * 4 + 3] = 255;
        }
      }
    }
    bctx.putImageData(bimg, 0, 0);
    ectx.putImageData(eimg, 0, 0);
    return { bin, edge };
  }

  function drawMarkers(ctx, w, h, markers) {
    const r = Math.max(5, Math.round(Math.max(w, h) / 110));
    for (const m of markers || []) {
      const x = m.x * w, y = m.y * h;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = m.positive ? '#22c55e' : '#ef4444';
      ctx.fill();
      ctx.lineWidth = Math.max(2, r / 3);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.beginPath();
      ctx.lineWidth = Math.max(1.5, r / 4);
      ctx.moveTo(x - r * 0.5, y);
      ctx.lineTo(x + r * 0.5, y);
      if (m.positive) {
        ctx.moveTo(x, y - r * 0.5);
        ctx.lineTo(x, y + r * 0.5);
      }
      ctx.stroke();
    }
  }

  return { aiMask, colorMask, cutoutPreview, analysisSize };
})();
