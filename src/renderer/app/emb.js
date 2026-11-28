/** Stickdateien (PES/DST/EXP): Stichplanung und Anzeige. */

import { Embroidery } from '../embroidery.js';
import { $ } from './dom.js';
import { scheduleDragPrepare } from './drag.js';
import { embDlg, scheduleEmbDialog } from './emb-dialog.js';
import { baseName } from './export.js';
import { showPreview } from './merge.js';
import { Pipeline } from './pipeline.js';
import { EMB_MODES, embFormats, state } from './state.js';

/* ---- Stickdateien (PES/DST/EXP) ---- */

/**
 * Vektordaten fürs Sticken: Farbflächen bzw. die Fläche (schwarz) als Füllstich, die Umrisslinie
 * als Steppstich. Nur Modi mit Vektorflächen (Fläche, Linien, Farben).
 */
export function embSource({ mode, colors, fillPath, stroke = null, outline, outlineOnly, mmPerPx }) {
  if (!EMB_MODES.includes(mode)) return null;
  const layers = [];
  if (!outlineOnly) {
    if (mode === 'sine') {
      // Wellen: offene Linien als Steppstich
      if (stroke && stroke.d) layers.push({ d: stroke.d, hex: '#000000', name: 'Wellen', key: 'sine', kind: 'line', pad: 0 });
      // Motivkontur (schmaler Ring) als Steppstich entlang seiner Ränder
      if (fillPath && String(fillPath).trim()) layers.push({ d: fillPath, hex: '#000000', name: 'Motivkontur', key: 'contour', kind: 'run', pad: 0 });
    } else if (colors) {
      for (const c of colors) if (c.d) layers.push({ d: c.d, hex: c.hex, name: c.name || c.label, key: c.key || c.hex, kind: c.kind || 'fill', pad: 0, own: !!c.own });
    } else if (fillPath && String(fillPath).trim()) {
      layers.push({ d: fillPath, hex: '#000000', name: 'Fläche', key: 'fill', kind: 'fill', pad: 0 });
    }
  }
  // Umrisslinie: Pfad im Koordinatensystem des erweiterten Bildes (Bild bei pad/pad)
  if (outline && outline.d) layers.push({ d: outline.d, hex: '#000000', name: 'Umrisslinie', key: 'outline', kind: 'run', pad: outline.pad || 0 });
  return layers.length ? { layers, mmPerPx } : null;
}

/** Polygone (mm) und Formanalyse je Ebene – hängen nur am Ergebnis, einmal gerechnet. */
export function embGeometry(r) {
  const e = r.emb;
  if (!e.rings) {
    e.rings = e.layers.map((l) => Embroidery.scaleRings(
      Embroidery.pathToRings(l.d, 0.3 / e.mmPerPx, l.kind === 'line'), e.mmPerPx, -l.pad * e.mmPerPx, -l.pad * e.mmPerPx,
    ));
    e.an = e.layers.map((l, i) => (l.kind === 'fill' ? Embroidery.analyze(e.rings[i]) : null));
  }
  return e;
}

/**
 * Stickgeometrie in Motivgröße: „Breite (mm)“ gilt bei Stickdateien für das gestickte Motiv, nicht für das
 * Bild mit Rand und Hintergrund. Ergebnis { rings, an, f } (f = Faktor gegenüber der Bildgröße).
 */
export function embScaled(r, s = state.settings) {
  const e = embGeometry(r);
  const target = Number(s.widthMm) || 0;
  if (e.scaled && e.scaled.target === target) return e.scaled;
  let x0 = Infinity, x1 = -Infinity;
  for (const rs of e.rings) for (const ring of rs) for (let k = 0; k < ring.length; k += 2) {
    if (ring[k] < x0) x0 = ring[k];
    if (ring[k] > x1) x1 = ring[k];
  }
  const f = target > 0 && x1 > x0 ? target / (x1 - x0) : 1;
  const rings = f === 1 ? e.rings : e.rings.map((rs) => Embroidery.scaleRings(rs, f));
  const an = f === 1 ? e.an : e.layers.map((l, i) => (l.kind === 'fill' ? Embroidery.analyze(rings[i]) : null));
  e.scaled = { target, f, rings, an };
  return e.scaled;
}

/**
 * Stickparameter je Ebene: Automatik aus Stoff und Form (Winkel abhängig von der Fläche darunter),
 * darüber die von Hand gesetzten Werte (s.embLayers[key]).
 * Ergebnis: [{ key, name, hex, kind, auto: {params, why}, manual, params }]
 */
