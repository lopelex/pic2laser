'use strict';

/* global Processing, Encoders, Segmentation */

const DEFAULTS = Object.freeze({
  mode: 'vector',
  brightness: 0,
  contrast: 0,
  gamma: 1,
  blur: 0,
  sharpen: 0,
  invert: false,
  threshold: 128,
  turdSize: 4,
  alphaMax: 1,
  optTolerance: 0.2,
  workRes: 1600,
  ditherAlgo: 'floyd',
  dpi: 254,
  widthMm: 100,
  transparent: true,
  fmtSvg: true,
  fmtPng: false,
  fmtJpg: false,
  fmtBmp: false,
  // Freistellen
  bgRemove: 'none',
  maskThreshold: 0.5,
  bgTolerance: 20,
  bgBorder: true,
  bgSeeds: [],
  // Kanten
  edgeSensitivity: 60,
  lineWidthMm: 0.4,
  // Umrisslinie
  outline: false,
  outlineOffsetMm: 2,
  outlineCloseMm: 2,
  outlineOnly: false,
});

const SETTINGS_STORAGE_KEY = 'pic2laser.settings';
const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8, 12];

const MODE_HINTS = {
  vector: 'Ideal für Logos, Schriften, Strichzeichnungen und Silhouetten. Ergebnis sind echte Vektorpfade – in LightBurn als Füllung (Fill) gravieren.',
  edges: 'Zeichnet die Kanten und Randkonturen des Bildes als Linien nach – ergibt eine Strichzeichnung als Vektor. In LightBurn als Füllung (Fill) gravieren.',
  dither: 'Ideal für Fotos. Graustufen werden in Punktmuster umgewandelt. Für LightBurn am besten zusätzlich PNG/BMP exportieren und als Bild im Modus „Passthrough" gravieren.',
};

const state = {
  settings: loadSettings(),
  source: null, // { name, ext, bytes: Uint8Array, bitmap, url, savedId }
  result: null, // { w, h, bits, svg, widthMm, heightMm, dpi, ... }
  aiRaw: null, // Promise der rohen KI-Maske für das aktuelle Bild
  mask: null, // { key, canvas }
  originalViewKey: null,
  historyId: null,
  history: [],
  generation: 0,
  zoomIndex: 0,
  viewMode: 'split',
  resultUrl: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ------------------------------------------------------------------ */
/* Einstellungen                                                      */
/* ------------------------------------------------------------------ */

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignorieren */ }
  return { ...DEFAULTS };
}

function persistSettings() {
  try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings)); } catch { /* ignorieren */ }
}

const FORMATTERS = {
  brightness: (v) => (v > 0 ? `+${v}` : `${v}`),
  contrast: (v) => (v > 0 ? `+${v}` : `${v}`),
  gamma: (v) => Number(v).toFixed(2),
  blur: (v) => (v ? Number(v).toFixed(1) : 'aus'),
  sharpen: (v) => (v ? Number(v).toFixed(1) : 'aus'),
  threshold: (v) => `${v}`,
  turdSize: (v) => `${v} px`,
  alphaMax: (v) => Number(v).toFixed(2),
  optTolerance: (v) => Number(v).toFixed(2),
  workRes: (v) => `${v} px`,
  maskThreshold: (v) => Number(v).toFixed(2),
  bgTolerance: (v) => `${v}`,
  edgeSensitivity: (v) => `${v}`,
  lineWidthMm: (v) => `${Number(v).toFixed(2)} mm`,
  outlineOffsetMm: (v) => `${Number(v).toFixed(1)} mm`,
  outlineCloseMm: (v) => (Number(v) ? `${Number(v).toFixed(1)} mm` : 'aus'),
};

