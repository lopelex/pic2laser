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

  async function run(id, feeds, outputs) {
    const res = await window.api.models.run(id, feeds, outputs);
    return outputs ? res : Object.values(res)[0];
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
    ai: { model: 'u2netp', size: 320, mean: IMAGENET.mean, std: IMAGENET.std, scale: 'max' },
    isnet: { model: 'isnet', size: 1024, mean: [0.5, 0.5, 0.5], std: [1, 1, 1], scale: 'max' },
    birefnet: { model: 'birefnet', size: 1024, mean: IMAGENET.mean, std: IMAGENET.std, scale: 1 / 255 },
  };

  /** Liefert die rohe Motivmaske { data (0..1), w, h }. */
  async function segment(method, bitmap) {
    if (method === 'modnet') {
      // MODNet: kürzere Seite 512, beide Seiten Vielfache von 32, Werte auf -1..1
      const sc = 512 / Math.min(bitmap.width, bitmap.height);
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
    const name = method === 'ai' ? 'input.1' : 'input_image';
    const out = await run(cfg.model, { [name]: { data: input, dims: [1, 3, size, size] } });
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

  /** Liefert eine Canvas mit dunklen Linien auf Weiß, gleiche Seitenverhältnisse wie die Quelle. */
  async function lineArt(source, maxSide) {
    const sc = maxSide / Math.max(source.width, source.height);
    const w = roundTo(source.width * sc, 8);
    const h = roundTo(source.height * sc, 8);
    const input = toNCHW(pixels(source, w, h), w, h);
    const out = await run('lineart', { input: { data: input, dims: [1, 3, h, w] } });
    const outW = Math.round(source.width * sc), outH = Math.round(source.height * sc);
    return grayToCanvas(lineLevels(out.data), w, h, outW, outH);
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
  async function enhanceFacesLineArt(input, base, faces, strength, { mouth = 1, nose = 0.5 } = {}) {
    const out = new OffscreenCanvas(base.width, base.height);
    const octx = out.getContext('2d');
    octx.drawImage(base, 0, 0);
    for (const f of faces) {
      const r = faceRegion(f);
      const sx = r.x1 * input.width, sy = r.y1 * input.height;
      const sw = (r.x2 - r.x1) * input.width, sh = (r.y2 - r.y1) * input.height;
      if (sw < 8 || sh < 8) continue;
      const crop = new OffscreenCanvas(Math.round(sw), Math.round(sh));
      crop.getContext('2d').drawImage(input, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
      const face = await lineArt(crop, Math.round(512 + 192 * Math.min(2, strength)));

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

      // Mund und Nase gezielt nachschärfen (Regler „Mund“/„Nase“, 0 = aus)
      const fw = f.x2 - f.x1, fh = f.y2 - f.y1, fcx = (f.x1 + f.x2) / 2;
      if (mouth > 0) {
        await enhanceFeatureLineArt(input, octx, base.width, base.height,
          { cx: fcx, cy: f.y1 + fh * 0.78, rx: fw * 0.38, ry: fh * 0.17 }, mouth);
      }
      if (nose > 0) {
        await enhanceFeatureLineArt(input, octx, base.width, base.height,
          { cx: fcx, cy: f.y1 + fh * 0.56, rx: fw * 0.22, ry: fh * 0.16 }, nose);
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
  async function enhanceFeatureLineArt(input, octx, bw, bh, m, strength) {
    const x1 = Math.max(0, m.cx - m.rx), x2 = Math.min(1, m.cx + m.rx);
    const y1 = Math.max(0, m.cy - m.ry), y2 = Math.min(1, m.cy + m.ry);
    const sw = (x2 - x1) * input.width, sh = (y2 - y1) * input.height;
    if (sw < 8 || sh < 4) return;
    const crop = new OffscreenCanvas(Math.max(1, Math.round(sw)), Math.max(1, Math.round(sh)));
    crop.getContext('2d').drawImage(input, x1 * input.width, y1 * input.height, sw, sh, 0, 0, crop.width, crop.height);

    // 1. Strichzeichnung des Mundes in hoher Vergrößerung
    const lines = await lineArt(crop, 512);
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
    const t = Math.max(10, vals.length ? vals[Math.floor(vals.length * q)] : 255);

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
  /* Tiefenkarte (Depth Anything V2)                                  */
  /* ---------------------------------------------------------------- */

  /** Tiefenkarte als Graustufen-Canvas: nah = hell, fern = dunkel. */
  async function depthMap(source, longSide) {
    const sc = longSide / Math.max(source.width, source.height);
    const w = roundTo(source.width * sc, 14);
    const h = roundTo(source.height * sc, 14);
    const input = toNCHW(pixels(source, w, h), w, h, IMAGENET);
    const out = await run('depth', { pixel_values: { data: input, dims: [1, 3, h, w] } });
    const [, oh, ow] = out.dims;
    const outW = Math.round(source.width * sc), outH = Math.round(source.height * sc);
    return grayToCanvas(minMax(out.data), ow, oh, outW, outH);
  }

  /* ---------------------------------------------------------------- */
  /* KI-Vergrößerung (Real-ESRGAN general x4v3)                       */
  /* ---------------------------------------------------------------- */

  const UPSCALE_MAX_INPUT = 1024;
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
    const total = tilesX * tilesY;
    let done = 0;
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x0 = tx * TILE, y0 = ty * TILE;
        const x1 = Math.min(w, x0 + TILE), y1 = Math.min(h, y0 + TILE);
        // Kachel mit Überlappung, damit an den Rändern keine Nähte entstehen
        const px0 = Math.max(0, x0 - OVERLAP), py0 = Math.max(0, y0 - OVERLAP);
        const px1 = Math.min(w, x1 + OVERLAP), py1 = Math.min(h, y1 + OVERLAP);
        const pw = px1 - px0, ph = py1 - py0;
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
        const res = await run('esrgan', { input: { data: input, dims: [1, 3, ph, pw] } });
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
        onProgress?.(++done, total);
      }
    }
    const canvas = new OffscreenCanvas(W, H);
    canvas.getContext('2d').putImageData(out, 0, 0);
    return canvas;
  }

  return { segment, samEmbedding, samMask, lineArt, depthMap, upscale, detectFaces, enhanceFacesLineArt, faceRegion };
})();