export function embLayerParams(r, s = state.settings) {
  const e = embGeometry(r);
  const sc = embScaled(r, s);
  const manualAll = s.embLayers || {};
  let prevAngle = null;
  return e.layers.map((l, i) => {
    const auto = Embroidery.autoParams(sc.an[i], s.embFabric, prevAngle, l.kind);
    const manual = manualAll[l.key] || {};
    const params = { ...auto.params, ...manual };
    if (params.type === 'fill') prevAngle = Number(params.angle);
    return { key: l.key, name: l.name, hex: l.hex, kind: l.kind, auto, manual, params };
  });
}

export const embKey = (s) => JSON.stringify([s.embFabric, s.embTrimMm, s.embLayers || {}, s.widthMm]);

/** Schon geplante Stiche des Ergebnisses für diese Einstellungen, sonst null (planen: planStitches). */
export function stitchPattern(r, s = state.settings) {
  if (!r || !r.emb) return null;
  return r.embCache && r.embCache.key === embKey(s) ? r.embCache.pat : null;
}

/**
 * Stiche des Ergebnisses planen – im Stich-Worker, damit die Oberfläche bedienbar bleibt. Zwischengespeichert
 * je Stoff, Schnittlänge, Handeinstellungen und Breite; gleiche Anfragen teilen sich eine laufende Planung.
 * Eine Planung mit anderen Einstellungen bricht die laufende ab (deren Promise endet mit „cancelled“).
 */
export function planStitches(r, s = state.settings) {
  if (!r || !r.emb) return Promise.resolve(null);
  const key = embKey(s);
  if (r.embCache && r.embCache.key === key) return Promise.resolve(r.embCache.pat);
  if (r.embPlan && r.embPlan.key === key) return r.embPlan.promise;
  const e = embGeometry(r);
  const sc = embScaled(r, s);
  const lp = embLayerParams(r, s);
  const layers = e.layers.map((l, i) => ({
    rings: sc.rings[i], an: sc.an[i], hex: l.hex, kind: l.kind, name: l.name, p: lp[i].params, own: !!l.own,
  }));
  const promise = Pipeline.planStitches(layers, { trimMm: s.embTrimMm }).then((pat) => {
    pat.widthMm = (pat.bounds[2] - pat.bounds[0]) / 10;
    pat.heightMm = (pat.bounds[3] - pat.bounds[1]) / 10;
    r.embCache = { key, pat };
    return pat;
  }).finally(() => {
    if (r.embPlan && r.embPlan.promise === promise) r.embPlan = null;
  });
  r.embPlan = { key, promise };
  return promise;
}

export const EMB_MAX_MM = 400; // größere Motive passen in keinen Stickrahmen (und sprengen PES-Sprünge)

/** PES/DST/EXP-Dateien des Ergebnisses (leer, wenn nicht gewählt oder nichts zu sticken). */
export async function embroideryFiles(r, s) {
  if (!embFormats(s) || !r.emb) return [];
  const pat = await planStitches(r, s);
  if (!pat || !pat.stats.stitches || Math.max(pat.widthMm, pat.heightMm) > EMB_MAX_MM) return [];
  const files = [];
  if (s.fmtPes) files.push({ ext: 'pes', data: Embroidery.toPes(pat, baseName()) });
  if (s.fmtDst) files.push({ ext: 'dst', data: Embroidery.toDst(pat, baseName()) });
  if (s.fmtExp) files.push({ ext: 'exp', data: Embroidery.toExp(pat) });
  // Farben zu EXP (und DST mit gleichem Namen) für Melco DesignShop 12
  if (s.fmtExp) files.push({ ext: 'inf', data: Embroidery.toInf(pat) });
  return files;
}

/** Hinweis, warum keine Stickdatei entsteht (oder null). Probleme der Stiche erst nach planStitches. */
export function embroideryProblem(r, s) {
  if (!embFormats(s)) return null;
  if (!r.emb) {
    return EMB_MODES.includes(r.mode) || r.merge
      ? 'Keine Stickdatei – das Ergebnis ist leer.'
      : 'PES/DST/EXP gibt es nur in den Modi Fläche, Linien, Wellen und Farben.';
  }
  const pat = stitchPattern(r, s);
  if (!pat) return null; // noch nicht geplant
  if (!pat.stats.stitches) return 'Keine Stickdatei – die Flächen sind zu klein für Stiche.';
  if (Math.max(pat.widthMm, pat.heightMm) > EMB_MAX_MM) return `Keine Stickdatei – das Motiv ist größer als ${EMB_MAX_MM} mm. Breite unter „Ausgabegröße“ verringern.`;
  return null;
}

