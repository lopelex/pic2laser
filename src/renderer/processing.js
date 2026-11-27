'use strict';

/**
 * Bildverarbeitung: Bitmap -> Graustufen -> Anpassungen -> Binärbild (1 = schwarz/gravieren).
 */
const Processing = (() => {
  const MAX_PIXELS = 36e6; // Schutz gegen zu große Arbeitsbilder

  /** Zielgröße des Arbeitsbildes in Pixeln. */
  function targetSize(srcW, srcH, s) {
    let w;
    if (s.mode === 'dither' || s.mode === 'relief' || s.mode === 'sine') {
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
  /** Farbpixel (RGBA) des Bildes in w × h, auf Weiß gezeichnet. */
  function rgbaOf(bitmap, w, h) {
    const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  }

  /** Quelle auf Weiß in w × h zeichnen (mit Weichzeichnen) und die RGBA-Pixel liefern. */
  function drawSource(bitmap, w, h, s) {
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

    return ctx.getImageData(0, 0, w, h).data;
  }

  function toGray(bitmap, w, h, s) {
    const data = drawSource(bitmap, w, h, s);
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
  function adjustLut(s) {
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
    return lut;
  }

  function adjust(gray, s) {
    const lut = adjustLut(s);
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

    // Wellen: Graustufen werden im Worker zu Sinuswellen (Sine, WebAssembly)
    if (s.mode === 'sine') return { w, h, bits: null, gray8: Uint8ClampedArray.from(gray), alpha8: null, alpha };

    // Relief: Graustufen bleiben erhalten (Laserleistung = Tiefe)
    if (s.mode === 'relief') {
      const gray8 = Uint8ClampedArray.from(gray);
      const alpha8 = s.reliefTransparent ? reliefAlpha(gray8, w, h, alpha) : null;
      return { w, h, bits: null, gray8, alpha8, alpha };
    }

    let bits;
    const mmPerPx = s.widthMm / w;
    const hasText = !!(s.textClean && s.textBlocks && s.textBlocks.length);
    // „Formen verbessern“ vor oder nach „Schrift & Logos“: davor = erkannte Schrift bleibt, wie die
    // Schrifterkennung sie zeichnet; danach = die Verbesserung gilt auch für die Schrift
    const improveAfterText = hasText && s.shapeOrder !== 'before';
    const cleanAll = (b) => cleanLines(b, w, h, (Number(s.lineSmoothMm) || 0) / mmPerPx, (Number(s.lineMinMm) || 0) / mmPerPx);
    // Ruhige Linien: vor dem Verbreitern, damit die Striche gleichmäßig breit bleiben
    const calm = (b) => (s.lineClean && !improveAfterText ? cleanAll(b) : b);
    if (s.mode === 'edges' && s.edgeMethod === 'ai') {
      bits = calm(threshold(gray, s.threshold));
      const r = s.lineBoldMm / mmPerPx / 2;
      if (r >= 0.5) bits = dilate(bits, w, h, r);
    } else if (s.mode === 'edges') {
      bits = calm(canny(gray, w, h, s.edgeSensitivity));
      const r = Math.max(0, s.lineWidthMm / mmPerPx / 2 - 0.5);
      bits = dilate(bits, w, h, r);
    } else if (s.mode === 'vector' && s.smoothContours) {
      // Glatte Konturen: Treppenstufen des hochskalierten Bildes vor dem Schwellwert verwischen
      // (Stärke wächst mit der Vergrößerung beim Zeichnen auf die Arbeitsgröße)
      bits = threshold(gaussBlur(gray, w, h, Math.max(0.8, 0.45 * (w / bitmap.width))), s.threshold);
    } else if (s.mode === 'vector' || s.ditherAlgo === 'threshold') {
      bits = threshold(gray, s.threshold);
    } else if (s.ditherAlgo === 'ordered') {
      bits = ordered(gray, w, h);
    } else {
      bits = errorDiffusion(gray, w, h, s.ditherAlgo);
    }
    // Schrift & Logos: in erkannten Textbereichen sauber gefüllt statt gerastert/nachgezeichnet
    if (hasText) {
      let tg = toGray(textSource || bitmap, w, h, { ...s, blur: 0 });
      tg = sharpen(tg, w, h, s.sharpen);
      tg = adjust(tg, s);
      // wie beim Hauptbild: Transparenz und freigestellter Hintergrund bleiben weiß
      // (sonst entstünden mit „Invertieren“ schwarze Kästen um die Schrift)
      if (s.invert) whitenTransparent(tg, textSource || bitmap, w, h);
      if (alpha) for (let i = 0; i < tg.length; i++) tg[i] = tg[i] * alpha[i] + 255 * (1 - alpha[i]);
      // Glatte Konturen auch in den Schriftbereichen (gleiche Glättung wie im übrigen Bild)
      if (s.mode === 'vector' && s.smoothContours && improveAfterText) tg = gaussBlur(tg, w, h, Math.max(0.8, 0.45 * (w / (textSource || bitmap).width)));
      cleanText(bits, tg, rgbaOf(textSource || bitmap, w, h), w, h, s.textBlocks, s.textPad ?? 1, s.textBold ?? 0);
      // Ruhige Linien nach der Schrifterkennung: auch die Schrift wird entlang ihrer Mitte geglättet
      // (Strichbreite bleibt, da sie aus den Strichen selbst gemessen wird)
      if (s.mode === 'edges' && s.lineClean && improveAfterText) bits = cleanAll(bits);
    }

    return { w, h, bits, gray8: null, alpha };
  }

  /**
   * Modus Farben: Farbpixel in Arbeitsgröße mit Bildanpassung je Kanal (Weichzeichnen, Schärfen,
   * Helligkeit, Kontrast, Gamma, Invertieren) und Deckung: opaque = 0 für transparente Pixel der
   * Quelle und freigestellten Hintergrund.
   * @returns {{ w, h, rgba: Uint8ClampedArray, opaque: Uint8Array, textKeep: Uint8Array|null, textColors: Array|null }}
   */
  function processColor(bitmap, s, maskCanvas = null) {
    const { w, h } = targetSize(bitmap.width, bitmap.height, s);
    const n = w * h;
    const rgba = drawSource(bitmap, w, h, s);
    for (let ch = 0; ch < 3; ch++) {
      let c = new Float32Array(n);
      for (let p = 0; p < n; p++) c[p] = rgba[p * 4 + ch];
      c = adjust(sharpen(c, w, h, s.sharpen), s);
      for (let p = 0; p < n; p++) rgba[p * 4 + ch] = c[p];
    }
    // Gesichtszüge hervorheben: auf der Helligkeit rechnen und die Änderung auf alle drei Kanäle
    // übertragen – Farbton bleibt, Lippen, Augen und Nase heben sich deutlicher ab
    if (s.faceBoost && s.faces && s.faces.length) {
      const gray = new Float32Array(n);
      for (let p = 0, i = 0; p < n; p++, i += 4) gray[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      const orig = Float32Array.from(gray);
      enhanceFaces(gray, w, h, s.faces, s.faceStrength, faceFeatureLevels(s));
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        const d = gray[p] - orig[p];
        if (d) { rgba[i] += d; rgba[i + 1] += d; rgba[i + 2] += d; }
      }
    }
    const srcA = maskAlpha(bitmap, w, h);
    const m = maskCanvas ? maskAlpha(maskCanvas, w, h) : null;
    const opaque = new Uint8Array(n);
    for (let p = 0; p < n; p++) opaque[p] = srcA[p] >= 0.5 && (!m || m[p] >= 0.5) ? 1 : 0;
    // Schrift & Logos: Buchstaben als einheitliche Farbfläche mit scharfem Saum
    const text = s.textClean && s.textBlocks && s.textBlocks.length
      ? cleanTextColor(rgba, opaque, w, h, s.textBlocks, s.textPad ?? 1, s.textBold ?? 0)
      : null;
    return { w, h, rgba, opaque, textKeep: text ? text.keep : null, textColors: text ? text.colors : null };
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

  /**
   * Bereiche eines Merkmals für ein Gesicht (relativ zum Bild). Mit Face Parsing (f.parts) liegt
   * die Ellipse genau auf dem Merkmal, sonst wird sie aus dem Gesichtsrahmen geschätzt.
   */
  function faceFeatureRegions(f, key, forLines = false) {
    const fw = f.x2 - f.x1, fh = f.y2 - f.y1, fcx = (f.x1 + f.x2) / 2;
    const exact = f.parts?.[key];
    if (exact && exact.length === (FACE_FEATURES[key] || []).length) {
      return FACE_FEATURES[key].map((d, i) => {
        const e = exact[i];
        return {
          cx: e.cx, cy: e.cy, rx: forLines ? e.lrx : e.rx, ry: forLines ? e.lry : e.ry,
          rad: d.rad, dark: d.dark, light: d.light, floor: d.floor || 0, inner: d.inner || 0,
        };
      });
    }
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
      // Ausgangswerte merken: Die Schritte unten überlagern sich (Gesicht, Mund, Nase, Kinn, Wangen)
      // und würden tiefe Falten und Schatten sonst bis ins Schwarze ziehen
      const bx0 = Math.max(0, Math.floor(((f.x1 + f.x2) / 2) * w - fw * 0.8));
      const bx1 = Math.min(w - 1, Math.ceil(((f.x1 + f.x2) / 2) * w + fw * 0.8));
      const by0 = Math.max(0, Math.floor(((f.y1 + f.y2) / 2) * h - fh * 0.85));
      const by1 = Math.min(h - 1, Math.ceil(((f.y1 + f.y2) / 2) * h + fh * 0.85));
      const bw = bx1 - bx0 + 1;
      const orig = new Float32Array(bw * Math.max(0, by1 - by0 + 1));
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) orig[(y - by0) * bw + x - bx0] = gray[y * w + x];
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
      // Gesamtänderung je Pixel weich begrenzen: feine Unterschiede (Lippen, Lidfalte) werden voll
      // verstärkt, deutliche Falten und Schatten nur noch wenig – keine schwarzen Flecken
      const capDark = FACE_CAP_DARK * Math.max(0.5, Math.min(1.5, strength));
      const capLight = FACE_CAP_LIGHT * Math.max(0.5, Math.min(1.5, strength));
      for (let y = by0; y <= by1; y++) {
        for (let x = bx0; x <= bx1; x++) {
          const i = y * w + x, o = orig[(y - by0) * bw + x - bx0];
          const d = gray[i] - o;
          if (d < 0) gray[i] = o - capDark * Math.tanh(-d / capDark);
          else if (d > 0) gray[i] = o + capLight * Math.tanh(d / capLight);
        }
      }
    }
  }

  /** Höchste Gesamtänderung (Graustufen) durch „Gesichtszüge hervorheben“ bei Stärke 100 %. */
  const FACE_CAP_DARK = 38;
  const FACE_CAP_LIGHT = 30;

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
        // Verstärkung nimmt mit der Größe des Unterschieds ab: schwache Konturen (Lippen mit
        // fast Hautton) werden betont, ohnehin dunkle Falten und Schatten nicht vervielfacht
        const k = (detail < 0 ? dark : light) / (1 + Math.abs(detail) / 24);
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
   * Flächen (8er-Nachbarschaft) im Rechteck x0..x1 × y0..y1, deren Pixel `ink(index)` erfüllen, die
   * den Rand des Rechtecks nicht berühren und mindestens minArea Pixel groß sind (kleinere sind
   * Bildrauschen, z. B. dunkle Laubpunkte zwischen den Zeilen). Rückgabe: Maske und Anzahl der Pixel.
   */
  function innerParts(w, x0, y0, x1, y1, ink, minArea = 0) {
    const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
    const label = new Int32Array(rw * rh); // Flächennummer + 1
    const stack = new Int32Array(rw * rh);
    const keep = [];
    for (let s0 = 0; s0 < rw * rh; s0++) {
      if (label[s0] || !ink((y0 + ((s0 / rw) | 0)) * w + x0 + (s0 % rw))) continue;
      const id = keep.length + 1;
      let edge = false, sp = 0, size = 0;
      label[s0] = id; stack[sp++] = s0;
      while (sp) {
        const i = stack[--sp];
        const x = i % rw, y = (i / rw) | 0;
        size++;
        if (x === 0 || y === 0 || x === rw - 1 || y === rh - 1) edge = true;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
            const k = ny * rw + nx;
            if (!label[k] && ink((y0 + ny) * w + x0 + nx)) { label[k] = id; stack[sp++] = k; }
          }
        }
      }
      keep.push(!edge && size >= minArea);
    }
    const mask = new Uint8Array(rw * rh);
    let count = 0;
    for (let k = 0; k < mask.length; k++) {
      if (label[k] && keep[label[k] - 1]) { mask[k] = 1; count++; }
    }
    return { mask, count };
  }

  /**
   * Farbgruppen im Rechteck (k-Means, k = 3, RGB): je Gruppe ein Test „gehört Pixel i dazu?“.
   * bold > 0 rechnet Pixel, die fast so nah an einer anderen Gruppe liegen, mit dazu (fetter).
   */
  function colorGroups(rgba, w, x0, y0, x1, y1, bold) {
    const n = (x1 - x0 + 1) * (y1 - y0 + 1);
    const step = Math.max(1, Math.floor(Math.sqrt(n / 20000)));
    const px = [];
    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) { const j = (y * w + x) * 4; px.push([rgba[j], rgba[j + 1], rgba[j + 2]]); }
    }
    if (px.length < 9) return [];
    const lum = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
    const sorted = px.slice().sort((a, b) => lum(a) - lum(b));
    // Start bei 10 %, 50 % und 90 % der Helligkeit (reproduzierbar, kein Zufall)
    let centers = [0.1, 0.5, 0.9].map((q) => sorted[Math.floor(q * (sorted.length - 1))].slice());
    const d2 = (r, g, b, c) => (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    for (let it = 0; it < 10; it++) {
      const sum = centers.map(() => [0, 0, 0, 0]);
      for (const c of px) {
        let best = 0;
        for (let k = 1; k < centers.length; k++) if (d2(c[0], c[1], c[2], centers[k]) < d2(c[0], c[1], c[2], centers[best])) best = k;
        const t = sum[best]; t[0] += c[0]; t[1] += c[1]; t[2] += c[2]; t[3]++;
      }
      centers = centers.map((c, k) => (sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c));
    }
    return centers.map((c, k) => (i) => {
      const j = i * 4, r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
      let other = Infinity;
      for (let o = 0; o < centers.length; o++) if (o !== k) other = Math.min(other, Math.sqrt(d2(r, g, b, centers[o])));
      return Math.sqrt(d2(r, g, b, c)) - other < bold;
    });
  }

  /**
   * Schrift & Logos sauber darstellen: In jedem Textblock werden die Buchstaben mit einem lokal
   * optimalen Schwellwert (Otsu) bestimmt und scharf gefüllt – statt Rasterpunkten oder Umrisslinien.
   * Als Buchstaben zählen nur Flächen, die ganz im Schriftbereich liegen. Der Hintergrund läuft über
   * den Rand hinaus und behält seine Darstellung – sonst würde er im Kasten hart gefüllt und der
   * Schriftbereich als Rechteck sichtbar. Farbige Schrift mit ähnlicher Helligkeit wie der Grund
   * (z. B. gelb vor Wolken) wird über ihre Farbe abgegrenzt. Helle Schrift auf dunklem Grund wird hell
   * gezeichnet. Grafikelemente, die direkt an dunkle Schrift grenzen (Logo-Symbole), werden über
   * zusammenhängende Flächen mit erfasst.
   * rgba: Farbpixel (w × h) für die Farbgruppen oder null.
   * pad: Suchradius für Logo-Elemente in Zeilenhöhen; bold: Schwellwert-Versatz (+ = fetter).
   */
  function cleanText(bits, gray, rgba, w, h, blocks, pad, bold) {
    textRegions(gray, rgba, w, h, blocks, pad, bold, ({ tm, halo, bx0, by0, rw, rh, ink }) => {
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          const k = y * rw + x;
          const i = (by0 + y) * w + bx0 + x;
          if (tm[k]) bits[i] = ink;
          else if (halo[k]) bits[i] = 1 - ink;
        }
      }
    });
  }

  /**
   * Schrift & Logos im Modus Farben: Die Buchstaben (samt einbezogener Logo-Elemente) bekommen je
   * Textblock eine einheitliche Farbe (Mittel ihrer Pixel), der schmale Saum darum die mittlere Farbe
   * des Grundes – so wird die Schrift beim Zerlegen zu einer sauberen Farbfläche statt ausgefranst.
   * rgba wird verändert. Rückgabe: { keep: Maske der Schrift- und Saumpixel (die das Glätten nicht
   * verändern soll), colors: [{ rgb, weight }] Schriftfarben } oder null, wenn nichts gefunden wurde.
   */
  /**
   * Liegt die Farbe (r, g, b) nahe der Strecke zwischen Schriftfarbe f und Grundfarbe bg, also ist sie
   * eine Kantenmischung der beiden (oder fast reiner Grund)? Abstand in RGB-Einheiten.
   */
  function isBlend(r, g, b, f, bg) {
    const dx = bg[0] - f[0], dy = bg[1] - f[1], dz = bg[2] - f[2];
    const len2 = dx * dx + dy * dy + dz * dz;
    const px = r - f[0], py = g - f[1], pz = b - f[2];
    const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / len2)) : 1;
    const ex = px - t * dx, ey = py - t * dy, ez = pz - t * dz;
    // höchstens 45 von der Strecke entfernt (die Form der Buchstaben bestimmt allein die Maske)
    return ex * ex + ey * ey + ez * ez <= 45 * 45;
  }

  function cleanTextColor(rgba, opaque, w, h, blocks, pad, bold) {
    const n = w * h;
    const src = rgba.slice(); // Analyse auf den unveränderten Farben (Blöcke können sich überlappen)
    const gray = new Float32Array(n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      gray[p] = opaque[p] ? 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2] : 255;
    }
    const keep = new Uint8Array(n);
    const colors = []; // Schriftfarben: { rgb, weight }
    let any = false;
    textRegions(gray, src, w, h, blocks, pad, bold, ({ tm, halo, bx0, by0, rw, rh }) => {
      const m = rw * rh;
      const gi = (k) => (by0 + ((k / rw) | 0)) * w + bx0 + (k % rw); // Rechteck → Bildpixel
      // Grund je Saum-Pixel: Farbe des nächsten Pixels außerhalb des Saums (Ausbreitung von außen nach
      // innen). Ein gemeinsamer Mittelwert für den ganzen Block mischt sonst verschiedene Gründe – z. B.
      // Zahlen auf Weiß neben einem gelben Wappen bekämen einen gelben Rand.
      const from = new Int32Array(m).fill(-1); // Bildpixel, dessen Farbe der Grund hier hat
      const queue = new Int32Array(m);
      let qh = 0, qt = 0;
      const bg = [0, 0, 0, 0]; // Mittel des ganzen Blocks – nur Ersatz, wenn kein Grund erreichbar ist
      for (let k = 0; k < m; k++) {
        const i = gi(k);
        if (!opaque[i]) continue;
        if (!halo[k]) { from[k] = i; queue[qt++] = k; continue; }
        if (!tm[k]) { const j = i * 4; bg[0] += src[j]; bg[1] += src[j + 1]; bg[2] += src[j + 2]; bg[3]++; }
      }
      while (qh < qt) {
        const k = queue[qh++];
        const x = k % rw, y = (k / rw) | 0;
        for (const nb of [x > 0 ? k - 1 : -1, x < rw - 1 ? k + 1 : -1, y > 0 ? k - rw : -1, y < rh - 1 ? k + rw : -1]) {
          if (nb < 0 || from[nb] >= 0 || tm[nb] || !halo[nb] || !opaque[gi(nb)]) continue;
          from[nb] = from[k];
          queue[qt++] = nb;
        }
      }
      const blockBg = bg[3] ? bg.slice(0, 3).map((v) => v / bg[3]) : null;
      const bgAt = (k) => (from[k] >= 0 ? [src[from[k] * 4], src[from[k] * 4 + 1], src[from[k] * 4 + 2]] : blockBg);
      // nächstes Schriftpixel je Saum-Pixel (Ausbreitung von der Schrift nach außen)
      const near = new Int32Array(m).fill(-1);
      qh = 0; qt = 0;
      for (let k = 0; k < m; k++) if (tm[k] && opaque[gi(k)]) { near[k] = k; queue[qt++] = k; }
      while (qh < qt) {
        const k = queue[qh++];
        const x = k % rw, y = (k / rw) | 0;
        for (const nb of [x > 0 ? k - 1 : -1, x < rw - 1 ? k + 1 : -1, y > 0 ? k - rw : -1, y < rh - 1 ? k + rw : -1]) {
          if (nb < 0 || near[nb] >= 0 || !halo[nb]) continue;
          near[nb] = near[k];
          queue[qt++] = nb;
        }
      }

      // Schriftfarbe je zusammenhängendem Teil (Buchstabe, Ziffer, Logo-Element): rote Zahlen neben einem
      // schwarzen Logo-Symbol bleiben rot. Je Teil das Mittel der Hälfte seiner Pixel, die sich am
      // deutlichsten vom angrenzenden Grund abheben (Kern der Striche) – geglättete Kanten mischen sonst
      // den Grund hinein (dünne Schrift wird zu hell).
      const comp = new Int32Array(m).fill(-1);
      const fill = new Int32Array(m);
      const compColor = [];
      const local = []; // Farben dieses Blocks, ähnliche zusammengefasst
      for (let s0 = 0; s0 < m; s0++) {
        if (!tm[s0] || comp[s0] >= 0 || !opaque[gi(s0)]) continue;
        const id = compColor.length;
        const px = [];
        const ref = [0, 0, 0, 0];
        let sp = 0;
        comp[s0] = id; fill[sp++] = s0;
        while (sp) {
          const k = fill[--sp];
          px.push(k);
          const x = k % rw, y = (k / rw) | 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
              const nb = ny * rw + nx;
              if (tm[nb]) {
                if (comp[nb] < 0 && opaque[gi(nb)]) { comp[nb] = id; fill[sp++] = nb; }
              } else if (from[nb] >= 0) {
                const j = from[nb] * 4;
                ref[0] += src[j]; ref[1] += src[j + 1]; ref[2] += src[j + 2]; ref[3]++;
              }
            }
          }
        }
        const bc = ref[3] ? ref.slice(0, 3).map((v) => v / ref[3]) : blockBg;
        const far = (k) => {
          const j = gi(k) * 4;
          return bc ? (src[j] - bc[0]) ** 2 + (src[j + 1] - bc[1]) ** 2 + (src[j + 2] - bc[2]) ** 2 : 0;
        };
        const core = bc ? px.map((k) => [far(k), k]).sort((a, b) => b[0] - a[0]).slice(0, Math.max(1, Math.ceil(px.length / 2))).map((e) => e[1]) : px;
        const fc = [0, 0, 0];
        for (const k of core) { const j = gi(k) * 4; fc[0] += src[j]; fc[1] += src[j + 1]; fc[2] += src[j + 2]; }
        for (let c = 0; c < 3; c++) fc[c] /= core.length;
        // ähnliche Farben (Buchstaben eines Wortes) zu einer zusammenfassen: einheitliche Schrift und
        // keine zusätzlichen Palettenfarben
        let hit = local.find((e) => (e.rgb[0] - fc[0]) ** 2 + (e.rgb[1] - fc[1]) ** 2 + (e.rgb[2] - fc[2]) ** 2 < 40 * 40);
        if (hit) {
          const wsum = hit.weight + px.length;
          for (let c = 0; c < 3; c++) hit.rgb[c] = (hit.rgb[c] * hit.weight + fc[c] * px.length) / wsum;
          hit.weight = wsum;
        } else {
          hit = { rgb: fc, weight: px.length };
          local.push(hit);
        }
        compColor.push(hit.rgb);
      }
      if (!compColor.length) return;
      colors.push(...local);
      for (let k = 0; k < m; k++) {
        const i = gi(k);
        if (!opaque[i] || !halo[k]) continue;
        const j = i * 4;
        let c;
        if (tm[k]) c = compColor[comp[k]];
        else {
          // Saum: nur Kantenpixel (Mischung aus Schrift- und Grundfarbe) bekommen die Grundfarbe.
          // Andere Farben im Saum bleiben unverändert – z. B. ein schmaler weißer Streifen zwischen
          // schwarzer Kontur und roter Linie oder das Innere einer „8“, das der Grund nicht erreicht.
          const b = from[k] >= 0 ? bgAt(k) : null;
          const f = near[k] >= 0 && comp[near[k]] >= 0 ? compColor[comp[near[k]]] : null;
          if (!b || !f || !isBlend(src[j], src[j + 1], src[j + 2], f, b)) continue;
          c = b;
        }
        if (!c) continue;
        rgba[j] = c[0]; rgba[j + 1] = c[1]; rgba[j + 2] = c[2];
        keep[i] = 1;
        any = true;
      }
    });
    return any ? { keep, colors } : null;
  }

  /**
   * Schriftbereiche bestimmen (siehe cleanText): ruft je Textblock fn({ tm, halo, bx0, by0, rw, rh, ink })
   * auf – tm = Buchstaben samt Logo-Elementen, halo = tm um einen schmalen Saum erweitert
   * (Rechteck bx0, by0, rw × rh), ink = Farbe der Schrift im Binärbild (1 = schwarz).
   */
  function textRegions(gray, rgba, w, h, blocks, pad, bold, fn) {
    for (const b of blocks) {
      const lineH = Math.max(2, b.lineH * h);
      let bx0 = Math.max(0, Math.floor(b.x1 * w)), by0 = Math.max(0, Math.floor(b.y1 * h));
      let bx1 = Math.min(w - 1, Math.ceil(b.x2 * w)), by1 = Math.min(h - 1, Math.ceil(b.y2 * h));
      if (bx1 - bx0 < 3 || by1 - by0 < 3) continue;

      // Schriftbereich selbst (mit kleinem Rand) und dessen Schwellwert
      const m = Math.round(lineH * 0.15);
      const tx0 = Math.max(0, bx0 - m), ty0 = Math.max(0, by0 - m);
      const tx1 = Math.min(w - 1, bx1 + m), ty1 = Math.min(h - 1, by1 + m);
      const tw = tx1 - tx0 + 1;
      const minArea = Math.max(4, Math.round((lineH * 0.08) ** 2)); // kleinere Flächen: kein Buchstabenteil
      const otsu = otsuRect(gray, w, tx0, ty0, tx1, ty1);

      // Welche Pixel sind die Buchstaben? Kandidaten: dunkle bzw. helle Seite der Schwelle und die
      // Farbgruppen. Gewählt wird der mit den meisten abgegrenzten Pixeln (Flächen, die ganz im
      // Bereich liegen); eine Farbgruppe nur, wenn sie mindestens doppelt so viel findet wie die
      // Helligkeit – sonst gewinnt bei dunkler Schrift vor Laub leicht „Schrift + dunkle Blätter“.
      // „fetter“ (bold > 0) = mehr Pixel auf der Seite der Schrift.
      let best = null;
      for (const [kind, test] of [['dark', (i) => gray[i] < otsu + bold], ['light', (i) => gray[i] >= otsu - bold]]) {
        const parts = innerParts(w, tx0, ty0, tx1, ty1, test, minArea);
        if (!best || parts.count > best.parts.count) best = { kind, parts };
      }
      if (rgba) {
        const gray0 = best.parts;
        // Spalten (je eine Zeilenhöhe breit) mit Buchstabenpixeln – wie weit die Schrift entlang der Zeile reicht
        const bins = Math.max(1, Math.ceil(tw / lineH));
        const spread = (mask) => {
          const seen = new Uint8Array(bins);
          for (let k = 0; k < mask.length; k++) if (mask[k]) seen[Math.min(bins - 1, Math.floor((k % tw) / lineH))] = 1;
          return seen.reduce((a, v) => a + v, 0);
        };
        const graySpread = spread(gray0.mask);
        for (const test of colorGroups(rgba, w, tx0, ty0, tx1, ty1, bold)) {
          const parts = innerParts(w, tx0, ty0, tx1, ty1, test, minArea);
          if (parts.count <= best.parts.count) continue;
          let take = parts.count > gray0.count * 2;
          // Farbige Schrift vor einem Verlauf: Die Helligkeit trennt nur einen Teil der Buchstaben (dort,
          // wo der Grund heller/dunkler ist). Die Farbgruppe enthält diese fast vollständig und reicht
          // deutlich weiter entlang der Zeile – dann sind die zusätzlichen Pixel die übrigen Buchstaben
          // (bei Schrift vor Laub deckt die dunkle Schrift schon die ganze Zeile ab)
          if (!take && gray0.count) {
            let inside = 0;
            for (let k = 0; k < parts.mask.length; k++) if (gray0.mask[k] && parts.mask[k]) inside++;
            const sp = spread(parts.mask);
            take = inside >= gray0.count * 0.9 && sp >= graySpread * 1.25 && sp - graySpread >= 2;
          }
          if (take) best = { kind: 'color', parts };
        }
      }
      const glyphs = best.parts;
      if (!glyphs.count) continue; // nichts Abgegrenztes gefunden – Bereich unverändert lassen

      // Hell zeichnen nur, wenn die Schrift deutlich heller ist als ihre Umgebung im Bereich – sonst
      // (dunkle Schrift oder kaum Unterschied, z. B. gelb vor Wolken) schwarz, damit sie lesbar bleibt
      let gs = 0, gn = 0, bs = 0, bn = 0;
      for (let y = ty0; y <= ty1; y++) {
        for (let x = tx0; x <= tx1; x++) {
          if (glyphs.mask[(y - ty0) * tw + x - tx0]) { gs += gray[y * w + x]; gn++; } else { bs += gray[y * w + x]; bn++; }
        }
      }
      const ink = bn && gs / gn > bs / bn + 40 ? 0 : 1; // Farbe der Schrift im Ergebnis (1 = schwarz)

      // übernommene Logo-Elemente (Fenster, Pixel-Labels, angenommene Komponenten)
      let logo = null;

      // Logo-Elemente neben der Schrift einbeziehen – nur bei dunkler Schrift: Bei heller oder farbiger
      // Schrift auf einem Foto wären das Bildteile daneben (Äste, Wiese, Wolken), keine Logos
      if (pad > 0 && best.kind === 'dark') {
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

      // Schrift werden nur: abgegrenzte Buchstaben im Textbereich + genau die übernommenen Logo-Elemente
      bx0 = Math.min(bx0, tx0); by0 = Math.min(by0, ty0);
      bx1 = Math.max(bx1, tx1); by1 = Math.max(by1, ty1);
      const rw = bx1 - bx0 + 1, rh = by1 - by0 + 1;
      const tm = new Uint8Array(rw * rh);
      for (let y = 0; y < rh; y++) {
        const gy = by0 + y;
        for (let x = 0; x < rw; x++) {
          const gx = bx0 + x;
          let on = gx >= tx0 && gx <= tx1 && gy >= ty0 && gy <= ty1 && glyphs.mask[(gy - ty0) * tw + gx - tx0] === 1;
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
      // Schrift in ihrer Farbe, schmaler Saum darum in der Gegenfarbe (scharfe Kanten); der übrige
      // Hintergrund behält seine Darstellung (Rasterung/Linien) – keine Kästen
      const halo = boxDilate(tm, rw, rh, Math.max(1, Math.round(lineH * 0.08)));
      fn({ tm, halo, bx0, by0, rw, rh, ink });
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

  /** Farbbild (Modus Farben) als Canvas – leere Pixel transparent oder weiß. */
  function rgbaToCanvas(rgba8, w, h, transparent) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!transparent) {
      const tmp = new OffscreenCanvas(w, h);
      tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba8), w, h), 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(tmp, 0, 0);
    } else {
      ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba8), w, h), 0, 0);
    }
    return canvas;
  }

  /** Ergebnis (Binär- oder Graustufenbild) als Canvas. */
  function resultCanvas(r, transparent) {
    if (r.rgba8) return rgbaToCanvas(r.rgba8, r.w, r.h, transparent);
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

  /** Gaußscher Weichzeichner (separabel) auf einem Float32-Graustufenbild. */
  function gaussBlur(gray, w, h, sigma) {
    if (!(sigma > 0.2)) return gray;
    const r = Math.ceil(sigma * 3);
    const k = new Float32Array(2 * r + 1);
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) {
          const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i;
          acc += gray[row + xx] * k[i + r];
        }
        tmp[row + x] = acc;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) {
          const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i;
          acc += tmp[yy * w + x] * k[i + r];
        }
        out[y * w + x] = acc;
      }
    }
    return out;
  }

  /* ---------------- Ruhige Linien ---------------- */

  /** Skelett (Zhang-Suen-Verdünnung) eines Binärbildes. */
  function thin(bits, w, h) {
    const img = new Uint8Array(bits);
    for (let x = 0; x < w; x++) { img[x] = 0; img[(h - 1) * w + x] = 0; }
    for (let y = 0; y < h; y++) { img[y * w] = 0; img[y * w + w - 1] = 0; }
    // nur Pixel am Rand der Striche prüfen: Kandidatenliste statt ganzer Bilddurchläufe
    let cand = [];
    for (let i = 0; i < img.length; i++) if (img[i]) cand.push(i);
    const del = [];
    for (let changed = true; changed;) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        del.length = 0;
        for (const i of cand) {
          if (!img[i]) continue;
          const p2 = img[i - w], p3 = img[i - w + 1], p4 = img[i + 1], p5 = img[i + w + 1];
          const p6 = img[i + w], p7 = img[i + w - 1], p8 = img[i - 1], p9 = img[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (A !== 1) continue;
          if (step === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
          del.push(i);
        }
        if (del.length) {
          changed = true;
          for (const i of del) img[i] = 0;
        }
      }
      if (changed) cand = cand.filter((i) => img[i]);
    }
    return img;
  }

  const NB8 = (w) => [-w - 1, -w, -w + 1, 1, w + 1, w, w - 1, -1];

  /**
   * Skelett in Linienzüge zerlegen. Knoten sind Endpunkte (1 Nachbar) und Verzweigungen (≥ 3).
   * Rückgabe: [{ pts: Int32Array-artige Indexliste, closed }]
   */
  function skeletonPaths(sk, w, h) {
    const nb = NB8(w);
    const deg = new Uint8Array(sk.length);
    const pix = [];
    for (let i = 0; i < sk.length; i++) {
      if (!sk[i]) continue;
      pix.push(i);
      let d = 0;
      for (const o of nb) d += sk[i + o];
      deg[i] = d;
    }
    const isNode = (i) => deg[i] !== 2;
    const used = new Uint8Array(sk.length); // Nicht-Knoten-Pixel schon einem Linienzug zugeordnet
    const paths = [];
    const nodeEdges = new Set(); // direkt benachbarte Knoten nur einmal verbinden
    const walk = (start, next) => {
      const pts = [start];
      let prev = start, cur = next;
      for (;;) {
        pts.push(cur);
        if (isNode(cur)) break;
        used[cur] = 1;
        let nxt = -1;
        for (const o of nb) {
          const j = cur + o;
          if (!sk[j] || j === prev) continue;
          if (j === start ? pts.length > 2 : !(used[j] && !isNode(j))) { nxt = j; if (isNode(j) || j === start) break; }
        }
        if (nxt < 0 || nxt === start && pts.length < 3) break;
        prev = cur; cur = nxt;
        if (cur === start) { pts.push(cur); break; }
      }
      return pts;
    };
    for (const i of pix) {
      if (!isNode(i) || deg[i] === 0) continue;
      for (const o of nb) {
        const j = i + o;
        if (!sk[j]) continue;
        if (isNode(j)) {
          const key = i < j ? `${i},${j}` : `${j},${i}`;
          if (nodeEdges.has(key)) continue;
          nodeEdges.add(key);
          paths.push({ pts: [i, j], closed: false });
        } else if (!used[j]) {
          paths.push({ pts: walk(i, j), closed: false });
        }
      }
    }
    // geschlossene Schleifen ohne Knoten
    for (const i of pix) {
      if (used[i] || isNode(i)) continue;
      used[i] = 1;
      let nxt = -1;
      for (const o of nb) if (sk[i + o] && !used[i + o]) { nxt = i + o; break; }
      if (nxt < 0) continue;
      const pts = walk(i, nxt);
      paths.push({ pts, closed: pts[pts.length - 1] === i });
    }
    return { paths, deg };
  }

  /**
   * Ruhige Linien: Striche auf ihre Mittellinie reduzieren, Ausläufer und kurze Striche
   * entfernen, die Mittellinien glätten und mit gleichmäßiger Breite (Median je Strich) neu zeichnen.
   * smoothPx: Glättung (Gauß-Sigma entlang der Linie), minLenPx: kürzere Striche/Ausläufer entfallen.
   */
  function cleanLines(bits, w, h, smoothPx, minLenPx) {
    const d2 = distanceTransformSq(bits, w, h, 0, 64);
    const sk = thin(bits, w, h);
    let { paths, deg } = skeletonPaths(sk, w, h);
    const len = (pts) => {
      let L = 0;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k];
        L += (a % w !== b % w && (a / w | 0) !== (b / w | 0)) ? Math.SQRT2 : 1;
      }
      return L;
    };
    // Ausläufer (ein Ende frei, anderes an einer Verzweigung) und kurze Einzelstriche entfernen
    for (let pass = 0; pass < 2; pass++) {
      const nodeUse = new Map();
      for (const p of paths) {
        if (p.closed) continue;
        for (const e of [p.pts[0], p.pts[p.pts.length - 1]]) nodeUse.set(e, (nodeUse.get(e) || 0) + 1);
      }
      const isFree = (i) => deg[i] <= 1 || nodeUse.get(i) === 1;
      paths = paths.filter((p) => {
        if (p.closed) return len(p.pts) >= minLenPx;
        const a = p.pts[0], b = p.pts[p.pts.length - 1];
        const fa = isFree(a), fb = isFree(b);
        const L = len(p.pts);
        if (fa && fb) return L >= minLenPx; // einzelner Strich
        if (fa || fb) return L >= minLenPx * 0.5; // Ausläufer an einer Verzweigung
        return true;
      });
    }

    const out = new Uint8Array(w * h);
    const stamp = (x0, y0, x1, y1, r) => {
      const minX = Math.max(0, Math.floor(Math.min(x0, x1) - r)), maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + r));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1) - r)), maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + r));
      const vx = x1 - x0, vy = y1 - y0, l2 = vx * vx + vy * vy;
      const rr = (r + 0.05) * (r + 0.05);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          let t = l2 > 0 ? ((x - x0) * vx + (y - y0) * vy) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = x - x0 - t * vx, dy = y - y0 - t * vy;
          if (dx * dx + dy * dy <= rr) out[y * w + x] = 1;
        }
      }
    };
    const sigma = Math.max(0, smoothPx);
    const R = Math.ceil(sigma * 2.5);
    const kern = new Float64Array(2 * R + 1);
    for (let i = -R; i <= R; i++) kern[i + R] = sigma > 0 ? Math.exp(-(i * i) / (2 * sigma * sigma)) : (i === 0 ? 1 : 0);
    for (const p of paths) {
      let pts = p.pts;
      if (p.closed && pts.length > 1 && pts[0] === pts[pts.length - 1]) pts = pts.slice(0, -1);
      const n = pts.length;
      const X = new Float64Array(n), Y = new Float64Array(n);
      const widths = [];
      for (let k = 0; k < n; k++) {
        X[k] = pts[k] % w; Y[k] = (pts[k] / w) | 0;
        widths.push(2 * Math.sqrt(d2[pts[k]]) - 1);
      }
      widths.sort((a, b) => a - b);
      const width = Math.max(1, widths[widths.length >> 1]);
      // glätten (Enden bleiben fest, damit Verbindungen an Verzweigungen erhalten bleiben)
      let SX = X, SY = Y;
      if (sigma > 0.3 && n > 2) {
        SX = new Float64Array(n); SY = new Float64Array(n);
        for (let k = 0; k < n; k++) {
          let ax = 0, ay = 0, aw = 0;
          // offene Linien: Fenster zum Ende hin verkleinern
          const r = p.closed ? R : Math.min(R, k, n - 1 - k);
          for (let i = -r; i <= r; i++) {
            const j = p.closed ? (k + i + n) % n : k + i;
            const wt = kern[i + R];
            ax += X[j] * wt; ay += Y[j] * wt; aw += wt;
          }
          SX[k] = ax / aw; SY[k] = ay / aw;
        }
      }
      const r = width / 2;
      if (n === 1) stamp(SX[0], SY[0], SX[0], SY[0], r);
      for (let k = 1; k < n; k++) stamp(SX[k - 1], SY[k - 1], SX[k], SY[k], r);
      if (p.closed && n > 2) stamp(SX[n - 1], SY[n - 1], SX[0], SY[0], r);
    }
    return out;
  }

  return { faceFeatureRegions, faceFeatureLevels, process, processColor, rgbaToCanvas, ditherGray, bitsToCanvas, grayToCanvas, resultCanvas, otsu, targetSize, toGray, sharpen, adjust, silhouette, dilate, distanceTransformSq, addSubjectLine, cleanLines, gaussBlur, thin };
})();