function syncControls() {
  const s = state.settings;
  for (const el of $$('[data-key]')) {
    const key = el.dataset.key;
    if (el.type === 'checkbox') el.checked = !!s[key];
    else el.value = s[key];
  }
  for (const out of $$('output[data-for]')) {
    const key = out.dataset.for;
    out.textContent = FORMATTERS[key] ? FORMATTERS[key](s[key]) : s[key];
  }
  for (const btn of $$('#mode button')) btn.classList.toggle('active', btn.dataset.value === s.mode);
  for (const g of $$('[data-mode]')) g.hidden = !g.dataset.mode.split(' ').includes(s.mode);
  for (const el of $$('[data-algo]')) el.hidden = s.ditherAlgo !== el.dataset.algo;
  for (const btn of $$('#bgRemove button')) btn.classList.toggle('active', btn.dataset.value === s.bgRemove);
  for (const el of $$('[data-bg]')) el.hidden = el.dataset.bg !== s.bgRemove;
  for (const el of $$('[data-show]')) el.hidden = !s[el.dataset.show];
  const seeds = s.bgSeeds.length;
  $('#btn-clear-seeds').textContent = seeds ? `Klickpunkte zurücksetzen (${seeds})` : 'Klickpunkte zurücksetzen';
  $('#btn-clear-seeds').disabled = !seeds;
  $('#pane-original').classList.toggle('pickable', s.bgRemove === 'color' && !!state.source);
  $('#mode-hint').textContent = MODE_HINTS[s.mode];
  updateHeightField();
}

function updateHeightField() {
  const h = $('#heightMm');
  if (document.activeElement === h) return;
  if (state.source) {
    const { width, height } = state.source.bitmap;
    h.value = round1((state.settings.widthMm * height) / width);
    h.disabled = false;
  } else {
    h.value = '';
    h.disabled = true;
  }
}

function round1(v) { return Math.round(v * 10) / 10; }

function setSetting(key, value) {
  state.settings[key] = value;
  persistSettings();
  syncControls();
  if (!key.startsWith('fmt')) scheduleProcess();
}

function bindControls() {
  for (const el of $$('[data-key]')) {
    const key = el.dataset.key;
    const handler = () => {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'range' || el.type === 'number') {
        v = Number(el.value);
        if (!Number.isFinite(v)) return;
        if (el.type === 'number') {
          const min = Number(el.min), max = Number(el.max);
          if (v < min || v > max) return; // Während der Eingabe ungültige Werte ignorieren
        }
      } else v = el.value;
      setSetting(key, v);
    };
    el.addEventListener(el.type === 'range' ? 'input' : 'change', handler);
    if (el.type === 'number') el.addEventListener('input', handler);
  }

  $('#heightMm').addEventListener('input', (e) => {
    const h = Number(e.target.value);
    if (!state.source || !(h >= 1 && h <= 2000)) return;
    const { width, height } = state.source.bitmap;
    setSetting('widthMm', round1((h * width) / height));
  });

  for (const btn of $$('#mode button')) {
    btn.addEventListener('click', () => setSetting('mode', btn.dataset.value));
  }
  for (const btn of $$('#bgRemove button')) {
    btn.addEventListener('click', () => setSetting('bgRemove', btn.dataset.value));
  }
  $('#btn-clear-seeds').addEventListener('click', () => setSetting('bgSeeds', []));

  // Klick ins Original: Hintergrundpunkt hinzufügen (Freistellen nach Farbe)
  $('#img-original').addEventListener('click', (e) => {
    if (state.settings.bgRemove !== 'color' || !state.source) return;
    const p = imagePointFromEvent(e.currentTarget, e);
    if (!p) return;
    setSetting('bgSeeds', [...state.settings.bgSeeds, p]);
  });

  // Doppelklick auf einen Regler setzt ihn zurück
  for (const el of $$('input[type=range][data-key]')) {
    el.addEventListener('dblclick', () => setSetting(el.dataset.key, DEFAULTS[el.dataset.key]));
  }

  $('#btn-auto-threshold').addEventListener('click', (e) => {
    e.preventDefault();
    if (!state.source) return;
    const s = state.settings;
    const { w, h } = Processing.targetSize(state.source.bitmap.width, state.source.bitmap.height, s);
    let gray = Processing.toGray(state.source.bitmap, w, h, s);
    gray = Processing.sharpen(gray, w, h, s.sharpen);
    gray = Processing.adjust(gray, s);
    setSetting('threshold', Processing.otsu(gray));
    toast(`Schwellwert automatisch auf ${state.settings.threshold} gesetzt`);
  });

  $('#btn-reset').addEventListener('click', () => {
    const keep = { fmtSvg: state.settings.fmtSvg, fmtPng: state.settings.fmtPng, fmtJpg: state.settings.fmtJpg, fmtBmp: state.settings.fmtBmp };
    state.settings = { ...DEFAULTS, ...keep, bgSeeds: [] };
    persistSettings();
    syncControls();
    scheduleProcess();
  });
}

/* ------------------------------------------------------------------ */
/* Bild laden                                                         */
/* ------------------------------------------------------------------ */

