/** Ergebnis und Original herausziehen (Drag & Drop). */

import { AI } from '../ai.js';
import { Encoders } from '../encoders.js';
import { $, setBusy, toast } from './dom.js';
import { embroideryFiles, renderEmbInfo } from './emb.js';
import { baseName, buildRasterFiles, lightBurnSvg, rasterCanvas } from './export.js';
import { saveToHistory } from './history.js';
import { restoreSig, upTag } from './keys.js';
import { mergeTimer } from './merge.js';
import { Pipeline, isCancelled, processTimer, resultIsCurrent, scheduleProcess } from './pipeline.js';
import { Run, downloadStarts, hideProgress } from './progress.js';
import { embFormats, laserFormats, state } from './state.js';

export let dragReady = false;
/** Bis zum nächsten Ergebnis nichts herausziehen lassen (das angezeigte ist veraltet). */
export function invalidateDrag() {
  dragReady = false;
}
export let dragTimer = null;

/** Bereitet die Dateien zum Herausziehen vor (gewählte Exportformate), im Hintergrund. */
export function scheduleDragPrepare(delay = 250) {
  dragReady = false;
  clearTimeout(dragTimer);
  // Info sofort mit den gewählten Formaten aktualisieren (Dateien folgen im Hintergrund)
  const fs0 = state.settings;
  const exts = [];
  const embOnly = !laserFormats(fs0) && embFormats(fs0) && state.result && state.result.emb;
  if (fs0.fmtSvg || (!laserFormats(fs0) && !embOnly)) exts.push('svg');
  if (fs0.fmtPng) exts.push('png');
  if (fs0.fmtJpg) exts.push('jpg');
  if (fs0.fmtBmp) exts.push('bmp');
  if (state.result && state.result.emb) {
    if (fs0.fmtPes) exts.push('pes');
    if (fs0.fmtDst) exts.push('dst');
    if (fs0.fmtExp) exts.push('exp', 'inf');
  }
  renderResultInfo(exts);
  dragTimer = setTimeout(async () => {
    const r = state.result;
    if (!r) return;
    const s = state.settings;
    try {
      const files = await handoverFiles(r, s, true);
      if (r === state.result) renderEmbInfo(r); // Stiche sind jetzt geplant
      const icon = await dragIcon(r);
      if (r !== state.result) return; // inzwischen neu berechnet
      await window.api.dragPrepare({ baseName: baseName(), files, icon });
      dragReady = r === state.result;
      if (r === state.result) renderResultInfo(files.map((f) => f.ext));
    } catch (err) {
      if (!isCancelled(err)) console.error(err); // abgebrochen: eine neuere Vorbereitung läuft schon
    }
  }, delay);
}

/**
 * Dateien zum Herausziehen bzw. Senden an LightBurn: gewählte Exportformate, ohne Auswahl das SVG.
 * embroidery: auch PES/DST/EXP (nur beim Herausziehen – LightBurn kann damit nichts anfangen).
 */
export async function handoverFiles(r, s, embroidery = false, lightburn = false) {
  const files = [];
  const emb = embroidery ? await embroideryFiles(r, s) : [];
  // LightBurn: jede Ebene in eigener LightBurn-Farbe (sonst landen gleiche/ähnliche Farben in einer Ebene)
  if (s.fmtSvg || (!laserFormats(s) && !emb.length)) files.push({ ext: 'svg', data: lightburn ? lightBurnSvg(r) : r.svg });
  files.push(...(await buildRasterFiles(r, { png: s.fmtPng, jpg: s.fmtJpg, bmp: s.fmtBmp })));
  files.push(...emb);
  return files;
}

/** Kleine Info im Ergebnisfeld: herausziehbar, welche Dateien, welche Größe. */
export function renderResultInfo(exts) {
  const el = $('#result-info');
  const r = state.result;
  if (!r || !exts || !exts.length) { el.hidden = true; return; }
  const mm = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
  const size = `${mm(r.totalWmm ?? r.widthMm)} × ${mm(r.totalHmm ?? r.heightMm)} mm`;
  const raster = exts.some((e) => e === 'png' || e === 'jpg' || e === 'bmp') ? ` · ${Math.round(r.dpi)} DPI` : '';
  el.textContent = `⤴ ${MOD_KEY} + Ziehen: ${exts.map((e) => e.toUpperCase()).join(' + ')} · ${size}${raster}`;
  el.title = `Mit gedrückter ${MOD_KEY}-Taste das Ergebnis herausziehen, z. B. direkt in LightBurn, den Finder oder Explorer. Formate unter „Exportformate“.`;
  el.hidden = false;
}

