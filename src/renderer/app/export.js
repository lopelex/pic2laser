/** Export und Übergabe an LightBurn. */

import { Encoders } from '../encoders.js';
import { Processing } from '../processing.js';
import { $, toast } from './dom.js';
import { handoverFiles } from './drag.js';
import { embroideryFiles, embroideryProblem, planStitches } from './emb.js';
import { saveToHistory } from './history.js';
import { cleanError } from './keys.js';
import { lightBurnLayers, svgLayersOf } from './merge.js';
import { isCancelled, resultIsCurrent, scheduleProcess } from './pipeline.js';
import { embFormats, laserFormats, state } from './state.js';

/** Dateiname (ohne Endung) für Export, Herausziehen, LightBurn und Stickdateien: Name des geöffneten
 * Historie-Eintrags (auch nach dem Umbenennen), sonst der Name der Bilddatei. */
export function baseName() {
  if (!state.source) return 'bild';
  if (state.historyId && state.historyName) return state.historyName;
  return state.source.name.replace(/\.[^.]+$/, '') || 'bild';
}

/**
 * Rasterbild des Ergebnisses – mit Umrisslinie, falls aktiv. Das Bild wird dann um den
 * Rand der Umrisslinie erweitert (gleiche Größe und Lage wie das SVG). In Bildern ist die
 * Linie schwarz (1-Bit-Formate kennen keine Farbe), mind. 0,2 mm breit.
 */
export function rasterCanvas(r, transparent) {
  const o = r.outline;
  if (!o || !o.d) return { canvas: Processing.resultCanvas(r, transparent), w: r.w, h: r.h, composed: false };
  const W = r.w + 2 * o.pad, H = r.h + 2 * o.pad;
  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d');
  if (!transparent) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
  }
  if (!r.outlineOnly) ctx.drawImage(Processing.resultCanvas(r, transparent), o.pad, o.pad);
  // Pfad liegt im Koordinatensystem des erweiterten Bildes (Bild bei pad/pad)
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(1, 0.2 / r.mmPerPx);
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(o.d));
  return { canvas: c, w: W, h: H, composed: true };
}

export async function buildRasterFiles(r, formats) {
  const files = [];
  if (formats.png) {
    const { canvas } = rasterCanvas(r, r.transparent);
    const png = await Encoders.canvasBytes(canvas, 'image/png');
    files.push({ ext: 'png', data: Encoders.pngWithDpi(png, r.dpi) });
  }
  if (formats.jpg) {
    const { canvas } = rasterCanvas(r, false);
    const jpg = await Encoders.canvasBytes(canvas, 'image/jpeg', 0.95);
    files.push({ ext: 'jpg', data: Encoders.jpgWithDpi(jpg, r.dpi) });
  }
  if (formats.bmp) {
    let bmp;
    const { canvas, w, h, composed } = rasterCanvas(r, false);
    if (r.rgba8) {
      bmp = Encoders.bmp24(canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, w, h, r.dpi);
    } else if (!composed) {
      bmp = r.gray8 ? Encoders.bmp8gray(r.gray8, r.w, r.h, r.dpi) : Encoders.bmp1bit(r.bits, r.w, r.h, r.dpi);
    } else {
      // zusammengesetztes Bild (mit Umrisslinie) wieder in Bits bzw. Graustufen umwandeln
      const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
      if (r.gray8) {
        const g = new Uint8ClampedArray(w * h);
        for (let p = 0; p < w * h; p++) g[p] = d[p * 4];
        bmp = Encoders.bmp8gray(g, w, h, r.dpi);
      } else {
        const bits = new Uint8Array(w * h);
        for (let p = 0; p < w * h; p++) bits[p] = d[p * 4] < 128 ? 1 : 0;
        bmp = Encoders.bmp1bit(bits, w, h, r.dpi);
      }
    }
    files.push({ ext: 'bmp', data: bmp });
  }
  return files;
}