/** Stiche als Vorschaubild (Fadenfarben, gleicher Maßstab wie das Ergebnis, höchstens 2400 px). */
export async function stitchPreviewBlob(r, s) {
  const pat = await planStitches(r, s);
  if (!pat || !pat.stats.stitches) return null;
  const [x0, y0, x1, y1] = pat.bounds;
  const margin = 12;
  const scale = Math.min(0.1 / (r.emb.mmPerPx * embScaled(r, s).f), 2400 / Math.max(1, x1 - x0), 2400 / Math.max(1, y1 - y0)); // px je 0,1 mm
  const c = new OffscreenCanvas(Math.ceil((x1 - x0) * scale) + 2 * margin, Math.ceil((y1 - y0) * scale) + 2 * margin);
  Embroidery.draw(c.getContext('2d'), pat, scale, margin - x0 * scale, margin - y0 * scale);
  return c.convertToBlob({ type: 'image/png' });
}

export const fmtInt = (v) => Math.round(v).toLocaleString('de-DE');
export const fmtMm = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');

/** Kennzahlen der Stickdatei im Abschnitt „Stickdatei“ (nur wenn die Stiche schon geplant sind). */
export function renderEmbInfo(r = state.result) {
  renderEmbManualInfo();
  const el = $('#emb-info');
  const s = state.settings;
  if (!r || !embFormats(s)) { el.textContent = ''; return; }
  const key = embKey(s);
  const pat = r.embCache && r.embCache.key === key ? r.embCache.pat : null;
  if (!pat) {
    el.textContent = r.emb ? 'Stiche werden geplant …' : (embroideryProblem(r, s) || '');
    return;
  }
  const problem = embroideryProblem(r, s);
  // Vereinigen: Rasterbild-Ebenen (Foto, abgeschwächte Ebene) lassen sich nicht sticken
  const skipped = r.embSkipped && r.embSkipped.length
    ? ` Ohne ${r.embSkipped.map((n) => `„${n}“`).join(', ')} – Rasterbilder lassen sich nicht sticken.`
    : '';
  el.textContent = problem || embSummary(pat) + skipped;
}

/** Kennzahlen einer Stickdatei als Text (Stiche, Farben, Schnitte, Größe, Rahmen). */
export function embSummary(pat) {
  const st = pat.stats;
  const parts = [
    `${fmtInt(st.stitches)} Stiche`,
    `${st.colors} ${st.colors === 1 ? 'Farbe' : 'Farben'}`,
    `${fmtInt(st.trims)} ${st.trims === 1 ? 'Fadenschnitt' : 'Fadenschnitte'}`,
    `${fmtMm(pat.widthMm)} × ${fmtMm(pat.heightMm)} mm`,
  ].map((t) => t.replace(/ /g, '\u00a0')); // Zahl und Einheit nicht trennen
  // übliche Rahmen bis 130 × 180 mm (in beiden Lagen)
  const fits = (a, b) => (pat.widthMm <= a && pat.heightMm <= b) || (pat.widthMm <= b && pat.heightMm <= a);
  const hoop = fits(100, 100) ? 'passt in den Rahmen 100\u00a0×\u00a0100\u00a0mm'
    : fits(130, 180) ? 'passt in den Rahmen 130\u00a0×\u00a0180\u00a0mm'
      : 'größer als 130\u00a0×\u00a0180\u00a0mm – großer Stickrahmen nötig';
  return `${parts.join(' · ')} – ${hoop}`;
}

/** Hinweis neben „Je Farbe einstellen…“: wie viele Farben von Hand angepasst sind. */
export function renderEmbManualInfo() {
  const n = Object.keys(state.settings.embLayers || {}).length;
  $('#emb-manual-info').textContent = n ? `${n} ${n === 1 ? 'Farbe' : 'Farben'} von Hand angepasst` : 'Automatik je Farbe';
  $('#btn-emb-dialog').disabled = !(state.result && state.result.emb);
}

export let embTimer = null;

/** Stickeinstellungen geändert: Stiche neu planen, Vorschau und Herausziehen aktualisieren. */
export function scheduleEmbRefresh() {
  // Dialog offen: nur dort neu zeichnen, Vorschau und Herausziehen beim Schließen
  if ($('#emb-dialog').open) {
    embDlg.dirty = true;
    scheduleEmbDialog();
    return;
  }
  clearTimeout(embTimer);
  embTimer = setTimeout(() => {
    const r = state.result;
    if (!r) return;
    showPreview(r);
    scheduleDragPrepare(0);
  }, 200);
}