/* ---- Optimiertes Original herausziehen (Strg + Ziehen im Originalfeld) ---- */

// Bild, das in die Umwandlung geht: restauriert, KI-vergrößert, freigestellt (Hintergrund transparent)
export const origDrag = { ready: false, key: null, timer: null, info: null };
export const MOD_KEY = /Mac/.test(navigator.platform) ? '⌘' : 'Strg';

export function resetOriginalDrag() {
  clearTimeout(origDrag.timer);
  Object.assign(origDrag, { ready: false, key: null, info: null });
  renderOriginalInfo();
}

/** Bereitet das optimierte Original als PNG zum Herausziehen vor (im Hintergrund, nur bei Änderungen). */
export function scheduleOriginalDrag(s, work, mask) {
  const key = `${upTag(s)}|${mask ? s.maskKey : 'none'}|${work.width}x${work.height}`;
  if (key === origDrag.key) return;
  clearTimeout(origDrag.timer);
  origDrag.key = key;
  origDrag.ready = false;
  const steps = [];
  if (restoreSig(s)) steps.push('restauriert');
  if (work.width > state.source.bitmap.width) steps.push('KI-vergrößert');
  if (mask) steps.push('freigestellt');
  origDrag.info = { w: work.width, h: work.height, steps };
  renderOriginalInfo();
  const source = state.source;
  origDrag.timer = setTimeout(async () => {
    try {
      const c = new OffscreenCanvas(work.width, work.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(work, 0, 0);
      if (mask) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(mask, 0, 0, c.width, c.height);
      }
      const png = await Encoders.canvasBytes(c, 'image/png');
      const sc = Math.min(1, 96 / Math.max(c.width, c.height));
      const ic = new OffscreenCanvas(Math.max(1, Math.round(c.width * sc)), Math.max(1, Math.round(c.height * sc)));
      const ictx = ic.getContext('2d');
      ictx.imageSmoothingQuality = 'high';
      ictx.drawImage(c, 0, 0, ic.width, ic.height);
      const icon = await Encoders.canvasBytes(ic, 'image/png');
      if (origDrag.key !== key || state.source !== source) return; // inzwischen geändert
      const suffix = origDrag.info.steps.length ? '-optimiert' : '-original';
      await window.api.dragPrepare({ kind: 'original', baseName: baseName() + suffix, files: [{ ext: 'png', data: png }], icon });
      origDrag.ready = origDrag.key === key;
      renderOriginalInfo();
    } catch (err) {
      console.error(err);
    }
  }, 400);
}

/** Kleine Info im Originalfeld: mit Strg herausziehbar, Größe, was optimiert wurde. */
export function renderOriginalInfo() {
  const el = $('#original-info');
  const i = origDrag.info;
  if (!i || !state.source) { el.hidden = true; return; }
  const what = i.steps.length ? `optimiert (${i.steps.join(', ')})` : 'Original';
  el.textContent = `⤴ ${MOD_KEY} + Ziehen: ${what} · PNG · ${i.w} × ${i.h} px${origDrag.ready ? '' : ' · wird vorbereitet …'}`;
  el.title = `Mit gedrückter ${MOD_KEY}-Taste das Bild herausziehen`
    + ' – so, wie es in die Umwandlung geht: restauriert, KI-vergrößert und freigestellt (Hintergrund transparent), ohne Markierungen.';
  el.hidden = false;
}

/** Kleines Vorschaubild für den Mauszeiger beim Ziehen. */
export async function dragIcon(r) {
  const { canvas: full, w: fw, h: fh } = rasterCanvas(r, false); // inkl. Umrisslinie
  const sc = Math.min(1, 96 / Math.max(fw, fh));
  const c = new OffscreenCanvas(Math.max(1, Math.round(fw * sc)), Math.max(1, Math.round(fh * sc)));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, c.width, c.height);
  return Encoders.canvasBytes(c, 'image/png');
}