async function loadImage(name, bytes, { historyId = null, settings = null } = {}) {
  const ext = (name.split('.').pop() || 'png').toLowerCase();
  const blob = new Blob([bytes]);
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    toast('Dieses Bildformat kann nicht gelesen werden.', true);
    return;
  }

  if (state.source) {
    URL.revokeObjectURL(state.source.url);
    state.source.bitmap.close();
  }
  const url = URL.createObjectURL(blob);
  state.source = { name, ext, bytes, bitmap, url, savedId: historyId };
  state.historyId = historyId;
  state.result = null;
  state.aiRaw = null;
  state.mask = null;
  state.originalViewKey = null;

  if (settings) {
    state.settings = { ...DEFAULTS, ...settings };
  } else {
    state.settings = { ...state.settings, bgSeeds: [] }; // Klickpunkte gelten nur für ein Bild
  }
  persistSettings();

  $('#img-original').src = url;
  document.body.classList.add('has-image');
  $('#btn-export').disabled = false;
  $('#btn-save-history').disabled = false;
  syncControls();
  renderHistory();
  scheduleProcess(0);
}

async function readFile(file) {
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) {
    toast('Bitte eine Bilddatei verwenden.', true);
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  await loadImage(file.name || 'eingefuegt.png', bytes);
}

