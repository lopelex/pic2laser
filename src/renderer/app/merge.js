/** Mit einem Historie-Eintrag vereinigen. */

import { Encoders } from '../encoders.js';
import { $, $$, setBusy, toast } from './dom.js';
import { invalidateDrag, scheduleDragPrepare } from './drag.js';
import { embSource, renderEmbInfo, stitchPreviewBlob } from './emb.js';
import { iconButton, renderHistory } from './history.js';
import { cleanError } from './keys.js';
import { Pipeline, isCancelled } from './pipeline.js';
import { rasterizePath, showResult, traceParams } from './process.js';
import { syncEmbFormats } from './settings.js';
import { embFormats, state } from './state.js';

/*
 * Das aktuelle Ergebnis (state.baseResult) und das gespeicherte Ergebnis eines Historie-Eintrags
 * werden übereinandergelegt: Weiß ist durchsichtig, die obere Ebene wird mit der Deckkraft
 * („Überblenden“) abgeschwächt. Ändert sich eine Einstellung, rechnet runProcess das aktuelle
 * Ergebnis neu und vereinigt am Ende wieder (composeMerged); Reihenfolge und Deckkraft ändern nur
 * die Vereinigung, ohne neue Umwandlung.
 */

export let mergeSeq = 0; // jede Vereinigung bekommt eine Nummer; nur die neueste darf ihr Ergebnis zeigen
export let mergeRev = 0; // Stand der Vereinigen-Einstellungen (Reihenfolge, Deckkraft, Eintrag)
export let mergeTimer = null;

export const isRasterMode = (mode) => mode === 'dither' || mode === 'relief';

/** Ergebnis anzeigen und für Export, Herausziehen und Historie bereitstellen. */
export function publishResult(r, rev = mergeRev) {
  state.result = r;
  if (rev === mergeRev) state.mergePending = false;
  scheduleDragPrepare();
  showPreview(r);
}

/** Vorschau des Ergebnisses: Flächen bzw. mit „Stiche in der Vorschau zeigen“ die geplanten Stiche. */
export async function showPreview(r) {
  const s = state.settings;
  if (s.embPreview && embFormats(s) && r.emb) {
    try {
      const blob = await stitchPreviewBlob(r, s);
      if (r !== state.result) return;
      if (blob) {
        showResult(blob, false);
        renderEmbInfo(r);
        return;
      }
    } catch (err) {
      if (isCancelled(err)) return; // Stiche werden mit neueren Einstellungen geplant – deren Vorschau folgt
      console.error(err);
    }
  }
  if (r !== state.result) return;
  showResult(r.preview.blob, r.preview.pixelated);
  renderEmbInfo(r);
}

/**
 * state.baseResult (ggf. mit dem gewählten Historie-Eintrag vereinigt) als Ergebnis zeigen.
 * inRun: Aufruf aus runProcess (Fortschritt und Abbruch regelt dann der Durchlauf).
 */
