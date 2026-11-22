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
   * Maske verfeinern (läuft im Worker). o: {
   *   shiftPx     Kante verschieben: > 0 Motiv größer, < 0 kleiner (Pixel der Maske)
   *   smoothPx    Kante glätten: Zacken und kleine Ausbuchtungen abrunden (Radius in Pixeln)
   *   speckPct    lose Flecken des Motivs entfernen, die kleiner als so viel % der Bildfläche sind
   *   holePct     Löcher im Motiv füllen, die kleiner als so viel % der Bildfläche sind
   *   largestOnly nur das größte zusammenhängende Motiv behalten
   * }
   * Reihenfolge: Flecken → Löcher → Glätten → Kante verschieben (mit geglätteter Kante).
   */
  function refineMask(source, o) {
    const w = source.width, h = source.height, n = w * h;
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const a = img.data;
    let bin = new Uint8Array(n);
    for (let p = 0; p < n; p++) bin[p] = a[p * 4 + 3] >= 128 ? 1 : 0;

    if (o.speckPct > 0 || o.largestOnly) removeSpecks(bin, w, h, (o.speckPct / 100) * n, o.largestOnly);
    if (o.holePct > 0) fillSmallHoles(bin, w, h, (o.holePct / 100) * n);
    if (o.smoothPx > 0) bin = smoothBinary(bin, w, h, o.smoothPx);

    // Vorzeichenbehafteter Abstand zur Kante (innen > 0) → Kante verschieben und weich auslaufen lassen
    const shift = o.shiftPx || 0;
    const reach = Math.abs(shift) + 2;
    const toInside = Processing.distanceTransformSq(bin, w, h, 1, reach);
    const toOutside = Processing.distanceTransformSq(bin, w, h, 0, reach);
    for (let p = 0; p < n; p++) {
      const sd = bin[p] ? Math.sqrt(toOutside[p]) - 0.5 : 0.5 - Math.sqrt(toInside[p]);
      const t = Math.min(1, Math.max(0, sd + shift + 0.5));
      a[p * 4] = a[p * 4 + 1] = a[p * 4 + 2] = 0;
      a[p * 4 + 3] = Math.round(t * 255);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /**
   * Markiert zusammenhängende Bereiche mit Wert `want` (8er-Nachbarschaft für das Motiv,
   * 4er für den Hintergrund – so gelten diagonal verbundene Motivteile als ein Stück).
   * Rückgabe: { label (Int32Array, -1 = anderer Wert), sizes, touchesBorder }.
   */
  function components(bin, w, h, want) {
    const n = w * h;
    const label = new Int32Array(n).fill(-1);
    const stack = new Int32Array(n);
    const sizes = [], touchesBorder = [];
    const diag = want === 1;
    const xMax = w - 1, yMaxRow = (h - 1) * w;
    for (let start = 0; start < n; start++) {
      if (bin[start] !== want || label[start] !== -1) continue;
      const id = sizes.length;
      let size = 0, border = false, sp = 0;
      label[start] = id;
      stack[sp++] = start;
      while (sp) {
        const i = stack[--sp];
        size++;
        const x = i % w;
        const left = x > 0, right = x < xMax, up = i >= w, down = i < yMaxRow;
        if (!left || !right || !up || !down) border = true;
        let k;
        if (left && bin[k = i - 1] === want && label[k] === -1) { label[k] = id; stack[sp++] = k; }
        if (right && bin[k = i + 1] === want && label[k] === -1) { label[k] = id; stack[sp++] = k; }
        if (up && bin[k = i - w] === want && label[k] === -1) { label[k] = id; stack[sp++] = k; }
        if (down && bin[k = i + w] === want && label[k] === -1) { label[k] = id; stack[sp++] = k; }
        if (diag) {
          if (up && left && bin[k = i - w - 1] === want && label[k] === -1) { label[k] = id; stack[sp++] = k; }
          if (up && right && bin[k = i - w + 1] === want && label[k] === -1) { label[k] = id; stack[sp++] = k; }
          if (down && left && bin[k = i + w - 1] === want && label[k] === -1) { label[k] = id; stack[sp++] = k; }
          if (down && right && bin[k = i + w + 1] === want && label[k] === -1) { label[k] = id; stack[sp++] = k; }
        }
      }
      sizes.push(size);
      touchesBorder.push(border);
    }
    return { label, sizes, touchesBorder };
  }

  /** Entfernt Motivteile unter minArea Pixeln bzw. alle außer dem größten. */
  function removeSpecks(bin, w, h, minArea, largestOnly) {
    const { label, sizes } = components(bin, w, h, 1);
    if (!sizes.length) return;
    let largest = 0;
    for (let id = 1; id < sizes.length; id++) if (sizes[id] > sizes[largest]) largest = id;
    const keep = sizes.map((sz, id) => (largestOnly ? id === largest : sz >= minArea || id === largest));
    for (let p = 0; p < bin.length; p++) if (bin[p] && !keep[label[p]]) bin[p] = 0;
  }

  /** Füllt Löcher im Motiv bis maxArea Pixel (Hintergrund, der den Bildrand berührt, bleibt). */
  function fillSmallHoles(bin, w, h, maxArea) {
    const { label, sizes, touchesBorder } = components(bin, w, h, 0);
    const fill = sizes.map((sz, id) => !touchesBorder[id] && sz <= maxArea);
    for (let p = 0; p < bin.length; p++) if (!bin[p] && fill[label[p]]) bin[p] = 1;
  }

  /** Weichzeichnen (3 × Boxfilter ≈ Gauß) und wieder bei 50 % trennen: rundet Zacken und Spitzen ab. */
  function smoothBinary(bin, w, h, radius) {
    const r = Math.max(1, Math.round(radius / Math.sqrt(3)));
    const f = Float32Array.from(bin);
    const tmp = new Float32Array(f.length);
    for (let pass = 0; pass < 3; pass++) {
      boxBlurRows(f, tmp, w, h, r);
      boxBlurCols(tmp, f, w, h, r);
    }
    const out = new Uint8Array(bin.length);
    for (let p = 0; p < out.length; p++) out[p] = f[p] >= 0.5 ? 1 : 0;
    return out;
  }

  /** Gleitender Mittelwert je Zeile (Randwerte werden fortgesetzt). */
  function boxBlurRows(src, dst, w, h, r) {
    const norm = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
      const row = y * w, last = row + w - 1;
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += src[Math.min(last, Math.max(row, row + i))];
      for (let x = 0; x < w; x++) {
        dst[row + x] = sum * norm;
        const add = row + x + r + 1, sub = row + x - r;
        sum += src[add > last ? last : add] - src[sub < row ? row : sub];
      }
    }
  }

  /** Gleitender Mittelwert je Spalte, zeilenweise über den Speicher (cachefreundlich). */
  function boxBlurCols(src, dst, w, h, r) {
    const norm = 1 / (2 * r + 1);
    const sum = new Float32Array(w);
    for (let i = -r; i <= r; i++) {
      const row = Math.min(h - 1, Math.max(0, i)) * w;
      for (let x = 0; x < w; x++) sum[x] += src[row + x];
    }
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const addRow = Math.min(h - 1, y + r + 1) * w, subRow = Math.max(0, y - r) * w;
      for (let x = 0; x < w; x++) {
        dst[row + x] = sum[x] * norm;
        sum[x] += src[addRow + x] - src[subRow + x];
      }
    }
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

    return bgToMask(bg, w, h);
  }

  /** Hintergrund-Bitmaske (1 = entfernen) → Freistellmaske mit leicht geglätteter Kante. */
  function bgToMask(bg, w, h) {
    const mask = new OffscreenCanvas(w, h);
    const ctx = mask.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let p = 0; p < bg.length; p++) img.data[p * 4 + 3] = bg[p] ? 0 : 255;
    ctx.putImageData(img, 0, 0);

    // Kante leicht glätten. Randpixel nach außen verlängern, sonst mischt der Filter am
    // Bildrand Transparenz ein und ein Motiv, das den Rand berührt, wird dort halb durchsichtig.
    const radius = Math.max(0.6, w / 1500);
    const m = Math.ceil(radius * 3) + 1;
    const pad = new OffscreenCanvas(w + 2 * m, h + 2 * m);
    const pctx = pad.getContext('2d');
    pctx.imageSmoothingEnabled = false;
    pctx.drawImage(mask, m, m);
    pctx.drawImage(mask, 0, 0, w, 1, m, 0, w, m);
    pctx.drawImage(mask, 0, h - 1, w, 1, m, m + h, w, m);
    pctx.drawImage(pad, m, 0, 1, h + 2 * m, 0, 0, m, h + 2 * m);
    pctx.drawImage(pad, m + w - 1, 0, 1, h + 2 * m, m + w, 0, m, h + 2 * m);
    const smooth = new OffscreenCanvas(w, h);
    const sctx = smooth.getContext('2d');
    sctx.filter = `blur(${radius}px)`;
    sctx.drawImage(pad, -m, -m);
    return smooth;
  }

  /**
   * Himmel entfernen: wächst vom oberen Bildrand aus über alle himmelartigen Pixel (blau oder
   * hell-neutral wie Wolken und Dunst). Jeder Schritt vergleicht mit dem Nachbarpixel, nicht mit
   * einer festen Farbe – so folgt die Fläche dem Verlauf von Dunkelblau oben bis Hellblau am
   * Horizont und stoppt an harten Kanten (Maschine, Gebäude, Baumkronen, Horizont).
   * tolerance 1..100: erlaubter Farbsprung je Schritt. seeds: zusätzliche Startpunkte (z. B. Himmel
   * zwischen Ästen oder hinter Fenstern), relativ 0..1.
   */
  function skyMask(bitmap, tolerance, seeds) {
    const { w, h } = analysisSize(bitmap);
    const d = drawRgba(bitmap, w, h);
    // Rauschen und JPEG-Blöcke glätten, damit der Verlauf nicht an Körnung hängen bleibt
    const n = w * h;
    const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    const tmp = new Float32Array(n), tmp2 = new Float32Array(n);
    const r = Math.max(1, Math.round(w / 600));
    for (let c = 0; c < 3; c++) {
      for (let p = 0; p < n; p++) tmp[p] = d[p * 4 + c];
      boxBlurRows(tmp, tmp2, w, h, r);
      boxBlurCols(tmp2, ch[c], w, h, r);
    }
    const [R, G, B] = ch;
    const skyLike = (p) => {
      const rr = R[p], gg = G[p], bb = B[p];
      const lum = (rr + gg + bb) / 3;
      if (lum < 55) return false;
      if (bb >= gg + 4 && bb >= rr + 12) return true; // blau bis hellblau / türkis
      const spread = Math.max(rr, gg, bb) - Math.min(rr, gg, bb);
      return lum >= 165 && spread <= 45 && bb >= rr - 8; // Wolken, Dunst, bedeckter Himmel
    };
    const step = 2 + tolerance * 0.3; // Standard 20 → 8 Graustufen je Pixel
    const step2 = step * step;
    const bg = new Uint8Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    const start = (p) => { if (!bg[p] && skyLike(p)) { bg[p] = 1; stack[sp++] = p; } };
    for (let x = 0; x < w; x++) start(x);
    for (const s of seeds || []) {
      const x = Math.min(w - 1, Math.max(0, Math.round(s.x * (w - 1))));
      const y = Math.min(h - 1, Math.max(0, Math.round(s.y * (h - 1))));
      start(y * w + x);
    }
    const visit = (from, k) => {
      if (bg[k]) return;
      const dr = R[k] - R[from], dg = G[k] - G[from], db = B[k] - B[from];
      if (dr * dr + dg * dg + db * db <= step2 && skyLike(k)) { bg[k] = 1; stack[sp++] = k; }
    };
    while (sp) {
      const i = stack[--sp];
      const x = i % w;
      if (x > 0) visit(i, i - 1);
      if (x < w - 1) visit(i, i + 1);
      if (i >= w) visit(i, i - w);
      if (i < (h - 1) * w) visit(i, i + w);
    }
    // Kleine Inseln im Himmel (Vögel, Leitungen, Bildrauschen) gehören zum Himmel
    fillSmallIslands(bg, w, h, Math.max(16, Math.round(n * 0.0004)));
    return bgToMask(bg, w, h);
  }

  /** Setzt Nicht-Hintergrund-Flächen unter minSize Pixeln, die den Bildrand nicht berühren, auf Hintergrund. */
  function fillSmallIslands(bg, w, h, minSize) {
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    const comp = [];
    for (let p0 = 0; p0 < w * h; p0++) {
      if (bg[p0] || seen[p0]) continue;
      let sp = 0, border = false;
      comp.length = 0;
      seen[p0] = 1; stack[sp++] = p0;
      while (sp) {
        const i = stack[--sp];
        comp.push(i);
        const x = i % w, y = (i - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
        for (const k of nb) if (k >= 0 && !bg[k] && !seen[k]) { seen[k] = 1; stack[sp++] = k; }
      }
      if (!border && comp.length < minSize) for (const i of comp) bg[i] = 1;
    }
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
      // Hintergrund abschwächen (halb transparent), Motiv bleibt voll deckend
      const subject = new OffscreenCanvas(w, h);
      const subCtx = subject.getContext('2d');
      subCtx.drawImage(bitmap, 0, 0, w, h);
      subCtx.globalCompositeOperation = 'destination-in';
      subCtx.drawImage(mask, 0, 0, w, h);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(bitmap, 0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.drawImage(subject, 0, 0);

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

  return { aiMask, colorMask, skyMask, refineMask, cutoutPreview, analysisSize };
})();
