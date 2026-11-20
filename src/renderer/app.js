'use strict';

/* global Processing, Encoders, Segmentation, AI */

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
  samPoints: [],
  // KI-Verbesserung
  upscale: false,
  // Linien
  edgeMethod: 'ai',
  lineRes: 768,
  lineBoldMm: 0,
  edgeSensitivity: 60,
  lineWidthMm: 0.4,
  // Relief
  depthRes: '518',
  // Umrisslinie
  outline: false,
  outlineOffsetMm: 2,
  outlineCloseMm: 2,
  outlineOnly: false,
  // Motivkontur
  subjectLine: false,
  subjectLineMm: 0.3,
});

const SETTINGS_STORAGE_KEY = 'pic2laser.settings';
const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8, 12];

const MODE_HINTS = {
  vector: 'Ideal für Logos, Schriften, Strichzeichnungen und Silhouetten. Ergebnis sind echte Vektorpfade – in LightBurn als Füllung (Fill) gravieren.',
  edges: 'Zeichnet die Kanten und Randkonturen des Bildes als Linien nach – ergibt eine Strichzeichnung als Vektor. In LightBurn als Füllung (Fill) gravieren.',
  relief: 'Erzeugt per KI eine Tiefenkarte des Fotos als Graustufenbild – für 3D-Reliefgravur in Holz (Laserleistung bestimmt die Tiefe).',
  dither: 'Ideal für Fotos. Graustufen werden in Punktmuster umgewandelt. Für LightBurn am besten zusätzlich PNG/BMP exportieren und als Bild im Modus „Passthrough" gravieren.',
};

const state = {
  settings: loadSettings(),
  source: null, // { name, ext, bytes: Uint8Array, bitmap, url, savedId }
  result: null, // { w, h, bits, svg, widthMm, heightMm, dpi, ... }
  cache: new Map(), // Zwischenergebnisse der KI-Modelle für das aktuelle Bild (Promises)
  mask: null, // { key, canvas }
  models: [], // Status der KI-Modelle
  presets: [], // eigene Presets
  activePreset: null, // { key, settings } – zuletzt angewendetes Preset
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
  lineRes: (v) => `${v} px`,
  lineBoldMm: (v) => (Number(v) ? `${Number(v).toFixed(2)} mm` : 'aus'),
  lineWidthMm: (v) => `${Number(v).toFixed(2)} mm`,
  outlineOffsetMm: (v) => `${Number(v).toFixed(1)} mm`,
  outlineCloseMm: (v) => (Number(v) ? `${Number(v).toFixed(1)} mm` : 'aus'),
  subjectLineMm: (v) => `${Number(v).toFixed(2)} mm`,
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
  for (const el of $$('[data-bg]')) el.hidden = !el.dataset.bg.split(' ').includes(s.bgRemove);
  for (const el of $$('[data-edge]')) el.hidden = el.dataset.edge !== s.edgeMethod;
  for (const el of $$('[data-show]')) el.hidden = !s[el.dataset.show];
  const seeds = s.bgSeeds.length;
  $('#btn-clear-seeds').textContent = seeds ? `Klickpunkte zurücksetzen (${seeds})` : 'Klickpunkte zurücksetzen';
  $('#btn-clear-seeds').disabled = !seeds;
  const pts = s.samPoints.length;
  $('#btn-clear-sam').textContent = pts ? `Punkte zurücksetzen (${pts})` : 'Punkte zurücksetzen';
  $('#btn-clear-sam').disabled = !pts;
  const pickable = (s.bgRemove === 'color' || s.bgRemove === 'sam') && !!state.source;
  $('#pane-original').classList.toggle('pickable', pickable);
  $('#pane-original').dataset.pick = s.bgRemove;
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
  updatePresetHint();
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
  $('#btn-clear-seeds').addEventListener('click', () => setSetting('bgSeeds', []));
  $('#btn-clear-sam').addEventListener('click', () => setSetting('samPoints', []));

  // Klick ins Original: Hintergrundpunkt (nach Farbe) bzw. Motiv-/Ausschlusspunkt (Objekt anklicken)
  const pick = (e, negative) => {
    const mode = state.settings.bgRemove;
    if (!state.source || (mode !== 'color' && mode !== 'sam')) return;
    const p = imagePointFromEvent(e.currentTarget, e);
    if (!p) return;
    if (mode === 'color') setSetting('bgSeeds', [...state.settings.bgSeeds, p]);
    else setSetting('samPoints', [...state.settings.samPoints, { ...p, positive: !negative }]);
  };
  $('#img-original').addEventListener('click', (e) => pick(e, e.altKey));
  $('#img-original').addEventListener('contextmenu', (e) => {
    if (state.settings.bgRemove !== 'sam') return;
    e.preventDefault();
    pick(e, true);
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
    state.settings = { ...DEFAULTS, ...keep, bgSeeds: [], samPoints: [] };
    state.activePreset = null;
    renderPresets();
    persistSettings();
    syncControls();
    scheduleProcess();
  });
}