export async function composeMerged(inRun = false) {
  const base = state.baseResult;
  const m = state.merge;
  if (!base) return;
  const seq = ++mergeSeq;
  const rev = mergeRev;
  if (!m) {
    publishResult(base, rev);
    if (!inRun && !state.processing) setBusy(false); // evtl. noch laufende Vereinigung ist damit hinfällig
    return;
  }
  const gen = state.generation;
  // geänderte Reihenfolge/Deckkraft machen diese Vereinigung nicht ungültig: Sie wird gezeigt und
  // danach mit den neuen Werten wiederholt (mergeRev / scheduleMerge)
  const stale = () => seq !== mergeSeq || gen !== state.generation || base !== state.baseResult;
  const { top, opacity } = m; // Werte dieses Durchgangs (Regler können sich währenddessen ändern)
  if (!inRun) setBusy(true);
  try {
    if (base.mode === 'color' || m.mode === 'color') {
      await composeColorMerge(base, m, top, opacity, stale, rev);
      return;
    }
    const gray = base.mode === 'relief' || m.mode === 'relief';
    const vector = !isRasterMode(base.mode) && !isRasterMode(m.mode);
    const ditherAlgo = base.mode === 'dither' ? base.settings.ditherAlgo : m.mode === 'dither' ? m.ditherAlgo : 'floyd';
    const res = await Pipeline.merge({
      w: base.w,
      h: base.h,
      bits: !base.gray8 && base.bits ? base.bits.slice() : null, // Kopien: das Basisergebnis bleibt erhalten
      gray8: base.gray8 ? base.gray8.slice() : null,
      alpha8: base.alpha8 ? base.alpha8.slice() : null, // Relief mit transparentem Hintergrund
      baseEmpty: base.outlineOnly || (!base.bits && !base.gray8),
      layer: { svg: m.svg, mode: m.mode, widthMm: m.widthMm },
      top,
      opacity,
      gray,
      vector,
      transparent: base.transparent,
      ditherAlgo,
    });
    if (stale()) return;
    let fillPath = null;
    if (res.trace) {
      const st = base.settings;
      fillPath = await window.api.trace({ bits: res.bits, w: res.w, h: res.h }, traceParams(st, base.mmPerPx, res.w, res.h, base.textBlocks), 'fill');
      if (stale()) return;
      if (st.shapeFit && fillPath) res.bits = rasterizePath(fillPath, res.w, res.h);
    }
    // SVG: je Bild eine eigene Ebene (wie im Modus Farben) – Rasterexporte und Stickdatei zeigen das
    // zusammengerechnete Ergebnis
    const layers = mergeLayers(base, m, top, opacity, res.topImageB64);
    const doc = { w: base.w, h: base.h, widthMm: base.widthMm, layers, outline: base.outline };
    const preview = { blob: new Blob([Encoders.svgDocument({ ...doc, preview: true })], { type: 'image/svg+xml' }), pixelated: false };
    if (res.aspectOff && !m.aspectWarned) {
      m.aspectWarned = true;
      toast('Der Historie-Eintrag hat ein anderes Seitenverhältnis – er wird mittig eingepasst.');
    }
    publishResult({
      ...base,
      bits: res.bits,
      gray8: res.gray8,
      alpha8: res.alpha8 || null,
      svg: Encoders.svgDocument(doc),
      svgLightBurn: Encoders.svgDocument({ ...doc, layers: lightBurnLayers(layers) }),
      preview,
      mode: gray ? 'relief' : res.trace ? 'vector' : 'dither',
      // Stickdatei: je Bild ein eigener (schwarzer) Farbblock wie die Ebenen im SVG
      emb: res.trace
        ? embSource({ mode: 'color', colors: mergeEmbColors(layers), outline: base.outline, outlineOnly: false, mmPerPx: base.mmPerPx })
        : null,
      embCache: null,
      embPlan: null, // laufende Stichplanung gehört zum unvereinigten Ergebnis
      outlineOnly: false, // die vereinigte Ebene ist Inhalt, nicht nur die Umrisslinie
      merge: { id: m.id, name: m.name, top, opacity },
    }, rev);
    renderMergePanel();
  } catch (err) {
    if (isCancelled(err)) {
      if (inRun) throw err;
      return;
    }
    if (stale()) return;
    console.error(err);
    // nicht immer wieder scheitern: Vereinigung aufheben und das eigene Ergebnis zeigen
    toast(`Vereinigen fehlgeschlagen: ${cleanError(err)}`, true);
    state.merge = null;
    mergeRev++;
    publishResult(base);
    renderMergePanel();
    renderHistory();
  } finally {
    if (!inRun && seq === mergeSeq && !state.processing) setBusy(false);
  }
}

/**
 * Vereinigen mit einem Farb-Ergebnis: Die Farbebenen bleiben, das andere Ergebnis kommt als eigene
 * Ebene(n) dazu (in einer Farbe, die im Bild nicht vorkommt). Rasterexporte zeigen die Ebenen
 * übereinander, die Stickdatei bekommt die zusätzliche Ebene als weiteren Farbblock.
 */
