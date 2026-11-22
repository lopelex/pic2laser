'use strict';

/**
 * Bildverarbeitung: Bitmap -> Graustufen -> Anpassungen -> Binärbild (1 = schwarz/gravieren).
 */
const Processing = (() => {
  const MAX_PIXELS = 36e6; // Schutz gegen zu große Arbeitsbilder

  /** Zielgröße des Arbeitsbildes in Pixeln. */
  function targetSize(srcW, srcH, s) {
    let w;
    if (s.mode === 'dither' || s.mode === 'relief') {
      w = Math.round((s.widthMm / 25.4) * s.dpi);
    } else {
      const longSide = Math.max(srcW, srcH);
      const scale = Math.min(s.workRes / longSide, 4); // max. 4-fach hochskalieren
      w = Math.round(srcW * scale);
    }
    w = Math.max(1, w);
    let h = Math.max(1, Math.round((w * srcH) / srcW));
    const maxPixels = s.maxMegapixels ? s.maxMegapixels * 1e6 : MAX_PIXELS; // je nach Arbeitsspeicher
    if (w * h > maxPixels) {
      const f = Math.sqrt(maxPixels / (w * h));
      w = Math.max(1, Math.floor(w * f));
      h = Math.max(1, Math.floor(h * f));
    }
    return { w, h };
  }

  /** Zeichnet die Quelle skaliert (weißer Hintergrund) und liefert Graustufen 0..255 als Float32Array. */
  function toGray(bitmap, w, h, s) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (s.blur > 0) {
      // Weichzeichner relativ zur Bildbreite, damit er unabhängig von der Auflösung wirkt.
      // Erst auf weißen Grund skalieren, dann mit über den Rand gezogenen Randpixeln weichzeichnen –
      // sonst mischt der Filter am Bildrand Transparenz ein und der Rand wird heller.
      const radius = (s.blur * w) / 1000;
      const m = Math.ceil(radius * 3) + 1;
      const pad = new OffscreenCanvas(w + 2 * m, h + 2 * m);
      const pctx = pad.getContext('2d');
      pctx.imageSmoothingEnabled = false; // Randstreifen exakt verlängern, ohne Nachbarzeilen einzumischen
      const base = new OffscreenCanvas(w, h);
      const bctx = base.getContext('2d');
      bctx.fillStyle = '#fff';
      bctx.fillRect(0, 0, w, h);
      bctx.imageSmoothingEnabled = true;
      bctx.imageSmoothingQuality = 'high';
      bctx.drawImage(bitmap, 0, 0, w, h);
      pctx.drawImage(base, 0, 0, w, h, m, m, w, h);
      // Ränder spiegeln nicht nötig – Randpixel strecken reicht für den Weichzeichner
      pctx.drawImage(base, 0, 0, w, 1, m, 0, w, m);
      pctx.drawImage(base, 0, h - 1, w, 1, m, m + h, w, m);
      pctx.drawImage(pad, m, 0, 1, h + 2 * m, 0, 0, m, h + 2 * m);
      pctx.drawImage(pad, m + w - 1, 0, 1, h + 2 * m, m + w, 0, m, h + 2 * m);
      ctx.filter = `blur(${radius}px)`;
      ctx.drawImage(pad, -m, -m);
      ctx.filter = 'none';
    } else {
      ctx.drawImage(bitmap, 0, 0, w, h);
    }

    const data = ctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return gray;
  }

  function sharpen(gray, w, h, amount) {
    if (amount <= 0) return gray;
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) {
      const y0 = y > 0 ? y - 1 : y;
      const y1 = y < h - 1 ? y + 1 : y;
      for (let x = 0; x < w; x++) {
        const x0 = x > 0 ? x - 1 : x;
        const x1 = x < w - 1 ? x + 1 : x;
        const c = gray[y * w + x];
        const lap = 4 * c - gray[y0 * w + x] - gray[y1 * w + x] - gray[y * w + x0] - gray[y * w + x1];
        out[y * w + x] = c + amount * lap;
      }
    }
    return out;
  }

  /** Helligkeit, Kontrast, Gamma, Invertieren. Ergebnis auf 0..255 begrenzt. */
  function adjust(gray, s) {
    const b = s.brightness * 2.55;
    const c = s.contrast * 2.55;
    const cf = (259 * (c + 255)) / (255 * (259 - c));
    const invGamma = 1 / s.gamma;
    const lut = new Float32Array(256);
    for (let v = 0; v < 256; v++) {
      let x = v + b;
      x = cf * (x - 128) + 128;
      x = Math.min(255, Math.max(0, x));
      x = 255 * Math.pow(x / 255, invGamma);
      if (s.invert) x = 255 - x;
      lut[v] = x;
    }
    const out = new Float32Array(gray.length);
    for (let i = 0; i < gray.length; i++) {
      const v = gray[i];
      const vi = v <= 0 ? 0 : v >= 255 ? 255 : v;
      const lo = vi | 0;
      const hi = lo < 255 ? lo + 1 : 255;
      out[i] = lut[lo] + (lut[hi] - lut[lo]) * (vi - lo);
    }
    return out;
  }

  /** Otsu-Schwellwert auf dem angepassten Graustufenbild. */
  function otsu(gray) {
    const hist = new Float64Array(256);
    for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, gray[i] | 0))]++;
    const total = gray.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, best = 0, bestT = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; bestT = t; }
    }
    return Math.max(1, Math.min(254, bestT));
  }

  function threshold(gray, t) {
    const out = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i++) out[i] = gray[i] < t ? 1 : 0;
    return out;
  }

  const KERNELS = {
    floyd: { div: 16, k: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
    atkinson: { div: 8, k: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
    jarvis: {
      div: 48,
      k: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
          [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]],
    },
    stucki: {
      div: 42,
      k: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
          [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]],
    },
  };

  /** Fehlerdiffusion mit Serpentinen-Durchlauf (weniger Artefakte). */
  function errorDiffusion(gray, w, h, algo) {
    const { div, k } = KERNELS[algo];
    // Kernel als flache Typed Arrays (schneller als verschachtelte JS-Arrays)
    const n = k.length;
    const kdx = new Int32Array(n), kdy = new Int32Array(n), kw = new Float64Array(n);
    for (let j = 0; j < n; j++) { kdx[j] = k[j][0]; kdy[j] = k[j][1]; kw[j] = k[j][2]; }
    // Index-Versatz je Nachbar für beide Laufrichtungen (Innenbereich ohne Randprüfung)
    const offL = new Int32Array(n), offR = new Int32Array(n);
    let reach = 0;
    for (let j = 0; j < n; j++) {
      offL[j] = kdy[j] * w + kdx[j];
      offR[j] = kdy[j] * w - kdx[j];
      reach = Math.max(reach, Math.abs(kdx[j]), kdy[j]);
    }
    const buf = Float32Array.from(gray);
    const out = new Uint8Array(gray.length);
    for (let y = 0; y < h; y++) {
      const ltr = (y & 1) === 0;
      const sx = ltr ? 1 : -1;
      const off = ltr ? offL : offR;
      const row = y * w;
      const inner = y < h - reach;
      for (let i = 0; i < w; i++) {
        const x = ltr ? i : w - 1 - i;
        const idx = row + x;
        const old = buf[idx];
        const black = old < 128;
        out[idx] = black ? 1 : 0;
        const err = old - (black ? 0 : 255);
        if (err === 0) continue;
        if (inner && x >= reach && x < w - reach) {
          for (let j = 0; j < n; j++) buf[idx + off[j]] += (err * kw[j]) / div;
          continue;
        }
        for (let j = 0; j < n; j++) {
          const nx = x + sx * kdx[j];
          const ny = y + kdy[j];
          if (nx < 0 || nx >= w || ny >= h) continue;
          buf[ny * w + nx] += (err * kw[j]) / div;
        }
      }
    }
    return out;
  }

  const BAYER8 = (() => {
    const m = [[0]];
    let size = 1;
    let mat = m;
    while (size < 8) {
      const n = size * 2;
      const next = Array.from({ length: n }, () => new Array(n));
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = mat[y][x] * 4;
          next[y][x] = v;
          next[y][x + size] = v + 2;
          next[y + size][x] = v + 3;
          next[y + size][x + size] = v + 1;
        }
      }
      mat = next;
      size = n;
    }
    return mat;
  })();

  function ordered(gray, w, h) {
    const out = new Uint8Array(gray.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = ((BAYER8[y & 7][x & 7] + 0.5) / 64) * 255;
        out[y * w + x] = gray[y * w + x] < t ? 1 : 0;
      }
    }
    return out;
  }

  /** Graustufen (0 = schwarz) mit dem gewählten Verfahren in ein Binärbild wandeln (1 = schwarz). */
  function ditherGray(gray, w, h, algo) {
    if (algo === 'threshold') return threshold(gray, 128);
    if (algo === 'ordered') return ordered(gray, w, h);
    return errorDiffusion(gray, w, h, KERNELS[algo] ? algo : 'floyd');
  }

  /** Transparente Pixel der Quelle auf Weiß ziehen (nach adjust, also auch nach dem Invertieren). */
  function whitenTransparent(gray, bitmap, w, h) {
    const a = maskAlpha(bitmap, w, h);
    for (let i = 0; i < gray.length; i++) if (a[i] < 1) gray[i] = gray[i] * a[i] + 255 * (1 - a[i]);
  }

  /** Liest den Alphakanal einer Maske in Zielgröße (0..1). */
  function maskAlpha(maskCanvas, w, h) {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(maskCanvas, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const a = new Float32Array(w * h);
    for (let i = 0, p = 0; p < a.length; i += 4, p++) a[p] = d[i + 3] / 255;
    return a;
  }

  /**
   * Euklidische Distanztransformation (exakt), als QUADRIERTER Abstand (px²) jedes Pixels
   * zum nächsten Pixel mit set[i] === want (Standard 1). Kein Pixel gesetzt → Infinity.
   * Schritt 1 (spaltenweise, nach Meijster) läuft zeilenweise über den Speicher und ist
   * damit cachefreundlich; Schritt 2 ist die untere Parabel-Hülle nach Felzenszwalb je Zeile.
   * Zeilen ohne endlichen Wert werden übersprungen.
   * maxDist: Abstände bis maxDist sind exakt, größere nur „größer als maxDist“ (deutlich schneller,
   * wenn nur ein Radius-Vergleich gebraucht wird).
   */
  function distanceTransformSq(set, w, h, want = 1, maxDist = Infinity) {
    const INF = Infinity;
    const g = new Float32Array(w * h); // erst senkrechter Abstand, am Ende quadrierter Abstand
    // senkrechter Abstand: von oben nach unten, dann von unten nach oben
    for (let x = 0; x < w; x++) g[x] = (set[x] ? 1 : 0) === want ? 0 : INF;
    for (let y = 1; y < h; y++) {
      const row = y * w, prev = row - w;
      for (let x = 0; x < w; x++) g[row + x] = (set[row + x] ? 1 : 0) === want ? 0 : g[prev + x] + 1;
    }
    for (let y = h - 2; y >= 0; y--) {
      const row = y * w, next = row + w;
      for (let x = 0; x < w; x++) {
        const below = g[next + x] + 1;
        if (below < g[row + x]) g[row + x] = below;
      }
    }

    const f = new Float64Array(w);
    const v = new Int32Array(w);
    const z = new Float64Array(w + 1);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      // nur Parabeln mit endlichem Scheitel in die Hülle aufnehmen
      let k = -1;
      for (let q = 0; q < w; q++) {
        const gq = g[row + q];
        if (!(gq <= maxDist) || gq === INF) continue; // Infinity (unerreichbar) und NaN auslassen – sonst Endlosschleife
        const fq = gq * gq;
        f[q] = fq;
        if (k < 0) {
          k = 0; v[0] = q; z[0] = -INF; z[1] = INF;
          continue;
        }
        let s0;
        for (;;) { // endet spätestens bei k = 0, weil z[0] = -Infinity
          const r = v[k];
          s0 = (fq + q * q - (f[r] + r * r)) / (2 * q - 2 * r);
          if (s0 > z[k]) break;
          k--;
        }
        k++;
        v[k] = q; z[k] = s0; z[k + 1] = INF;
      }
      if (k < 0) {
        for (let q = 0; q < w; q++) g[row + q] = INF;
        continue;
      }
      k = 0;
      for (let q = 0; q < w; q++) {
        while (z[k + 1] < q) k++;
        const r = v[k];
        g[row + q] = (q - r) * (q - r) + f[r];
      }
    }
    return g;
  }

  function dilate(bits, w, h, r) {
    if (r <= 0) return bits;
    const d2 = distanceTransformSq(bits, w, h, 1, r);
    const r2 = r * r;
    const out = new Uint8Array(bits.length);
    for (let i = 0; i < out.length; i++) out[i] = d2[i] <= r2 ? 1 : 0;
    return out;
  }

  function erode(bits, w, h, r) {
    if (r <= 0) return bits;
    const d2 = distanceTransformSq(bits, w, h, 0, r); // Abstand zum nächsten Hintergrundpixel
    const r2 = r * r;
    const out = new Uint8Array(bits.length);
    for (let i = 0; i < out.length; i++) out[i] = bits[i] && d2[i] > r2 ? 1 : 0;
    return out;
  }

  /** Füllt alle Löcher (Bereiche, die nicht mit dem Bildrand verbunden sind). */
  function fillHoles(bits, w, h) {
    const outside = new Uint8Array(bits.length);
    const stack = new Int32Array(bits.length);
    let sp = 0;
    const push = (i) => { if (!bits[i] && !outside[i]) { outside[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) {
      const i = stack[--sp];
      const x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < (h - 1) * w) push(i + w);
    }
    const out = new Uint8Array(bits.length);
    for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
    return out;
  }

  const TAN22 = Math.tan(Math.PI / 8), TAN67 = Math.tan((3 * Math.PI) / 8);

  /** Canny-Kantenerkennung. sensitivity 1..100 (höher = mehr Kanten). */
  function canny(gray, w, h, sensitivity) {
    const mag = new Float32Array(w * h);
    const dir = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const tl = gray[i - w - 1], t = gray[i - w], tr = gray[i - w + 1];
        const l = gray[i - 1], r = gray[i + 1];
        const bl = gray[i + w - 1], b = gray[i + w], br = gray[i + w + 1];
        const gx = -tl - 2 * l - bl + tr + 2 * r + br;
        const gy = -tl - 2 * t - tr + bl + 2 * b + br;
        mag[i] = Math.sqrt(gx * gx + gy * gy);
        // Richtung in 4 Sektoren (0°, 45°, 90°, 135°) ohne atan2: Vergleich über tan(22,5°)/tan(67,5°)
        const ax = gx < 0 ? -gx : gx, ay = gy < 0 ? -gy : gy;
        dir[i] = ay < TAN22 * ax ? 0 : ay >= TAN67 * ax ? 2 : (gx > 0) === (gy > 0) ? 1 : 3;
      }
    }
    // Non-Maximum-Suppression
    const nms = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const m = mag[i];
        if (!m) continue;
        let a, b;
        switch (dir[i]) {
          case 0: a = mag[i - 1]; b = mag[i + 1]; break;
          case 1: a = mag[i - w - 1]; b = mag[i + w + 1]; break;
          case 2: a = mag[i - w]; b = mag[i + w]; break;
          default: a = mag[i - w + 1]; b = mag[i + w - 1];
        }
        if (m >= a && m >= b) nms[i] = m;
      }
    }
    // Hysterese
    const high = 20 + (100 - sensitivity) * 6;
    const low = high * 0.4;
    const out = new Uint8Array(w * h);
    const stack = new Int32Array(w * h); // jedes Pixel kommt höchstens einmal auf den Stapel
    const n = nms.length;
    for (let i = 0; i < n; i++) {
      if (nms[i] >= high && !out[i]) {
        out[i] = 1;
        let sp = 0;
        stack[sp++] = i;
        while (sp) {
          const j = stack[--sp];
          const jx = j % w;
          const xa = jx > 0 ? -1 : 0, xb = jx < w - 1 ? 1 : 0;
          for (let dy = -w; dy <= w; dy += w) {
            for (let dx = xa; dx <= xb; dx++) {
              const k = j + dy + dx;
              if (k < 0 || k >= n || out[k]) continue;
              if (nms[k] >= low) { out[k] = 1; stack[sp++] = k; }
            }
          }
        }
      }
    }
    return out;
  }

  /**
   * Vollständige Verarbeitung.
   * @param bitmap     Quelle – bei KI-Linien die Strichzeichnung, bei Relief die Tiefenkarte
   * @param maskCanvas optionale Freistellmaske (Alphakanal = Motiv)
   * @returns {{ w, h, bits: Uint8Array|null, gray8: Uint8ClampedArray|null, alpha: Float32Array|null }}
   */
  function process(bitmap, s, maskCanvas = null, textSource = null) {
    const { w, h } = targetSize(bitmap.width, bitmap.height, s);
    let gray = toGray(bitmap, w, h, s);
    gray = sharpen(gray, w, h, s.sharpen);
    gray = adjust(gray, s);
    // Transparente Bereiche der Quelle (z. B. PNG-Logo) bleiben weiß – auch mit „Invertieren“,
    // das sonst den weiß hinterlegten Hintergrund schwarz (= graviert) machen würde
    if (s.invert) whitenTransparent(gray, bitmap, w, h);

    // Gesichtszüge hervorheben: lokaler Kontrast im Gesichtsbereich
    if (s.faceBoost && s.faces && s.faces.length && s.mode !== 'relief' && !(s.mode === 'edges' && s.edgeMethod === 'ai')) {
      enhanceFaces(gray, w, h, s.faces, s.faceStrength, faceFeatureLevels(s));
    }

    // Freigestellter Hintergrund wird weiß (= wird nicht graviert)
    let alpha = null;
    if (maskCanvas) {
      alpha = maskAlpha(maskCanvas, w, h);
      for (let i = 0; i < gray.length; i++) gray[i] = gray[i] * alpha[i] + 255 * (1 - alpha[i]);
    }

    // Relief: Graustufen bleiben erhalten (Laserleistung = Tiefe)
    if (s.mode === 'relief') {
      const gray8 = Uint8ClampedArray.from(gray);
      const alpha8 = s.reliefTransparent ? reliefAlpha(gray8, w, h, alpha) : null;
      return { w, h, bits: null, gray8, alpha8, alpha };
    }

    let bits;
    if (s.mode === 'edges' && s.edgeMethod === 'ai') {
      bits = threshold(gray, s.threshold);
      const r = s.lineBoldMm / (s.widthMm / w) / 2;
      if (r >= 0.5) bits = dilate(bits, w, h, r);
    } else if (s.mode === 'edges') {
      bits = canny(gray, w, h, s.edgeSensitivity);
      const mmPerPx = s.widthMm / w;
      const r = Math.max(0, s.lineWidthMm / mmPerPx / 2 - 0.5);
      bits = dilate(bits, w, h, r);
    } else if (s.mode === 'vector' || s.ditherAlgo === 'threshold') {
      bits = threshold(gray, s.threshold);
    } else if (s.ditherAlgo === 'ordered') {
      bits = ordered(gray, w, h);
    } else {
      bits = errorDiffusion(gray, w, h, s.ditherAlgo);
    }
    // Schrift & Logos: in erkannten Textbereichen sauber gefüllt statt gerastert/nachgezeichnet
    if (s.textClean && s.textBlocks && s.textBlocks.length) {
      let tg = toGray(textSource || bitmap, w, h, { ...s, blur: 0 });
      tg = sharpen(tg, w, h, s.sharpen);
      tg = adjust(tg, s);
      // wie beim Hauptbild: Transparenz und freigestellter Hintergrund bleiben weiß
      // (sonst entstünden mit „Invertieren“ schwarze Kästen um die Schrift)
      if (s.invert) whitenTransparent(tg, textSource || bitmap, w, h);
      if (alpha) for (let i = 0; i < tg.length; i++) tg[i] = tg[i] * alpha[i] + 255 * (1 - alpha[i]);
      cleanText(bits, tg, w, h, s.textBlocks, s.textPad ?? 1, s.textBold ?? 0);
    }

    return { w, h, bits, gray8: null, alpha };
  }

  /**
   * Silhouette für die Umrisslinie: Motiv (Maske oder schwarze Pixel),
   * um offsetPx erweitert, Lücken bis closePx geschlossen, Löcher gefüllt.
   * Das Ergebnis ist um pad Pixel auf jeder Seite größer.
   */
  function silhouette(src, w, h, offsetPx, closePx) {
    const pad = Math.ceil(offsetPx + closePx) + 2;
    const pw = w + 2 * pad, ph = h + 2 * pad;
    let m = new Uint8Array(pw * ph);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) m[(y + pad) * pw + x + pad] = src[y * w + x];
    }
    if (closePx > 0) m = erode(dilate(m, pw, ph, offsetPx + closePx), pw, ph, closePx);
    else m = dilate(m, pw, ph, offsetPx);
    m = fillHoles(m, pw, ph);
    return { bits: m, w: pw, h: ph, pad };
  }

  /** Binärbild als Canvas (schwarz auf weiß oder schwarz auf transparent). */
  function bitsToCanvas(bits, w, h, transparent) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0, p = 0; p < bits.length; i += 4, p++) {
      if (bits[p]) {
        d[i] = d[i + 1] = d[i + 2] = 0;
        d[i + 3] = 255;
      } else {
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = transparent ? 0 : 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /**
   * Hebt Augen, Brauen, Nase und Mund hervor: Unscharfe Maskierung mit einem
   * Radius in Größe der Gesichtsdetails, elliptisch weich auf das Gesicht begrenzt.
   */
  /**
   * Gesichtsmerkmale relativ zur Gesichtsbox der Erkennung (UltraFace: Stirn bis Kinn).
   * Die Positionen sind an Porträts nachgemessen.
   *  y/dx: Mittelpunkt (Anteil Boxhöhe / Abstand zur Mitte als Anteil Boxbreite)
   *  rx/ry: Halbachsen der Ellipse; rad: Detailradius; dark/light: Verstärkung
   *  floor: Rauschschwelle in Graustufen – feinere Unterschiede werden ignoriert
   *  inner: Glättungsradius (Anteil von rad) – Punkte kleiner als Falten (Poren, Sommersprossen) entfallen
   *  line: größere Ellipse für das Nachzeichnen im Modus Linien
   */
  const FACE_FEATURES = {
    mouth: [{ dx: 0, y: 0.80, rx: 0.30, ry: 0.12, rad: 0.035, dark: 3.5, light: 0.6, floor: 2, line: { rx: 0.38, ry: 0.16 } }],
    nose: [{ dx: 0, y: 0.62, rx: 0.18, ry: 0.14, rad: 0.03, dark: 3.2, light: 0.5, floor: 2, line: { rx: 0.22, ry: 0.16 } }],
    chin: [{ dx: 0, y: 0.97, rx: 0.30, ry: 0.12, rad: 0.04, dark: 3.0, light: 0.4, floor: 5, inner: 0.35, line: { rx: 0.36, ry: 0.15 } }],
    cheeks: [
      { dx: -0.27, y: 0.66, rx: 0.15, ry: 0.15, rad: 0.05, dark: 2.4, light: 0.5, floor: 4, inner: 0.4, line: { rx: 0.18, ry: 0.18 } },
      { dx: 0.27, y: 0.66, rx: 0.15, ry: 0.15, rad: 0.05, dark: 2.4, light: 0.5, floor: 4, inner: 0.4, line: { rx: 0.18, ry: 0.18 } },
    ],
  };

  /** Bereiche eines Merkmals für ein Gesicht (relativ zum Bild). */
  function faceFeatureRegions(f, key, forLines = false) {
    const fw = f.x2 - f.x1, fh = f.y2 - f.y1, fcx = (f.x1 + f.x2) / 2;
    return (FACE_FEATURES[key] || []).map((d) => ({
      cx: fcx + d.dx * fw,
      cy: f.y1 + d.y * fh,
      rx: (forLines ? d.line.rx : d.rx) * fw,
      ry: (forLines ? d.line.ry : d.ry) * fh,
      rad: d.rad, dark: d.dark, light: d.light, floor: d.floor || 0, inner: d.inner || 0,
    }));
  }

  /** Stärken der Merkmal-Regler aus den Einstellungen (0 = aus). */
  function faceFeatureLevels(s) {
    return {
      mouth: s.mouthStrength ?? 1,
      nose: s.noseStrength ?? 0.5,
      chin: s.chinStrength ?? 0,
      cheeks: s.cheekStrength ?? 0,
    };
  }

  /**
   * Hebt Gesichtszüge hervor: lokaler Kontrast im ganzen Gesicht (Augen, Brauen)
   * plus gezielte, feinere Verstärkung von Mund, Nase, Kinn und Wangen.
   */
  function enhanceFaces(gray, w, h, faces, strength, levels) {
    for (const f of faces) {
      const fw = (f.x2 - f.x1) * w, fh = (f.y2 - f.y1) * h;
      // 1. ganzes Gesicht: Details in Größe von Augen/Brauen/Nase
      localContrast(gray, w, h, {
        cx: ((f.x1 + f.x2) / 2) * w, cy: ((f.y1 + f.y2) / 2) * h, rx: fw * 0.75, ry: fh * 0.8,
        rad: Math.max(2, Math.round(Math.min(fw, fh) * 0.06)),
        dark: strength * 2.1, light: strength * 1.1,
      });
      // 2. einzelne Merkmale (Lippen, Nase, Kinn, Wangen haben oft fast Hauttöne)
      for (const [key, level] of Object.entries(levels)) {
        if (!(level > 0)) continue;
        for (const r of faceFeatureRegions(f, key)) {
          localContrast(gray, w, h, {
            cx: r.cx * w, cy: r.cy * h, rx: r.rx * w, ry: r.ry * h,
            rad: Math.max(1, Math.round(fh * r.rad)),
            dark: level * r.dark, light: level * r.light, floor: r.floor,
            inner: r.inner ? Math.max(1, Math.round(fh * r.rad * r.inner)) : 0,
          });
        }
      }
    }
  }

  /**
   * Unscharfe Maskierung (lokaler Kontrast), elliptisch weich begrenzt.
   * dark/light: Verstärkung für dunkle bzw. helle Details.
   */
  function localContrast(gray, w, h, { cx, cy, rx, ry, rad, dark, light, floor = 0, inner = 0 }) {
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(w - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(h - 1, Math.ceil(cy + ry));
    const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
    if (rw < 4 || rh < 4) return;

    // Integralbild des Bereichs für schnelle Box-Mittelwerte
    const iw = rw + 1;
    const integ = new Float64Array(iw * (rh + 1));
    for (let y = 0; y < rh; y++) {
      let rowSum = 0;
      for (let x = 0; x < rw; x++) {
        rowSum += gray[(y0 + y) * w + x0 + x];
        integ[(y + 1) * iw + x + 1] = integ[y * iw + x + 1] + rowSum;
      }
    }
    for (let y = 0; y < rh; y++) {
      const ya = Math.max(0, y - rad), yb = Math.min(rh - 1, y + rad);
      const ny = (y0 + y - cy) / ry;
      for (let x = 0; x < rw; x++) {
        const nx = (x0 + x - cx) / rx;
        const d = nx * nx + ny * ny;
        if (d >= 1) continue;
        const t = d < 0.55 ? 1 : (1 - d) / 0.45;
        const wgt = t * t * (3 - 2 * t);
        const xa = Math.max(0, x - rad), xb = Math.min(rw - 1, x + rad);
        const sum = integ[(yb + 1) * iw + xb + 1] - integ[ya * iw + xb + 1] - integ[(yb + 1) * iw + xa] + integ[ya * iw + xa];
        const mean = sum / ((xb - xa + 1) * (yb - ya + 1));
        const i = (y0 + y) * w + x0 + x;
        // Bandpass: statt des Einzelpixels ein leicht geglätteter Wert (entfernt Poren/Sommersprossen)
        let center = gray[i];
        if (inner > 0) {
          const ia = Math.max(0, y - inner), ib = Math.min(rh - 1, y + inner);
          const ja = Math.max(0, x - inner), jb = Math.min(rw - 1, x + inner);
          center = (integ[(ib + 1) * iw + jb + 1] - integ[ia * iw + jb + 1] - integ[(ib + 1) * iw + ja] + integ[ia * iw + ja])
            / ((jb - ja + 1) * (ib - ia + 1));
        }
        let detail = center - mean;
        // Rauschschwelle: feine Hautstruktur nicht verstärken
        if (floor > 0) detail = detail > 0 ? Math.max(0, detail - floor) : Math.min(0, detail + floor);
        const k = detail < 0 ? dark : light;
        gray[i] = Math.max(0, Math.min(255, gray[i] + wgt * k * detail));
      }
    }
  }

  /** Otsu-Schwelle innerhalb eines Rechtecks. */
  function otsuRect(gray, w, x0, y0, x1, y1) {
    const hist = new Float64Array(256);
    let total = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        hist[Math.max(0, Math.min(255, gray[y * w + x] | 0))]++;
        total++;
      }
    }
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, best = -1, bestT = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; bestT = t + 0.5; }
    }
    return bestT;
  }

  /**
   * Schrift & Logos sauber darstellen: In jedem Textblock wird das Bild mit einem
   * lokal optimalen Schwellwert (Otsu) gefüllt – scharfe, gefüllte Buchstaben statt
   * Rasterpunkten oder Umrisslinien. Grafikelemente, die direkt an die Schrift
   * grenzen (Logo-Symbole), werden über zusammenhängende Flächen mit erfasst.
   * pad: Suchradius für Logo-Elemente in Zeilenhöhen; bold: Schwellwert-Versatz (+ = fetter).
   */
  function cleanText(bits, gray, w, h, blocks, pad, bold) {
    for (const b of blocks) {
      const lineH = Math.max(2, b.lineH * h);
      let bx0 = Math.max(0, Math.floor(b.x1 * w)), by0 = Math.max(0, Math.floor(b.y1 * h));
      let bx1 = Math.min(w - 1, Math.ceil(b.x2 * w)), by1 = Math.min(h - 1, Math.ceil(b.y2 * h));
      if (bx1 - bx0 < 3 || by1 - by0 < 3) continue;

      // Schriftbereich selbst (mit kleinem Rand) und dessen Schwellwert
      const m = Math.round(lineH * 0.15);
      const tx0 = Math.max(0, bx0 - m), ty0 = Math.max(0, by0 - m);
      const tx1 = Math.min(w - 1, bx1 + m), ty1 = Math.min(h - 1, by1 + m);
      const t = otsuRect(gray, w, tx0, ty0, tx1, ty1) + bold;

      // übernommene Logo-Elemente (Fenster, Pixel-Labels, angenommene Komponenten)
      let logo = null;

      // Logo-Elemente neben der Schrift einbeziehen
      if (pad > 0) {
        const p = Math.round(lineH * pad);
        const wx0 = Math.max(0, bx0 - p), wy0 = Math.max(0, by0 - p);
        const wx1 = Math.min(w - 1, bx1 + p), wy1 = Math.min(h - 1, by1 + p);
        const ww = wx1 - wx0 + 1, wh = wy1 - wy0 + 1;
        const t0 = otsuRect(gray, w, wx0, wy0, wx1, wy1);
        const seen = new Uint8Array(ww * wh);
        const label = new Int32Array(ww * wh); // Komponentennummer + 1
        const stack = new Int32Array(ww * wh);
        // alle dunklen, zusammenhängenden Elemente, die vollständig im Suchfenster liegen
        const comps = [];
        for (let sy = 0; sy < wh; sy++) {
          for (let sx = 0; sx < ww; sx++) {
            const s0 = sy * ww + sx;
            if (seen[s0] || gray[(wy0 + sy) * w + wx0 + sx] >= t0) continue;
            let sp = 0, cx0 = sx, cy0 = sy, cx1 = sx, cy1 = sy, count = 0;
            const id = comps.length + 1;
            seen[s0] = 1; label[s0] = id; stack[sp++] = s0;
            while (sp) {
              const i = stack[--sp];
              const x = i % ww, y = (i / ww) | 0;
              count++;
              if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  const nx = x + dx, ny = y + dy;
                  if (nx < 0 || ny < 0 || nx >= ww || ny >= wh) continue;
                  const k = ny * ww + nx;
                  if (!seen[k] && gray[(wy0 + ny) * w + wx0 + nx] < t0) { seen[k] = 1; label[k] = id; stack[sp++] = k; }
                }
              }
            }
            const inside = (cx0 > 0 || wx0 === 0) && (cy0 > 0 || wy0 === 0) && (cx1 < ww - 1 || wx1 === w - 1) && (cy1 < wh - 1 || wy1 === h - 1);
            // auch abgelehnte Komponenten bekommen einen Eintrag (Nummer = Label)
            comps.push({
              x0: wx0 + cx0, y0: wy0 + cy0, x1: wx0 + cx1, y1: wy0 + cy1,
              ok: inside && count > 4 && count < ww * wh * 0.4,
            });
          }
        }
        // schrittweise wachsen: Elemente an der Schrift, dann Elemente an diesen (z. B. Zahnrad → Ähren)
        const near = Math.round(lineH * 0.5);
        let ux0 = bx0, uy0 = by0, ux1 = bx1, uy1 = by1;
        const used = new Uint8Array(comps.length);
        for (let pass = 0; pass < 4; pass++) {
          let grew = false;
          comps.forEach((c, k) => {
            if (used[k] || !c.ok) return;
            if (c.x0 <= ux1 + near && c.x1 >= ux0 - near && c.y0 <= uy1 + near && c.y1 >= uy0 - near) {
              used[k] = 1;
              grew = true;
              ux0 = Math.min(ux0, c.x0); uy0 = Math.min(uy0, c.y0);
              ux1 = Math.max(ux1, c.x1); uy1 = Math.max(uy1, c.y1);
            }
          });
          if (!grew) break;
        }
        bx0 = Math.max(wx0, ux0); by0 = Math.max(wy0, uy0); bx1 = Math.min(wx1, ux1); by1 = Math.min(wy1, uy1);
        logo = { wx0, wy0, ww, label, used };
      }

      // Schwarz werden nur: Schrift im Textbereich + genau die übernommenen Logo-Elemente
      bx0 = Math.min(bx0, tx0); by0 = Math.min(by0, ty0);
      bx1 = Math.max(bx1, tx1); by1 = Math.max(by1, ty1);
      const rw = bx1 - bx0 + 1, rh = by1 - by0 + 1;
      const tm = new Uint8Array(rw * rh);
      for (let y = 0; y < rh; y++) {
        const gy = by0 + y;
        for (let x = 0; x < rw; x++) {
          const gx = bx0 + x;
          const i = gy * w + gx;
          let on = gx >= tx0 && gx <= tx1 && gy >= ty0 && gy <= ty1 && gray[i] < t;
          if (!on && logo) {
            const lx = gx - logo.wx0, ly = gy - logo.wy0;
            if (lx >= 0 && ly >= 0 && lx < logo.ww) {
              const id = logo.label[ly * logo.ww + lx];
              on = id > 0 && logo.used[id - 1] === 1;
            }
          }
          tm[y * rw + x] = on ? 1 : 0;
        }
      }
      // Schrift schwarz, schmaler Saum darum weiß (scharfe Kanten); der übrige
      // Hintergrund behält seine Darstellung (Rasterung/Linien) – keine weißen Kästen
      const halo = boxDilate(tm, rw, rh, Math.max(1, Math.round(lineH * 0.08)));
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          const k = y * rw + x;
          const i = (by0 + y) * w + bx0 + x;
          if (tm[k]) bits[i] = 1;
          else if (halo[k]) bits[i] = 0;
        }
      }
    }
  }

  /** Quadratische Dilatation (separabel, gleitendes Fenster). */
  function boxDilate(src, w, h, r) {
    const tmp = new Uint8Array(w * h);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let cnt = 0;
      for (let x = -r; x < w + r; x++) {
        const add = x + r, rem = x - r - 1;
        if (add >= 0 && add < w) cnt += src[y * w + add];
        if (rem >= 0 && rem < w) cnt -= src[y * w + rem];
        if (x >= 0 && x < w) tmp[y * w + x] = cnt > 0 ? 1 : 0;
      }
    }
    for (let x = 0; x < w; x++) {
      let cnt = 0;
      for (let y = -r; y < h + r; y++) {
        const add = y + r, rem = y - r - 1;
        if (add >= 0 && add < h) cnt += tmp[add * w + x];
        if (rem >= 0 && rem < h) cnt -= tmp[rem * w + x];
        if (y >= 0 && y < h) out[y * w + x] = cnt > 0 ? 1 : 0;
      }
    }
    return out;
  }

  /**
   * Deckkraft (0…255) für „Weißen Hintergrund transparent“ im Relief.
   * Mit Freistellmaske gilt die Maske (weiche Kante; helle = nahe Stellen im Motiv bleiben erhalten),
   * sonst wird reines Weiß transparent, das mit dem Bildrand zusammenhängt.
   */
  function reliefAlpha(gray8, w, h, maskAlpha) {
    const n = w * h;
    const a = new Uint8ClampedArray(n).fill(255);
    if (maskAlpha) {
      for (let i = 0; i < n; i++) a[i] = Math.round(maskAlpha[i] * 255);
      return a;
    }
    const WHITE = 254;
    const stack = [];
    const push = (i) => { if (a[i] && gray8[i] >= WHITE) { a[i] = 0; stack.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < n - w) push(i + w);
    }
    return a;
  }

  /** Graustufenbild (Relief) als Canvas – optional mit Deckkraft (alpha8). */
  function grayToCanvas(gray8, w, h, alpha8 = null) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0, p = 0; p < gray8.length; i += 4, p++) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = gray8[p];
      img.data[i + 3] = alpha8 ? alpha8[p] : 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /** Ergebnis (Binär- oder Graustufenbild) als Canvas. */
  function resultCanvas(r, transparent) {
    return r.gray8 ? grayToCanvas(r.gray8, r.w, r.h, transparent ? r.alpha8 : null) : bitsToCanvas(r.bits, r.w, r.h, transparent);
  }

  /**
   * Motivkontur: setzt eine dünne schwarze Linie innen entlang der Grenze
   * zwischen Motiv und Hintergrund (aus der Maske). Wo das Motiv am Rand schon
   * dunkel ist, ändert sich nichts – sichtbar wird die Linie genau dort,
   * wo Motiv und Hintergrund nach der Umwandlung ineinander übergehen.
   * Die Bildränder zählen nicht als Grenze.
   */
  function addSubjectLine(bits, maskCanvas, w, h, widthPx) {
    const alpha = maskAlpha(maskCanvas, w, h);
    const bg = new Uint8Array(w * h);
    let any = false;
    for (let i = 0; i < bg.length; i++) {
      if (alpha[i] < 0.5) { bg[i] = 1; any = true; }
    }
    if (!any) return bits;
    const r = Math.max(0.75, widthPx);
    const d2 = distanceTransformSq(bg, w, h, 1, r);
    const r2 = r * r;
    for (let i = 0; i < bits.length; i++) {
      if (!bg[i] && d2[i] <= r2) bits[i] = 1;
    }
    return bits;
  }

  return { faceFeatureRegions, faceFeatureLevels, process, ditherGray, bitsToCanvas, grayToCanvas, resultCanvas, otsu, targetSize, toGray, sharpen, adjust, silhouette, dilate, distanceTransformSq, addSubjectLine };
})();
