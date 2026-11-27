'use strict';

/**
 * Modus „Farben“: zerlegt ein Bild in wenige Farbflächen (z. B. für Stickerei oder Laser mit
 * mehreren Ebenen). Ablauf:
 *  1. Farbhistogramm (6 Bit je Kanal) der deckenden Pixel, Farbabstand im Lab-Farbraum (CIE76)
 *  2. gewichtetes k-Means über die Histogramm-Fächer (deterministisch: k-Means++ ohne Zufall)
 *     – „Auto“ erhöht k, bis fast jedes Pixel durch eine Farbe oder eine Mischung zweier Farben
 *       (Kantenglättung) erklärt ist
 *  3. Mischfarben an Kanten (schmale Säume, die zwischen zwei anderen Farben liegen) auflösen,
 *     Hintergrund (vom Bildrand aus) entfernen
 *  4. optional auf eine Garnpalette einrasten, Bearbeitungen (ausblenden, umfärben, zusammenführen)
 *  5. Glätten (Mehrheitsfilter) und Kleinstflächen der Nachbarfarbe zuschlagen
 *  6. Ebenen nach Fläche sortiert (größte unten)
 * Läuft im Pipeline-Worker; ohne DOM-Abhängigkeiten.
 */
const Colors = (() => {
  const EMPTY = 255; // Label: transparent / freigestellt / weggelassen
  const BITS = 6; // Auflösung des Histogramms je Kanal
  const SHIFT = 8 - BITS;
  const BINS = 1 << (3 * BITS);
  const AUTO_MAX = 10;
  const MAX_COLORS = 32;
  const STEP_MAX = 16; // bis hierher je Farbe ein k-Means-Lauf, darüber alle weiteren Startzentren auf einmal

  /* ---------------- Farbräume ---------------- */

  const LIN = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function labOf(r, g, b) {
    const R = LIN[r | 0], G = LIN[g | 0], B = LIN[b | 0];
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const x = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047);
    const y = f(0.2126729 * R + 0.7151522 * G + 0.072175 * B);
    const z = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }

  const hex2 = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  const toHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  function fromHex(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ''));
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  /* ---------------- Garnpaletten ---------------- */

  // Brother-Standardfarben (PEC-Palette der PES-Dateien); Farbwerte wie in gängigen Stickprogrammen,
  // auf dem Bildschirm nur eine Näherung an das echte Garn
  const BROTHER = [
    ['Preußischblau', 14, 31, 124], ['Blau', 10, 85, 163], ['Blaugrün', 0, 135, 119], ['Kornblumenblau', 75, 107, 175],
    ['Rot', 237, 23, 31], ['Rotbraun', 209, 92, 0], ['Magenta', 145, 54, 151], ['Hellflieder', 228, 154, 203],
    ['Flieder', 145, 95, 172], ['Mintgrün', 158, 214, 125], ['Tiefgold', 232, 169, 0], ['Orange', 254, 186, 53],
    ['Gelb', 255, 255, 0], ['Limettengrün', 112, 188, 31], ['Messing', 186, 152, 0], ['Silber', 168, 168, 168],
    ['Rostbraun', 125, 111, 0], ['Cremebraun', 255, 255, 179], ['Zinngrau', 79, 85, 86], ['Schwarz', 0, 0, 0],
    ['Ultramarin', 11, 61, 145], ['Königspurpur', 119, 1, 118], ['Dunkelgrau', 41, 49, 51], ['Dunkelbraun', 42, 19, 1],
    ['Tiefrosa', 246, 74, 138], ['Hellbraun', 178, 118, 36], ['Lachsrosa', 252, 187, 197], ['Zinnoberrot', 254, 55, 15],
    ['Weiß', 240, 240, 240], ['Violett', 106, 28, 138], ['Meeresgrün', 168, 221, 196], ['Himmelblau', 37, 132, 187],
    ['Kürbis', 254, 179, 67], ['Cremegelb', 255, 243, 107], ['Khaki', 208, 166, 96], ['Lehmbraun', 209, 84, 0],
    ['Blattgrün', 102, 186, 73], ['Pfauenblau', 19, 74, 70], ['Grau', 135, 135, 135], ['Warmgrau', 216, 204, 198],
    ['Dunkeloliv', 67, 86, 7], ['Leinen', 253, 217, 222], ['Pink', 249, 147, 188], ['Tiefgrün', 0, 56, 34],
    ['Lavendel', 178, 175, 212], ['Glyzinienviolett', 104, 106, 176], ['Beige', 239, 227, 185], ['Karmin', 247, 56, 102],
    ['Amberrot', 181, 75, 100], ['Olivgrün', 19, 43, 26], ['Dunkelfuchsia', 199, 1, 86], ['Mandarine', 254, 158, 50],
    ['Hellblau', 168, 222, 235], ['Smaragdgrün', 0, 103, 62], ['Purpur', 78, 41, 144], ['Moosgrün', 47, 126, 32],
    ['Hautrosa', 255, 204, 204], ['Erntegold', 255, 217, 17], ['Elektroblau', 9, 91, 166], ['Zitronengelb', 240, 249, 112],
    ['Frischgrün', 227, 243, 91],
  ].map(([name, r, g, b], i) => ({ name: `${name} (${i + 1})`, rgb: [r, g, b], lab: labOf(r, g, b) }));

  const PALETTES = { brother: BROTHER };

  function nearestThread(palette, lab) {
    let best = palette[0], bd = Infinity;
    for (const t of palette) {
      const d = dist2(t.lab, lab);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  /** Kurzer deutscher Farbname (für Bildfarben ohne Garnpalette). */
  function colorName([r, g, b]) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 510;
    const d = (mx - mn) / 255;
    const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (sat < 0.15 || d < 0.08) {
      if (l > 0.9) return 'Weiß';
      if (l < 0.12) return 'Schwarz';
      return l > 0.65 ? 'Hellgrau' : l < 0.35 ? 'Dunkelgrau' : 'Grau';
    }
    let hue;
    if (mx === r) hue = ((g - b) / (mx - mn) + 6) % 6;
    else if (mx === g) hue = (b - r) / (mx - mn) + 2;
    else hue = (r - g) / (mx - mn) + 4;
    hue *= 60;
    // gedeckte Rot-/Orangetöne: Haut, Holz, Leder
    if ((hue < 45 || hue >= 345) && sat < (l > 0.55 ? 0.65 : 0.5)) {
      if (l > 0.55) return hue >= 10 && hue < 45 ? 'Beige' : 'Altrosa';
      return l < 0.3 ? 'Dunkelbraun' : 'Braun';
    }
    let name;
    if (hue < 15 || hue >= 345) name = 'Rot';
    else if (hue < 40) name = l < 0.4 ? 'Braun' : 'Orange';
    else if (hue < 65) name = l < 0.35 ? 'Oliv' : 'Gelb';
    else if (hue < 90) name = 'Gelbgrün';
    else if (hue < 160) name = 'Grün';
    else if (hue < 195) name = 'Türkis';
    else if (hue < 255) name = 'Blau';
    else if (hue < 290) name = 'Violett';
    else if (hue < 330) name = 'Magenta';
    else name = l > 0.6 ? 'Rosa' : 'Rot';
    if (name === 'Braun' || name === 'Oliv') return name;
    if (name === 'Rot' && l > 0.7) return 'Rosa';
    if (l > 0.75) return `Hell${name.toLowerCase()}`;
    if (l < 0.28) return `Dunkel${name.toLowerCase()}`;
    return name;
  }

  /* ---------------- Histogramm und k-Means ---------------- */

  const binKey = (r, g, b) => ((r >> SHIFT) << (2 * BITS)) | ((g >> SHIFT) << BITS) | (b >> SHIFT);

  /** Belegte Fächer: mittlere Farbe (RGB), Lab und Gewicht. opaque: Pixel, die zählen. */
  function histogram(rgba, opaque) {
    const cnt = new Uint32Array(BINS);
    const sum = new Float64Array(BINS * 3);
    for (let p = 0, i = 0; p < opaque.length; p++, i += 4) {
      if (!opaque[p]) continue;
      const k = binKey(rgba[i], rgba[i + 1], rgba[i + 2]);
      cnt[k]++;
      sum[k * 3] += rgba[i]; sum[k * 3 + 1] += rgba[i + 1]; sum[k * 3 + 2] += rgba[i + 2];
    }
    const keys = [];
    for (let k = 0; k < BINS; k++) if (cnt[k]) keys.push(k);
    const n = keys.length;
    const rgb = new Float32Array(n * 3), lab = new Float32Array(n * 3), wt = new Float64Array(n);
    let total = 0;
    for (let j = 0; j < n; j++) {
      const k = keys[j], c = cnt[k];
      const r = sum[k * 3] / c, g = sum[k * 3 + 1] / c, b = sum[k * 3 + 2] / c;
      rgb[j * 3] = r; rgb[j * 3 + 1] = g; rgb[j * 3 + 2] = b;
      const L = labOf(r, g, b);
      lab[j * 3] = L[0]; lab[j * 3 + 1] = L[1]; lab[j * 3 + 2] = L[2];
      wt[j] = c;
      total += c;
    }
    return { keys, n, rgb, lab, wt, total };
  }

  /** Gewichtetes k-Means (Lloyd) mit festen Startzentren; liefert Zentren (Lab) und Zuordnung. */
  function kmeans(H, init, maxIter = 40) {
    const k = init.length;
    const cen = init.map((c) => c.slice());
    const asg = new Int32Array(H.n).fill(-1);
    for (let it = 0; it < maxIter; it++) {
      let changed = 0;
      for (let j = 0; j < H.n; j++) {
        const L = H.lab[j * 3], A = H.lab[j * 3 + 1], B = H.lab[j * 3 + 2];
        let best = 0, bd = Infinity;
        for (let c = 0; c < k; c++) {
          const q = cen[c];
          const d = (L - q[0]) ** 2 + (A - q[1]) ** 2 + (B - q[2]) ** 2;
          if (d < bd) { bd = d; best = c; }
        }
        if (asg[j] !== best) { asg[j] = best; changed++; }
      }
      const acc = Array.from({ length: k }, () => [0, 0, 0, 0]);
      for (let j = 0; j < H.n; j++) {
        const a = acc[asg[j]], w = H.wt[j];
        a[0] += H.lab[j * 3] * w; a[1] += H.lab[j * 3 + 1] * w; a[2] += H.lab[j * 3 + 2] * w; a[3] += w;
      }
      for (let c = 0; c < k; c++) if (acc[c][3] > 0) cen[c] = [acc[c][0] / acc[c][3], acc[c][1] / acc[c][3], acc[c][2] / acc[c][3]];
      if (!changed) break;
    }
    // mittlere Farbe (RGB) je Zentrum – Kantenglättung mischt im RGB-Raum, nicht in Lab
    const acc = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let j = 0; j < H.n; j++) {
      const a = acc[asg[j]], w = H.wt[j];
      a[0] += H.rgb[j * 3] * w; a[1] += H.rgb[j * 3 + 1] * w; a[2] += H.rgb[j * 3 + 2] * w; a[3] += w;
    }
    const rgb = acc.map((a, c) => (a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : labToApproxRgb(cen[c])));
    return { cen, asg, rgb };
  }

  /** Nächstes Startzentrum (k-Means++ ohne Zufall): größtes Gewicht · Abstand² zu den bisherigen Zentren. */
  function nextSeed(H, cen) {
    let best = -1, bs = -1;
    for (let j = 0; j < H.n; j++) {
      const L = H.lab[j * 3], A = H.lab[j * 3 + 1], B = H.lab[j * 3 + 2];
      let bd = Infinity;
      for (const q of cen) bd = Math.min(bd, (L - q[0]) ** 2 + (A - q[1]) ** 2 + (B - q[2]) ** 2);
      const sc = Math.sqrt(H.wt[j]) * bd;
      if (sc > bs) { bs = sc; best = j; }
    }
    return best < 0 ? null : [H.lab[best * 3], H.lab[best * 3 + 1], H.lab[best * 3 + 2]];
  }

  /** Quadrierter Abstand von p zur Strecke a–b (Lab). */
  function segDist2(p, a, b) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    let t = len2 > 0 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return dist2(p, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]);
  }

  /**
   * Liegt eine Farbe auf der Mischung zweier anderer? Kantenglättung mischt im RGB-Raum (dort ist
   * die Mischung eine Gerade); JPEG-Farbsäume (Farbunterabtastung) liegen eher auf der Geraden in Lab.
   * q, a, b: { rgb, lab }
   */
  function isBlend(q, a, b) {
    return segDist2(q.rgb, a.rgb, b.rgb) <= Math.max(14 * 14, 0.015 * dist2(a.rgb, b.rgb))
      || segDist2(q.lab, a.lab, b.lab) <= Math.max(36, 0.04 * dist2(a.lab, b.lab));
  }

  /**
   * Anteil der Pixel, die weder nah an einer Farbe noch an einer Mischung zweier Farben liegen
   * (Mischungen entstehen an kantengeglätteten Rändern und zählen nicht als eigene Farbe).
   */
  function unexplained(H, { cen, rgb }, tol) {
    const t2 = tol * tol;
    let miss = 0;
    for (let j = 0; j < H.n; j++) {
      const p = [H.lab[j * 3], H.lab[j * 3 + 1], H.lab[j * 3 + 2]];
      const q = [H.rgb[j * 3], H.rgb[j * 3 + 1], H.rgb[j * 3 + 2]];
      let ok = false;
      for (let a = 0; a < cen.length && !ok; a++) {
        if (dist2(p, cen[a]) <= t2) ok = true;
        for (let b = a + 1; b < cen.length && !ok; b++) {
          if (isBlend({ rgb: q, lab: p }, { rgb: rgb[a], lab: cen[a] }, { rgb: rgb[b], lab: cen[b] })) ok = true;
        }
      }
      if (!ok) miss += H.wt[j];
    }
    return miss / H.total;
  }

  /**
   * k-Means mit fester oder automatischer Farbanzahl. must: Lab-Farben erkannter Schrift (nach Gewicht
   * absteigend) – bei automatischer Anzahl bekommt jede eine eigene Farbe, wenn keine nahe genug liegt
   * (einheitliche Schrift sähe sonst wie eine Kantenmischung zweier anderer Farben aus).
   */
  function cluster(H, count, must = []) {
    const first = (() => {
      let best = 0;
      for (let j = 1; j < H.n; j++) if (H.wt[j] > H.wt[best]) best = j;
      return [H.lab[best * 3], H.lab[best * 3 + 1], H.lab[best * 3 + 2]];
    })();
    const want = count > 0 ? Math.min(count, H.n, MAX_COLORS) : Math.min(AUTO_MAX, H.n);
    let res = kmeans(H, [first]);
    for (let k = 2; k <= Math.min(want, STEP_MAX); k++) {
      if (count <= 0 && unexplained(H, res, 10) < 0.001) break;
      const seed = nextSeed(H, res.cen);
      if (!seed) break;
      res = kmeans(H, [...res.cen, seed]);
    }
    // mehr als 16 Farben: weitere Startzentren wie nextSeed, aber ohne Zwischenläufe (Abstand zum
    // nächsten Zentrum fortlaufend nachführen), dann ein gemeinsamer k-Means-Lauf – sonst wächst die
    // Rechenzeit quadratisch mit der Farbanzahl
    if (want > STEP_MAX && res.cen.length === STEP_MAX) {
      const cen = res.cen.map((c) => c.slice());
      const minD = new Float64Array(H.n);
      for (let j = 0; j < H.n; j++) {
        const L = H.lab[j * 3], A = H.lab[j * 3 + 1], B = H.lab[j * 3 + 2];
        let bd = Infinity;
        for (const q of cen) bd = Math.min(bd, (L - q[0]) ** 2 + (A - q[1]) ** 2 + (B - q[2]) ** 2);
        minD[j] = bd;
      }
      while (cen.length < want) {
        let best = -1, bs = 0;
        for (let j = 0; j < H.n; j++) {
          const sc = Math.sqrt(H.wt[j]) * minD[j];
          if (sc > bs) { bs = sc; best = j; }
        }
        if (best < 0) break;
        const q = [H.lab[best * 3], H.lab[best * 3 + 1], H.lab[best * 3 + 2]];
        cen.push(q);
        for (let j = 0; j < H.n; j++) {
          const d = (H.lab[j * 3] - q[0]) ** 2 + (H.lab[j * 3 + 1] - q[1]) ** 2 + (H.lab[j * 3 + 2] - q[2]) ** 2;
          if (d < minD[j]) minD[j] = d;
        }
      }
      res = kmeans(H, cen);
    }
    if (count <= 0) {
      for (const m of must) {
        if (res.cen.length >= AUTO_MAX) break;
        if (res.cen.every((q) => dist2(m, q) > 10 * 10)) res = kmeans(H, [...res.cen, m.slice()]);
      }
    }
    return res;
  }

  /* ---------------- Label-Bild ---------------- */

  /** Mehrheitsfilter 3 × 3: Pixel übernimmt die häufigste Nachbarfarbe, wenn sie häufiger ist als die eigene. */
  function majority(labels, w, h, passes) {
    let src = labels;
    let dst = new Uint8Array(labels.length);
    const nb = new Uint8Array(9);
    for (let pass = 0; pass < passes; pass++) {
      let changed = 0;
      for (let y = 0; y < h; y++) {
        const y0 = y > 0 ? y - 1 : y, y1 = y < h - 1 ? y + 1 : y;
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const c = src[i];
          const x0 = x > 0 ? x - 1 : x, x1 = x < w - 1 ? x + 1 : x;
          nb[0] = src[y0 * w + x0]; nb[1] = src[y0 * w + x]; nb[2] = src[y0 * w + x1];
          nb[3] = src[y * w + x0]; nb[4] = c; nb[5] = src[y * w + x1];
          nb[6] = src[y1 * w + x0]; nb[7] = src[y1 * w + x]; nb[8] = src[y1 * w + x1];
          let same = true;
          for (let k = 0; k < 9; k++) if (nb[k] !== c) { same = false; break; }
          if (same) { dst[i] = c; continue; }
          let own = 0;
          for (let k = 0; k < 9; k++) if (nb[k] === c) own++;
          let best = c, bc = own;
          for (let a = 0; a < 9; a++) {
            const v = nb[a];
            if (v === c || v === best) continue;
            let n = 0;
            for (let k = 0; k < 9; k++) if (nb[k] === v) n++;
            if (n > bc) { bc = n; best = v; }
          }
          dst[i] = best;
          if (best !== c) changed++;
        }
      }
      [src, dst] = [dst, src];
      if (!changed) break;
    }
    if (src !== labels) labels.set(src);
    return labels;
  }

  /**
   * Zusammenhängende Flächen unter minPx Pixeln der Nachbarfarbe mit der längsten gemeinsamen
   * Grenze zuschlagen (4er-Nachbarschaft). Auch kleine Lücken (EMPTY) werden gefüllt.
   */
  function removeSmall(labels, w, h, minPx) {
    if (!(minPx >= 2)) return labels;
    const n = w * h;
    const comp = new Int32Array(n).fill(-1);
    const stack = new Int32Array(n);
    const starts = [], sizes = [];
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const id = starts.length, lab = labels[s];
      let sp = 0, size = 0;
      stack[sp++] = s; comp[s] = id;
      while (sp) {
        const i = stack[--sp];
        size++;
        const x = i % w;
        if (x > 0 && comp[i - 1] < 0 && labels[i - 1] === lab) { comp[i - 1] = id; stack[sp++] = i - 1; }
        if (x < w - 1 && comp[i + 1] < 0 && labels[i + 1] === lab) { comp[i + 1] = id; stack[sp++] = i + 1; }
        if (i >= w && comp[i - w] < 0 && labels[i - w] === lab) { comp[i - w] = id; stack[sp++] = i - w; }
        if (i < n - w && comp[i + w] < 0 && labels[i + w] === lab) { comp[i + w] = id; stack[sp++] = i + w; }
      }
      starts.push(s); sizes.push(size);
    }
    const small = [];
    for (let id = 0; id < sizes.length; id++) if (sizes[id] < minPx) small.push(id);
    if (!small.length) return labels;
    small.sort((a, b) => sizes[a] - sizes[b]);
    // erneut fluten (inzwischen zugeschlagene Nachbarn können die Fläche vergrößert haben)
    const seen = new Int32Array(n);
    const count = new Float64Array(256);
    const list = new Int32Array(n);
    let stamp = 0;
    for (const id of small) {
      const s = starts[id], lab = labels[s];
      stamp++;
      let sp = 0, cnt = 0;
      stack[sp++] = s; seen[s] = stamp;
      count.fill(0);
      while (sp && cnt < minPx) {
        const i = stack[--sp];
        list[cnt++] = i;
        const x = i % w;
        const visit = (j) => {
          if (labels[j] === lab) {
            if (seen[j] !== stamp) { seen[j] = stamp; stack[sp++] = j; }
          } else count[labels[j]]++;
        };
        if (x > 0) visit(i - 1);
        if (x < w - 1) visit(i + 1);
        if (i >= w) visit(i - w);
        if (i < n - w) visit(i + w);
      }
      if (cnt >= minPx || sp) continue; // inzwischen groß genug
      let best = -1, bc = 0;
      for (let v = 0; v < 256; v++) if (count[v] > bc) { bc = count[v]; best = v; }
      if (best < 0) continue; // ganzes Bild eine Fläche
      for (let k = 0; k < cnt; k++) labels[list[k]] = best;
    }
    return labels;
  }

  /* ---------------- Zerlegen ---------------- */

  /**
   * Zerlegt das Bild in Farbflächen.
   * rgba: Pixel (auf Weiß), opaque: 1 = Pixel zählt (nicht transparent/freigestellt)
   * opts: { count (0 = Auto), palette ('image'|'brother'), smoothPasses, minAreaPx, skipBg, blend ('auto'|'logo'|'off'),
   *         edits: [{ from: '#rrggbb', to?: '#rrggbb', off?: bool, into?: '#rrggbb' }],
   *         keep: Uint8Array|null – Pixel, die Glätten und Kleinstflächen nicht verändern,
   *         textColors: [{ rgb, weight }] – Farben erkannter Schrift (siehe cluster) }
   * Ergebnis: { labels (Uint8Array, EMPTY = leer), layers: [{ label, rgb, hex, name, thread, from, merged, area, off, edited }] }
   * – Ebenen von unten (größte Fläche) nach oben.
   */
  function separate(rgba, opaque, w, h, opts = {}) {
    const n = w * h;
    const labels = new Uint8Array(n).fill(EMPTY);
    const H = histogram(rgba, opaque);
    if (!H.n) return { labels, layers: [] };

    const must = (opts.textColors || []).slice().sort((a, b) => b.weight - a.weight).map((t) => labOf(...t.rgb));
    const { cen, rgb: cenRgb } = cluster(H, Math.round(Number(opts.count) || 0), must);
    const k = cen.length;
    // Anzeige- und Ausgabefarbe: Mittelwert der zugehörigen Pixel (RGB), nicht die Lab-Rückrechnung
    const meanRgb = () => {
      const acc = Array.from({ length: k }, () => [0, 0, 0, 0]);
      for (let j = 0; j < H.n; j++) {
        let best = 0, bd = Infinity;
        const p = [H.lab[j * 3], H.lab[j * 3 + 1], H.lab[j * 3 + 2]];
        for (let c = 0; c < k; c++) { const d = dist2(p, cen[c]); if (d < bd) { bd = d; best = c; } }
        const a = acc[best], wgt = H.wt[j];
        a[0] += H.rgb[j * 3] * wgt; a[1] += H.rgb[j * 3 + 1] * wgt; a[2] += H.rgb[j * 3 + 2] * wgt; a[3] += wgt;
      }
      return acc.map((a, c) => (a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : labToApproxRgb(cen[c])));
    };

    // Zuordnung Fach → Farbe über eine Tabelle (je Fach einmal rechnen)
    const binLabel = new Uint8Array(BINS).fill(EMPTY);
    const assignBins = (alive) => {
      for (let j = 0; j < H.n; j++) {
        const p = [H.lab[j * 3], H.lab[j * 3 + 1], H.lab[j * 3 + 2]];
        let best = EMPTY, bd = Infinity;
        for (let c = 0; c < k; c++) {
          if (!alive[c]) continue;
          const d = dist2(p, cen[c]);
          if (d < bd) { bd = d; best = c; }
        }
        binLabel[H.keys[j]] = best;
      }
    };
    const paint = () => {
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        labels[p] = opaque[p] ? binLabel[binKey(rgba[i], rgba[i + 1], rgba[i + 2])] : EMPTY;
      }
    };
    let alive = new Array(k).fill(true);
    assignBins(alive);
    paint();

    // Mischfarben an Kanten auflösen: Farbe liegt zwischen zwei anderen und besteht fast nur aus Rand.
    // opts.blend: 'auto' (Standard) = nur an geschlossenen Flächen, 'logo' = immer (wie bis 1.22),
    // 'off' = nie (alle Zwischentöne bleiben, z. B. für Fotos mit Verläufen)
    const blendMode = opts.blend === 'logo' || opts.blend === 'off' ? opts.blend : 'auto';
    if (k >= 3 && blendMode !== 'off') {
      const area = new Float64Array(k), edge = new Float64Array(k), text = new Float64Array(k);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x, c = labels[i];
          if (c === EMPTY) continue;
          area[c]++;
          if (opts.keep && opts.keep[i]) text[c]++;
          if ((x > 0 && labels[i - 1] !== c) || (x < w - 1 && labels[i + 1] !== c)
            || (y > 0 && labels[i - w] !== c) || (y < h - 1 && labels[i + w] !== c)) edge[c]++;
        }
      }
      const total = area.reduce((a, b) => a + b, 0) || 1;
      const solid = (c) => area[c] > 0 && edge[c] / area[c] < 0.25;
      let any = false;
      for (let c = 0; c < k; c++) {
        if (!area[c] || edge[c] / area[c] < 0.5 || area[c] / total > 0.15) continue;
        // überwiegend erkannte Schrift: eine echte Farbe, auch wenn dünne Buchstaben fast nur Rand sind
        if (text[c] >= area[c] * 0.3) continue;
        let blend = false;
        for (let a = 0; a < k && !blend; a++) {
          if (a === c || !alive[a]) continue;
          for (let b = a + 1; b < k && !blend; b++) {
            if (b === c || !alive[b]) continue;
            // ein Saum aus Kantenglättung liegt an einer geschlossenen Fläche (Logo, Grafik); in Fotos
            // und Maserung sind auch die Nachbarfarben zerfasert – dort ist die Farbe ein echter Zwischenton
            if (blendMode === 'auto' && !(solid(a) || solid(b))) continue;
            if (isBlend({ rgb: cenRgb[c], lab: cen[c] }, { rgb: cenRgb[a], lab: cen[a] }, { rgb: cenRgb[b], lab: cen[b] })) blend = true;
          }
        }
        if (blend) { alive[c] = false; any = true; }
      }
      if (any) { assignBins(alive); paint(); }
    }

    // Hintergrund: die Farbe, die am Bildrand überwiegt – nur ihre mit dem Rand verbundene Fläche
    // entfällt; dieselbe Farbe innerhalb des Motivs (z. B. weiße Schrift im Logo) bleibt erhalten.
    // Vor den Bearbeitungen, damit Zusammenführen oder Umfärben den Hintergrund nicht verschiebt
    if (opts.skipBg) {
      const border = new Float64Array(256);
      let borderTotal = 0;
      const edgePx = [];
      for (let x = 0; x < w; x++) { edgePx.push(x); if (h > 1) edgePx.push((h - 1) * w + x); }
      for (let y = 1; y < h - 1; y++) { edgePx.push(y * w); if (w > 1) edgePx.push(y * w + w - 1); }
      for (const p of edgePx) { border[labels[p]]++; borderTotal++; }
      let bgLabel = -1, bb = 0;
      for (let c = 0; c < k; c++) if (border[c] > bb) { bb = border[c]; bgLabel = c; }
      if (bgLabel >= 0 && bb >= 0.4 * borderTotal) {
        const stack = [];
        for (const p of edgePx) if (labels[p] === bgLabel) { labels[p] = EMPTY; stack.push(p); }
        while (stack.length) {
          const i = stack.pop();
          const x = i % w;
          if (x > 0 && labels[i - 1] === bgLabel) { labels[i - 1] = EMPTY; stack.push(i - 1); }
          if (x < w - 1 && labels[i + 1] === bgLabel) { labels[i + 1] = EMPTY; stack.push(i + 1); }
          if (i >= w && labels[i - w] === bgLabel) { labels[i - w] = EMPTY; stack.push(i - w); }
          if (i < n - w && labels[i + w] === bgLabel) { labels[i + w] = EMPTY; stack.push(i + w); }
        }
      }
    }

    // Farben (Mittelwert) und Herkunft (für Bearbeitungen) je Zentrum
    let rgbs = meanRgb();
    const from = rgbs.map(toHex);
    const out = rgbs.map((rgb) => ({ rgb, name: colorName(rgb), thread: null }));

    // Garnpalette: auf das nächste Garn einrasten, gleiche Garne zusammenführen
    const palette = PALETTES[opts.palette];
    const remap = Array.from({ length: k }, (_, c) => c);
    if (palette) {
      const byThread = new Map();
      for (let c = 0; c < k; c++) {
        if (!alive[c]) continue;
        const t = nearestThread(palette, labOf(...out[c].rgb));
        out[c] = { rgb: t.rgb.slice(), name: t.name, thread: t.name };
        if (byThread.has(t.name)) remap[c] = byThread.get(t.name);
        else byThread.set(t.name, c);
      }
    }

    // Bearbeitungen: zur Farbe mit der ähnlichsten Herkunft (ΔE < 12)
    const edits = Array.isArray(opts.edits) ? opts.edits : [];
    const findByHex = (hex) => {
      const rgb = fromHex(hex);
      if (!rgb) return -1;
      const L = labOf(...rgb);
      let best = -1, bd = 144;
      for (let c = 0; c < k; c++) {
        if (!alive[c]) continue;
        const d = dist2(labOf(...fromHex(from[c])), L);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    };
    const editOf = new Array(k).fill(null);
    for (const e of edits) {
      const c = findByHex(e.from);
      if (c >= 0) editOf[c] = e;
    }
    for (let c = 0; c < k; c++) {
      const e = editOf[c];
      if (!e) continue;
      if (e.into) {
        const t = findByHex(e.into);
        if (t >= 0 && t !== c) remap[c] = remap[t] === c ? t : remap[t];
      }
      const to = fromHex(e.to);
      if (to) {
        if (palette) {
          const t = nearestThread(palette, labOf(...to));
          out[c] = { rgb: t.rgb.slice(), name: t.name, thread: t.name };
        } else out[c] = { rgb: to, name: colorName(to), thread: null };
      }
    }
    // Zusammenführen auflösen (Ketten a → b → c)
    for (let c = 0; c < k; c++) {
      let t = c, guard = 0;
      while (remap[t] !== t && guard++ < k) t = remap[t];
      remap[c] = t;
    }
    if (remap.some((t, c) => t !== c)) {
      for (let p = 0; p < n; p++) if (labels[p] !== EMPTY) labels[p] = remap[labels[p]];
    }

    // Glätten und Kleinstflächen
    // (Pixel in opts.keep – erkannte Schrift – behalten ihre Farbe)
    const kept = opts.keep ? labels.slice() : null;
    if (opts.smoothPasses > 0) majority(labels, w, h, Math.min(12, Math.round(opts.smoothPasses)));
    if (opts.minAreaPx > 0) removeSmall(labels, w, h, opts.minAreaPx);
    if (kept) for (let p = 0; p < n; p++) if (opts.keep[p]) labels[p] = kept[p];

    const area = new Float64Array(256);
    for (let p = 0; p < n; p++) area[labels[p]]++;

    const layers = [];
    for (let c = 0; c < k; c++) {
      if (!area[c]) continue;
      // Bearbeitung der Farbe selbst und aller hineingeführten Farben
      const e = editOf[c];
      const off = !!(e && e.off);
      const merged = [];
      for (let o = 0; o < k; o++) if (o !== c && remap[o] === c && alive[o]) merged.push(from[o]);
      layers.push({
        label: c,
        rgb: out[c].rgb.map((v) => Math.round(v)),
        hex: toHex(out[c].rgb),
        name: out[c].name,
        thread: out[c].thread,
        from: from[c],
        merged,
        area: area[c],
        off,
        edited: !!(e && (e.to || e.off)),
      });
    }
    layers.sort((a, b) => b.area - a.area);
    return { labels, layers };
  }

  /** Grobe Lab → RGB-Rückrechnung (nur als Notlösung für leere Zentren). */
  function labToApproxRgb([L, A, B]) {
    const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
    const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
    const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
    const lin = [
      3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
      -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
      0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
    ];
    return lin.map((c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055));
  }

  /**
   * Binärmasken der sichtbaren Ebenen (von unten nach oben). Mit Überlappung reicht jede Ebene
   * um overlapPx unter die darüberliegenden Ebenen – so entstehen beim Sticken (Stoffverzug) bzw.
   * zwischen den einzeln vektorisierten Pfaden keine Lücken. dilate: Processing.dilate.
   */
  function layerMasks(labels, w, h, layers, overlapPx, dilate) {
    const n = w * h;
    const vis = layers.filter((l) => !l.off);
    const above = new Uint8Array(n); // Pixel der Ebenen darüber
    const masks = new Array(vis.length);
    for (let li = vis.length - 1; li >= 0; li--) {
      const lab = vis[li].label;
      let m = new Uint8Array(n);
      for (let p = 0; p < n; p++) if (labels[p] === lab) m[p] = 1;
      const own = m;
      if (overlapPx > 0 && li < vis.length - 1) {
        const grown = dilate(own, w, h, overlapPx);
        m = new Uint8Array(n);
        for (let p = 0; p < n; p++) m[p] = own[p] || (grown[p] && above[p]) ? 1 : 0;
      }
      for (let p = 0; p < n; p++) if (own[p]) above[p] = 1;
      masks[li] = m;
    }
    return vis.map((l, i) => ({ layer: l, bits: masks[i] }));
  }

  /**
   * Echtfarben mit Verläufen: zerlegt jede Ebenenmaske in zusammenhängende Flächen und gibt jeder
   * größeren Fläche, deren Farbe sich über die Fläche ändert, einen linearen Farbverlauf.
   * Richtung: stärkste Farbänderung der linearen Näherung (Kleinste Quadrate je Kanal);
   * Farbstopps: mittlere Bildfarbe in Streifen quer zur Richtung (folgt auch ungleichmäßigen Verläufen).
   * Gerechnet nur mit den eigenen Pixeln der Ebene (labels === label), nicht mit der Überlappung.
   * Stufen glätten (opts.merge 0..1): benachbarte Flächen – auch verschiedener Farbebenen – werden zu
   * einer Fläche mit gemeinsamem Verlauf, wenn ihre Grenze im Bild kaum Kontrast hat (Farbstufe in
   * einem weichen Übergang, keine echte Kante) und ein Verlauf die vereinte Fläche noch gut beschreibt
   * (Restabweichung der linearen Näherung). Die vereinte Fläche liegt in der Ebene ihres größten Teils.
   * masks: [{ layer, bits }] (Colors.layerMasks). Ergebnis je Maske:
   * { rest: Uint8Array (Pixel ohne Verlauf, einfarbig), grads: [{ x, y, w, h, bits (Ausschnitt),
   *   x1, y1, x2, y2, stops: [[offset 0..1, '#rrggbb']] }] }
   */
  function gradientRegions(rgba, labels, w, h, masks, opts = {}) {
    const n = w * h;
    const minPx = Math.max(64, Number(opts.minPx) || 0);
    const minDelta = Number(opts.minDelta) || 10; // kleinste Farbänderung (RGB-Abstand) über die Fläche
    const maxGrads = Number(opts.maxGrads) || 4000;
    const merge = Math.min(1, Math.max(0, Number(opts.merge) || 0));
    const rests = masks.map((m) => m.bits.slice());
    const result = masks.map((m, i) => ({ rest: rests[i], grads: [] }));
    const skipLayer = masks.map((m) => !!(opts.skip && opts.skip(m.layer)));

    // 1. zusammenhängende Flächen je Ebene (4er-Nachbarschaft) mit Momenten der eigenen Pixel
    // M: [N, sx, sy, sxx, sxy, syy, sr, sg, sb, srx, sry, sgx, sgy, sbx, sby, srr, sgg, sbb]
    const NM = 18;
    const comps = []; // { li, seed, cnt, x0, y0, x1, y1, m: Float64Array }
    const own = new Int32Array(n).fill(-1); // eigene Pixel → Fläche
    const comp = new Int32Array(n);
    const stack = new Int32Array(n);
    masks.forEach(({ layer, bits }, li) => {
      if (skipLayer[li]) return;
      comp.fill(-1);
      for (let s = 0; s < n; s++) {
        if (!bits[s] || comp[s] >= 0) continue;
        const id = comps.length;
        const c = { li, seed: s, cnt: 0, x0: w, y0: h, x1: -1, y1: -1, m: new Float64Array(NM) };
        const M = c.m;
        let sp = 0;
        stack[sp++] = s; comp[s] = id;
        while (sp) {
          const i = stack[--sp];
          const x = i % w, y = (i / w) | 0;
          c.cnt++;
          if (x < c.x0) c.x0 = x;
          if (y < c.y0) c.y0 = y;
          if (x > c.x1) c.x1 = x;
          if (y > c.y1) c.y1 = y;
          if (labels[i] === layer.label) {
            own[i] = id;
            const px = x + 0.5, py = y + 0.5, k = i * 4;
            const r = rgba[k], g = rgba[k + 1], b = rgba[k + 2];
            M[0]++; M[1] += px; M[2] += py; M[3] += px * px; M[4] += px * py; M[5] += py * py;
            M[6] += r; M[7] += g; M[8] += b;
            M[9] += r * px; M[10] += r * py; M[11] += g * px; M[12] += g * py; M[13] += b * px; M[14] += b * py;
            M[15] += r * r; M[16] += g * g; M[17] += b * b;
          }
          if (x > 0 && bits[i - 1] && comp[i - 1] < 0) { comp[i - 1] = id; stack[sp++] = i - 1; }
          if (x < w - 1 && bits[i + 1] && comp[i + 1] < 0) { comp[i + 1] = id; stack[sp++] = i + 1; }
          if (i >= w && bits[i - w] && comp[i - w] < 0) { comp[i - w] = id; stack[sp++] = i - w; }
          if (i < n - w && bits[i + w] && comp[i + w] < 0) { comp[i + w] = id; stack[sp++] = i + w; }
        }
        comps.push(c);
      }
    });
    if (!comps.length) return result;

    // lineare Näherung aus den Momenten: Mittelpunkt, Farbgradient G (3 × 2), Restabweichung (RMS je Kanal)
    const fit = (M) => {
      const N = M[0];
      if (!(N > 0)) return null;
      const mx = M[1] / N, my = M[2] / N;
      const cxx = M[3] / N - mx * mx, cxy = M[4] / N - mx * my, cyy = M[5] / N - my * my;
      const det = cxx * cyy - cxy * cxy;
      const G = [];
      let res = 0;
      for (let ch = 0; ch < 3; ch++) {
        const mc = M[6 + ch] / N;
        const vx = M[9 + 2 * ch] / N - mc * mx, vy = M[10 + 2 * ch] / N - mc * my;
        const gx = det > 1e-6 ? (cyy * vx - cxy * vy) / det : 0;
        const gy = det > 1e-6 ? (cxx * vy - cxy * vx) / det : 0;
        G.push([gx, gy]);
        res += Math.max(0, M[15 + ch] / N - mc * mc - (gx * vx + gy * vy));
      }
      return { N, mx, my, det, G, rms: Math.sqrt(res / 3) };
    };

    // 2. Stufen glätten: Flächen über kontrastarme Grenzen zusammenlegen (Union-Find)
    const parent = new Int32Array(comps.length);
    for (let c = 0; c < comps.length; c++) parent[c] = c;
    const root = (c) => { while (parent[c] !== c) { parent[c] = parent[parent[c]]; c = parent[c]; } return c; };
    if (merge > 0 && comps.length > 1 && comps.length < 2097152) {
      const maxContrast = 15 + 60 * merge; // mittlerer Farbabstand quer über die Grenze
      // erlaubte Zunahme der Abweichung vom Verlauf durch das Vereinen (RMS je Kanal), bezogen auf die
      // kleinere Fläche – sonst ginge ein kleiner Buchstabe in einem großen Himmel unter. Die
      // Bildstruktur selbst (Hautporen, Stoff) steckt schon in beiden Teilen und zählt nicht
      const maxInc = 3 + 20 * merge;
      const edges = new Map(); // a·2^21 + b → [Anzahl, Summe Kontrast]
      const STEP = 2; // Kontrast über ±2 px: weichgezeichnete echte Kanten zählen voll
      const px = (i) => i * 4;
      const contrast = (i, j) => {
        const a = px(i), b = px(j);
        return Math.sqrt((rgba[a] - rgba[b]) ** 2 + (rgba[a + 1] - rgba[b + 1]) ** 2 + (rgba[a + 2] - rgba[b + 2]) ** 2);
      };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x, a = own[i];
          if (a < 0) continue;
          for (let dir = 0; dir < 2; dir++) {
            const j = dir ? (y < h - 1 ? i + w : -1) : (x < w - 1 ? i + 1 : -1);
            if (j < 0) continue;
            const b = own[j];
            if (b < 0 || b === a) continue;
            // Pixel etwas weiter weg auf beiden Seiten vergleichen
            let p = i, q = j;
            if (dir) {
              p = Math.max(x, i - STEP * w); q = Math.min(j + STEP * w, (h - 1) * w + x);
              if (p < 0) p = i;
            } else {
              p = i - Math.min(STEP, x); q = j + Math.min(STEP, w - 1 - (x + 1));
            }
            const key = a < b ? a * 2097152 + b : b * 2097152 + a;
            const e = edges.get(key);
            const cv = contrast(p, q);
            if (e) { e[0]++; e[1] += cv; } else edges.set(key, [1, cv]);
          }
        }
      }
      const list = [];
      for (const [key, [cnt, sum]] of edges) {
        if (cnt < 3) continue;
        const c = sum / cnt;
        if (c < maxContrast) list.push({ a: Math.floor(key / 2097152), b: key % 2097152, c });
      }
      list.sort((u, v) => u.c - v.c);
      const mom = comps.map((c) => c.m);
      const sse = (M) => { const f = fit(M); return f ? f.rms * f.rms * 3 * f.N : 0; };
      const err = comps.map((c) => sse(c.m));
      for (const { a, b } of list) {
        const ra = root(a), rb = root(b);
        if (ra === rb) continue;
        const M = new Float64Array(NM);
        for (let k = 0; k < NM; k++) M[k] = mom[ra][k] + mom[rb][k];
        if (!(M[0] > 0)) continue;
        const e = sse(M);
        if ((e - err[ra] - err[rb]) / (3 * Math.min(mom[ra][0], mom[rb][0]) || 1) > maxInc * maxInc) continue;
        const [big, small] = mom[ra][0] >= mom[rb][0] ? [ra, rb] : [rb, ra];
        parent[small] = big;
        mom[big] = M;
        err[big] = e;
      }
      comps.forEach((c, i) => { c.mm = mom[i]; });
    }

    // 3. Gruppen (vereinte Flächen): Ebene des größten Teils, Richtung der stärksten Farbänderung
    const groups = new Map(); // Wurzel → Gruppe
    for (let c = 0; c < comps.length; c++) {
      const r = root(c);
      let g = groups.get(r);
      if (!g) groups.set(r, (g = { members: [], cnt: 0, x0: w, y0: h, x1: -1, y1: -1, M: (comps[r].mm || comps[r].m), main: c, mainOwn: -1 }));
      const k = comps[c];
      g.members.push(c);
      g.cnt += k.cnt;
      g.x0 = Math.min(g.x0, k.x0); g.y0 = Math.min(g.y0, k.y0); g.x1 = Math.max(g.x1, k.x1); g.y1 = Math.max(g.y1, k.y1);
      if (k.m[0] > g.mainOwn) { g.mainOwn = k.m[0]; g.main = c; }
    }
    const gOf = new Int32Array(comps.length).fill(-1);
    const cand = [];
    for (const g of groups.values()) {
      const merged = g.members.length > 1;
      if (cand.length >= maxGrads) break;
      if (merged ? g.cnt < minPx * 0.25 : g.cnt < minPx || g.M[0] < minPx * 0.5) continue;
      const f = fit(g.M);
      if (!f || !(f.det > 1e-6)) continue;
      let p = 0, q = 0, r = 0;
      for (const [gx, gy] of f.G) { p += gx * gx; q += gx * gy; r += gy * gy; }
      const ang = 0.5 * Math.atan2(2 * q, p - r);
      g.mx = f.mx; g.my = f.my; g.dx = Math.cos(ang); g.dy = Math.sin(ang);
      g.grad = Math.sqrt(p * g.dx * g.dx + 2 * q * g.dx * g.dy + r * g.dy * g.dy);
      g.merged = merged;
      g.tmin = Infinity; g.tmax = -Infinity;
      for (const c of g.members) gOf[c] = cand.length;
      cand.push(g);
    }
    if (!cand.length) return result;
    for (let i = 0; i < n; i++) {
      const j = own[i] >= 0 ? gOf[own[i]] : -1;
      if (j < 0) continue;
      const c = cand[j];
      const t = (i % w + 0.5 - c.mx) * c.dx + (((i / w) | 0) + 0.5 - c.my) * c.dy;
      if (t < c.tmin) c.tmin = t;
      if (t > c.tmax) c.tmax = t;
    }
    // 4. Farbstopps: Streifen entlang der Richtung (je Streifen mittlere Farbe)
    const BINS_MAX = 16;
    const keep = cand.map((c) => {
      const len = c.tmax - c.tmin;
      if (!(len > 2) || (!c.merged && c.grad * len < minDelta)) return false;
      c.nb = Math.max(2, Math.min(BINS_MAX, Math.round(len / 6)));
      c.acc = new Float64Array(c.nb * 4);
      return true;
    });
    for (let i = 0; i < n; i++) {
      const j = own[i] >= 0 ? gOf[own[i]] : -1;
      if (j < 0 || !keep[j]) continue;
      const c = cand[j];
      const t = (i % w + 0.5 - c.mx) * c.dx + (((i / w) | 0) + 0.5 - c.my) * c.dy;
      const b = Math.min(c.nb - 1, Math.floor(((t - c.tmin) / (c.tmax - c.tmin)) * c.nb));
      const k = i * 4, o = b * 4;
      c.acc[o] += rgba[k]; c.acc[o + 1] += rgba[k + 1]; c.acc[o + 2] += rgba[k + 2]; c.acc[o + 3]++;
    }
    const seen = new Uint8Array(n);
    for (let j = 0; j < cand.length; j++) {
      if (!keep[j]) continue;
      const c = cand[j];
      let stops = [];
      for (let b = 0; b < c.nb; b++) {
        const o = b * 4, cnt = c.acc[o + 3];
        if (cnt < 3) continue;
        stops.push({ t: (b + 0.5) / c.nb, rgb: [c.acc[o] / cnt, c.acc[o + 1] / cnt, c.acc[o + 2] / cnt] });
      }
      if (!stops.length) continue;
      if (stops.length === 1) stops = [{ t: 0, rgb: stops[0].rgb }, { t: 1, rgb: stops[0].rgb }];
      const first = stops[0].rgb, last = stops[stops.length - 1].rgb;
      let spread = 0;
      for (const st of stops) spread = Math.max(spread, dist2(st.rgb, first), dist2(st.rgb, last));
      if (!c.merged && spread < minDelta * minDelta) continue; // praktisch einfarbig
      // Endfarben vom Streifenmittel bis an den Rand der Fläche hochrechnen – sonst bleibt an der
      // Grenze zur Nachbarfläche (gleicher Verlauf, andere Farbebene) eine sichtbare Naht
      const extend = (A, B, t) => {
        const f = (t - A.t) / (B.t - A.t);
        return { t, rgb: A.rgb.map((v, ch) => Math.min(255, Math.max(0, v + (B.rgb[ch] - v) * f))) };
      };
      if (stops[0].t > 0) {
        stops = [extend(stops[0], stops[1], 0), ...stops.slice(1, -1), extend(stops[stops.length - 2], stops[stops.length - 1], 1)];
      }
      // überflüssige Zwischenstopps (liegen auf der Geraden zwischen den Nachbarn) weglassen
      for (let changed = true; changed && stops.length > 2;) {
        changed = false;
        for (let s = 1; s < stops.length - 1; s++) {
          const A = stops[s - 1], B = stops[s], C = stops[s + 1];
          const f = (B.t - A.t) / (C.t - A.t);
          const lerp = A.rgb.map((v, ch) => v + (C.rgb[ch] - v) * f);
          if (dist2(lerp, B.rgb) < 4 * 4) { stops.splice(s, 1); changed = true; break; }
        }
      }
      // Ausschnitt der (vereinten) Fläche: Teile erneut fluten; diese Pixel fehlen in den Restflächen
      const x0 = c.x0, y0 = c.y0, bw = c.x1 - x0 + 1, bh = c.y1 - y0 + 1;
      const crop = new Uint8Array(bw * bh);
      const touched = [];
      for (const mi of c.members) {
        const k = comps[mi], bits = masks[k.li].bits, rest = rests[k.li];
        let sp = 0;
        stack[sp++] = k.seed; seen[k.seed] = 1; touched.push(k.seed);
        while (sp) {
          const i = stack[--sp];
          const x = i % w, y = (i / w) | 0;
          crop[(y - y0) * bw + (x - x0)] = 1;
          rest[i] = 0;
          const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1];
          for (const q of nb) if (q >= 0 && bits[q] && !seen[q]) { seen[q] = 1; touched.push(q); stack[sp++] = q; }
        }
        for (const i of touched) seen[i] = 0;
        touched.length = 0;
      }
      result[comps[c.main].li].grads.push({
        x: x0, y: y0, w: bw, h: bh, bits: crop,
        x1: c.mx + c.tmin * c.dx, y1: c.my + c.tmin * c.dy,
        x2: c.mx + c.tmax * c.dx, y2: c.my + c.tmax * c.dy,
        stops: stops.map((st) => [st.t, toHex(st.rgb)]),
      });
    }
    return result;
  }

  return { separate, layerMasks, gradientRegions, colorName, toHex, fromHex, labOf, EMPTY, palettes: PALETTES };
})();

if (typeof module !== 'undefined') module.exports = Colors;