export async function composeColorMerge(base, m, top, opacity, stale, rev) {
  const upperColor = top === 'current' ? base.mode === 'color' : m.mode === 'color';
  let topImageB64 = null;
  if (!upperColor && opacity > 0.001 && opacity < 0.999) {
    // obere Schwarz-Weiß-Ebene abgeschwächt: als Punktmuster rastern (wie beim Vereinigen ohne Farben)
    const res = await Pipeline.merge({
      w: base.w, h: base.h,
      bits: base.bits ? base.bits.slice() : null,
      gray8: base.gray8 ? base.gray8.slice() : null,
      alpha8: null,
      baseEmpty: base.outlineOnly || (!base.bits && !base.gray8),
      layer: { svg: m.svg, mode: m.mode, widthMm: m.widthMm },
      top, opacity, gray: false, vector: false, transparent: true,
      ditherAlgo: base.mode === 'dither' ? base.settings.ditherAlgo : m.mode === 'dither' ? m.ditherAlgo : 'floyd',
    });
    if (stale()) return;
    topImageB64 = res.topImageB64;
  }
  const layers = mergeLayers(base, m, top, opacity, topImageB64);
  const rgba8 = await rasterizeLayers(layers, base.w, base.h);
  if (stale()) return;
  const bits = new Uint8Array(base.w * base.h);
  for (let p = 0, i = 0; p < bits.length; p++, i += 4) bits[p] = rgba8[i + 3] > 127 && Math.min(rgba8[i], rgba8[i + 1], rgba8[i + 2]) < 250 ? 1 : 0;
  const doc = { w: base.w, h: base.h, widthMm: base.widthMm, layers, outline: base.outline };
  publishResult({
    ...base,
    bits, gray8: null, alpha8: null, rgba8,
    svg: Encoders.svgDocument(doc),
    svgLightBurn: Encoders.svgDocument({ ...doc, layers: lightBurnLayers(layers) }),
    preview: { blob: new Blob([Encoders.svgDocument({ ...doc, preview: true })], { type: 'image/svg+xml' }), pixelated: false },
    mode: 'color',
    transparent: base.mode === 'color' ? base.transparent : true,
    emb: embSource({ mode: 'color', colors: mergeEmbColors(layers), outline: base.outline, outlineOnly: false, mmPerPx: base.mmPerPx }),
    embSkipped: layers.filter((l) => l.items.some((it) => it.kind === 'image')).map((l) => l.label),
    embCache: null,
    embPlan: null, // laufende Stichplanung gehört zum unvereinigten Ergebnis
    outlineOnly: false,
    merge: { id: m.id, name: m.name, top, opacity },
  }, rev);
  renderMergePanel();
}

/**
 * Ebenenfarben von LightBurn (00–29). LightBurn ordnet importierte Farben der nächstliegenden Ebenenfarbe
 * zu – zwei ähnliche Farben landeten sonst in einer Ebene.
 */
export const LIGHTBURN_COLORS = [
  '#000000', '#0000ff', '#ff0000', '#00e000', '#d0d000', '#ff8000', '#00e0e0', '#ff00ff', '#b4b4b4', '#0000a0',
  '#a00000', '#00a000', '#a0a000', '#c08000', '#00a0ff', '#a000a0', '#808080', '#7d87b9', '#bb7784', '#4a6fe3',
  '#d33f6a', '#8cd78c', '#f0b98d', '#f6c4e1', '#fa9ed4', '#500a78', '#b45a00', '#004754', '#86fa88', '#ffdb66',
];

export const hexRgb = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  const s = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex || '');
  return s ? [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16)] : [0, 0, 0];
};

/**
 * Ebenen für „An LightBurn senden“: jede Ebene eine eigene LightBurn-Farbe, damit dort jede Ebene
 * (jede Bildfarbe beider Ergebnisse) als eigene Ebene ankommt. Schwarz-Weiß-Ebenen: ohne Farb-Ergebnis
 * die erste schwarz, die weiteren blau usw.; neben Farben blau. Farbebenen: die nächstliegende freie Farbe.
 */
