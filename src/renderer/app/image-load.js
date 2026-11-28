/** Bild laden: Datei, Einfügen, Drag & Drop, SVG-Vorlagen. */

import { $, toast } from './dom.js';
import { invalidateDrag, renderResultInfo, resetOriginalDrag } from './drag.js';
import { lightburnBusy } from './export.js';
import { renderHistory } from './history.js';
import { renderMergePanel } from './merge.js';
import { scheduleProcess } from './pipeline.js';
import { round1, syncControls } from './settings.js';
import { persistSettings, state, withDefaults } from './state.js';

/** Ist das eine SVG-Datei? (Endung oder Inhalt, z. B. beim Einfügen ohne Namen) */
export function isSvgFile(name, bytes) {
  if (/\.svg$/i.test(name)) return true;
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^\uFEFF/, '').trimStart();
  return /^<(\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head);
}

export const SVG_RASTER_PX = 3000; // längere Seite beim Rastern von SVG-Vorlagen (reicht für alle Arbeitsauflösungen)

/**
 * SVG als Bild laden: im Browser (ohne Skripte) gerendert und auf SVG_RASTER_PX gerastert,
 * Transparenz bleibt erhalten. widthMm: Breite aus dem width-Attribut, falls in mm/cm/in angegeben.
 */
export async function rasterizeSvg(bytes) {
  const text = new TextDecoder().decode(bytes);
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('Kein gültiges SVG');
  const unit = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
  const parseLen = (v) => {
    const m = /^\s*([\d.]+)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(v || '');
    return m ? { v: Number(m[1]), u: (m[2] || 'px').toLowerCase() } : null;
  };
  const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const hasVb = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
  const wa = parseLen(root.getAttribute('width')), ha = parseLen(root.getAttribute('height'));
  // Seitenverhältnis: viewBox, sonst width/height, sonst Standardgröße des Browsers
  let aspect = hasVb ? vb[2] / vb[3] : wa && ha && wa.v > 0 && ha.v > 0 ? wa.v / ha.v : 0;
  const widthMm = wa && unit[wa.u] && wa.v > 0 ? wa.v * unit[wa.u] : null;
  if (!aspect) aspect = 2;
  const W = Math.round(aspect >= 1 ? SVG_RASTER_PX : SVG_RASTER_PX * aspect);
  const H = Math.round(aspect >= 1 ? SVG_RASTER_PX / aspect : SVG_RASTER_PX);
  // feste Pixelgröße setzen, damit der Browser in voller Auflösung rendert (nicht 300 × 150)
  // ohne viewBox: Koordinaten sind CSS-Pixel (96 je Zoll) – Maße in mm/in usw. umrechnen
  const px = (l) => l.v * (l.u === 'px' ? 1 : (unit[l.u] * 96) / 25.4);
  if (!hasVb && wa && ha) root.setAttribute('viewBox', `0 0 ${px(wa)} ${px(ha)}`);
  root.setAttribute('width', W);
  root.setAttribute('height', H);
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = new OffscreenCanvas(W, H);
    c.getContext('2d').drawImage(img, 0, 0, W, H);
    return { bitmap: await createImageBitmap(c), widthMm };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadImage(name, bytes, { historyId = null, settings = null } = {}) {
  const svg = isSvgFile(name, bytes);
  const ext = svg ? 'svg' : (name.split('.').pop() || 'png').toLowerCase();
  const blob = new Blob([bytes], svg ? { type: 'image/svg+xml' } : {});
  let bitmap, svgWidthMm = null;
  try {
    if (svg) ({ bitmap, widthMm: svgWidthMm } = await rasterizeSvg(bytes));
    else bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    toast(svg ? 'Diese SVG-Datei kann nicht gelesen werden.' : 'Dieses Bildformat kann nicht gelesen werden.', true);
    return;
  }

  if (state.source) {
    URL.revokeObjectURL(state.source.url);
    state.source.bitmap.close();
  }
  const url = URL.createObjectURL(blob);
  state.source = { name, ext, bytes, bitmap, url, savedId: historyId };
  state.historyId = historyId;
  state.historyName = null; // setzt openHistoryEntry bzw. saveToHistory
  state.result = null;
  state.baseResult = null;
  state.merge = null; // gehört zum vorigen Bild (ein Historie-Eintrag stellt seine Vereinigung danach wieder her)
  state.mergePending = false;
  renderMergePanel();
  state.cancelRetries = 0;
  invalidateDrag(); // altes Ergebnis lässt sich nicht mehr herausziehen
  renderResultInfo(null);
  resetOriginalDrag();
  state.cache = new Map();
  state.inflight = new Map();
  state.faceCount = null;
  state.restoreFaceCount = null;
  state.restoreInfo = '';
  $('#restore-info').textContent = '';
  $('#face-info').textContent = '';
  $('#text-info').textContent = '';
  state.mask = null;
  state.maskRaw = null;
  state.originalViewKey = null;
  state.originalViewPending = null;
  state.lastViewBase = null; // altes (restauriertes) Bild nicht im Speicher halten
  state.lastTextBlocks = null;
  state.lastView = null;

  if (settings) {
    state.settings = withDefaults(settings);
  } else {
    state.settings = { ...state.settings, bgSeeds: [], samPoints: [], colorEdits: [], embLayers: {} }; // Klickpunkte, Farb- und Stickänderungen gelten nur für ein Bild
    // SVG mit Maßangabe (mm/cm/in): diese Breite übernehmen
    if (svgWidthMm && svgWidthMm >= 1 && svgWidthMm <= 2000) {
      state.settings.widthMm = round1(svgWidthMm);
      toast(`SVG übernommen – Breite ${String(round1(svgWidthMm)).replace('.', ',')} mm aus der Datei.`);
    }
  }
  persistSettings();

  $('#img-original').src = url;
  document.body.classList.add('has-image');
  $('#btn-export').disabled = false;
  $('#btn-lightburn').disabled = lightburnBusy;
  $('#btn-save-history').disabled = false;
  syncControls();
  renderHistory();
  scheduleProcess(0);
}

export async function readFile(file) {
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) {
    toast('Bitte eine Bilddatei verwenden.', true);
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  await loadImage(file.name || 'eingefuegt.png', bytes);
}

export function bindDragDrop() {
  let depth = 0;
  const dz = $('#dropzone');
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    depth++;
    dz.classList.add('dragging');
  });
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    depth = Math.max(0, depth - 1);
    if (!depth) dz.classList.remove('dragging');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    dz.classList.remove('dragging');
    const file = Array.from(e.dataTransfer.files || []).find((f) => !f.type || f.type.startsWith('image/'));
    if (file) readFile(file);
    else toast('Keine Bilddatei erkannt.', true);
  });

  window.addEventListener('paste', (e) => {
    const file = Array.from(e.clipboardData?.files || []).find((f) => f.type.startsWith('image/'));
    if (file) readFile(file);
  });

  const open = async (e) => {
    e?.preventDefault();
    const res = await window.api.openImage();
    if (res) await loadImage(res.name, new Uint8Array(res.data));
  };
  $('#btn-open').addEventListener('click', open);
  $('#drop-open').addEventListener('click', open);
}