/* ------------------------------------------------------------------ */
/* Presets                                                            */
/* ------------------------------------------------------------------ */

// Mitgelieferte Vorlagen (nur die Abweichungen von den Standardwerten)
const BUILTIN_PRESETS = [
  { name: 'Logo / Schrift', settings: { mode: 'vector', threshold: 128, turdSize: 4, alphaMax: 1, optTolerance: 0.2, workRes: 2000 } },
  { name: 'Foto – Dithering', settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 15, sharpen: 0.6 } },
  { name: 'Foto – freigestellt', settings: { mode: 'dither', ditherAlgo: 'floyd', dpi: 254, contrast: 10, sharpen: 0.5, bgRemove: 'birefnet' } },
  { name: 'Porträt – Strichzeichnung', settings: { mode: 'edges', edgeMethod: 'ai', lineRes: 832, threshold: 150, bgRemove: 'modnet' } },
  { name: 'Sticker mit Schnittkontur', settings: { mode: 'vector', bgRemove: 'ai', outline: true, outlineOffsetMm: 3, outlineCloseMm: 3 } },
  { name: 'Nur Schnittkontur', settings: { mode: 'vector', bgRemove: 'ai', outline: true, outlineOnly: true, outlineOffsetMm: 2, outlineCloseMm: 4 } },
  { name: 'Holz-Relief (3D)', settings: { mode: 'relief', depthRes: '770', dpi: 254, blur: 1, contrast: 10 } },
  { name: 'Kleines Bild verbessern', settings: { mode: 'vector', upscale: true, blur: 0.5 } },
];

// Werte, die zum einzelnen Bild gehören und nicht in Presets gespeichert werden
const PER_IMAGE_KEYS = ['bgSeeds', 'samPoints'];

function presetSettingsFromCurrent() {
  const out = { ...state.settings };
  for (const k of PER_IMAGE_KEYS) delete out[k];
  return out;
}

/** Wendet ein Preset an. Vorlagen behalten Ausgabegröße und Exportformate bei. */
function applyPreset(key) {
  const [kind, ...rest] = key.split(':');
  const name = rest.join(':');
  const preset = kind === 'builtin'
    ? BUILTIN_PRESETS.find((p) => p.name === name)
    : state.presets.find((p) => p.name === name);
  if (!preset) return;
  const cur = state.settings;
  const keep = kind === 'builtin'
    ? { widthMm: cur.widthMm, fmtSvg: cur.fmtSvg, fmtPng: cur.fmtPng, fmtJpg: cur.fmtJpg, fmtBmp: cur.fmtBmp }
    : {};
  state.settings = {
    ...DEFAULTS,
    ...keep,
    ...preset.settings,
    bgSeeds: cur.bgSeeds,
    samPoints: cur.samPoints,
  };
  state.activePreset = { key, settings: presetSettingsFromCurrent() };
  persistSettings();
  syncControls();
  renderPresets();
  scheduleProcess(0);
}