/**
 * Alles abbrechen: laufende Berechnung (Worker), KI-Prozess, Vektorisierung und
 * Modell-Downloads. Das letzte fertige Ergebnis bleibt stehen.
 */
export async function cancelAll() {
  const gen = ++state.generation; // laufende Durchläufe gelten als veraltet
  state.cancelledAt = performance.now();
  clearTimeout(processTimer);
  Pipeline.cancel();
  AI.abort(); // Kachel-Schleifen (Vergrößern, Restaurieren) steigen vor der nächsten Kachel aus
  // Oberfläche sofort zurücksetzen (vor dem Warten auf den Main-Prozess)
  Run.stop();
  downloadStarts.clear();
  Run.downloading = false;
  hideProgress();
  setBusy(false);
  state.processing = false;
  clearTimeout(mergeTimer); // offene Vereinigung erst beim nächsten Durchlauf/Export
  toast('Berechnung abgebrochen.');
  try { await window.api.cancelAll(); } catch { /* ignorieren */ }
  if (state.generation === gen) {
    // Fortschritt, der während des Wartens noch ankam, wieder ausblenden
    downloadStarts.clear();
    Run.downloading = false;
    hideProgress();
  }
  // Hat inzwischen eine neue Berechnung begonnen (z. B. durch eine geänderte Einstellung),
  // kann der Abbruch im Main-Prozess sie mit erwischt haben – dann neu starten.
  if (state.generation !== gen) scheduleProcess(0);
}

export function bindCancel() {
  $('#btn-cancel').addEventListener('click', cancelAll);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('dialog[open]')) return; // Esc schließt nur den Dialog, Berechnungen/Downloads laufen weiter
    const busy = $('#busy').classList.contains('on') || !$('#progress').hidden;
    if (busy) { e.preventDefault(); cancelAll(); }
  });
}

export function bindOriginalDrag() {
  const img = $('#img-original');
  const result = $('#img-result');
  // Strg (Mac: auch Cmd) gedrückt → Original und Ergebnis werden zur Drag-Quelle statt zum Verschieben/Punkte setzen
  const setCtrl = (on) => {
    document.body.classList.toggle('ctrl-drag', on);
    img.draggable = on && !!state.source;
    result.draggable = on && !!state.result;
  };
  window.addEventListener('keydown', (e) => { if (e.key === 'Control' || e.key === 'Meta') setCtrl(true); });
  window.addEventListener('keyup', (e) => { if (e.key === 'Control' || e.key === 'Meta') setCtrl(false); });
  window.addEventListener('blur', () => setCtrl(false));
  img.addEventListener('pointerdown', (e) => setCtrl(e.ctrlKey || e.metaKey), true);
  result.addEventListener('pointerdown', (e) => setCtrl(e.ctrlKey || e.metaKey), true);
  img.addEventListener('dragstart', (e) => {
    e.preventDefault(); // eigenes System-Drag mit echter Datei statt Bild-URL
    if (!(e.ctrlKey || e.metaKey) || !state.source) return;
    if (!origDrag.ready) {
      toast('Das Bild wird noch vorbereitet – bitte gleich noch einmal ziehen.');
      return;
    }
    window.api.dragStart('original');
  });
  // Strg + Klick setzt keinen Punkt (sonst entstünde beim Ziehen-Versuch ohne Bewegung ein Klickpunkt)
  img.addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey) e.stopImmediatePropagation();
  }, true);
}

export function bindResultDrag() {
  $('#img-result').addEventListener('dragstart', (e) => {
    e.preventDefault(); // eigenes System-Drag mit echten Dateien statt Bild-URL
    if (!(e.ctrlKey || e.metaKey) || !state.result) return; // nur Strg/Cmd + Ziehen, sonst wird verschoben
    if (!dragReady || !resultIsCurrent(state.result)) {
      if (!resultIsCurrent(state.result) && !$('#busy').classList.contains('on')) scheduleProcess(0);
      toast('Die Dateien werden noch vorbereitet – bitte gleich noch einmal ziehen.');
      return;
    }
    window.api.dragStart();
    saveToHistory(true); // wie beim Export in der Historie festhalten
  });
}
