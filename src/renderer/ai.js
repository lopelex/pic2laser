'use strict';

/**
 * KI-Funktionen: Vor- und Nachverarbeitung für die ONNX-Modelle.
 * Die eigentliche Inferenz läuft im Main-Prozess (window.api.models.run).
 */
const AI = (() => {
  const IMAGENET = { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] };

  /** Zeichnet die Quelle auf Weiß und liefert RGBA-Pixel. */
  function pixels(source, w, h) {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  }

  /** RGBA → Float32 NCHW mit (x * scale - mean) / std. scale = 'max' normiert auf den hellsten Wert. */
  function toNCHW(rgba, w, h, { mean = [0, 0, 0], std = [1, 1, 1], scale = 1 / 255 } = {}) {
    let sc = scale;
    if (scale === 'max') {
      let max = 0;
      for (let i = 0; i < rgba.length; i += 4) max = Math.max(max, rgba[i], rgba[i + 1], rgba[i + 2]);
      sc = 1 / (max || 1);
    }
    const n = w * h;
    const out = new Float32Array(3 * n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      out[p] = (rgba[i] * sc - mean[0]) / std[0];
      out[n + p] = (rgba[i + 1] * sc - mean[1]) / std[1];
      out[2 * n + p] = (rgba[i + 2] * sc - mean[2]) / std[2];
    }
    return out;
  }

  function minMax(data) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    const range = max - min || 1;
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = (data[i] - min) / range;
    return out;
  }

  function sigmoid(data) {
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = 1 / (1 + Math.exp(-data[i]));
    return out;
  }

  const roundTo = (v, m) => Math.max(m, Math.round(v / m) * m);

  // Anzahl der Ergebnisse aus dem Festplatten-Cache (für die Zeitschätzung)
  let cacheHits = 0;

  async function run(id, feeds, outputs) {
    const res = await window.api.models.run(id, feeds, outputs);
    if (res.__fromCache) {
      cacheHits++;
      delete res.__fromCache;
    }
    return outputs ? res : Object.values(res)[0];
  }

  /**
   * Kacheln überlappend abarbeiten: Die nächste Kachel ist schon beim KI-Prozess angefragt,
   * während die vorige ausgewertet wird – der KI-Prozess wartet so nicht auf das Fenster.
   * request(item) → Promise, consume(result, item).
   */
  // Abbruch zwischen Kacheln: „Abbrechen“ erhöht den Zähler, laufende Kachel-Schleifen steigen aus
  let abortEpoch = 0;
  let runEpoch = 0; // Stand beim Start des aktuellen Durchlaufs
  function abort() { abortEpoch++; }
  /** Neuer Durchlauf beginnt: frühere Abbrüche gelten für ihn nicht mehr. */
  function beginRun() { runEpoch = abortEpoch; }
  /**
   * Prüffunktion für eine Kachel-Schleife: wirft „cancelled“, sobald seit dem Start des Durchlaufs
   * abgebrochen wurde – auch wenn die Schleife erst nach dem Abbruch beginnt (z. B. nach einem
   * nicht abbrechbaren Zwischenschritt).
   */
  function guard() {
    const start = Math.min(runEpoch, abortEpoch);
    return () => {
      if (start !== abortEpoch) {
        const err = new Error('cancelled');
        err.cancelled = true;
        throw err;
      }
    };
  }

  async function pipelined(items, request, consume, depth = 2) {
    const check = guard();
    const inflight = [];
    for (const item of items) {
      check();
      const p = request(item);
      p.catch(() => {}); // Fehler wird beim Abholen gemeldet
      inflight.push({ item, p });
      if (inflight.length >= depth) {
        const job = inflight.shift();
        const res = await job.p;
        check();
        consume(res, job.item);
      }
    }
    while (inflight.length) {
      const job = inflight.shift();
      const res = await job.p;
      check();
      consume(res, job.item);
    }
  }

  /** Graustufen (0..1) als Canvas in Zielgröße. */
  function grayToCanvas(data, w, h, outW, outH) {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let p = 0; p < w * h; p++) {
      const v = Math.max(0, Math.min(255, Math.round(data[p] * 255)));
      img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = v;
      img.data[p * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (outW === w && outH === h) return c;
    const out = new OffscreenCanvas(outW, outH);
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(c, 0, 0, outW, outH);
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* Freistellen                                                      */
  /* ---------------------------------------------------------------- */

  const SEG_MODELS = {
    ai: { model: 'u2netp', size: 320, mean: IMAGENET.mean, std: IMAGENET.std, scale: 'max', input: 'input.1' },
    isnet: { model: 'isnet', size: 1024, mean: [0.5, 0.5, 0.5], std: [1, 1, 1], scale: 'max', input: 'input_image' },
    birefnet: { model: 'birefnet', size: 1024, mean: IMAGENET.mean, std: IMAGENET.std, scale: 1 / 255, input: 'input_image' },
    ben2: { model: 'ben2', size: 1024, scale: 1 / 255, input: 'input.1' },
  };

  /** Liefert die rohe Motivmaske { data (0..1), w, h }. */
  async function segment(method, bitmap) {
    if (method === 'modnet') {
      // MODNet: kürzere Seite 512, beide Seiten Vielfache von 32, Werte auf -1..1.
      // Kleine Bilder höchstens auf das Doppelte vergrößern – stark hochskaliert (unscharf)
      // versagt MODNet (gemessen: 135 px → 512 px schneidet die Haut weg, → 288 px sauber).
      const short = Math.min(bitmap.width, bitmap.height);
      const target = Math.max(256, Math.min(512, short * 2));
      const sc = target / short;
      const w = roundTo(bitmap.width * sc, 32);
      const h = roundTo(bitmap.height * sc, 32);
      const input = toNCHW(pixels(bitmap, w, h), w, h, { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] });
      const out = await run('modnet', { input: { data: input, dims: [1, 3, h, w] } });
      return { data: Float32Array.from(out.data), w, h };
    }
    const cfg = SEG_MODELS[method];
    if (!cfg) throw new Error(`Unbekannte Freistell-Methode: ${method}`);
    const { size } = cfg;
    const input = toNCHW(pixels(bitmap, size, size), size, size, cfg);
    const out = await run(cfg.model, { [cfg.input]: { data: input, dims: [1, 3, size, size] } });
    let data = out.data;
    if (method === 'birefnet') {
      // Je nach Export Logits oder Wahrscheinlichkeiten
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < data.length; i++) { min = Math.min(min, data[i]); max = Math.max(max, data[i]); }
      data = min < 0 || max > 1 ? sigmoid(data) : Float32Array.from(data);
    } else {
      data = minMax(data);
    }
    return { data, w: size, h: size };
  }

  /* ---------------------------------------------------------------- */
  /* Objekt anklicken (MobileSAM)                                     */
  /* ---------------------------------------------------------------- */

  /** Bild-Embedding (einmal pro Bild, ~1 s). */
  async function samEmbedding(bitmap) {
    const sc = 1024 / Math.max(bitmap.width, bitmap.height);
    const w = Math.max(1, Math.round(bitmap.width * sc));
    const h = Math.max(1, Math.round(bitmap.height * sc));
    const rgba = pixels(bitmap, w, h);
    const hwc = new Float32Array(w * h * 3);
    for (let p = 0, i = 0; p < w * h; p++, i += 4) {
      hwc[p * 3] = rgba[i];
      hwc[p * 3 + 1] = rgba[i + 1];
      hwc[p * 3 + 2] = rgba[i + 2];
    }
    const emb = await run('sam_encoder', { input_image: { data: hwc, dims: [h, w, 3] } });
    return { emb, w, h };
  }

  /**
   * Maske für Klickpunkte. points: [{ x, y, positive }] relativ (0..1).
   * Rückgabe: { data (0..1), w: outW, h: outH }
   */
  async function samMask(embedding, points, outW, outH) {
    const n = points.length + 1;
    const coords = new Float32Array(n * 2);
    const labels = new Float32Array(n);
    points.forEach((p, i) => {
      coords[i * 2] = p.x * embedding.w;
      coords[i * 2 + 1] = p.y * embedding.h;
      labels[i] = p.positive ? 1 : 0;
    });
    labels[n - 1] = -1; // Füllpunkt (keine Box)
    const res = await run('sam_decoder', {
      image_embeddings: { data: embedding.emb.data, dims: embedding.emb.dims },
      point_coords: { data: coords, dims: [1, n, 2] },
      point_labels: { data: labels, dims: [1, n] },
      mask_input: { data: new Float32Array(256 * 256), dims: [1, 1, 256, 256] },
      has_mask_input: { data: new Float32Array([0]), dims: [1] },
      orig_im_size: { data: new Float32Array([outH, outW]), dims: [2] },
    }, ['masks']);
    return { data: sigmoid(res.masks.data), w: outW, h: outH };
  }

  /* ---------------------------------------------------------------- */
  /* Objekt anklicken – genau (SAM 2.1 Small)                         */
  /* ---------------------------------------------------------------- */

  const SAM2_SIZE = 1024;
  const SAM2_EMB = ['image_embeddings.0', 'image_embeddings.1', 'image_embeddings.2'];

  /** Bild-Embedding (einmal pro Bild, ca. 2–3 s). Das Bild wird wie im Original auf 1024×1024 gestreckt. */
  async function sam2Embedding(bitmap) {
    const S = SAM2_SIZE;
    const input = toNCHW(pixels(bitmap, S, S), S, S, { mean: IMAGENET.mean, std: IMAGENET.std });
    const emb = await run('sam2_encoder', { pixel_values: { data: input, dims: [1, 3, S, S] } }, SAM2_EMB);
    return { emb };
  }

  /**
   * Maske für Klickpunkte. points: [{ x, y, positive }] relativ (0..1).
   * Der Decoder liefert drei Vorschläge (256×256, Logits über das gestreckte Bild);
   * genommen wird der mit der höchsten vorhergesagten Güte (IoU).
   */
  async function sam2Mask(embedding, points, outW, outH) {
    const n = points.length;
    const coords = new Float32Array(n * 2);
    const labels = new BigInt64Array(n);
    points.forEach((p, i) => {
      coords[i * 2] = p.x * SAM2_SIZE;
      coords[i * 2 + 1] = p.y * SAM2_SIZE;
      labels[i] = p.positive ? 1n : 0n;
    });
    const feeds = {
      input_points: { data: coords, dims: [1, 1, n, 2] },
      input_labels: { data: labels, dims: [1, 1, n], type: 'int64' },
      input_boxes: { data: new Float32Array(0), dims: [1, 0, 4] },
    };
    for (const name of SAM2_EMB) feeds[name] = embedding.emb[name];
    const res = await run('sam2_decoder', feeds, ['pred_masks', 'iou_scores']);
    const iou = res.iou_scores.data;
    const dims = res.pred_masks.dims;
    const mh = dims[dims.length - 2], mw = dims[dims.length - 1];
    let best = 0;
    for (let k = 1; k < iou.length; k++) if (iou[k] > iou[best]) best = k;
    const logits = res.pred_masks.data.subarray(best * mw * mh, (best + 1) * mw * mh);
    // Logits glatt hochskalieren, erst danach in Wahrscheinlichkeiten umrechnen (saubere Kanten)
    return { data: sigmoid(resizeBilinear(logits, mw, mh, outW, outH)), w: outW, h: outH };
  }

  /** Bilineares Skalieren eines Float-Rasters (Pixelmitten aufeinander abgebildet). */
  function resizeBilinear(src, sw, sh, dw, dh) {
    const out = new Float32Array(dw * dh);
    const fx = sw / dw, fy = sh / dh;
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) * fy - 0.5));
      const y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), ty = sy - y0;
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) * fx - 0.5));
        const x0 = Math.floor(sx), x1 = Math.min(sw - 1, x0 + 1), tx = sx - x0;
        const a = src[y0 * sw + x0] + (src[y0 * sw + x1] - src[y0 * sw + x0]) * tx;
        const b = src[y1 * sw + x0] + (src[y1 * sw + x1] - src[y1 * sw + x0]) * tx;
        out[y * dw + x] = a + (b - a) * ty;
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* Strichzeichnung (Informative Drawings)                           */
  /* ---------------------------------------------------------------- */

  /**
   * Tonwertkorrektur: Das Modell zeichnet eher hellgraue Bleistiftlinien.
   * Die dunkelsten Linien werden auf Schwarz, fast weiße Bereiche auf Weiß gezogen,
   * damit der Schwellwert (Standard 128) die Linien sauber erfasst.
   */
  function lineLevels(data) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < data.length; i++) hist[Math.max(0, Math.min(255, Math.round(data[i] * 255)))]++;
    let acc = 0, lo = 0;
    const target = data.length * 0.005;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) { lo = v / 255; break; }
    }
    const hi = 0.97;
    const range = Math.max(0.05, hi - lo);
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = Math.min(1, Math.max(0, (data[i] - lo) / range));
    return out;
  }

  /**
   * Strichzeichnungs-Modelle (Ausgabe immer: Linien dunkel auf Weiß, 0..1):
   * fine/contour/sketch = Informative Drawings (anime = mitgeliefert, contour, opensketch),
   * portrait = U²-Net Portrait (Tusche-Porträt, feste Eingabe 512×512),
   * teed = TEED-Kantendetektor (sehr klein, feine Umrisse).
   */
  const LINE_STYLES = {
    fine: { model: 'lineart', input: 'input', kind: 'drawings' },
    contour: { model: 'lineart_contour', input: 'image', kind: 'drawings' },
    sketch: { model: 'lineart_sketch', input: 'image', kind: 'drawings' },
    portrait: { model: 'lineart_portrait', input: 'serving_default_args_0', kind: 'portrait' },
    teed: { model: 'lineart_teed', input: 'image', kind: 'edges' },
  };
  const lineCfg = (style) => LINE_STYLES[style] || LINE_STYLES.fine;
  const lineModel = (style) => lineCfg(style).model;
  /** Rechnet das Modell mit fester Auflösung (Detailgrad ohne Wirkung)? */
  const lineFixedSize = (style) => lineCfg(style).kind === 'portrait';

  /** Quantil von Werten im Bereich 0..1 (Histogramm, ohne Sortieren). */
  function quantile01(data, q) {
    const bins = new Uint32Array(1024);
    for (let i = 0; i < data.length; i++) bins[Math.max(0, Math.min(1023, Math.floor(data[i] * 1024)))]++;
    const target = data.length * q;
    for (let b = 0, acc = 0; b < 1024; b++) {
      acc += bins[b];
      if (acc >= target) return (b + 0.5) / 1024;
    }
    return 1;
  }

  /**
   * Kantenwahrscheinlichkeit → dunkle Linien auf Weiß. TEED liefert auch in leeren Flächen
   * einen Grundwert (~0,44); der Median gilt als „Papier“, die stärksten Kanten als Schwarz.
   */
  function edgeLevels(data) {
    const base = quantile01(data, 0.5);
    const top = Math.max(base + 0.05, quantile01(data, 0.999));
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = 1 - Math.min(1, Math.max(0, (data[i] - base) / (top - base)));
    return out;
  }

  /** U²-Net Portrait: quadratisch auf Weiß einpassen, 512×512 rechnen, Ausschnitt zurückgeben. */
  async function portraitLineArt(source, cfg, outW, outH) {
    const S = 512;
    const n = Math.max(source.width, source.height);
    const sq = new OffscreenCanvas(S, S);
    const sctx = sq.getContext('2d');
    sctx.fillStyle = '#fff';
    sctx.fillRect(0, 0, S, S);
    sctx.imageSmoothingQuality = 'high';
    const dw = (source.width / n) * S, dh = (source.height / n) * S;
    const ox = (S - dw) / 2, oy = (S - dh) / 2;
    sctx.drawImage(source, ox, oy, dw, dh);
    const input = toNCHW(pixels(sq, S, S), S, S, { mean: IMAGENET.mean, std: IMAGENET.std, scale: 'max' });
    const out = await run(cfg.model, { [cfg.input]: { data: input, dims: [1, 3, S, S] } });
    const norm = minMax(out.data);
    for (let i = 0; i < norm.length; i++) norm[i] = 1 - norm[i];
    const full = grayToCanvas(norm, S, S, S, S);
    const c = new OffscreenCanvas(outW, outH);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, ox, oy, dw, dh, 0, 0, outW, outH);
    return c;
  }

  /** Liefert eine Canvas mit dunklen Linien auf Weiß, gleiche Seitenverhältnisse wie die Quelle. */
  async function lineArt(source, maxSide, style = 'fine') {
    const cfg = lineCfg(style);
    const sc = maxSide / Math.max(source.width, source.height);
    const outW = Math.round(source.width * sc), outH = Math.round(source.height * sc);
    if (cfg.kind === 'portrait') return portraitLineArt(source, cfg, outW, outH);
    const w = roundTo(source.width * sc, 8);
    const h = roundTo(source.height * sc, 8);
    const rgba = pixels(source, w, h);
    if (cfg.kind === 'edges') {
      // TEED: BGR 0..255 minus Mittelwert (BIPED)
      const n = w * h;
      const input = new Float32Array(3 * n);
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        input[p] = rgba[i + 2] - 104.007;
        input[n + p] = rgba[i + 1] - 116.669;
        input[2 * n + p] = rgba[i] - 122.679;
      }
      const out = await run(cfg.model, { [cfg.input]: { data: input, dims: [1, 3, h, w] } });
      return grayToCanvas(edgeLevels(out.data), w, h, outW, outH);
    }
    const input = toNCHW(rgba, w, h);
    const out = await run(cfg.model, { [cfg.input]: { data: input, dims: [1, 3, h, w] } });
    return grayToCanvas(lineLevels(out.data), w, h, outW, outH);
  }

  /* ---------------------------------------------------------------- */
  /* Texterkennung (PaddleOCR PP-OCRv4, DB-Detektor)                  */
  /* ---------------------------------------------------------------- */

  /**
   * Findet Textbereiche und fasst benachbarte Zeilen zu Blöcken zusammen.
   * Rückgabe: [{ x1, y1, x2, y2, lineH }] relativ (0..1), lineH = größte Zeilenhöhe im Block.
   */
  async function detectText(source, limit = 1280) {
    const sc = Math.min(1, limit / Math.max(source.width, source.height)) || 1;
    const w = roundTo(source.width * Math.max(sc, 32 / Math.min(source.width, source.height)), 32);
    const h = roundTo(source.height * Math.max(sc, 32 / Math.min(source.width, source.height)), 32);
    const rgba = pixels(source, w, h);
    // PaddleOCR erwartet BGR-Reihenfolge
    const n = w * h;
    const input = new Float32Array(3 * n);
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      input[p] = (rgba[i + 2] / 255 - mean[0]) / std[0];
      input[n + p] = (rgba[i + 1] / 255 - mean[1]) / std[1];
      input[2 * n + p] = (rgba[i] / 255 - mean[2]) / std[2];
    }
    const out = await run('text', { x: { data: input, dims: [1, 3, h, w] } });
    const prob = out.data;

    // DB-Nachbearbeitung: zusammenhängende Bereiche über der Schwelle → Boxen
    const seen = new Uint8Array(n);
    const stack = new Int32Array(n);
    const boxes = [];
    for (let start = 0; start < n; start++) {
      if (seen[start] || prob[start] < 0.3) continue;
      let sp = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, count = 0, sum = 0;
      seen[start] = 1; stack[sp++] = start;
      while (sp) {
        const i = stack[--sp];
        const x = i % w, y = (i / w) | 0;
        count++; sum += prob[i];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
        for (const k of nb) {
          if (k >= 0 && !seen[k] && prob[k] >= 0.3) { seen[k] = 1; stack[sp++] = k; }
        }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (count < 12 || bh < 3 || sum / count < 0.55) continue;
      // „Unclip“: DB-Kerne sind schmaler als der Text → um A·1,5/U erweitern
      const d = (bw * bh * 1.5) / (2 * (bw + bh));
      // Riesige „Zeilen“ (über ein Viertel der Bildhöhe): Fehltreffer oder Schrift, die auch ohne
      // Sonderbehandlung sauber bleibt – als Schriftbereich würde fast das ganze Bild hart gefüllt
      if (bh + 2 * d > 0.25 * h) continue;
      boxes.push({ x1: x0 - d, y1: y0 - d, x2: x1 + 1 + d, y2: y1 + 1 + d, lineH: bh + 2 * d });
    }

    // Gesichter hält das Modell gern für Schrift (gemessen: Porträt → ein „Textblock“ über Augen und
    // Nase mit derselben Sicherheit wie echte Schrift). Im Ergebnis entstünde dort ein hart gefülltes
    // Rechteck. Bereiche, die überwiegend in einem erkannten Gesicht liegen, deshalb verwerfen.
    let kept = boxes;
    if (boxes.length) {
      const faces = await detectFaces(source).catch(() => []);
      if (faces.length) {
        kept = boxes.filter((b) => !faces.some((f) => {
          const iw = Math.max(0, Math.min(b.x2 / w, f.x2) - Math.max(b.x1 / w, f.x1));
          const ih = Math.max(0, Math.min(b.y2 / h, f.y2) - Math.max(b.y1 / h, f.y1));
          return iw * ih > 0.5 * ((b.x2 - b.x1) / w) * ((b.y2 - b.y1) / h);
        }));
      }
    }

    // Benachbarte Zeilen/Wörter zu Blöcken zusammenfassen
    let blocks = kept.map((b) => ({ ...b }));
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let a = 0; a < blocks.length; a++) {
        for (let b = a + 1; b < blocks.length; b++) {
          const A = blocks[a], B = blocks[b];
          const g = Math.min(A.lineH, B.lineH) * 0.6;
          if (A.x1 - g < B.x2 && B.x1 - g < A.x2 && A.y1 - g < B.y2 && B.y1 - g < A.y2) {
            blocks[a] = {
              x1: Math.min(A.x1, B.x1), y1: Math.min(A.y1, B.y1),
              x2: Math.max(A.x2, B.x2), y2: Math.max(A.y2, B.y2),
              lineH: Math.max(A.lineH, B.lineH),
            };
            blocks.splice(b, 1);
            merged = true;
            break outer;
          }
        }
      }
    }
    const clamp = (v) => Math.max(0, Math.min(1, v));
    return blocks.map((b) => ({
      x1: clamp(b.x1 / w), y1: clamp(b.y1 / h), x2: clamp(b.x2 / w), y2: clamp(b.y2 / h),
      lineH: b.lineH / h,
    }));
  }

  /* ---------------------------------------------------------------- */
  /* Gesichter (UltraFace) & Gesichtsdetails                          */
  /* ---------------------------------------------------------------- */

  /** Findet Gesichter. Rückgabe: [{ x1, y1, x2, y2, score }] relativ (0..1). */
  async function detectFaces(source, minScore = 0.85) {
    const W = 320, H = 240;
    const input = toNCHW(pixels(source, W, H), W, H, { mean: [127, 127, 127], std: [128, 128, 128], scale: 1 });
    const res = await run('faces', { input: { data: input, dims: [1, 3, H, W] } }, ['scores', 'boxes']);
    const scores = res.scores.data, boxes = res.boxes.data;
    const cand = [];
    for (let i = 0; i < scores.length / 2; i++) {
      const p = scores[i * 2 + 1];
      if (p < minScore) continue;
      const clamp = (v) => Math.max(0, Math.min(1, v));
      cand.push({ x1: clamp(boxes[i * 4]), y1: clamp(boxes[i * 4 + 1]), x2: clamp(boxes[i * 4 + 2]), y2: clamp(boxes[i * 4 + 3]), score: p });
    }
    // Non-Maximum-Suppression
    cand.sort((a, b) => b.score - a.score);
    const iou = (a, b) => {
      const iw = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
      const ih = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
      const inter = iw * ih;
      const area = (r) => (r.x2 - r.x1) * (r.y2 - r.y1);
      return inter / (area(a) + area(b) - inter || 1);
    };
    const faces = [];
    for (const c of cand) {
      if (faces.every((f) => iou(f, c) < 0.3)) faces.push(c);
      if (faces.length >= 12) break;
    }
    return faces;
  }

  /** Bereich um ein Gesicht inkl. Stirn, Haaransatz und Kinn (relativ, geclampt). */
  function faceRegion(f) {
    const cx = (f.x1 + f.x2) / 2, cy = (f.y1 + f.y2) / 2;
    const rw = (f.x2 - f.x1) * 1.5, rh = (f.y2 - f.y1) * 1.5;
    const x1 = Math.max(0, cx - rw / 2), x2 = Math.min(1, cx + rw / 2);
    const y1 = Math.max(0, cy - rh * 0.55), y2 = Math.min(1, cy + rh * 0.45);
    return { x1, y1, x2, y2, cx, cy, rx: rw / 2, ry: rh / 2 };
  }

  /**
   * Zeichnet jedes Gesicht zusätzlich in hoher Auflösung als Strichzeichnung,
   * verstärkt die Linien und blendet es weich in die Gesamtzeichnung ein.
   */
  async function enhanceFacesLineArt(input, base, faces, strength, levels = {}, style = 'fine') {
    const out = new OffscreenCanvas(base.width, base.height);
    const octx = out.getContext('2d');
    octx.drawImage(base, 0, 0);
    const check = guard();
    for (const f of faces) {
      check();
      const r = faceRegion(f);
      const sx = r.x1 * input.width, sy = r.y1 * input.height;
      const sw = (r.x2 - r.x1) * input.width, sh = (r.y2 - r.y1) * input.height;
      if (sw < 8 || sh < 8) continue;
      const crop = new OffscreenCanvas(Math.round(sw), Math.round(sh));
      crop.getContext('2d').drawImage(input, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
      const face = await lineArt(crop, Math.round(512 + 192 * Math.min(2, strength)), style);

      // Linien kräftiger machen: Grauwerte nach unten ziehen (Weiß bleibt Weiß)
      const fctx = face.getContext('2d', { willReadFrequently: true });
      const img = fctx.getImageData(0, 0, face.width, face.height);
      const gamma = 1 + strength * 1.5;
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 255 * Math.pow(img.data[i] / 255, gamma);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      }
      fctx.putImageData(img, 0, 0);

      // Weicher, elliptischer Übergang zur Gesamtzeichnung
      const dx = r.x1 * base.width, dy = r.y1 * base.height;
      const dw = (r.x2 - r.x1) * base.width, dh = (r.y2 - r.y1) * base.height;
      const patch = new OffscreenCanvas(Math.max(1, Math.round(dw)), Math.max(1, Math.round(dh)));
      const pctx = patch.getContext('2d');
      pctx.imageSmoothingQuality = 'high';
      pctx.drawImage(face, 0, 0, patch.width, patch.height);
      // Außerhalb der Ellipse wird Weiß eingeblendet (neutral beim Abdunkeln)
      const ecx = (r.cx - r.x1) * base.width, ecy = (r.cy - r.y1) * base.height;
      pctx.save();
      pctx.translate(ecx, ecy);
      pctx.scale(r.rx * base.width, r.ry * base.height);
      const grad = pctx.createRadialGradient(0, 0, 0.65, 0, 0, 1);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(255,255,255,1)');
      pctx.fillStyle = grad;
      pctx.fillRect(-2, -2, 4, 4);
      pctx.restore();
      octx.globalCompositeOperation = 'darken';
      octx.drawImage(patch, dx, dy, dw, dh);
      octx.globalCompositeOperation = 'source-over';

      // Mund, Nase, Kinn, Wangen gezielt nachschärfen (eigene Regler, 0 = aus)
      for (const [key, level] of Object.entries(levels)) {
        if (!(level > 0)) continue;
        for (const region of Processing.faceFeatureRegions(f, key, true)) {
          await enhanceFeatureLineArt(input, octx, base.width, base.height, region, level, style);
        }
      }
    }
    return out;
  }

  /**
   * Gesichtsmerkmal (Mund, Nase) gezielt betonen. Lippen und Nase haben oft fast
   * Hauttöne; deutlich dunkel sind nur Lippenfuge, Mundwinkel, Nasenlöcher und -flügel.
   * 1. Bereich stark vergrößert erneut nachzeichnen (kräftige Linien)
   * 2. dunkle „Täler“ direkt im Foto finden und als Linie ergänzen
   * m: { cx, cy, rx, ry } relativ zum Bild
   */
  async function enhanceFeatureLineArt(input, octx, bw, bh, m, strength, style = 'fine') {
    const x1 = Math.max(0, m.cx - m.rx), x2 = Math.min(1, m.cx + m.rx);
    const y1 = Math.max(0, m.cy - m.ry), y2 = Math.min(1, m.cy + m.ry);
    const sw = (x2 - x1) * input.width, sh = (y2 - y1) * input.height;
    if (sw < 8 || sh < 4) return;
    const crop = new OffscreenCanvas(Math.max(1, Math.round(sw)), Math.max(1, Math.round(sh)));
    crop.getContext('2d').drawImage(input, x1 * input.width, y1 * input.height, sw, sh, 0, 0, crop.width, crop.height);

    // 1. Strichzeichnung des Mundes in hoher Vergrößerung. Nur das Standardmodell zeichnet
    // glatte Haut stark vergrößert sauber; Konturen/Skizze/Porträt/Kanten malen dort
    // Schattierung, die nach der Verstärkung als Flecken erscheint → nur Schritt 2.
    let lines;
    if (style === 'fine') {
      lines = await lineArt(crop, 512, style);
    } else {
      const sc = 512 / Math.max(crop.width, crop.height);
      lines = new OffscreenCanvas(Math.max(1, Math.round(crop.width * sc)), Math.max(1, Math.round(crop.height * sc)));
      const wctx = lines.getContext('2d');
      wctx.fillStyle = '#fff';
      wctx.fillRect(0, 0, lines.width, lines.height);
    }
    const W = lines.width, H = lines.height;
    const lctx = lines.getContext('2d', { willReadFrequently: true });
    const img = lctx.getImageData(0, 0, W, H);
    const gamma = 1 + strength * 3;

    // 2. Dunkle Täler: Pixel deutlich dunkler als ihre Umgebung
    const rgba = pixels(crop, W, H);
    const g = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) g[p] = 0.299 * rgba[p * 4] + 0.587 * rgba[p * 4 + 1] + 0.114 * rgba[p * 4 + 2];
    const rad = Math.max(2, Math.round(H * 0.12));
    const iw = W + 1;
    const integ = new Float64Array(iw * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += g[y * W + x];
        integ[(y + 1) * iw + x + 1] = integ[y * iw + x + 1] + row;
      }
    }
    const valley = new Float32Array(W * H);
    const vals = [];
    for (let y = 0; y < H; y++) {
      const ya = Math.max(0, y - rad), yb = Math.min(H - 1, y + rad);
      for (let x = 0; x < W; x++) {
        const xa = Math.max(0, x - rad), xb = Math.min(W - 1, x + rad);
        const sum = integ[(yb + 1) * iw + xb + 1] - integ[ya * iw + xb + 1] - integ[(yb + 1) * iw + xa] + integ[ya * iw + xa];
        const v = sum / ((xb - xa + 1) * (yb - ya + 1)) - g[y * W + x];
        valley[y * W + x] = v;
        if (v > 0) vals.push(v);
      }
    }
    vals.sort((a, b) => a - b);
    // nur die deutlichsten Täler (je stärker, desto mehr)
    const q = Math.max(0.8, 0.95 - strength * 0.06);
    const t = Math.max(10 + 2 * (m.floor || 0), vals.length ? vals[Math.floor(vals.length * q)] : 255);

    for (let p = 0; p < W * H; p++) {
      let v = Math.pow(img.data[p * 4] / 255, gamma);
      const vv = valley[p];
      if (vv > t) v = Math.min(v, 1 - Math.min(1, (vv - t) / t + 0.6));
      const out = Math.round(v * 255);
      img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = out;
    }
    lctx.putImageData(img, 0, 0);

    // weich elliptisch einblenden (abdunkeln)
    const dx = x1 * bw, dy = y1 * bh, dw = (x2 - x1) * bw, dh = (y2 - y1) * bh;
    const patch = new OffscreenCanvas(Math.max(1, Math.round(dw)), Math.max(1, Math.round(dh)));
    const pctx = patch.getContext('2d');
    pctx.imageSmoothingQuality = 'high';
    pctx.drawImage(lines, 0, 0, patch.width, patch.height);
    pctx.save();
    pctx.translate((m.cx - x1) * bw, (m.cy - y1) * bh);
    pctx.scale(m.rx * bw, m.ry * bh);
    const grad = pctx.createRadialGradient(0, 0, 0.55, 0, 0, 1);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    pctx.fillStyle = grad;
    pctx.fillRect(-2, -2, 4, 4);
    pctx.restore();
    octx.globalCompositeOperation = 'darken';
    octx.drawImage(patch, dx, dy, dw, dh);
    octx.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------------------------------------------- */
  /* Face Parsing (BiSeNet, CelebAMask-HQ-Klassen)                    */
  /* ---------------------------------------------------------------- */

  const PARSE = 512;
  // Klassen: 1 Haut, 2/3 Braue l/r, 4/5 Auge l/r, 10 Nase, 11 Mundinneres, 12/13 Ober-/Unterlippe
  const PARSE_GROUPS = {
    skin: [1], browL: [2], browR: [3], eyeL: [4], eyeR: [5], nose: [10], mouth: [11, 12, 13],
  };

  /**
   * Zerlegt ein Gesicht in Merkmale. m: DOMMatrix Quelle → 512×512-Ausschnitt (Gesicht mittig,
   * aufrecht). Rückgabe je Gruppe (siehe PARSE_GROUPS) der robuste Begrenzungsrahmen in
   * Quellkoordinaten { x1, y1, x2, y2, cx, cy, n } oder null, wenn das Merkmal nicht zu sehen ist.
   */
  async function parseFace(source, m) {
    const c = new OffscreenCanvas(PARSE, PARSE);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, PARSE, PARSE);
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(m);
    ctx.drawImage(source, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const rgba = ctx.getImageData(0, 0, PARSE, PARSE).data;
    const out = await run('faceparse', { input: { data: toNCHW(rgba, PARSE, PARSE, IMAGENET), dims: [1, 3, PARSE, PARSE] } }, ['output']);
    const logits = out.output.data;
    const C = out.output.dims[1], n = PARSE * PARSE;
    const cls2group = new Map();
    for (const [g, ids] of Object.entries(PARSE_GROUPS)) for (const id of ids) cls2group.set(id, g);

    // jede 2. Zeile/Spalte genügt für die Rahmen; Punkte zurück in Quellkoordinaten
    const inv = m.inverse();
    const pts = Object.fromEntries(Object.keys(PARSE_GROUPS).map((g) => [g, { xs: [], ys: [] }]));
    for (let y = 0; y < PARSE; y += 2) {
      for (let x = 0; x < PARSE; x += 2) {
        const p = y * PARSE + x;
        let best = 0, bv = -Infinity;
        for (let k = 0; k < C; k++) {
          const v = logits[k * n + p];
          if (v > bv) { bv = v; best = k; }
        }
        const g = cls2group.get(best);
        if (!g) continue;
        pts[g].xs.push(inv.a * x + inv.c * y + inv.e);
        pts[g].ys.push(inv.b * x + inv.d * y + inv.f);
      }
    }
    const q = (arr, t) => arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * t)))];
    const parts = {};
    for (const [g, { xs, ys }] of Object.entries(pts)) {
      if (xs.length < 6) { parts[g] = null; continue; }
      xs.sort((a, b) => a - b);
      ys.sort((a, b) => a - b);
      // 2-/98-%-Quantile: einzelne Fehlpixel verschieben den Rahmen nicht
      const x1 = q(xs, 0.02), x2 = q(xs, 0.98), y1 = q(ys, 0.02), y2 = q(ys, 0.98);
      parts[g] = { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, n: xs.length };
    }
    return parts;
  }

  /** Augenbereich (Auge + Braue) einer Seite aus den Merkmalen. */
  function eyeRegion(p, side) {
    const parts = [p[`eye${side}`], p[`brow${side}`]].filter(Boolean);
    if (!parts.length) return null;
    const x1 = Math.min(...parts.map((r) => r.x1)), x2 = Math.max(...parts.map((r) => r.x2));
    const y1 = Math.min(...parts.map((r) => r.y1)), y2 = Math.max(...parts.map((r) => r.y2));
    return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
  }

  /**
   * Genaue Lage von Mund, Nase, Kinn und Wangen für „Gesichtszüge hervorheben“ per Face Parsing.
   * faces: UltraFace-Rahmen (relativ). Ergänzt je Gesicht `parts` (relativ zum Bild):
   * { mouth: [{ cx, cy, rx, ry, lrx, lry }], nose: [...], chin: [...], cheeks: [links, rechts] }
   * (lrx/lry: größere Ellipse zum Nachzeichnen im Modus Linien). Fehlende Merkmale bleiben weg –
   * dafür gilt dann die geschätzte Lage aus dem Gesichtsrahmen.
   */
  async function faceParts(source, faces) {
    const W = source.width, H = source.height;
    const check = guard();
    const result = [];
    for (const f of faces) {
      check();
      // Ausschnitt wie bei CelebAMask-HQ: Gesicht mittig, mit Haaren und Kinn (ca. 2× Gesichtsrahmen)
      const fw = (f.x2 - f.x1) * W, fh = (f.y2 - f.y1) * H;
      const side = Math.max(fw, fh) * 2;
      if (side < 24) { result.push(f); continue; }
      const cx = ((f.x1 + f.x2) / 2) * W, cy = ((f.y1 + f.y2) / 2) * H;
      const sc = PARSE / side;
      const m = new DOMMatrix([sc, 0, 0, sc, PARSE / 2 - cx * sc, PARSE / 2 - cy * sc]);
      const p = await parseFace(source, m);
      result.push({ ...f, parts: partsToRegions(p, W, H) });
    }
    return result;
  }

  /** Merkmalsrahmen (Pixel) → Ellipsen relativ zum Bild. */
  function partsToRegions(p, W, H) {
    const out = {};
    const rel = (cx, cy, rx, ry, k = 1.25) => ({ cx: cx / W, cy: cy / H, rx: rx / W, ry: ry / H, lrx: (rx * k) / W, lry: (ry * k) / H });
    const skin = p.skin;
    const eyeL = eyeRegion(p, 'L'), eyeR = eyeRegion(p, 'R');
    const faceW = skin ? skin.x2 - skin.x1 : null;
    const faceH = skin ? skin.y2 - skin.y1 : null;
    if (p.mouth) {
      const hw = (p.mouth.x2 - p.mouth.x1) / 2, hh = (p.mouth.y2 - p.mouth.y1) / 2;
      out.mouth = [rel(p.mouth.cx, p.mouth.cy, hw * 1.25, Math.max(hh * 1.7, hw * 0.45), 1.3)];
    }
    if (p.nose) {
      // wie bisher vor allem Nasenspitze, -flügel und -löcher (unteres Drittel)
      const hw = (p.nose.x2 - p.nose.x1) / 2, h = p.nose.y2 - p.nose.y1;
      out.nose = [rel(p.nose.cx, p.nose.y1 + h * 0.72, hw * 1.2, Math.max(h * 0.32, hw * 0.6), 1.2)];
    }
    if (skin && p.mouth) {
      const hw = (p.mouth.x2 - p.mouth.x1) / 2;
      out.chin = [rel(p.mouth.cx, skin.y2 - faceH * 0.04, Math.max(hw * 1.3, faceW * 0.28), faceH * 0.11, 1.2)];
    }
    if (skin && (eyeL || eyeR) && p.mouth) {
      const eyeY = [p.eyeL, p.eyeR].filter(Boolean).map((e) => e.cy);
      const ey = eyeY.length ? eyeY.reduce((a, b) => a + b, 0) / eyeY.length : [eyeL, eyeR].filter(Boolean)[0].y2;
      const cy = ey + (p.mouth.cy - ey) * 0.55;
      const mid = p.nose ? p.nose.cx : p.mouth.cx;
      const r = faceW * 0.15;
      out.cheeks = [rel(mid - faceW * 0.27, cy, r, faceH * 0.13, 1.2), rel(mid + faceW * 0.27, cy, r, faceH * 0.13, 1.2)];
    }
    return out;
  }

  /**
   * Schutzzonen für die Kratzer-Erkennung per Face Parsing (Pixel der Quelle): Augen mit Brauen,
   * Nase, Mund. faces: YuNet-Gesichter mit 5 Punkten; ausgerichtet wie die Gesichtsrestaurierung.
   * Rückgabe je Gesicht [Auge, Auge, Nase, Mund] als Ellipsen { cx, cy, rx, ry }; nicht gefundene
   * Merkmale sind null (dafür gelten die geschätzten Zonen), ebenso das ganze Gesicht, wenn zu klein.
   */
  async function faceProtectZones(source, faces, align) {
    const check = guard();
    const result = [];
    for (const f of faces) {
      check();
      const ed = Math.hypot(f.kps[1][0] - f.kps[0][0], f.kps[1][1] - f.kps[0][1]);
      if (ed < 8) { result.push(null); continue; }
      const t = align(f.kps);
      const p = await parseFace(source, new DOMMatrix([t.a, t.b, -t.b, t.a, t.tx, t.ty]));
      const pad = ed * 0.08;
      const zone = (r, kx, ky) => r && { cx: r.cx, cy: r.cy, rx: ((r.x2 - r.x1) / 2) * kx + pad, ry: ((r.y2 - r.y1) / 2) * ky + pad };
      let eyes = [zone(eyeRegion(p, 'L'), 1.15, 1.3), zone(eyeRegion(p, 'R'), 1.15, 1.3)];
      if (!eyes.every(Boolean)) eyes = [null, null]; // ein Auge fehlt → beide geschätzt (sonst doppelt/fehlend)
      result.push([...eyes, zone(p.nose, 1.2, 1.1), zone(p.mouth, 1.25, 1.6)]);
    }
    return result;
  }

  /* ---------------------------------------------------------------- */
  /* Tiefenkarte (Depth Anything V2)                                  */
  /* ---------------------------------------------------------------- */

  /** Modell-ID je Tiefenmodell-Auswahl (Small ist Apache-2.0, Base/Large sind CC BY-NC 4.0). */
  const DEPTH_MODELS = { small: 'depth', base: 'depth_base', large: 'depth_large' };
  const depthModel = (choice) => DEPTH_MODELS[choice] || 'depth';

  /** Tiefenkarte als Graustufen-Canvas: nah = hell, fern = dunkel. model: Modell-ID (depth, depth_base, depth_large). */
  async function depthMap(source, longSide, model = 'depth') {
    const sc = longSide / Math.max(source.width, source.height);
    const w = roundTo(source.width * sc, 14);
    const h = roundTo(source.height * sc, 14);
    const input = toNCHW(pixels(source, w, h), w, h, IMAGENET);
    const out = await run(model, { pixel_values: { data: input, dims: [1, 3, h, w] } });
    const [, oh, ow] = out.dims;
    const outW = Math.round(source.width * sc), outH = Math.round(source.height * sc);
    return grayToCanvas(minMax(out.data), ow, oh, outW, outH);
  }

  /* ---------------------------------------------------------------- */
  /* KI-Vergrößerung (Real-ESRGAN general x4v3)                       */
  /* ---------------------------------------------------------------- */

  let UPSCALE_MAX_INPUT = 1024; // je nach Arbeitsspeicher (configure)
  const TILE = 192;
  const OVERLAP = 12;

  /** Vergrößert 4-fach in Kacheln. onProgress(done, total). */
  async function upscale(bitmap, onProgress) {
    const sc = Math.min(1, UPSCALE_MAX_INPUT / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * sc));
    const h = Math.max(1, Math.round(bitmap.height * sc));
    const src = pixels(bitmap, w, h);
    const W = w * 4, H = h * 4;
    const out = new ImageData(W, H);

    const tilesX = Math.ceil(w / TILE), tilesY = Math.ceil(h / TILE);
    const tiles = [];
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x0 = tx * TILE, y0 = ty * TILE;
        const x1 = Math.min(w, x0 + TILE), y1 = Math.min(h, y0 + TILE);
        // Kachel mit Überlappung, damit an den Rändern keine Nähte entstehen
        const px0 = Math.max(0, x0 - OVERLAP), py0 = Math.max(0, y0 - OVERLAP);
        const px1 = Math.min(w, x1 + OVERLAP), py1 = Math.min(h, y1 + OVERLAP);
        tiles.push({ x0, y0, x1, y1, px0, py0, pw: px1 - px0, ph: py1 - py0 });
      }
    }
    let done = 0;
    await pipelined(tiles, ({ px0, py0, pw, ph }) => {
      const n = pw * ph;
      const input = new Float32Array(3 * n);
      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) {
          const i = ((py0 + y) * w + px0 + x) * 4;
          const p = y * pw + x;
          input[p] = src[i] / 255;
          input[n + p] = src[i + 1] / 255;
          input[2 * n + p] = src[i + 2] / 255;
        }
      }
      return run('esrgan', { input: { data: input, dims: [1, 3, ph, pw] } });
    }, (res, { x0, y0, x1, y1, px0, py0, pw, ph }) => {
      const ow = pw * 4, on = ow * ph * 4;
      const d = res.data;
      for (let y = (y0 - py0) * 4; y < (y1 - py0) * 4; y++) {
        for (let x = (x0 - px0) * 4; x < (x1 - px0) * 4; x++) {
          const p = y * ow + x;
          const o = ((py0 * 4 + y) * W + px0 * 4 + x) * 4;
          out.data[o] = Math.max(0, Math.min(255, Math.round(d[p] * 255)));
          out.data[o + 1] = Math.max(0, Math.min(255, Math.round(d[on + p] * 255)));
          out.data[o + 2] = Math.max(0, Math.min(255, Math.round(d[2 * on + p] * 255)));
          out.data[o + 3] = 255;
        }
      }
      onProgress?.(++done, tiles.length);
    });
    const canvas = new OffscreenCanvas(W, H);
    canvas.getContext('2d').putImageData(out, 0, 0);
    return canvas;
  }

  function configure({ upscaleMaxInput } = {}) {
    if (upscaleMaxInput) UPSCALE_MAX_INPUT = upscaleMaxInput;
  }

  return { configure, run, pipelined, abort, beginRun, guard, get cacheHits() { return cacheHits; }, pixels, toNCHW, detectText, segment, samEmbedding, samMask, sam2Embedding, sam2Mask, lineArt, lineModel, lineFixedSize, depthMap, depthModel, upscale, detectFaces, enhanceFacesLineArt, faceRegion, faceParts, faceProtectZones };
})();