export function lightBurnLayers(layers) {
  const free = LIGHTBURN_COLORS.slice();
  const take = (c) => { free.splice(free.indexOf(c), 1); return c; };
  const hasColor = layers.some((l) => l.fromColor);
  const out = layers.map((l) => ({ ...l }));
  for (const l of out) {
    if (l.fromColor || !free.length) continue;
    l.color = take(hasColor && free.includes('#0000ff') ? '#0000ff' : free[0]);
  }
  const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  for (const l of out) {
    if (!l.fromColor || !free.length) continue;
    const rgb = hexRgb(l.color);
    let best = free[0];
    for (const c of free) if (dist(hexRgb(c), rgb) < dist(hexRgb(best), rgb)) best = c;
    l.color = take(best);
  }
  return out;
}

/**
 * Ebenen eines Ergebnisses (SVG) im Pixelraum des aktuellen Ergebnisses: Farb-Ergebnisse behalten
 * ihre Farbebenen (je Farbe eine), alle anderen werden eine Ebene. Pfade werden umgerechnet
 * (mittig eingepasst wie beim Zusammenrechnen), Bilder behalten ihre Transformation.
 */
export function svgLayersOf(svg, w, h, { label, prefix = '', id, widthMm, isColor = false, color = null }) {
  const doc = Encoders.parseSvg(svg);
  if (!doc) return [];
  const sc = Math.min(w / doc.w0, h / doc.h0);
  const fit = [sc, 0, 0, sc, (w - doc.w0 * sc) / 2, (h - doc.h0 * sc) / 2];
  const place = (it) => {
    const m = Encoders.mulMatrix(fit, it.m);
    if (it.kind === 'image') return { ...it, m };
    const d = Encoders.transformPath(it.d, m);
    // gleichmäßige Skalierung: Pfad umgerechnet, Linienbreite mit
    return d != null ? { ...it, d, width: (it.width || 0) * m[0], m: [1, 0, 0, 1, 0, 0] } : { ...it, m };
  };
  let items = doc.items.map(place);
  // nur eine Umrisslinie: dann ist sie der Inhalt des Eintrags
  if (!items.length && doc.outline) {
    items = [place({
      kind: 'stroke', d: doc.outline.d, width: Math.max(1, 0.2 / ((widthMm || 100) / doc.w0)),
      m: [1, 0, 0, 1, doc.outline.x, doc.outline.y], color: '#000000',
    })];
  }
  // Farb-Ergebnis (auch ein gespeichertes „Farben + …“): Ebenen behalten; sonst alles eine Ebene
  const grouped = items.some((it) => it.group && (isColor || /^farbe-/.test(it.group.id)));
  if (!grouped) return [{ id, label, color, items }];
  // Farb-Ergebnis: je Farbebene eine eigene Ebene in ihrer Farbe
  const byGroup = new Map();
  for (const it of items) {
    const key = it.group ? it.group.id : '';
    if (!byGroup.has(key)) byGroup.set(key, { id: `${id}-${byGroup.size + 1}`, label: prefix + (it.group ? it.group.label : label), color: it.color || '#000000', items: [], fromColor: true });
    byGroup.get(key).items.push(it);
  }
  return [...byGroup.values()];
}

/**
 * Ebenen des vereinigten SVG, von unten nach oben: aktuelles Ergebnis und Historie-Eintrag je als
 * eigene Ebene(n) mit ihren Vektoren bzw. Rasterbildern – ein Farb-Ergebnis mit allen Farbebenen.
 * Die obere Seite entfällt bei 0 % Deckkraft; bei Zwischenwerten wird sie durch ihr abgeschwächtes
 * Rasterbild (topImageB64) ersetzt – außer bei Farbebenen, die bleiben voll.
 */