async function refreshPresets() {
  try {
    state.presets = await window.api.presets.list();
  } catch {
    state.presets = [];
  }
  renderPresets();
}

function renderPresets() {
  const sel = $('#preset-select');
  sel.replaceChildren();
  const placeholder = new Option('– Preset wählen –', '');
  sel.append(placeholder);
  const group = (label, items, kind) => {
    if (!items.length) return;
    const g = document.createElement('optgroup');
    g.label = label;
    for (const p of items) g.append(new Option(p.name, `${kind}:${p.name}`));
    sel.append(g);
  };
  group('Eigene Presets', state.presets, 'user');
  group('Vorlagen', BUILTIN_PRESETS, 'builtin');
  const active = state.activePreset?.key || '';
  sel.value = Array.from(sel.options).some((o) => o.value === active) ? active : '';
  $('#btn-preset-delete').disabled = !sel.value.startsWith('user:');
  updatePresetHint();
}

function updatePresetHint() {
  const a = state.activePreset;
  const hint = $('#preset-hint');
  if (!a) { hint.textContent = ''; return; }
  const cur = presetSettingsFromCurrent();
  const changed = Object.keys(cur).some((k) => JSON.stringify(cur[k]) !== JSON.stringify(a.settings[k]));
  hint.textContent = changed ? 'Einstellungen wurden seit dem Anwenden des Presets geändert.' : '';
}

async function savePreset() {
  const input = $('#preset-name');
  const name = input.value.trim();
  if (!name) return;
  if (state.presets.some((p) => p.name.toLowerCase() === name.toLowerCase())
      && !confirm(`Preset „${name}“ existiert bereits. Überschreiben?`)) return;
  try {
    const settings = presetSettingsFromCurrent();
    state.presets = await window.api.presets.save({ name, settings });
    const saved = state.presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    state.activePreset = { key: `user:${saved.name}`, settings };
    input.value = '';
    $('#btn-preset-save').disabled = true;
    renderPresets();
    toast(`Preset „${saved.name}“ gespeichert`);
  } catch (err) {
    toast(`Preset konnte nicht gespeichert werden: ${cleanError(err)}`, true);
  }
}