function bindDragDrop() {
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

/* ------------------------------------------------------------------ */
/* Verarbeitung                                                       */
/* ------------------------------------------------------------------ */

let processTimer = null;

function scheduleProcess(delay = 120) {
  if (!state.source) return;
  clearTimeout(processTimer);
  processTimer = setTimeout(runProcess, delay);
}

async function runProcess() {
  if (!state.source) return;
  const gen = ++state.generation;
  const s = { ...state.settings };
  const bitmap = state.source.bitmap;
  setBusy(true);

  // UI erst neu zeichnen lassen, bevor gerechnet wird
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  if (gen !== state.generation) return;

  try {
    const t0 = performance.now();
    const mask = await ensureMask(s);
    if (gen !== state.generation) return;
    await updateOriginalView(s, mask);
    if (gen !== state.generation) return;

    const { w, h, bits, alpha } = Processing.process(bitmap, s, mask);
    const widthMm = s.widthMm;
    const heightMm = (widthMm * h) / w;
    const mmPerPx = widthMm / w;
    const dpi = s.mode === 'dither' ? s.dpi : w / (widthMm / 25.4);
    const traceParams = { turdSize: s.turdSize, alphaMax: s.alphaMax, optTolerance: s.optTolerance };

    // Gravur-Inhalt
    let fillPath = null, imagePng = null;
    if (!(s.outline && s.outlineOnly)) {
      if (s.mode === 'dither') {
        imagePng = await Encoders.canvasBytes(Processing.bitsToCanvas(bits, w, h, s.transparent), 'image/png');
      } else {
        const png = await Encoders.canvasBytes(Processing.bitsToCanvas(bits, w, h, false), 'image/png');
        if (gen !== state.generation) return;
        fillPath = await window.api.trace(png, traceParams);
      }
      if (gen !== state.generation) return;
    }

    // Umrisslinie (Randkontur) um das Motiv
    let outline = null;
    if (s.outline) {
      let src = bits;
      if (alpha) {
        src = new Uint8Array(alpha.length);
        for (let i = 0; i < alpha.length; i++) src[i] = alpha[i] >= 0.5 ? 1 : 0;
      }
      const sil = Processing.silhouette(src, w, h, s.outlineOffsetMm / mmPerPx, s.outlineCloseMm / mmPerPx);
      const png = await Encoders.canvasBytes(Processing.bitsToCanvas(sil.bits, sil.w, sil.h, false), 'image/png');
      if (gen !== state.generation) return;
      const d = await window.api.trace(png, {
        turdSize: Math.round(sil.w * sil.h * 0.0005), // Kleinteile ignorieren
        alphaMax: 1.2,
        optTolerance: 0.5,
      });
      if (gen !== state.generation) return;
      outline = { d, pad: sil.pad };
    }

    const doc = { w, h, widthMm, fillPath, imagePng, outline };
    const svg = Encoders.svgDocument(doc);
    const previewSvg = Encoders.svgDocument({ ...doc, preview: true });

    state.result = { w, h, bits, svg, widthMm, heightMm, dpi, mode: s.mode, transparent: s.transparent };
    const pad = outline ? outline.pad : 0;
    const totalW = (w + 2 * pad) * mmPerPx, totalH = (h + 2 * pad) * mmPerPx;
    // Dithering ohne Umriss als PNG anzeigen (schärfere Pixel), sonst das SVG
    if (s.mode === 'dither' && !outline && imagePng) showResult(new Blob([imagePng], { type: 'image/png' }), true);
    else showResult(new Blob([previewSvg], { type: 'image/svg+xml' }), false);

    const ms = Math.round(performance.now() - t0);
    const kb = (new Blob([svg]).size / 1024).toFixed(0);
    $('#status').textContent =
      `${w} × ${h} px · ${round1(totalW)} × ${round1(totalH)} mm · ${Math.round(dpi)} DPI · SVG ${kb} KB · ${ms} ms`;
  } catch (err) {
    console.error(err);
    if (gen === state.generation) toast(`Umwandlung fehlgeschlagen: ${err.message || err}`, true);
  } finally {
    if (gen === state.generation) setBusy(false);
  }
}

function showResult(blob, pixelated) {
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = URL.createObjectURL(blob);
  const img = $('#img-result');
  img.classList.toggle('pixelated', pixelated);
  img.src = state.resultUrl;
}

/* ------------------------------------------------------------------ */
/* Freistellen                                                        */
/* ------------------------------------------------------------------ */

/** Liefert die Freistellmaske (zwischengespeichert) oder null. */
async function ensureMask(s) {
  if (s.bgRemove === 'none') return null;
  const key = s.bgRemove === 'ai'
    ? `ai:${s.maskThreshold}`
    : `color:${s.bgTolerance}:${s.bgBorder}:${JSON.stringify(s.bgSeeds)}`;
  if (state.mask && state.mask.key === key) return state.mask.canvas;

  const bitmap = state.source.bitmap;
  let canvas;
  if (s.bgRemove === 'ai') {
    if (!state.aiRaw) {
      state.aiRaw = Segmentation.aiRaw(bitmap);
      state.aiRaw.catch(() => { state.aiRaw = null; });
    }
    let raw;
    try {
      raw = await state.aiRaw;
    } catch (err) {
      toast(`KI-Freistellen fehlgeschlagen: ${err.message || err}`, true);
      return null;
    }
    if (bitmap !== state.source?.bitmap) return null;
    canvas = Segmentation.aiMask(raw, bitmap, s.maskThreshold);
  } else {
    canvas = Segmentation.colorMask(bitmap, s.bgTolerance, s.bgBorder, s.bgSeeds);
  }
  state.mask = { key, canvas };
  return canvas;
}

/** Zeigt im Original-Fenster das freigestellte Bild bzw. das unveränderte Original. */
async function updateOriginalView(s, mask) {
  const key = mask ? state.mask.key : 'plain';
  if (state.originalViewKey === key) return;
  state.originalViewKey = key;
  const img = $('#img-original');
  if (state.originalUrl) {
    URL.revokeObjectURL(state.originalUrl);
    state.originalUrl = null;
  }
  if (!mask) {
    img.src = state.source.url;
    $('#pane-original').classList.remove('checker');
    return;
  }
  const blob = await Segmentation.cutoutPreview(state.source.bitmap, mask, s.bgRemove === 'color' ? s.bgSeeds : []);
  state.originalUrl = URL.createObjectURL(blob);
  img.src = state.originalUrl;
  $('#pane-original').classList.add('checker');
}

/** Rechnet einen Klick auf ein <img> mit object-fit: contain in relative Bildkoordinaten um. */
function imagePointFromEvent(img, e) {
  const rect = img.getBoundingClientRect();
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (!nw || !nh) return null;
  const scale = Math.min(rect.width / nw, rect.height / nh);
  const dw = nw * scale, dh = nh * scale;
  const ox = rect.left + (rect.width - dw) / 2;
  const oy = rect.top + (rect.height - dh) / 2;
  const x = (e.clientX - ox) / dw;
  const y = (e.clientY - oy) / dh;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
}

function setBusy(on) {
  $('#busy').classList.toggle('on', on);
}

/* ------------------------------------------------------------------ */
/* Export & Historie                                                  */
/* ------------------------------------------------------------------ */

function baseName() {
  if (!state.source) return 'bild';
  return state.source.name.replace(/\.[^.]+$/, '') || 'bild';
}

async function buildRasterFiles(r, formats) {
  const files = [];
  if (formats.png) {
    const canvas = Processing.bitsToCanvas(r.bits, r.w, r.h, r.transparent);
    const png = await Encoders.canvasBytes(canvas, 'image/png');
    files.push({ ext: 'png', data: Encoders.pngWithDpi(png, r.dpi) });
  }
  if (formats.jpg) {
    const canvas = Processing.bitsToCanvas(r.bits, r.w, r.h, false);
    const jpg = await Encoders.canvasBytes(canvas, 'image/jpeg', 0.95);
    files.push({ ext: 'jpg', data: Encoders.jpgWithDpi(jpg, r.dpi) });
  }
  if (formats.bmp) {
    files.push({ ext: 'bmp', data: Encoders.bmp1bit(r.bits, r.w, r.h, r.dpi) });
  }
  return files;
}

async function exportCurrent() {
  const r = state.result;
  if (!r) return toast('Noch kein Ergebnis vorhanden.', true);
  const s = state.settings;
  if (!s.fmtSvg && !s.fmtPng && !s.fmtJpg && !s.fmtBmp) {
    return toast('Bitte mindestens ein Exportformat auswählen.', true);
  }

  const files = [];
  if (s.fmtSvg) files.push({ ext: 'svg', data: r.svg });
  files.push(...(await buildRasterFiles(r, { png: s.fmtPng, jpg: s.fmtJpg, bmp: s.fmtBmp })));

  let written;
  try {
    written = await window.api.exportFiles({ baseName: baseName(), files });
  } catch (err) {
    return toast(`Export fehlgeschlagen: ${err.message || err}`, true);
  }
  if (!written) return;

  toast(`${written.length} Datei(en) gespeichert`, false, {
    label: 'Im Ordner zeigen',
    action: () => window.api.showInFolder(written[0]),
  });
  await saveToHistory(true);
}

async function makeThumb(r) {
  const full = Processing.bitsToCanvas(r.bits, r.w, r.h, false);
  const scale = Math.min(1, 240 / Math.max(r.w, r.h));
  const tw = Math.max(1, Math.round(r.w * scale));
  const th = Math.max(1, Math.round(r.h * scale));
  const c = new OffscreenCanvas(tw, th);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, tw, th);
  return Encoders.canvasBytes(c, 'image/png');
}