export function mergeLayers(base, m, top, opacity, topImageB64) {
  const { w, h } = base;
  let current = svgLayersOf(base.svg, w, h, { label: 'Aktuelles Ergebnis', id: 'ebene-aktuell', widthMm: base.widthMm, isColor: base.mode === 'color' });
  let history = svgLayersOf(m.svg, w, h, { label: m.name || 'Historie-Eintrag', prefix: `${m.name || 'Historie'}: `, id: 'ebene-historie', widthMm: m.widthMm, isColor: m.mode === 'color' });
  // Anzeige, SVG, Raster und Stickdatei: Originalfarben – Schwarz-Weiß-Ebenen schwarz (in der Stickdatei
  // ein eigener schwarzer Faden). Eigene Farben je Ebene bekommt nur das SVG für LightBurn (lightBurnLayers)
  for (const l of [...current, ...history]) if (!l.fromColor) l.color = '#000000';
  const upperIsColor = (top === 'current' ? current : history).some((l) => l.fromColor);
  if (opacity <= 0.001) {
    if (top === 'current') current = []; else history = [];
  } else if (topImageB64 && !upperIsColor) {
    const list = top === 'current' ? current : history;
    const first = list[0] || { id: top === 'current' ? 'ebene-aktuell' : 'ebene-historie', label: top === 'current' ? 'Aktuelles Ergebnis' : m.name || 'Historie-Eintrag' };
    const weak = [{ ...first, items: [{ kind: 'image', b64: topImageB64, x: 0, y: 0, w, h, m: [1, 0, 0, 1, 0, 0] }] }];
    if (top === 'current') current = weak; else history = weak;
  }
  return top === 'current' ? [...history, ...current] : [...current, ...history];
}

