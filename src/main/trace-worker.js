'use strict';

/**
 * Läuft als Electron-Utility-Prozess: Potrace-Vektorisierung, ohne den
 * Main-Prozess (und damit das Fenster) zu blockieren.
 *
 * Eingabe ist das Binärbild selbst (1 = schwarz), nicht ein PNG: Das spart das
 * PNG-Kodieren im Renderer und das langsame Dekodieren (Jimp) hier.
 * Die Pfadsuche (_bmToPathlist) ist eine schnelle, ergebnisgleiche Neufassung
 * der Variante aus dem potrace-Paket (direkter Zugriff auf ein Typed Array statt
 * Point-/Bitmap-Methoden je Pixel); Kurvenoptimierung und Ausgabe bleiben vom Paket.
 */
const { Potrace } = require('potrace');
const Path = require('potrace/lib/types/Path');
const Point = require('potrace/lib/types/Point');
const potraceUtils = require('potrace/lib/utils');
const { fitCurve } = require('./shape-fit');

function clamp(v, min, max) {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/**
 * Zerlegt das Binärbild in Randpfade (wie Potrace._bmToPathlist mit Schwelle 128,
 * schwarz auf weiß). Anders als im Original (potrace-js) gilt alles außerhalb des Bildes
 * als weiß – dort las ein Zugriff bei x === w das erste Pixel der nächsten Zeile, was am
 * rechten Rand Formen außerhalb der viewBox und verzerrte Konturen erzeugte.
 */
function bitsToPathlist(bits, w, h, turdSize, turnPolicy) {
  const size = w * h;
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = bits[i] ? 1 : 0;

  const get = (x, y) => (x >= 0 && x < w && y >= 0 && y < h ? data[w * y + x] : 0);

  function majority(x, y) {
    for (let i = 2; i < 5; i++) {
      let ct = 0;
      for (let a = -i + 1; a <= i - 1; a++) {
        ct += get(x + a, y + i - 1) ? 1 : -1;
        ct += get(x + i - 1, y + a - 1) ? 1 : -1;
        ct += get(x + a - 1, y - i) ? 1 : -1;
        ct += get(x - i, y + a) ? 1 : -1;
      }
      if (ct > 0) return 1;
      if (ct < 0) return 0;
    }
    return 0;
  }

  function findPath(x0, y0) {
    const path = new Path();
    let x = x0, y = y0, dirx = 0, diry = 1, tmp;
    path.sign = get(x0, y0) ? '+' : '-';
    for (;;) {
      path.pt.push(new Point(x, y));
      if (x > path.maxX) path.maxX = x;
      if (x < path.minX) path.minX = x;
      if (y > path.maxY) path.maxY = y;
      if (y < path.minY) path.minY = y;
      path.len++;

      x += dirx;
      y += diry;
      path.area -= x * diry;

      if (x === x0 && y === y0) break;

      const l = get(x + (dirx + diry - 1) / 2, y + (diry - dirx - 1) / 2);
      const r = get(x + (dirx - diry - 1) / 2, y + (diry + dirx - 1) / 2);

      if (r && !l) {
        if (turnPolicy === 'right'
          || (turnPolicy === 'black' && path.sign === '+')
          || (turnPolicy === 'white' && path.sign === '-')
          || (turnPolicy === 'majority' && majority(x, y))
          || (turnPolicy === 'minority' && !majority(x, y))) {
          tmp = dirx; dirx = -diry; diry = tmp;
        } else {
          tmp = dirx; dirx = diry; diry = -tmp;
        }
      } else if (r) {
        tmp = dirx; dirx = -diry; diry = tmp;
      } else if (!l) {
        tmp = dirx; dirx = diry; diry = -tmp;
      }
    }
    return path;
  }

  function xorPath(path) {
    const pt = path.pt, len = path.len, maxX = path.maxX;
    let y1 = pt[0].y;
    for (let i = 1; i < len; i++) {
      const x = pt[i].x, y = pt[i].y;
      if (y !== y1) {
        const row = (y1 < y ? y1 : y) * w;
        for (let j = row + x, end = row + maxX; j < end; j++) data[j] ^= 1;
        y1 = y;
      }
    }
  }

  const list = [];
  let i = 0;
  for (;;) {
    while (i < size && data[i] !== 1) i++;
    if (i >= size) break;
    const y = (i / w) | 0;
    const path = findPath(i - y * w, y);
    xorPath(path);
    if (path.area > turdSize) list.push(path);
  }
  return list;
}

function trace({ bits, w, h }, params) {
  const turdSize = clamp(Number(params.turdSize) || 0, 0, 100000);
  const tracer = new Potrace({
    threshold: 128,
    blackOnWhite: true,
    turdSize,
    alphaMax: clamp(Number(params.alphaMax), 0, 1.3334),
    optCurve: params.optCurve !== false,
    optTolerance: clamp(Number(params.optTolerance) || 0.2, 0.01, 5),
    turnPolicy: Potrace.TURNPOLICY_MINORITY,
  });
  if (!(w > 0 && h > 0) || !bits || bits.length < w * h) throw new Error('Ungültiges Bild für die Vektorisierung');
  // Bild „geladen“ markieren und die schnelle Pfadsuche einsetzen
  tracer._luminanceData = { width: w, height: h };
  tracer._imageLoaded = true;
  tracer._bmToPathlist = function bmToPathlist() {
    this._pathlist = bitsToPathlist(bits, w, h, turdSize, this._params.turnPolicy);
  };
  // Formen begradigen: Potrace-Kurven durch Geraden, Bögen, Kreise und Ellipsen ersetzen
  if (params.shapes) {
    tracer._bmToPathlist();
    tracer._processPath();
    tracer._processed = true;
    const opts = {
      tol: clamp(Number(params.shapeTol) || 1.5, 0.5, 50),
      snap: params.shapeSnap !== false,
      snapDeg: 4,
      renderOriginal: (curve) => potraceUtils.renderCurve(curve),
    };
    // Begradigen vor „Schrift & Logos“: Konturen ganz innerhalb eines Schriftbereichs bleiben unverändert
    const skip = Array.isArray(params.shapeSkip) ? params.shapeSkip : [];
    const inText = (p) => skip.some(([x0, y0, x1, y1]) => p.minX >= x0 && p.maxX <= x1 && p.minY >= y0 && p.maxY <= y1);
    return tracer._pathlist
      .map((p) => (inText(p) ? opts.renderOriginal(p.curve) : fitCurve(p.curve, opts)))
      .join(' ');
  }
  // Nur das "d"-Attribut zurückgeben; das SVG baut der Renderer selbst (mit mm-Maßen)
  const tag = tracer.getPathTag('#000');
  const start = tag.indexOf(' d="') + 4;
  return start >= 4 ? tag.slice(start, tag.indexOf('"', start)) : '';
}

if (process.parentPort) process.parentPort.on('message', (e) => {
  const { id, image, params } = e.data;
  try {
    // Modus Farben: mehrere Ebenen gleicher Größe in einem Auftrag (Ergebnis: ein Pfad je Ebene)
    const d = Array.isArray(image && image.layers)
      ? image.layers.map((bits) => trace({ bits, w: image.w, h: image.h }, params))
      : trace(image, params);
    process.parentPort.postMessage({ id, ok: true, d });
  } catch (err) {
    process.parentPort.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
});

module.exports = { trace, bitsToPathlist };