async function saveToHistory(silent = false) {
  const r = state.result;
  if (!r || !state.source) return;
  const src = state.source;
  try {
    const [thumb, rasterFiles] = await Promise.all([makeThumb(r), buildRasterFiles(r, { png: true })]);
    const needsOriginal = !state.historyId || src.savedId !== state.historyId;
    const meta = await window.api.history.save({
      id: state.historyId,
      name: baseName(),
      originalName: src.name,
      original: needsOriginal ? { ext: src.ext, data: src.bytes } : null,
      settings: { ...state.settings },
      svg: r.svg,
      raster: rasterFiles[0],
      thumb,
      width: r.w,
      height: r.h,
    });
    state.historyId = meta.id;
    src.savedId = meta.id;
    await refreshHistory();
    if (!silent) toast('In der Historie gespeichert');
  } catch (err) {
    console.error(err);
    toast(`Historie konnte nicht gespeichert werden: ${err.message || err}`, true);
  }
}

async function refreshHistory() {
  try {
    state.history = await window.api.history.list();
  } catch (err) {
    console.error(err);
    state.history = [];
  }
  renderHistory();
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

function renderHistory() {
  const list = $('#history-list');
  const q = $('#history-search').value.trim().toLowerCase();
  const items = state.history.filter((e) => !q || (e.name || '').toLowerCase().includes(q) || (e.originalName || '').toLowerCase().includes(q));
  list.replaceChildren();
  $('#history-empty').hidden = state.history.length > 0;

  for (const e of items) {
    const li = document.createElement('li');
    li.className = 'history-item' + (e.id === state.historyId ? ' active' : '');
    li.title = 'Klicken, um diese Umwandlung wieder zu öffnen';

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (e.thumb) {
      const img = document.createElement('img');
      img.src = e.thumb;
      img.alt = '';
      thumb.append(img);
    }

    const info = document.createElement('div');
    info.className = 'info';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = e.name || 'Bild';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const mode = { dither: 'Foto', edges: 'Linien' }[e.settings?.mode] || 'Fläche';
    const size = e.settings?.widthMm && e.width ? ` · ${round1(e.settings.widthMm)}×${round1((e.settings.widthMm * e.height) / e.width)} mm` : '';
    meta.textContent = `${mode}${size}`;
    const date = document.createElement('div');
    date.className = 'meta';
    date.textContent = dateFmt.format(new Date(e.updated || e.created));
    info.append(name, meta, date);

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(
      iconButton('⤓', 'SVG speichern', async () => {
        const p = await window.api.history.exportSvg(e.id);
        if (p) toast('SVG gespeichert', false, { label: 'Im Ordner zeigen', action: () => window.api.showInFolder(p) });
      }),
      iconButton('📁', 'Speicherordner öffnen', () => window.api.history.openFolder(e.id)),
      iconButton('✕', 'Aus Historie löschen', async () => {
        if (!confirm(`„${e.name}“ aus der Historie löschen?`)) return;
        await window.api.history.remove(e.id);
        if (state.historyId === e.id) state.historyId = null;
        await refreshHistory();
      }),
    );

    li.append(thumb, info, actions);
    li.addEventListener('click', () => openHistoryEntry(e.id));
    list.append(li);
  }
}

function iconButton(text, title, onClick) {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.textContent = text;
  b.title = title;
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return b;
}

async function openHistoryEntry(id) {
  try {
    const { meta, original } = await window.api.history.load(id);
    await loadImage(meta.originalName || `${meta.name}.png`, new Uint8Array(original), {
      historyId: id,
      settings: meta.settings,
    });
  } catch (err) {
    console.error(err);
    toast('Eintrag konnte nicht geladen werden.', true);
  }
}

/* ------------------------------------------------------------------ */
/* Ansicht                                                            */
/* ------------------------------------------------------------------ */

function bindView() {
  for (const btn of $$('#view-mode button')) {
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.value;
      for (const b of $$('#view-mode button')) b.classList.toggle('active', b === btn);
      $('#panes').dataset.view = state.viewMode;
    });
  }
  $('#panes').dataset.view = state.viewMode;

  $('#zoom-in').addEventListener('click', () => setZoom(state.zoomIndex + 1));
  $('#zoom-out').addEventListener('click', () => setZoom(state.zoomIndex - 1));
  $('#zoom-fit').addEventListener('click', () => setZoom(0));

  // Strg + Mausrad zoomt
  $('#panes').addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(state.zoomIndex + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  // Scrollpositionen beider Ansichten synchron halten
  const scrolls = $$('.pane-scroll');
  let syncing = false;
  for (const el of scrolls) {
    el.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      const fx = el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth);
      const fy = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
      for (const other of scrolls) {
        if (other === el) continue;
        other.scrollLeft = fx * (other.scrollWidth - other.clientWidth);
        other.scrollTop = fy * (other.scrollHeight - other.clientHeight);
      }
      requestAnimationFrame(() => { syncing = false; });
    });
  }

  $('#btn-toggle-history').addEventListener('click', () => {
    document.body.classList.toggle('history-hidden');
  });
  $('#history-search').addEventListener('input', renderHistory);
  $('#btn-clear-history').addEventListener('click', async () => {
    if (await window.api.history.clear()) {
      state.historyId = null;
      if (state.source) state.source.savedId = null;
      await refreshHistory();
    }
  });

  $('#btn-export').addEventListener('click', exportCurrent);
  $('#btn-save-history').addEventListener('click', () => saveToHistory(false));

  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === 'o') { e.preventDefault(); $('#btn-open').click(); }
    if (e.key === 'e' || e.key === 's') { e.preventDefault(); if (state.result) exportCurrent(); }
  });
}

function setZoom(i) {
  state.zoomIndex = Math.max(0, Math.min(ZOOM_STEPS.length - 1, i));
  const z = ZOOM_STEPS[state.zoomIndex];
  document.documentElement.style.setProperty('--zoom', z);
  $('#zoom-label').textContent = `${Math.round(z * 100)} %`;
}

/* ------------------------------------------------------------------ */
/* Toast                                                              */
/* ------------------------------------------------------------------ */

let toastTimer = null;
function toast(msg, isError = false, action = null) {
  const el = $('#toast');
  el.replaceChildren(document.createTextNode(msg));
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn btn-small';
    b.textContent = action.label;
    b.addEventListener('click', action.action);
    el.append(b);
  }
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 3000);
}

/* ------------------------------------------------------------------ */

bindControls();
bindDragDrop();
bindView();
syncControls();
setZoom(0);
refreshHistory();