export async function exportCurrent() {
  const r = state.result;
  if (!r) return toast('Noch kein Ergebnis vorhanden.', true);
  const s = state.settings;
  if (!laserFormats(s) && !embFormats(s)) {
    return toast('Bitte mindestens ein Exportformat auswählen.', true);
  }
  // Einstellungen geändert, Ergebnis noch nicht neu berechnet → nicht das alte Ergebnis exportieren
  if (!resultIsCurrent(r)) {
    // läuft gerade keine Berechnung (z. B. nach Abbrechen oder Fehler), jetzt eine anstoßen
    if (!$('#busy').classList.contains('on')) scheduleProcess(0);
    return toast('Das Ergebnis wird an die geänderten Einstellungen angepasst – bitte danach noch einmal exportieren.');
  }
  // Stiche planen (Worker), dann erst lässt sich prüfen, ob eine Stickdatei entsteht – nur mit PES/DST/EXP
  try {
    if (embFormats(s)) await planStitches(r, s);
  } catch (err) {
    if (isCancelled(err)) return toast('Die Stickeinstellungen wurden gerade geändert – bitte noch einmal exportieren.');
    return toast(`Export fehlgeschlagen: ${cleanError(err)}`, true);
  }
  // PES/DST/EXP nicht möglich (falscher Modus, leer, zu groß): melden, die übrigen Formate trotzdem speichern
  const embProblem = embroideryProblem(r, s);
  if (embProblem && !laserFormats(s)) return toast(embProblem, true);

  let written;
  try {
    const files = [];
    if (s.fmtSvg) files.push({ ext: 'svg', data: r.svg });
    files.push(...(await buildRasterFiles(r, { png: s.fmtPng, jpg: s.fmtJpg, bmp: s.fmtBmp })));
    files.push(...(await embroideryFiles(r, s)));
    written = await window.api.exportFiles({ baseName: baseName(), files });
  } catch (err) {
    return toast(`Export fehlgeschlagen: ${cleanError(err)}`, true);
  }
  if (!written) return;

  toast(`${written.length} Datei(en) gespeichert${embProblem ? ` · ${embProblem}` : ''}`, !!embProblem, {
    label: 'Im Ordner zeigen',
    action: () => window.api.showInFolder(written[0]),
  });
  await saveToHistory(true);
}

/* ---- An LightBurn senden (Strg/Cmd+L) ---- */

/**
 * SVG für LightBurn: Vereinigungen mit eigener Farbe je Ebene; im Modus Farben ebenso (ähnliche
 * Bildfarben würden in LightBurn sonst zu einer Ebene). Sonst das normale SVG.
 */
export function lightBurnSvg(r) {
  if (r.svgLightBurn) return r.svgLightBurn;
  if (r.mode !== 'color') return r.svg;
  const layers = svgLayersOf(r.svg, r.w, r.h, { label: 'Ergebnis', id: 'farbe', widthMm: r.widthMm, isColor: true });
  if (layers.filter((l) => l.fromColor).length < 2) return r.svg;
  r.svgLightBurn = Encoders.svgDocument({ w: r.w, h: r.h, widthMm: r.widthMm, layers: lightBurnLayers(layers), outline: r.outline });
  return r.svgLightBurn;
}

export let lightburnBusy = false;

export async function sendToLightBurn() {
  const r = state.result;
  if (!r) return toast('Noch kein Ergebnis vorhanden.', true);
  if (lightburnBusy) return;
  if (!resultIsCurrent(r)) {
    if (!$('#busy').classList.contains('on')) scheduleProcess(0);
    return toast('Das Ergebnis wird an die geänderten Einstellungen angepasst – bitte danach noch einmal senden.');
  }
  const btn = $('#btn-lightburn');
  lightburnBusy = true;
  btn.disabled = true;
  try {
    const files = await handoverFiles(r, state.settings, false, true);
    const res = await window.api.lightburnSend({ baseName: baseName(), files });
    if (!res.ok) return toast(res.message, true);
    const what = files.map((f) => f.ext.toUpperCase()).join(' + ');
    toast(res.confirmed
      ? `In LightBurn eingefügt (${what})`
      : `An LightBurn gesendet (${what}) – ohne Bestätigung, da ein anderes Programm den Antwort-Port 19841 belegt.`);
    await saveToHistory(true); // wie beim Export in der Historie festhalten
  } catch (err) {
    toast(`Senden an LightBurn fehlgeschlagen: ${cleanError(err)}`, true);
  } finally {
    lightburnBusy = false;
    btn.disabled = !state.source;
  }
}