/** Ebenen als Farbbild (RGBA, w × h; leer = durchsichtig) – für PNG/JPG/BMP und Vorschau-Details. */
export async function rasterizeLayers(layers, w, h) {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  for (const l of layers) {
    for (const it of l.items) {
      ctx.setTransform(...it.m);
      if (it.kind === 'image') {
        const bin = atob(it.b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        ctx.imageSmoothingEnabled = !!it.smooth;
        ctx.globalCompositeOperation = 'multiply'; // Weiß ist durchsichtig
        ctx.drawImage(bmp, it.x, it.y, it.w, it.h);
        ctx.globalCompositeOperation = 'source-over';
        bmp.close();
      } else if (it.kind === 'fill') {
        ctx.fillStyle = l.color;
        ctx.fill(new Path2D(it.d), 'evenodd');
      } else {
        ctx.strokeStyle = l.color;
        ctx.lineWidth = Math.max(1, it.width);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke(new Path2D(it.d));
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

/** Stickebenen aus den Ebenen der Vereinigung: Flächen als Füllstich, Linien als Steppstich (Bilder entfallen). */
export function mergeEmbColors(layers) {
  const out = [];
  for (const l of layers) {
    const fills = l.items.filter((it) => it.kind === 'fill' && it.m.every((v, i) => v === [1, 0, 0, 1, 0, 0][i]));
    const strokes = l.items.filter((it) => it.kind === 'stroke' && it.m.every((v, i) => v === [1, 0, 0, 1, 0, 0][i]));
    // own: eigener Farbblock, auch wenn die Ebene davor dieselbe Garnfarbe hat (je Bild/Farbe ein Faden)
    if (fills.length) out.push({ d: fills.map((it) => it.d).join(' '), hex: l.color, name: l.label, key: `${l.id}:fill`, kind: 'fill', own: true });
    if (strokes.length) out.push({ d: strokes.map((it) => it.d).join(' '), hex: l.color, name: l.label, key: `${l.id}:line`, kind: 'line', own: !fills.length });
  }
  return out;
}

/** Vereinigen-Einstellung geändert: neu vereinigen (nach einer laufenden Umwandlung). */
export function scheduleMerge(delay = 60) {
  mergeRev++;
  state.mergePending = true;
  invalidateDrag(); // bis zum neuen Ergebnis nicht das veraltete herausziehen
  clearTimeout(mergeTimer);
  const tick = () => {
    if (!state.mergePending) return; // schon von runProcess erledigt
    if (state.processing) { mergeTimer = setTimeout(tick, 150); return; }
    composeMerged();
  };
  mergeTimer = setTimeout(tick, delay);
}

/** Gespeichertes Ergebnis eines Historie-Eintrags als Ebene laden. */
export async function loadMergeLayer(id) {
  const { meta, svg } = await window.api.history.loadResult(id);
  const st = meta.settings || {};
  return { id, name: meta.name || 'Bild', svg, mode: st.mode || 'vector', widthMm: st.widthMm || 100, ditherAlgo: st.ditherAlgo || 'floyd' };
}

export function setMerge(merge) {
  state.merge = merge;
  renderMergePanel();
  renderHistory();
  scheduleMerge(0);
}

export async function startMerge(e) {
  if (!state.source || !state.baseResult) {
    return toast('Erst ein Bild öffnen und umwandeln – dann lässt sich ein Historie-Eintrag darüberlegen.', true);
  }
  if (e.id === state.historyId) return toast('Ein Eintrag lässt sich nicht mit sich selbst vereinigen.', true);
  const source = state.source;
  try {
    const layer = await loadMergeLayer(e.id);
    if (state.source !== source) return;
    const prev = state.merge;
    setMerge({ ...layer, top: prev?.top ?? 'history', opacity: prev?.opacity ?? 1 });
    $('#settings-scroll').scrollTop = 0; // Regler fürs Vereinigen stehen ganz oben
    toast(`Vereinigt mit „${layer.name}“`);
  } catch (err) {
    toast(`Eintrag konnte nicht geladen werden: ${cleanError(err)}`, true);
  }
}

export function clearMerge() {
  if (!state.merge) return;
  state.merge = null;
  mergeRev++;
  clearTimeout(mergeTimer);
  renderMergePanel();
  renderHistory();
  composeMerged(); // zeigt wieder das eigene Ergebnis
}

export function mergeButton(e) {
  const b = iconButton('⊕', 'Mit dem aktuellen Ergebnis vereinigen (übereinanderlegen)', () => startMerge(e));
  if (e.id === state.historyId) {
    b.disabled = true;
    b.title = 'Das ist das geöffnete Bild – zum Vereinigen einen anderen Eintrag wählen';
  }
  return b;
}

export function renderMergePanel() {
  const m = state.merge;
  $('#merge-group').hidden = !m;
  syncEmbFormats(); // eine Vereinigung kann eine Stickdatei liefern
  $('#pane-result .pane-label').textContent = m ? `Ergebnis + ${m.name}` : 'Ergebnis';
  if (!m) return;
  $('#merge-name').textContent = m.name;
  $('#merge-name').title = m.name;
  for (const b of $$('#merge-order button')) b.classList.toggle('active', b.dataset.value === m.top);
  const pct = Math.round(m.opacity * 100);
  $('#merge-opacity').value = pct;
  $('#merge-opacity-out').textContent = `${pct} %`;
  const base = state.baseResult;
  let kind;
  if ((base && base.mode === 'color') || m.mode === 'color') {
    kind = 'Mit „Farben“: Die Farbebenen bleiben voll, nur eine Schwarz-Weiß-Ebene oben wird abgeschwächt (als Punktmuster).';
  } else if ((base && base.mode === 'relief') || m.mode === 'relief') kind = 'Ergebnis: Graustufenbild (Relief).';
  else if (base && !isRasterMode(base.mode) && !isRasterMode(m.mode) && (pct === 0 || pct === 100)) kind = 'Ergebnis: Vektor.';
  else kind = 'Ergebnis: Punktmuster als Bild im SVG – in LightBurn als Bild gravieren.';
  $('#merge-hint').textContent = `0 % = nur die untere Ebene, 100 % = beide voll. ${kind}`;
}

export function bindMerge() {
  for (const b of $$('#merge-order button')) {
    b.addEventListener('click', () => {
      if (!state.merge || state.merge.top === b.dataset.value) return;
      state.merge.top = b.dataset.value;
      renderMergePanel();
      scheduleMerge(0);
    });
  }
  const slider = $('#merge-opacity');
  const setOpacity = (pct) => {
    if (!state.merge) return;
    state.merge.opacity = Math.min(100, Math.max(0, pct)) / 100;
    renderMergePanel();
    scheduleMerge();
  };
  slider.addEventListener('input', () => setOpacity(Number(slider.value)));
  slider.addEventListener('dblclick', () => setOpacity(100));
  $('#btn-merge-off').addEventListener('click', clearMerge);
}