function bindPresets() {
  $('#preset-select').addEventListener('change', (e) => {
    if (e.target.value) applyPreset(e.target.value);
    else {
      state.activePreset = null;
      renderPresets();
    }
  });
  $('#preset-name').addEventListener('input', (e) => {
    $('#btn-preset-save').disabled = !e.target.value.trim();
  });
  $('#preset-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') savePreset();
  });
  $('#btn-preset-save').addEventListener('click', savePreset);
  $('#btn-preset-delete').addEventListener('click', async () => {
    const key = $('#preset-select').value;
    if (!key.startsWith('user:')) return;
    const name = key.slice(5);
    if (!confirm(`Preset „${name}“ löschen?`)) return;
    state.presets = await window.api.presets.remove(name);
    state.activePreset = null;
    renderPresets();
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
  state.cache = new Map();
  state.mask = null;
  state.originalViewKey = null;

  if (settings) {
    state.settings = { ...DEFAULTS, ...settings };
  } else {
    state.settings = { ...state.settings, bgSeeds: [], samPoints: [] }; // Klickpunkte gelten nur für ein Bild
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

/**
 * Web Worker für die schwere Bildverarbeitung. Läuft schon eine Berechnung,
 * wird sie bei einem neuen Auftrag sofort abgebrochen (Worker neu gestartet),
 * damit nur die aktuellen Einstellungen gerechnet werden.
 */
const Pipeline = (() => {
  let worker = null;
  let job = null; // { reject }

  function cancelled() {
    const err = new Error('cancelled');
    err.cancelled = true;
    return err;
  }

  function call(type, payload, transfer = []) {
    if (job) {
      worker.terminate();
      worker = null;
      job.reject(cancelled());
      job = null;
    }
    if (!worker) worker = new Worker('pipeline-worker.js');
    return new Promise((resolve, reject) => {
      job = { reject };
      const w = worker;
      w.onmessage = (e) => {
        job = null;
        if (e.data.ok) resolve(e.data.result);
        else reject(new Error(e.data.error));
      };
      w.onerror = (e) => {
        e.preventDefault();
        job = null;
        w.terminate();
        if (worker === w) worker = null;
        reject(new Error(e.message || 'Fehler im Verarbeitungs-Worker'));
      };
      w.postMessage({ type, payload }, transfer);
    });
  }

  return {
    async render(source, mask, s, lineMask = null) {
      const src = await createImageBitmap(source);
      const m = mask ? await createImageBitmap(mask) : null;
      const lm = lineMask ? await createImageBitmap(lineMask) : null;
      return call('render', { source: src, mask: m, lineMask: lm, s }, [src, m, lm].filter(Boolean));
    },
    async cutout(source, mask, markers) {
      const src = await createImageBitmap(source);
      const m = mask ? await createImageBitmap(mask) : null;
      return call('cutout', { source: src, mask: m, markers }, m ? [src, m] : [src]);
    },
    async colorMask(source, tolerance, border, seeds) {
      const src = await createImageBitmap(source);
      return call('colorMask', { source: src, tolerance, border, seeds }, [src]);
    },
  };
})();

const isCancelled = (err) => !!err && (err.cancelled || /cancelled$/.test(String(err.message)));

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
  setBusy(true);

  // UI erst neu zeichnen lassen, bevor gerechnet wird
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  if (gen !== state.generation) return;

  try {
    const t0 = performance.now();
    const stale = () => gen !== state.generation;

    // 1. Optional KI-Vergrößerung
    const work = await workingBitmap(s);
    if (stale()) return;

    // 2. Freistellen
    const mask = await ensureMask(s, work);
    if (stale()) return;
    await updateOriginalView(s, mask);
    if (stale()) return;

    // 3. KI-Quelle je nach Modus (Strichzeichnung, Tiefenkarte) oder das Bild selbst
    const source = await contentSource(s, work, mask);
    if (stale()) return;
    hideProgress();

    // Motivkontur ohne Freistellen: Grenze per schneller KI ermitteln, Hintergrund bleibt erhalten
    let lineMask = null;
    if (s.subjectLine && !mask && s.mode !== 'relief') {
      lineMask = await contourMask(s, work);
      if (stale()) return;
    }
    hideProgress();

    // 4. Rasterverarbeitung im Worker (blockiert die Oberfläche nicht)
    const { w, h, bits, gray8, tracePng, imagePng, imageB64, sil } = await Pipeline.render(source, mask, s, lineMask);
    if (stale()) return;
    const widthMm = s.widthMm;
    const heightMm = (widthMm * h) / w;
    const mmPerPx = widthMm / w;
    const dpi = s.mode === 'dither' || s.mode === 'relief' ? s.dpi : w / (widthMm / 25.4);

    // 5. Vektorisierung (Potrace im eigenen Prozess)
    let fillPath = null;
    if (tracePng) {
      fillPath = await window.api.trace(tracePng, { turdSize: s.turdSize, alphaMax: s.alphaMax, optTolerance: s.optTolerance });
      if (stale()) return;
    }
    let outline = null;
    if (sil) {
      const d = await window.api.trace(sil.png, {
        turdSize: Math.round(sil.w * sil.h * 0.0005), // Kleinteile ignorieren
        alphaMax: 1.2,
        optTolerance: 0.5,
      });
      if (stale()) return;
      outline = { d, pad: sil.pad };
    }

    const doc = { w, h, widthMm, fillPath, imageB64, outline };
    const svg = Encoders.svgDocument(doc);
    const previewSvg = Encoders.svgDocument({ ...doc, preview: true });

    state.result = { w, h, bits, gray8, svg, widthMm, heightMm, dpi, mode: s.mode, transparent: s.transparent };
    const pad = outline ? outline.pad : 0;
    const totalW = (w + 2 * pad) * mmPerPx, totalH = (h + 2 * pad) * mmPerPx;
    // Rasterergebnisse ohne Umriss als PNG anzeigen (schärfer), sonst das SVG
    if (imagePng && !outline) showResult(new Blob([imagePng], { type: 'image/png' }), s.mode === 'dither');
    else showResult(new Blob([previewSvg], { type: 'image/svg+xml' }), false);

    const ms = Math.round(performance.now() - t0);
    const kb = (svg.length / 1024).toFixed(0);
    $('#status').textContent =
      `${w} × ${h} px · ${round1(totalW)} × ${round1(totalH)} mm · ${Math.round(dpi)} DPI · SVG ${kb} KB · ${ms} ms`;
  } catch (err) {
    if (isCancelled(err) || gen !== state.generation) return;
    console.error(err);
    toast(`Umwandlung fehlgeschlagen: ${cleanError(err)}`, true);
  } finally {
    if (gen === state.generation) {
      setBusy(false);
      hideProgress();
    }
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

const SEG_MODEL = { ai: 'u2netp', isnet: 'isnet', birefnet: 'birefnet', modnet: 'modnet', sam: 'sam_encoder' };
const MODEL_NAMES = {
  u2netp: 'Freistellen (schnell)', isnet: 'Freistellen (präzise)', birefnet: 'Freistellen (beste Qualität)',
  modnet: 'Porträt-Freistellen', sam_encoder: 'Objekt anklicken', sam_decoder: 'Objekt anklicken',
  lineart: 'KI-Strichzeichnung', esrgan: 'KI-Vergrößerung', depth: 'Tiefenkarte',
};

/** Zwischenspeicher pro Bild: gleiche Anfrage → gleiches Promise. */
function cached(key, fn) {
  if (!state.cache.has(key)) {
    const p = fn();
    state.cache.set(key, p);
    p.catch(() => state.cache.delete(key));
  }
  return state.cache.get(key);
}

function cleanError(err) {
  return String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

/** Bild nach optionaler KI-Vergrößerung. */
async function workingBitmap(s) {
  const bitmap = state.source.bitmap;
  if (!s.upscale) return bitmap;
  if (Math.max(bitmap.width, bitmap.height) >= 2048) {
    if (!state.cache.has('upscale-skip')) {
      state.cache.set('upscale-skip', Promise.resolve());
      toast('Das Bild ist bereits groß genug – KI-Vergrößerung wird übersprungen.');
    }
    return bitmap;
  }
  return cached('upscale', async () => {
    await ensureModel('esrgan');
    showProgress('KI-Vergrößerung …', 0);
    return AI.upscale(bitmap, (done, total) => showProgress(`KI-Vergrößerung ${done}/${total}`, done / total));
  });
}

async function ensureModelReady(id) {
  const info = state.models.find((m) => m.id === id);
  if (info && info.available) return;
  await ensureModel(id);
}

/** Liefert die Freistellmaske (zwischengespeichert) oder null. */
async function ensureMask(s, bitmap) {
  const method = s.bgRemove;
  if (method === 'none') return null;
  if (method === 'sam' && !s.samPoints.length) return null;
  const up = s.upscale ? 'up' : 'orig';
  let key;
  if (method === 'color') key = `color:${up}:${s.bgTolerance}:${s.bgBorder}:${JSON.stringify(s.bgSeeds)}`;
  else if (method === 'sam') key = `sam:${up}:${s.maskThreshold}:${JSON.stringify(s.samPoints)}`;
  else key = `${method}:${up}:${s.maskThreshold}`;
  if (state.mask && state.mask.key === key) return state.mask.canvas;

  let canvas;
  try {
    if (method === 'color') {
      canvas = await Pipeline.colorMask(bitmap, s.bgTolerance, s.bgBorder, s.bgSeeds);
    } else {
      await ensureModelReady(SEG_MODEL[method]);
      showProgress(`${MODEL_NAMES[SEG_MODEL[method]]} …`, null);
      let raw;
      if (method === 'sam') {
        const emb = await cached(`sam-emb:${up}`, () => AI.samEmbedding(bitmap));
        const { w, h } = Segmentation.analysisSize(bitmap);
        raw = await cached(`sam-mask:${up}:${JSON.stringify(s.samPoints)}`, () => AI.samMask(emb, s.samPoints, w, h));
      } else {
        raw = await cached(`seg:${method}:${up}`, () => AI.segment(method, bitmap));
      }
      canvas = Segmentation.aiMask(raw, bitmap, s.maskThreshold);
    }
  } catch (err) {
    if (isCancelled(err)) throw err;
    console.error(err);
    toast(`Freistellen fehlgeschlagen: ${cleanError(err)}`, true);
    return null;
  }
  state.mask = { key, canvas };
  return canvas;
}

/** Maske nur für die Motivkontur (schnelle KI), wenn nicht freigestellt wird. */
async function contourMask(s, bitmap) {
  const up = s.upscale ? 'up' : 'orig';
  try {
    await ensureModelReady('u2netp');
    showProgress('Motivkontur wird ermittelt …', null);
    const raw = await cached(`seg:ai:${up}`, () => AI.segment('ai', bitmap));
    return await cached(`contour-mask:${up}`, async () => Segmentation.aiMask(raw, bitmap, 0.5));
  } catch (err) {
    if (isCancelled(err)) throw err;
    console.error(err);
    toast(`Motivkontur fehlgeschlagen: ${cleanError(err)}`, true);
    return null;
  }
}

/** Bild, das tatsächlich umgewandelt wird: Original, KI-Strichzeichnung oder KI-Tiefenkarte. */
async function contentSource(s, bitmap, mask) {
  const up = s.upscale ? 'up' : 'orig';
  if (s.mode === 'edges' && s.edgeMethod === 'ai') {
    const maskKey = mask ? state.mask.key : 'none';
    return cached(`lineart:${up}:${s.lineRes}:${maskKey}`, async () => {
      await ensureModelReady('lineart');
      showProgress('KI-Strichzeichnung …', null);
      // Freigestellten Hintergrund vorher entfernen, damit dort keine Linien entstehen
      let input = bitmap;
      if (mask) {
        const c = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = c.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mask, 0, 0, bitmap.width, bitmap.height);
        input = c;
      }
      return AI.lineArt(input, Number(s.lineRes));
    });
  }
  if (s.mode === 'relief') {
    return cached(`depth:${up}:${s.depthRes}`, async () => {
      await ensureModelReady('depth');
      showProgress('Tiefenkarte wird berechnet …', null);
      return AI.depthMap(bitmap, Number(s.depthRes));
    });
  }
  return bitmap;
}

/** Zeigt im Original-Fenster das freigestellte Bild bzw. das unveränderte Original. */
async function updateOriginalView(s, mask) {
  const markers = s.bgRemove === 'color'
    ? s.bgSeeds.map((p) => ({ ...p, positive: false }))
    : s.bgRemove === 'sam' ? s.samPoints : [];
  const key = `${mask ? state.mask.key : 'plain'}|${JSON.stringify(markers)}`;
  if (state.originalViewKey === key) return;
  state.originalViewKey = key;
  const img = $('#img-original');
  if (state.originalUrl) {
    URL.revokeObjectURL(state.originalUrl);
    state.originalUrl = null;
  }
  if (!mask && !markers.length) {
    img.src = state.source.url;
    $('#pane-original').classList.remove('checker');
    return;
  }
  const png = await Pipeline.cutout(state.source.bitmap, mask, markers);
  state.originalUrl = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
  img.src = state.originalUrl;
  $('#pane-original').classList.toggle('checker', !!mask);
}

/* ------------------------------------------------------------------ */
/* KI-Modelle: Download, Status, Fortschritt                          */
/* ------------------------------------------------------------------ */

const fmtMB = (b) => `${Math.round(b / 1e6)} MB`;

async function refreshModels() {
  try {
    state.models = await window.api.models.status();
  } catch {
    state.models = [];
  }
  renderModels();
}

/** Stellt sicher, dass ein Modell vorhanden ist (lädt es bei Bedarf mit Fortschrittsanzeige). */
async function ensureModel(id) {
  const info = state.models.find((m) => m.id === id);
  if (info && !info.available && info.downloadable) {
    showProgress(`Lade Modell „${MODEL_NAMES[id] || id}“ (${fmtMB(info.size)}) …`, 0);
  }
  await window.api.models.ensure(id);
  if (info && !info.available) await refreshModels();
}

function renderModels() {
  const list = $('#model-list');
  list.replaceChildren();
  const seen = new Set();
  for (const m of state.models) {
    const name = MODEL_NAMES[m.id] || m.label;
    if (m.id === 'sam_decoder') continue;
    if (seen.has(name)) continue;
    seen.add(name);
    const li = document.createElement('li');
    const label = document.createElement('div');
    label.className = 'model-name';
    label.textContent = m.label;
    label.title = `Lizenz: ${m.license}`;
    const st = document.createElement('div');
    st.className = 'model-state';
    if (m.bundled) {
      st.textContent = 'mitgeliefert';
    } else if (m.available) {
      st.textContent = 'installiert ';
      const del = document.createElement('button');
      del.className = 'link-btn';
      del.textContent = 'entfernen';
      del.addEventListener('click', async () => {
        state.models = await window.api.models.remove(m.id);
        state.cache = new Map();
        state.mask = null;
        renderModels();
      });
      st.append(del);
    } else {
      const dl = document.createElement('button');
      dl.className = 'link-btn';
      dl.textContent = `laden (${fmtMB(m.size)})`;
      dl.addEventListener('click', async () => {
        dl.disabled = true;
        try {
          await ensureModel(m.id);
          toast(`Modell „${m.label}“ installiert`);
        } catch (err) {
          toast(`Download fehlgeschlagen: ${cleanError(err)}`, true);
        } finally {
          hideProgress();
          refreshModels();
        }
      });
      st.append(dl);
    }
    li.append(label, st);
    list.append(li);
  }
}

function showProgress(label, fraction) {
  $('#progress').hidden = false;
  $('#progress-label').textContent = label;
  const fill = $('#progress-fill');
  fill.classList.toggle('indeterminate', fraction == null);
  fill.style.width = fraction == null ? '' : `${Math.round(fraction * 100)}%`;
}

function hideProgress() {
  $('#progress').hidden = true;
}

window.api.models.onProgress((p) => {
  if (p.done) return;
  const name = MODEL_NAMES[p.id] || p.id;
  const frac = p.total ? p.received / p.total : null;
  showProgress(`Lade Modell „${name}“: ${fmtMB(p.received)} / ${fmtMB(p.total)}`, frac);
});

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
    const canvas = Processing.resultCanvas(r, r.transparent);
    const png = await Encoders.canvasBytes(canvas, 'image/png');
    files.push({ ext: 'png', data: Encoders.pngWithDpi(png, r.dpi) });
  }
  if (formats.jpg) {
    const canvas = Processing.resultCanvas(r, false);
    const jpg = await Encoders.canvasBytes(canvas, 'image/jpeg', 0.95);
    files.push({ ext: 'jpg', data: Encoders.jpgWithDpi(jpg, r.dpi) });
  }
  if (formats.bmp) {
    const bmp = r.gray8 ? Encoders.bmp8gray(r.gray8, r.w, r.h, r.dpi) : Encoders.bmp1bit(r.bits, r.w, r.h, r.dpi);
    files.push({ ext: 'bmp', data: bmp });
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
  const full = Processing.resultCanvas(r, false);
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
    const mode = { dither: 'Foto', edges: 'Linien', relief: 'Relief' }[e.settings?.mode] || 'Fläche';
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
bindPresets();
bindDragDrop();
bindView();
syncControls();
setZoom(0);
refreshHistory();
refreshModels();
refreshPresets();
