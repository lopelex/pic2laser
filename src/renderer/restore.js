'use strict';

/* global AI */

/**
 * Alte Fotos restaurieren:
 *  - Rauschen & Körnung entfernen (SCUNet, kachelweise)
 *  - Kratzer & Staub finden (klassische Bildanalyse) und auffüllen (LaMa)
 *  - Gesichter restaurieren (YuNet-Gesichtspunkte → Ausrichtung → RestoreFormer++)
 */
const Restore = (() => {
  // Arbeitsgröße und Kachelgröße – werden je nach Arbeitsspeicher des Rechners angepasst (configure)
  let MAX_SIDE = 1280;

  /** Arbeitskopie des Bildes (höchstens MAX_SIDE), als Canvas. */
  function workingCopy(source) {
    const sc = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
    const w = Math.max(1, Math.round(source.width * sc));
    const h = Math.max(1, Math.round(source.height * sc));
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    return c;
  }

  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

  /* ---------------------------------------------------------------- */
  /* Rauschen entfernen (SCUNet)                                      */
  /* ---------------------------------------------------------------- */

  let DN_TILE = 320;
  const DN_OVERLAP = 16;

  function denoiseTiles(w, h) {
    const step = DN_TILE - 2 * DN_OVERLAP;
    return Math.ceil(w / step) * Math.ceil(h / step);
  }

  /** Entrauscht die Canvas in Kacheln (in place). onProgress(done, total). */
  async function denoise(canvas, onProgress) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const src = ctx.getImageData(0, 0, w, h);
    const out = new ImageData(w, h);
    const step = DN_TILE - 2 * DN_OVERLAP;
    const total = denoiseTiles(w, h);
    const tiles = [];
    for (let ty = 0; ty < h; ty += step) {
      for (let tx = 0; tx < w; tx += step) {
        const x0 = tx, y0 = ty, x1 = Math.min(w, tx + step), y1 = Math.min(h, ty + step);
        const px0 = Math.max(0, x0 - DN_OVERLAP), py0 = Math.max(0, y0 - DN_OVERLAP);
        const px1 = Math.min(w, x1 + DN_OVERLAP), py1 = Math.min(h, y1 + DN_OVERLAP);
        // SCUNet braucht Seitenlängen als Vielfache von 64 → Kachel spiegelnd auffüllen
        const pw = px1 - px0, ph = py1 - py0;
        tiles.push({ x0, y0, x1, y1, px0, py0, pw, ph, iw: Math.ceil(pw / 64) * 64, ih: Math.ceil(ph / 64) * 64 });
      }
    }
    let done = 0;
    // Kacheln lesen nur aus `src` und schreiben nur nach `out` → überlappend abarbeitbar
    await AI.pipelined(tiles, ({ px0, py0, pw, ph, iw, ih }) => {
      const n = iw * ih;
      const input = new Float32Array(3 * n);
      for (let y = 0; y < ih; y++) {
        const sy = py0 + (y < ph ? y : 2 * ph - y - 2 >= 0 ? 2 * ph - y - 2 : ph - 1);
        for (let x = 0; x < iw; x++) {
          const sx = px0 + (x < pw ? x : 2 * pw - x - 2 >= 0 ? 2 * pw - x - 2 : pw - 1);
          const i = (sy * w + sx) * 4, p = y * iw + x;
          input[p] = src.data[i] / 255;
          input[n + p] = src.data[i + 1] / 255;
          input[2 * n + p] = src.data[i + 2] / 255;
        }
      }
      return AI.run('scunet', { image: { data: input, dims: [1, 3, ih, iw] } });
    }, (res, { x0, y0, x1, y1, px0, py0, iw, ih }) => {
      const n = iw * ih;
      const d = res.data;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = (y - py0) * iw + (x - px0), o = (y * w + x) * 4;
          out.data[o] = clamp255(d[p] * 255);
          out.data[o + 1] = clamp255(d[n + p] * 255);
          out.data[o + 2] = clamp255(d[2 * n + p] * 255);
          out.data[o + 3] = 255;
        }
      }
      onProgress?.(++done, total);
    });
    ctx.putImageData(out, 0, 0);
    return canvas;
  }

  /* ---------------------------------------------------------------- */
  /* Kratzer & Staub finden (klassisch) und auffüllen (LaMa)          */
  /* ---------------------------------------------------------------- */

  /** Graustufen-Minimum/Maximum (separabel, quadratisch). */
  function minMaxFilter(src, w, h, r, isMax) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    const pick = isMax ? Math.max : Math.min;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = src[y * w + x];
        for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, src[y * w + k]);
        tmp[y * w + x] = v;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = tmp[y * w + x];
        for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x]);
        out[y * w + x] = v;
      }
    }
    return out;
  }

  /**
   * Findet Kratzer (dünne, lange helle/dunkle Linien) und Staub (kleine, scharfe Flecken).
   * sensitivity 1..100. protect: Ellipsen { cx, cy, rx, ry } in Pixeln, die nie verändert werden
   * (Augen mit Brauen, Nase, Mund – dort sind dünne/kleine dunkle Strukturen echte Details).
   * Rückgabe: { mask: Uint8Array, count }
   */
  function detectScratches(canvas, sensitivity, protect = []) {
    const w = canvas.width, h = canvas.height;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const raw = new Float32Array(w * h);
    for (let p = 0; p < w * h; p++) raw[p] = 0.299 * d[p * 4] + 0.587 * d[p * 4 + 1] + 0.114 * d[p * 4 + 2];
    // leicht glätten, damit Filmkorn nicht als Staub zählt
    const g = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            sum += raw[yy * w + xx]; n++;
          }
        }
        g[y * w + x] = sum / n;
      }
    }

    const r = Math.max(2, Math.round(Math.max(w, h) / 450));
    // Öffnen entfernt helle, Schließen dunkle dünne Strukturen → Differenz = Kratzer/Staub.
    // Auf dem Originalbild erkennen (1-px-Kratzer bleiben sichtbar) und zusätzlich verlangen,
    // dass die Abweichung auch geglättet noch besteht – zufälliges Filmkorn fällt so heraus.
    const tophats = (img) => ({
      open: minMaxFilter(minMaxFilter(img, w, h, r, false), w, h, r, true),
      close: minMaxFilter(minMaxFilter(img, w, h, r, true), w, h, r, false),
    });
    const fine = tophats(raw), smooth = tophats(g);
    const T = 70 - sensitivity * 0.55;
    const Ts = T * 0.35;
    const cand = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      const bright = raw[p] - fine.open[p] > T && g[p] - smooth.open[p] > Ts;
      const dark = fine.close[p] - raw[p] > T && smooth.close[p] - g[p] > Ts;
      if (bright || dark) cand[p] = 1;
    }
    // Augen/Brauen, Nase und Mund schützen
    for (const e of protect) {
      for (let y = Math.max(0, Math.floor(e.cy - e.ry)); y <= Math.min(h - 1, Math.ceil(e.cy + e.ry)); y++) {
        for (let x = Math.max(0, Math.floor(e.cx - e.rx)); x <= Math.min(w - 1, Math.ceil(e.cx + e.rx)); x++) {
          const nx = (x - e.cx) / e.rx, ny = (y - e.cy) / e.ry;
          if (nx * nx + ny * ny <= 1) cand[y * w + x] = 0;
        }
      }
    }

    // Zusammenhängende Bereiche bewerten: lang & dünn (Kratzer) oder klein (Staub)
    const mask = new Uint8Array(w * h);
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    const pixels = [];
    let count = 0;
    for (let s = 0; s < w * h; s++) {
      if (!cand[s] || seen[s]) continue;
      let sp = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      pixels.length = 0;
      seen[s] = 1; stack[sp++] = s;
      while (sp) {
        const i = stack[--sp];
        pixels.push(i);
        const x = i % w, y = (i / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const k = ny * w + nx;
            if (cand[k] && !seen[k]) { seen[k] = 1; stack[sp++] = k; }
          }
        }
      }
      const area = pixels.length;
      const len = Math.hypot(x1 - x0 + 1, y1 - y0 + 1);
      const thickness = area / len;
      const scratch = len >= r * 10 && thickness <= r * 1.6;
      const dust = area <= (r * 3) * (r * 3) && len <= r * 5;
      if (scratch || dust) {
        count++;
        for (const i of pixels) mask[i] = 1;
      }
    }
    // Maske etwas erweitern, damit Ränder sauber mit aufgefüllt werden
    return { mask: dilate(mask, w, h, Math.max(1, Math.round(r * 0.75))), count };
  }

  function dilate(src, w, h, r) {
    const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!src[y * w + x]) continue;
        for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) tmp[y * w + k] = 1;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!tmp[y * w + x]) continue;
        for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) out[k * w + x] = 1;
      }
    }
    return out;
  }

  const LAMA = 512;

  /** Ausschnitte (512er), die Maskenpixel enthalten. */
  function inpaintTiles(mask, w, h) {
    const step = LAMA - 64;
    const tiles = [];
    for (let ty = 0; ty < Math.max(1, h - 64); ty += step) {
      for (let tx = 0; tx < Math.max(1, w - 64); tx += step) {
        const x0 = Math.min(tx, Math.max(0, w - LAMA)), y0 = Math.min(ty, Math.max(0, h - LAMA));
        const x1 = Math.min(w, x0 + LAMA), y1 = Math.min(h, y0 + LAMA);
        let any = false;
        for (let y = y0; y < y1 && !any; y++) {
          for (let x = x0; x < x1; x++) if (mask[y * w + x]) { any = true; break; }
        }
        if (any) tiles.push({ x0, y0, x1, y1 });
      }
    }
    return tiles;
  }

  /** Füllt die maskierten Stellen mit LaMa (in place). onProgress(done, total). */
  async function inpaint(canvas, mask, onProgress) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tiles = inpaintTiles(mask, w, h);
    let done = 0;
    for (const t of tiles) {
      const img = ctx.getImageData(t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0);
      const tw = img.width, th = img.height;
      const n = LAMA * LAMA;
      const image = new Float32Array(3 * n);
      const m = new Float32Array(n);
      for (let y = 0; y < LAMA; y++) {
        for (let x = 0; x < LAMA; x++) {
          const sx = Math.min(tw - 1, x), sy = Math.min(th - 1, y); // Rand auffüllen, falls Bild kleiner
          const i = (sy * tw + sx) * 4, p = y * LAMA + x;
          image[p] = img.data[i] / 255;
          image[n + p] = img.data[i + 1] / 255;
          image[2 * n + p] = img.data[i + 2] / 255;
          m[p] = x < tw && y < th && mask[(t.y0 + y) * w + t.x0 + x] ? 1 : 0;
        }
      }
      const res = await AI.run('lama', {
        image: { data: image, dims: [1, 3, LAMA, LAMA] },
        mask: { data: m, dims: [1, 1, LAMA, LAMA] },
      });
      const o = res.data;
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const p = y * LAMA + x;
          if (!m[p]) continue;
          const i = (y * tw + x) * 4;
          img.data[i] = clamp255(o[p]);
          img.data[i + 1] = clamp255(o[n + p]);
          img.data[i + 2] = clamp255(o[2 * n + p]);
        }
      }
      ctx.putImageData(img, t.x0, t.y0);
      onProgress?.(++done, tiles.length);
    }
    return canvas;
  }

  /* ---------------------------------------------------------------- */
  /* Gesichter: Gesichtspunkte (YuNet) & Restaurierung (RestoreFormer++) */
  /* ---------------------------------------------------------------- */

  /** Schutzzonen für die Kratzer-Erkennung: Augen mit Brauen, Nase, Mund (aus den 5 Gesichtspunkten). */
  function protectZones(faces) {
    const zones = [];
    for (const f of faces) {
      const [le, re, nose, ml, mr] = f.kps;
      const ed = Math.hypot(re[0] - le[0], re[1] - le[1]);
      for (const eye of [le, re]) zones.push({ cx: eye[0], cy: eye[1] - ed * 0.15, rx: ed * 0.45, ry: ed * 0.5 });
      zones.push({ cx: nose[0], cy: nose[1], rx: ed * 0.32, ry: ed * 0.3 });
      const mw = Math.hypot(mr[0] - ml[0], mr[1] - ml[1]);
      zones.push({ cx: (ml[0] + mr[0]) / 2, cy: (ml[1] + mr[1]) / 2, rx: mw / 2 + ed * 0.15, ry: ed * 0.28 });
    }
    return zones;
  }

  /** Gesichter mit 5 Punkten (Augen, Nase, Mundwinkel), Koordinaten in Pixeln der Quelle. */
  async function landmarks(source, minScore = 0.7) {
    const S = 640;
    const sc = S / Math.max(source.width, source.height);
    const c = new OffscreenCanvas(S, S);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    ctx.drawImage(source, 0, 0, source.width * sc, source.height * sc);
    const d = ctx.getImageData(0, 0, S, S).data;
    const n = S * S;
    const input = new Float32Array(3 * n); // BGR, 0..255
    for (let p = 0; p < n; p++) {
      input[p] = d[p * 4 + 2];
      input[n + p] = d[p * 4 + 1];
      input[2 * n + p] = d[p * 4];
    }
    const names = [];
    for (const st of [8, 16, 32]) names.push(`cls_${st}`, `obj_${st}`, `bbox_${st}`, `kps_${st}`);
    const res = await AI.run('yunet', { input: { data: input, dims: [1, 3, S, S] } }, names);
    const cand = [];
    for (const st of [8, 16, 32]) {
      const cols = S / st;
      const cls = res[`cls_${st}`].data, obj = res[`obj_${st}`].data, bb = res[`bbox_${st}`].data, kp = res[`kps_${st}`].data;
      for (let i = 0; i < cls.length; i++) {
        const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
        if (score < minScore) continue;
        const r = Math.floor(i / cols), col = i % cols;
        const cx = (col + bb[i * 4]) * st, cy = (r + bb[i * 4 + 1]) * st;
        const bw = Math.exp(bb[i * 4 + 2]) * st, bh = Math.exp(bb[i * 4 + 3]) * st;
        const kps = [];
        for (let k = 0; k < 5; k++) kps.push([(col + kp[i * 10 + 2 * k]) * st / sc, (r + kp[i * 10 + 2 * k + 1]) * st / sc]);
        cand.push({ score, x1: (cx - bw / 2) / sc, y1: (cy - bh / 2) / sc, x2: (cx + bw / 2) / sc, y2: (cy + bh / 2) / sc, kps });
      }
    }
    cand.sort((a, b) => b.score - a.score);
    const faces = [];
    const iou = (a, b) => {
      const iw = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
      const ih = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
      const inter = iw * ih;
      return inter / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter || 1);
    };
    for (const c of cand) if (faces.every((f) => iou(f, c) < 0.3)) faces.push(c);
    return faces.slice(0, 12);
  }

  // FFHQ-Vorlage (facexlib) für 512×512: Augen, Nase, Mundwinkel
  const TEMPLATE = [[192.98138, 239.94708], [318.90277, 240.1936], [256.63416, 314.01935], [201.26117, 371.41043], [313.08905, 371.15118]];

  /** Ähnlichkeitstransformation (Rotation, Skalierung, Verschiebung) per kleinster Quadrate: src → dst. */
  function similarity(src, dst) {
    const n = src.length;
    let sx = 0, sy = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
    sx /= n; sy /= n; dx /= n; dy /= n;
    let num1 = 0, num2 = 0, den = 0;
    for (let i = 0; i < n; i++) {
      const px = src[i][0] - sx, py = src[i][1] - sy, qx = dst[i][0] - dx, qy = dst[i][1] - dy;
      num1 += px * qx + py * qy;
      num2 += px * qy - py * qx;
      den += px * px + py * py;
    }
    const a = num1 / den, b = num2 / den;
    return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
  }

  /**
   * Restauriert alle Gesichter der Canvas (in place).
   * strength 0..1: Mischung zwischen Original und restauriertem Gesicht.
   */
  async function restoreFaces(canvas, faces, strength, onProgress) {
    const ctx = canvas.getContext('2d');
    let done = 0;
    for (const f of faces) {
      const eyeDist = Math.hypot(f.kps[1][0] - f.kps[0][0], f.kps[1][1] - f.kps[0][1]);
      if (eyeDist < 8) { onProgress?.(++done, faces.length); continue; }
      const t = similarity(f.kps, TEMPLATE);

      // 1. Gesicht ausrichten und auf 512×512 ausschneiden
      const crop = new OffscreenCanvas(512, 512);
      const cctx = crop.getContext('2d', { willReadFrequently: true });
      cctx.imageSmoothingQuality = 'high';
      cctx.setTransform(t.a, t.b, -t.b, t.a, t.tx, t.ty);
      cctx.drawImage(canvas, 0, 0);
      cctx.setTransform(1, 0, 0, 1, 0, 0);
      const px = cctx.getImageData(0, 0, 512, 512).data;
      const n = 512 * 512;
      const input = new Float32Array(3 * n);
      for (let p = 0; p < n; p++) {
        input[p] = px[p * 4] / 127.5 - 1;
        input[n + p] = px[p * 4 + 1] / 127.5 - 1;
        input[2 * n + p] = px[p * 4 + 2] / 127.5 - 1;
      }

      // 2. Restaurieren (Werte −1..1)
      const out = await AI.run('restoreformer', { input: { data: input, dims: [1, 3, 512, 512] } });
      const img = cctx.createImageData(512, 512);
      for (let p = 0; p < n; p++) {
        img.data[p * 4] = clamp255((out.data[p] + 1) * 127.5);
        img.data[p * 4 + 1] = clamp255((out.data[n + p] + 1) * 127.5);
        img.data[p * 4 + 2] = clamp255((out.data[2 * n + p] + 1) * 127.5);
        img.data[p * 4 + 3] = 255;
      }

      // Tonwerte großflächig vom Original übernehmen (Farbstich/Helligkeit des Modells ausgleichen):
      // Ergebnis = Restauriert + Tiefpass(Original) − Tiefpass(Restauriert)
      const lowOrig = blurred(crop, 20), lowRest = blurred(img, 20);
      for (let i = 0; i < img.data.length; i += 4) {
        for (let c = 0; c < 3; c++) img.data[i + c] = clamp255(img.data[i + c] + lowOrig[i + c] - lowRest[i + c]);
      }
      cctx.putImageData(img, 0, 0);

      // 3. Weiche Maske (Gesichtsoval der Vorlage), damit der Übergang unsichtbar bleibt
      cctx.save();
      cctx.globalCompositeOperation = 'destination-in';
      cctx.translate(256, 300);
      cctx.scale(205, 245);
      const grad = cctx.createRadialGradient(0, 0, 0.6, 0, 0, 1);
      grad.addColorStop(0, `rgba(0,0,0,${strength})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      cctx.fillStyle = grad;
      cctx.fillRect(-2, -2, 4, 4);
      cctx.restore();

      // 4. Zurück an die ursprüngliche Stelle (inverse Transformation)
      const inv = new DOMMatrix([t.a, t.b, -t.b, t.a, t.tx, t.ty]).inverse();
      ctx.save();
      ctx.imageSmoothingQuality = 'high';
      ctx.setTransform(inv.a, inv.b, inv.c, inv.d, inv.e, inv.f);
      ctx.drawImage(crop, 0, 0);
      ctx.restore();
      onProgress?.(++done, faces.length);
    }
    return canvas;
  }

  /** Weichgezeichnete Pixel einer Canvas bzw. ImageData (Gauß über Canvas-Filter). */
  function blurred(src, radius) {
    let source = src;
    if (src instanceof ImageData) {
      source = new OffscreenCanvas(src.width, src.height);
      source.getContext('2d').putImageData(src, 0, 0);
    }
    const c = new OffscreenCanvas(source.width, source.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.filter = `blur(${radius}px)`;
    // Rand spiegeln wäre ideal; großzügig über den Rand zeichnen verhindert dunkle Säume
    ctx.drawImage(source, -radius, -radius, source.width + 2 * radius, source.height + 2 * radius);
    return ctx.getImageData(0, 0, c.width, c.height).data;
  }

  function configure({ maxSide, denoiseTile } = {}) {
    if (maxSide) MAX_SIDE = maxSide;
    if (denoiseTile) DN_TILE = denoiseTile;
  }

  return { configure, get MAX_SIDE() { return MAX_SIDE; }, workingCopy, denoise, denoiseTiles, detectScratches, protectZones, inpaint, inpaintTiles, landmarks, restoreFaces };
})();
