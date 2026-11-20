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
  // Gesichtszüge hervorheben
  faceBoost: false,
  faceStrength: 1,
  mouthStrength: 1,
  noseStrength: 0.5,
  chinStrength: 0.5,
  cheekStrength: 0,
  // Altes Foto restaurieren
  restoreDenoise: false,
  restoreScratches: false,
  scratchSensitivity: 50,
  restoreFaces: false,
  faceRestoreStrength: 1,
  // Schrift & Logos
  textClean: false,
  textPad: 1,
  textBold: 0,
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
  inflight: new Map(), // Cache-Schlüssel → Startzeit noch laufender Berechnungen
  mask: null, // { key, canvas }
  models: [], // Status der KI-Modelle
  sys: null, // Speicher/CPU des Rechners und daraus abgeleitete Grenzen
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
  faceStrength: (v) => `${Math.round(Number(v) * 100)} %`,
  mouthStrength: (v) => (Number(v) ? `${Math.round(Number(v) * 100)} %` : 'aus'),
  noseStrength: (v) => (Number(v) ? `${Math.round(Number(v) * 100)} %` : 'aus'),
  chinStrength: (v) => (Number(v) ? `${Math.round(Number(v) * 100)} %` : 'aus'),
  cheekStrength: (v) => (Number(v) ? `${Math.round(Number(v) * 100)} %` : 'aus'),
  scratchSensitivity: (v) => `${v}`,
  faceRestoreStrength: (v) => `${Math.round(Number(v) * 100)} %`,
  textPad: (v) => (Number(v) ? `${Number(v).toFixed(1)} × Zeilenhöhe` : 'nur Schrift'),
  textBold: (v) => (Number(v) > 0 ? `+${v}` : `${v}`),
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

// Mitgelieferte Vorlagen, gegliedert nach Art des Eingangsbilds
// (nur die Abweichungen von den Standardwerten; Ausgabegröße und Exportformate bleiben erhalten)
const BUILTIN_PRESETS = [
  // ---- Logos, Schrift & Grafik ----
  {
    group: 'Logos, Schrift & Grafik', name: 'Logo / Schrift (sauber)',
    desc: 'Für saubere Logos, Schriftzüge und Vektorgrafiken mit klaren Kanten.',
    settings: { mode: 'vector', threshold: 128, turdSize: 4, alphaMax: 1, optTolerance: 0.2, workRes: 2000 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Logo aus kleinem Bild / Screenshot',
    desc: 'Für kleine, verpixelte oder unscharfe Logos (z. B. aus dem Internet): KI-Vergrößerung glättet die Kanten.',
    settings: { mode: 'vector', upscale: true, blur: 0.5, threshold: 128, turdSize: 8, alphaMax: 1.1, optTolerance: 0.3, workRes: 2400 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Strichzeichnung mit Logo / Schrift',
    desc: 'Für Fotos mit Logo oder Schriftzug (z. B. Fahrzeuge, Schilder, Werbung): Motiv als Strichzeichnung, Schrift und Logos sauber gefüllt.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineRes: 1024, threshold: 150, textClean: true, textPad: 1.5, textBold: 0 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Fotogravur mit Logo / Schrift',
    desc: 'Für Fotos mit Logo oder Schriftzug: Motiv gerastert, Schrift und Logos scharf und gefüllt statt gepunktet.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 15, sharpen: 0.6, textClean: true, textPad: 1.5, textBold: 0 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Clipart / Comic',
    desc: 'Für Comics, Cliparts und Malvorlagen mit schwarzen Konturen – feine Linien bleiben erhalten.',
    settings: { mode: 'vector', threshold: 140, turdSize: 3, alphaMax: 0.9, optTolerance: 0.15, workRes: 2400 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Handschrift / Unterschrift (Scan)',
    desc: 'Für eingescannte oder fotografierte Handschrift auf Papier: hebt den Kontrast und entfernt Papierflecken.',
    settings: { mode: 'vector', contrast: 35, brightness: 10, blur: 0.5, threshold: 135, turdSize: 12, alphaMax: 1.2, optTolerance: 0.3, workRes: 2500 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Bleistift- / Tuschezeichnung (Scan)',
    desc: 'Für gescannte Zeichnungen und Skizzen: helle Striche werden kräftiger, Papierstruktur verschwindet.',
    settings: { mode: 'vector', contrast: 45, brightness: 15, gamma: 0.8, sharpen: 0.4, threshold: 160, turdSize: 6, workRes: 2500 },
  },

  // ---- Porträts & Personen ----
  {
    group: 'Porträts & Personen', name: 'Porträt – Fotogravur',
    desc: 'Für Porträtfotos: Person freigestellt, Dithering mit feiner Kontur zwischen Person und Hintergrund.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 15, sharpen: 0.6, bgRemove: 'modnet', subjectLine: true, subjectLineMm: 0.25, faceBoost: true, faceStrength: 1, mouthStrength: 0.8, noseStrength: 0.5, chinStrength: 0.5, cheekStrength: 0.3 },
  },
  {
    group: 'Porträts & Personen', name: 'Porträt – Schablone (Stencil)',
    desc: 'Für Porträts als flächige Schwarz-Weiß-Grafik im Stencil-Stil, z. B. für Holzschilder.',
    settings: { mode: 'vector', bgRemove: 'modnet', contrast: 25, blur: 1, threshold: 110, turdSize: 25, alphaMax: 1.2, optTolerance: 0.4, subjectLine: true, subjectLineMm: 0.4, faceBoost: true, faceStrength: 1, mouthStrength: 1, noseStrength: 0.6, chinStrength: 0.6, cheekStrength: 0.3 },
  },
  {
    group: 'Porträts & Personen', name: 'Porträt – Strichzeichnung',
    desc: 'Für Porträtfotos: KI zeichnet das Gesicht wie von Hand nach.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineRes: 832, threshold: 150, bgRemove: 'modnet', faceBoost: true, faceStrength: 1, mouthStrength: 1.2, noseStrength: 0.8, chinStrength: 0.8, cheekStrength: 0.5 },
  },
  {
    group: 'Porträts & Personen', name: 'Altes Porträtfoto restaurieren',
    desc: 'Für alte, verrauschte oder zerkratzte Porträts: Rauschen und Kratzer entfernen, Gesichter per KI restaurieren, dann Fotogravur.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 15, sharpen: 0.3, restoreDenoise: true, restoreScratches: true, scratchSensitivity: 50, restoreFaces: true, faceRestoreStrength: 1, faceBoost: true, faceStrength: 0.8, mouthStrength: 0.8, noseStrength: 0.4, chinStrength: 0.4, cheekStrength: 0.2 },
  },
  {
    group: 'Porträts & Personen', name: 'Gruppenfoto / Person im Alltag',
    desc: 'Für Fotos mit mehreren Personen oder unruhigem Hintergrund: präzises Freistellen, Dithering.',
    settings: { mode: 'dither', ditherAlgo: 'floyd', dpi: 254, contrast: 15, sharpen: 0.5, bgRemove: 'isnet', subjectLine: true, subjectLineMm: 0.25, faceBoost: true, faceStrength: 1, mouthStrength: 0.8, noseStrength: 0.4, chinStrength: 0.4, cheekStrength: 0.2 },
  },

  // ---- Tiere ----
  {
    group: 'Tiere', name: 'Haustier – Fotogravur',
    desc: 'Für Hunde, Katzen & Co.: Fell bleibt detailreich, Hintergrund wird entfernt.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 20, sharpen: 0.8, bgRemove: 'birefnet', subjectLine: true, subjectLineMm: 0.25 },
  },
  {
    group: 'Tiere', name: 'Haustier – Schablone',
    desc: 'Für Haustierfotos als kontrastreiche Schwarz-Weiß-Grafik.',
    settings: { mode: 'vector', bgRemove: 'birefnet', contrast: 25, blur: 1, threshold: 105, turdSize: 20, alphaMax: 1.2, optTolerance: 0.4, subjectLine: true, subjectLineMm: 0.4 },
  },
  {
    group: 'Tiere', name: 'Haustier – Strichzeichnung',
    desc: 'Für Haustierfotos als Linienzeichnung, z. B. für Gedenktafeln.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineRes: 896, threshold: 145, bgRemove: 'birefnet' },
  },
  {
    group: 'Tiere', name: 'Silhouette (gefüllt)',
    desc: 'Für jedes Motiv: komplett schwarz gefüllte Silhouette ohne Innendetails.',
    settings: { mode: 'vector', bgRemove: 'birefnet', brightness: -100, threshold: 254, turdSize: 30, alphaMax: 1.2, optTolerance: 0.4 },
  },

  // ---- Fotos & Landschaft ----
  {
    group: 'Fotos & Landschaft', name: 'Foto allgemein – Dithering',
    desc: 'Für normale Fotos ohne Freistellen.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 15, sharpen: 0.6 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Landschaft / Architektur',
    desc: 'Für Landschafts- und Gebäudefotos mit vielen feinen Details.',
    settings: { mode: 'dither', ditherAlgo: 'stucki', dpi: 300, contrast: 20, sharpen: 0.9 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Landschaft als Linienzeichnung',
    desc: 'Für Landschaften, Gebäude und Skylines als feine Strichzeichnung.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineRes: 1024, threshold: 150 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Dunkles / kontrastarmes Foto',
    desc: 'Für unterbelichtete, flaue oder alte Fotos: hellt auf und verstärkt den Kontrast.',
    settings: { mode: 'dither', ditherAlgo: 'floyd', dpi: 254, brightness: 15, contrast: 35, gamma: 1.3, sharpen: 0.5 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Altes / kleines Foto restaurieren',
    desc: 'Für alte Fotos ohne Personen im Vordergrund: Rauschen und Kratzer entfernen, KI-Vergrößerung, dann Dithering.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, upscale: true, contrast: 20, sharpen: 0.4, restoreDenoise: true, restoreScratches: true, scratchSensitivity: 50 },
  },

  // ---- Material ----
  {
    group: 'Material', name: 'Holz – Fotogravur',
    desc: 'Für Fotos auf Holz: Atkinson-Dithering wirkt auf Holz heller und sauberer.',
    settings: { mode: 'dither', ditherAlgo: 'atkinson', dpi: 254, contrast: 20, sharpen: 0.6, gamma: 1.1 },
  },
  {
    group: 'Material', name: 'Schiefer / Glas / eloxiertes Alu (invertiert)',
    desc: 'Für Materialien, auf denen die Gravur hell erscheint: Bild wird invertiert.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 300, invert: true, contrast: 20, sharpen: 0.6 },
  },
  {
    group: 'Material', name: 'Leder – Gravur',
    desc: 'Für Leder: gröbere Auflösung und mehr Kontrast, damit nichts verbrennt.',
    settings: { mode: 'dither', ditherAlgo: 'floyd', dpi: 200, contrast: 25, gamma: 1.2, sharpen: 0.4 },
  },
  {
    group: 'Material', name: 'Acryl – Flächengravur',
    desc: 'Für Grafiken auf Acryl: klare Flächen als Vektor. Für Rückseitengravur in LightBurn spiegeln.',
    settings: { mode: 'vector', threshold: 128, turdSize: 6, alphaMax: 1, optTolerance: 0.2, workRes: 2000 },
  },

  // ---- Schneiden & Relief ----
  {
    group: 'Schneiden & Relief', name: 'Sticker mit Schnittkontur',
    desc: 'Motiv freigestellt plus rote Schnittlinie mit 3 mm Abstand.',
    settings: { mode: 'vector', bgRemove: 'ai', outline: true, outlineOffsetMm: 3, outlineCloseMm: 3 },
  },
  {
    group: 'Schneiden & Relief', name: 'Holzaufsteller / Figur ausschneiden',
    desc: 'Für Figuren aus Holz: Gravur plus Schnittlinie mit 5 mm Rand und geschlossenen Lücken.',
    settings: { mode: 'dither', ditherAlgo: 'atkinson', dpi: 254, contrast: 20, sharpen: 0.6, bgRemove: 'birefnet', subjectLine: true, subjectLineMm: 0.3, outline: true, outlineOffsetMm: 5, outlineCloseMm: 6 },
  },
  {
    group: 'Schneiden & Relief', name: 'Nur Schnittkontur',
    desc: 'Nur die Außenkontur des Motivs als Schnittlinie, ohne Gravur.',
    settings: { mode: 'vector', bgRemove: 'ai', outline: true, outlineOnly: true, outlineOffsetMm: 2, outlineCloseMm: 4 },
  },
  {
    group: 'Schneiden & Relief', name: 'Holz-Relief (3D)',
    desc: 'Für Objekte und Landschaften: Tiefenkarte für 3D-Reliefgravur.',
    settings: { mode: 'relief', depthRes: '770', dpi: 254, blur: 1, contrast: 10 },
  },
  {
    group: 'Schneiden & Relief', name: 'Porträt-Relief (3D)',
    desc: 'Für Porträts: Person freigestellt, glatte Tiefenkarte für Reliefgravur.',
    settings: { mode: 'relief', depthRes: '770', dpi: 254, blur: 1.5, contrast: 15, bgRemove: 'modnet' },
  },
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
  for (const name of [...new Set(BUILTIN_PRESETS.map((p) => p.group))]) {
    group(name, BUILTIN_PRESETS.filter((p) => p.group === name), 'builtin');
  }
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
  const builtin = a.key.startsWith('builtin:') && BUILTIN_PRESETS.find((p) => `builtin:${p.name}` === a.key);
  const parts = [];
  if (builtin) parts.push(builtin.desc);
  if (changed) parts.push('Einstellungen wurden seit dem Anwenden geändert.');
  hint.textContent = parts.join(' ');
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
  state.inflight = new Map();
  state.faceCount = null;
  state.restoreFaceCount = null;
  state.restoreInfo = '';
  $('#restore-info').textContent = '';
  $('#face-info').textContent = '';
  $('#text-info').textContent = '';
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
    async render(source, mask, s, lineMask = null, textSource = null) {
      const src = await createImageBitmap(source);
      const m = mask ? await createImageBitmap(mask) : null;
      const lm = lineMask ? await createImageBitmap(lineMask) : null;
      const ts = textSource ? await createImageBitmap(textSource) : null;
      return call('render', { source: src, mask: m, lineMask: lm, textSource: ts, s }, [src, m, lm, ts].filter(Boolean));
    },
    async cutout(source, mask, markers, boxes = []) {
      const src = await createImageBitmap(source);
      const m = mask ? await createImageBitmap(mask) : null;
      return call('cutout', { source: src, mask: m, markers, boxes }, m ? [src, m] : [src]);
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

/* ------------------------------------------------------------------ */
/* Restzeit-Schätzung                                                 */
/* ------------------------------------------------------------------ */

/**
 * Gelernte Laufzeiten pro Schritt (ms je Einheit, z. B. je Megapixel oder je Modellaufruf).
 * Startwerte stammen aus Messungen; danach passt sich die Schätzung dem Rechner an.
 */
const Timing = (() => {
  const KEY = 'pic2laser.timing';
  let stats = {};
  try { stats = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* ignorieren */ }
  return {
    est(key, units, seedPerUnit) {
      return (stats[key] ?? seedPerUnit) * units;
    },
    learn(key, units, ms) {
      if (!(units > 0) || !(ms > 0)) return;
      const v = ms / units;
      stats[key] = stats[key] == null ? v : stats[key] * 0.6 + v * 0.4;
      try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch { /* ignorieren */ }
    },
  };
})();

function fmtDuration(ms) {
  if (ms < 1500) return 'gleich fertig';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `noch ca. ${sec} s`;
  return `noch ca. ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min`;
}

/** Fortschritt eines Berechnungsdurchlaufs mit Restzeit-Anzeige. */
const Run = {
  cur: null,
  timer: null,
  downloading: false,

  start(steps) {
    this.cur = {
      t0: performance.now(),
      steps: new Map(steps.map((st) => [st.id, { ...st, done: false, frac: null }])),
    };
    clearInterval(this.timer);
    this.timer = setInterval(() => this.render(), 250);
  },

  /** Verfolgt einen Schritt; nach Abschluss wird die tatsächliche Dauer gelernt. */
  async track(id, promise) {
    const st = this.cur?.steps.get(id);
    if (st && st.started == null) st.started = performance.now();
    this.render();
    const res = await promise;
    if (st && !st.done) {
      st.done = true;
      if (!st.inherited) Timing.learn(st.tkey, st.units, performance.now() - st.started);
    }
    return res;
  },

  progress(id, frac) {
    const st = this.cur?.steps.get(id);
    if (st) st.frac = frac;
  },

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.cur = null;
    if (!this.downloading) hideProgress();
  },

  render() {
    const r = this.cur;
    if (!r || this.downloading) return;
    const now = performance.now();
    let rem = 0;
    let label = null;
    let overrun = false;
    for (const st of r.steps.values()) {
      if (st.done) continue;
      if (!label) label = st.label;
      if (st.started == null) {
        rem += st.est;
        continue;
      }
      const el = now - st.started;
      let left = st.frac > 0.03 ? el / st.frac - el : st.est - el;
      if (left < 0) {
        // länger als geschätzt: keine erfundene Zahl anzeigen
        left = Math.max(st.est * 0.1, 500);
        if (label === st.label) overrun = true;
      }
      rem += left;
    }
    const el = now - r.t0;
    if (!label || (el < 700 && el + rem < 1500)) return; // kurze Berechnung: nur der Spinner
    const eta = overrun ? 'dauert etwas länger …' : fmtDuration(rem);
    showProgress(`${label} · ${eta}`, Math.min(0.97, el / (el + rem)));
  },
};

/* ------------------------------------------------------------------ */
/* Zwischenspeicher & Schlüssel                                       */
/* ------------------------------------------------------------------ */

const SEG_MODEL = { ai: 'u2netp', isnet: 'isnet', birefnet: 'birefnet', modnet: 'modnet', sam: 'sam_encoder' };
const SEG_SEED_MS = { ai: 1500, isnet: 4000, birefnet: 26000, modnet: 2200 };
const MODEL_NAMES = {
  u2netp: 'Freistellen (schnell)', isnet: 'Freistellen (präzise)', birefnet: 'Freistellen (beste Qualität)',
  modnet: 'Porträt-Freistellen', sam_encoder: 'Objekt anklicken', sam_decoder: 'Objekt anklicken',
  lineart: 'KI-Strichzeichnung', esrgan: 'KI-Vergrößerung', depth: 'Tiefenkarte', faces: 'Gesichtserkennung',
  scunet: 'Rauschen entfernen', lama: 'Kratzer auffüllen', restoreformer: 'Gesichter restaurieren', yunet: 'Gesichtspunkte',
  text: 'Texterkennung',
};

/** Kennung der Restaurierungs-Einstellungen ('' = keine Restaurierung). */
function restoreSig(s) {
  if (!s.restoreDenoise && !s.restoreScratches && !s.restoreFaces) return '';
  return `r${s.restoreDenoise ? 'D' : ''}${s.restoreScratches ? `S${s.scratchSensitivity}` : ''}${s.restoreFaces ? `F${s.faceRestoreStrength}` : ''}`;
}
// Alle KI-Zwischenergebnisse hängen am Eingangsbild: Restaurierung + Vergrößerung
const upTag = (s) => `${s.upscale ? 'up' : 'orig'}${restoreSig(s) ? `|${restoreSig(s)}` : ''}`;
const KEYS = {
  seg: (method, up) => `seg:${method}:${up}`,
  samEmb: (up) => `sam-emb:${up}`,
  samMask: (up, points) => `sam-mask:${up}:${JSON.stringify(points)}`,
  lineart: (up, res, maskKey) => `lineart:${up}:${res}:${maskKey}`,
  depth: (up, res) => `depth:${up}:${res}`,
  faces: (up) => `faces:${up}`,
  text: (up) => `text:${up}`,
};

const textWanted = (s) => s.textClean && s.mode !== 'relief';

const facesWanted = (s) => s.faceBoost && s.mode !== 'relief';

/** Schlüssel der Freistellmaske für die aktuellen Einstellungen (null = keine Maske). */
function maskKeyFor(s) {
  const method = s.bgRemove;
  if (method === 'none' || (method === 'sam' && !s.samPoints.length)) return null;
  const up = upTag(s);
  if (method === 'color') return `color:${up}:${s.bgTolerance}:${s.bgBorder}:${JSON.stringify(s.bgSeeds)}`;
  if (method === 'sam') return `sam:${up}:${s.maskThreshold}:${JSON.stringify(s.samPoints)}`;
  return `${method}:${up}:${s.maskThreshold}`;
}

/** Zwischenspeicher pro Bild: gleiche Anfrage → gleiches Promise. Laufende Berechnungen werden vermerkt. */
function cached(key, fn) {
  if (!state.cache.has(key)) {
    const p = fn();
    state.cache.set(key, p);
    state.inflight.set(key, performance.now());
    p.catch(() => state.cache.delete(key)).finally(() => state.inflight.delete(key));
  }
  return state.cache.get(key);
}

function cleanError(err) {
  return String(err?.message || err)
    .replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    .replace(/^LOW_MEMORY: /, '');
}

const isLowMemory = (err) => /LOW_MEMORY|bad_alloc|Arbeitsspeicher/.test(String(err?.message || err));

/* ------------------------------------------------------------------ */
/* Systemressourcen                                                   */
/* ------------------------------------------------------------------ */

/** Speicher und Leistungsstufe des Rechners abfragen und die Verarbeitungsgrenzen anwenden. */
async function refreshSystem() {
  try {
    state.sys = await window.api.system.profile();
  } catch {
    return;
  }
  const l = state.sys.limits;
  Restore.configure({ maxSide: l.restoreMaxSide, denoiseTile: l.denoiseTile });
  AI.configure({ upscaleMaxInput: l.upscaleMaxInput });
  renderSystemInfo();
}

const fmtGB = (mb) => `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;

function renderSystemInfo() {
  const sys = state.sys;
  if (!sys) return;
  $('#system-info').textContent =
    `Dieser Rechner: ${fmtGB(sys.totalMB)} RAM (${fmtGB(sys.availMB)} frei) · ${sys.cores} Kerne · Leistungsstufe „${sys.tier}“`;
}

/** Wendet die Grenzen des Rechners auf die Einstellungen eines Durchlaufs an. */
function applyLimits(s) {
  const l = state.sys?.limits;
  if (!l) return s;
  s.maxMegapixels = l.maxMegapixels;
  s.lineRes = Math.min(Number(s.lineRes), l.lineResMax);
  return s;
}

const upscaleApplies = (bitmap) => Math.max(bitmap.width, bitmap.height) < 2048;

/**
 * Plant die Schritte eines Durchlaufs mit geschätzter Dauer.
 * Bereits zwischengespeicherte Ergebnisse entfallen; noch laufende werden mit ihrer Startzeit übernommen.
 */
function planSteps(s) {
  const b = state.source.bitmap;
  const up = upTag(s);
  const steps = [];
  const add = (id, label, tkey, units, seed, cacheKey = null) => {
    let started = null;
    if (cacheKey && state.cache.has(cacheKey)) {
      if (!state.inflight.has(cacheKey)) return; // schon fertig
      started = state.inflight.get(cacheKey);
    }
    steps.push({ id, label, tkey, units, est: Timing.est(tkey, units, seed), started, inherited: started != null });
  };

  let work = { w: b.width, h: b.height };
  const sig = restoreSig(s);
  if (sig) {
    const sc = Math.min(1, Restore.MAX_SIDE / Math.max(b.width, b.height));
    work = { w: Math.round(b.width * sc), h: Math.round(b.height * sc) };
    const key = `restore:${sig}`;
    if (s.restoreDenoise) add('restore-denoise', 'Rauschen entfernen', 'restore-denoise', Restore.denoiseTiles(work.w, work.h), 6000, key);
    if (s.restoreScratches) add('restore-scratch', 'Kratzer & Staub entfernen', 'restore-scratch', 1, 6000, key);
    if (s.restoreFaces) add('restore-faces', 'Gesichter restaurieren', 'restore-faces', state.restoreFaceCount ?? 1, 5000, key);
  }
  if (s.upscale && upscaleApplies({ width: work.w, height: work.h })) {
    const sc = Math.min(1, 1024 / Math.max(work.w, work.h));
    const iw = Math.round(work.w * sc), ih = Math.round(work.h * sc);
    add('upscale', 'KI-Vergrößerung', 'upscale', Math.ceil(iw / 192) * Math.ceil(ih / 192), 450, `upscale:${sig}`);
    work = { w: iw * 4, h: ih * 4 };
  }

  const method = s.bgRemove;
  const maskKey = maskKeyFor(s);
  if (maskKey && !(state.mask && state.mask.key === maskKey)) {
    if (method === 'color') {
      const a = Segmentation.analysisSize({ width: work.w, height: work.h });
      add('colormask', 'Freistellen nach Farbe', 'colormask', (a.w * a.h) / 1e6, 250);
    } else if (method === 'sam') {
      add('sam-emb', 'Objekt erkennen', 'sam-emb', 1, 2500, KEYS.samEmb(up));
      add('sam-mask', 'Objekt auswählen', 'sam-mask', 1, 500, KEYS.samMask(up, s.samPoints));
    } else {
      add('seg', MODEL_NAMES[SEG_MODEL[method]], `seg:${method}`, 1, SEG_SEED_MS[method], KEYS.seg(method, up));
    }
  }

  if (facesWanted(s)) add('faces', 'Gesichtserkennung', 'faces', 1, 300, KEYS.faces(up));
  if (textWanted(s)) add('text', 'Texterkennung', 'text', 1, 900, KEYS.text(up));

  let src = work;
  if (s.mode === 'edges' && s.edgeMethod === 'ai') {
    const sc = Number(s.lineRes) / Math.max(work.w, work.h);
    src = { w: Math.round(work.w * sc), h: Math.round(work.h * sc) };
    const lineKey = KEYS.lineart(up, s.lineRes, maskKey || 'none');
    add('lineart', 'KI-Strichzeichnung', 'lineart', (src.w * src.h) / 1e6, 6000, lineKey);
    if (s.faceBoost) {
      const n = state.faceCount ?? 1;
      if (n > 0) add('lineart-faces', 'Gesichtsdetails zeichnen', 'lineart-face', n, 2500, `${lineKey}:faces:${s.faceStrength}:${s.mouthStrength}:${s.noseStrength}:${s.chinStrength}:${s.cheekStrength}`);
    }
  } else if (s.mode === 'relief') {
    const sc = Number(s.depthRes) / Math.max(work.w, work.h);
    add('depth', 'Tiefenkarte', 'depth', (work.w * sc * work.h * sc) / 1e6, 6000, KEYS.depth(up, s.depthRes));
  }
  if (s.subjectLine && !maskKey && s.mode !== 'relief') {
    add('contour', 'Motivkontur', `seg:ai`, 1, SEG_SEED_MS.ai, KEYS.seg('ai', up));
  }

  const out = Processing.targetSize(src.w, src.h, s);
  const mp = (out.w * out.h) / 1e6;
  const variant = s.mode === 'edges' ? `:${s.edgeMethod}` : s.mode === 'dither' ? `:${s.ditherAlgo}` : '';
  const renderSeed = { vector: 250, edges: s.edgeMethod === 'ai' ? 300 : 700, dither: 700, relief: 250 }[s.mode] + (s.outline ? 1500 : 0);
  add('render', 'Bildverarbeitung', `render:${s.mode}${variant}${s.outline ? '+outline' : ''}`, mp, renderSeed);
  if (!(s.outline && s.outlineOnly) && (s.mode === 'vector' || s.mode === 'edges')) {
    add('trace', 'Vektorisierung', `trace:${s.mode}${variant}`, mp, 1000);
  }
  if (s.outline) add('trace-outline', 'Umrisslinie', 'trace-outline', mp, 300);
  return steps;
}

/* ------------------------------------------------------------------ */
/* Durchlauf                                                          */
/* ------------------------------------------------------------------ */

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
    await refreshSystem(); // aktuell freien Speicher berücksichtigen
    if (stale()) return;
    applyLimits(s);
    Run.start(planSteps(s));

    // 1. Optional KI-Vergrößerung
    const work = await workingBitmap(s);
    if (stale()) return;
    const viewBase = restoreSig(s) ? await restoredBitmap(s) : state.source.bitmap;
    $('#restore-info').textContent = restoreSig(s) ? (state.restoreInfo || '') : '';

    // Schrift & Logos erkennen (vor der Vorschau, damit die Bereiche dort markiert werden)
    s.textBlocks = textWanted(s) ? await detectText(s, work) : [];
    if (stale()) return;

    // 2. Freistellen
    const mask = await ensureMask(s, work);
    if (stale()) return;
    await updateOriginalView(s, mask, viewBase);
    if (stale()) return;

    // Gesichter erkennen (für „Gesichtszüge hervorheben“)
    s.faces = facesWanted(s) ? await detectFaces(s, work) : [];
    if (stale()) return;

    // 3. KI-Quelle je nach Modus (Strichzeichnung, Tiefenkarte) oder das Bild selbst
    const source = await contentSource(s, work, mask);
    if (stale()) return;

    // Motivkontur ohne Freistellen: Grenze per schneller KI ermitteln, Hintergrund bleibt erhalten
    let lineMask = null;
    if (s.subjectLine && !mask && s.mode !== 'relief') {
      lineMask = await contourMask(s, work);
      if (stale()) return;
    }

    // 4. Rasterverarbeitung im Worker (blockiert die Oberfläche nicht)
    const { w, h, bits, gray8, tracePng, imagePng, imageB64, sil } =
      await Run.track('render', Pipeline.render(source, mask, s, lineMask, s.textBlocks.length && source !== work ? work : null));
    if (stale()) return;
    const widthMm = s.widthMm;
    const heightMm = (widthMm * h) / w;
    const mmPerPx = widthMm / w;
    const dpi = s.mode === 'dither' || s.mode === 'relief' ? s.dpi : w / (widthMm / 25.4);

    // 5. Vektorisierung (Potrace im eigenen Prozess)
    let fillPath = null;
    if (tracePng) {
      fillPath = await Run.track('trace',
        window.api.trace(tracePng, { turdSize: s.turdSize, alphaMax: s.alphaMax, optTolerance: s.optTolerance }));
      if (stale()) return;
    }
    let outline = null;
    if (sil) {
      const d = await Run.track('trace-outline', window.api.trace(sil.png, {
        turdSize: Math.round(sil.w * sil.h * 0.0005), // Kleinteile ignorieren
        alphaMax: 1.2,
        optTolerance: 0.5,
      }));
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
      Run.stop();
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
/* KI-Schritte                                                        */
/* ------------------------------------------------------------------ */

/** Bild nach optionaler KI-Vergrößerung. */
async function workingBitmap(s) {
  const bitmap = await restoredBitmap(s);
  if (!s.upscale) return bitmap;
  if (!upscaleApplies(bitmap)) {
    if (!state.cache.has('upscale-skip')) {
      state.cache.set('upscale-skip', Promise.resolve());
      toast('Das Bild ist bereits groß genug – KI-Vergrößerung wird übersprungen.');
    }
    return bitmap;
  }
  const key = `upscale:${restoreSig(s)}`;
  if (!state.cache.has(key)) await ensureModelReady('esrgan');
  return Run.track('upscale', cached(key, () =>
    AI.upscale(bitmap, (done, total) => Run.progress('upscale', done / total))));
}

/** Altes Foto restaurieren: Rauschen, Kratzer/Staub, Gesichter (zwischengespeichert). */
async function restoredBitmap(s) {
  const sig = restoreSig(s);
  if (!sig) return state.source.bitmap;
  const key = `restore:${sig}`;
  if (!state.cache.has(key)) {
    // Modelle vorher laden, damit der Download nicht in die Zeitmessung fällt
    if (s.restoreDenoise) await ensureModelReady('scunet');
    if (s.restoreScratches) await ensureModelReady('lama');
    if (s.restoreFaces || s.restoreScratches) await ensureModelReady('yunet');
    if (s.restoreFaces) await ensureModelReady('restoreformer');
  }
  return cached(key, async () => {
    const canvas = Restore.workingCopy(state.source.bitmap);
    const info = [];
    if (s.restoreDenoise) {
      await Run.track('restore-denoise', Restore.denoise(canvas, (d, t) => Run.progress('restore-denoise', d / t)));
      info.push('Rauschen entfernt');
    }
    const faces = s.restoreFaces || s.restoreScratches ? await Restore.landmarks(canvas) : [];
    if (s.restoreScratches) {
      await Run.track('restore-scratch', (async () => {
        const { mask, count } = Restore.detectScratches(canvas, s.scratchSensitivity, Restore.protectZones(faces));
        if (count) await Restore.inpaint(canvas, mask, (d, t) => Run.progress('restore-scratch', d / t));
        info.push(count ? `${count} Kratzer/Staubstellen aufgefüllt` : 'keine Kratzer gefunden');
      })());
    }
    if (s.restoreFaces) {
      state.restoreFaceCount = faces.length;
      await Run.track('restore-faces', Restore.restoreFaces(canvas, faces, s.faceRestoreStrength,
        (d, t) => Run.progress('restore-faces', d / t)));
      info.push(faces.length ? `${faces.length} Gesicht${faces.length === 1 ? '' : 'er'} restauriert` : 'kein Gesicht gefunden');
    }
    state.restoreInfo = info.join(' · ');
    return canvas;
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
  const key = maskKeyFor(s);
  if (!key) return null;
  if (state.mask && state.mask.key === key) return state.mask.canvas;
  const up = upTag(s);

  let canvas;
  try {
    if (method === 'color') {
      canvas = await Run.track('colormask', Pipeline.colorMask(bitmap, s.bgTolerance, s.bgBorder, s.bgSeeds));
    } else {
      await ensureModelReady(SEG_MODEL[method]);
      let raw;
      if (method === 'sam') {
        const emb = await Run.track('sam-emb', cached(KEYS.samEmb(up), () => AI.samEmbedding(bitmap)));
        const { w, h } = Segmentation.analysisSize(bitmap);
        raw = await Run.track('sam-mask', cached(KEYS.samMask(up, s.samPoints), () => AI.samMask(emb, s.samPoints, w, h)));
      } else {
        try {
          raw = await Run.track('seg', cached(KEYS.seg(method, up), () => AI.segment(method, bitmap)));
        } catch (err) {
          // BiRefNet braucht ca. 6,7 GB – bei zu wenig Speicher automatisch IS-Net verwenden
          if (method !== 'birefnet' || !isLowMemory(err)) throw err;
          await ensureModelReady('isnet');
          toast('Zu wenig freier Arbeitsspeicher für „beste Qualität“ – es wird „präzise“ (IS-Net) verwendet.');
          raw = await cached(KEYS.seg('isnet', up), () => AI.segment('isnet', bitmap));
        }
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

/** Erkennt Schrift im (ggf. vergrößerten) Bild und zeigt die Anzahl der Bereiche an. */
async function detectText(s, bitmap) {
  try {
    const blocks = await Run.track('text', cached(KEYS.text(upTag(s)), () => AI.detectText(bitmap)));
    $('#text-info').textContent = blocks.length
      ? `${blocks.length} Schriftbereich${blocks.length === 1 ? '' : 'e'} erkannt (im Original blau markiert).`
      : 'Keine Schrift erkannt.';
    return blocks;
  } catch (err) {
    if (isCancelled(err)) throw err;
    console.error(err);
    toast(`Texterkennung fehlgeschlagen: ${cleanError(err)}`, true);
    return [];
  }
}

/** Erkennt Gesichter im (ggf. vergrößerten) Bild und zeigt die Anzahl an. */
async function detectFaces(s, bitmap) {
  try {
    const faces = await Run.track('faces', cached(KEYS.faces(upTag(s)), () => AI.detectFaces(bitmap)));
    state.faceCount = faces.length;
    $('#face-info').textContent = faces.length
      ? `${faces.length} Gesicht${faces.length === 1 ? '' : 'er'} erkannt.`
      : 'Kein Gesicht erkannt – die Option wirkt nur auf Gesichter.';
    return faces;
  } catch (err) {
    if (isCancelled(err)) throw err;
    console.error(err);
    toast(`Gesichtserkennung fehlgeschlagen: ${cleanError(err)}`, true);
    return [];
  }
}

/** Maske nur für die Motivkontur (schnelle KI), wenn nicht freigestellt wird. */
async function contourMask(s, bitmap) {
  const up = upTag(s);
  try {
    await ensureModelReady('u2netp');
    const raw = await Run.track('contour', cached(KEYS.seg('ai', up), () => AI.segment('ai', bitmap)));
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
  const up = upTag(s);
  if (s.mode === 'edges' && s.edgeMethod === 'ai') {
    const key = KEYS.lineart(up, s.lineRes, mask ? state.mask.key : 'none');
    if (!state.cache.has(key)) await ensureModelReady('lineart');
    // Freigestellten Hintergrund vorher entfernen, damit dort keine Linien entstehen
    const lineInput = () => {
      if (!mask) return bitmap;
      const c = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0, bitmap.width, bitmap.height);
      return c;
    };
    const base = await Run.track('lineart', cached(key, () => AI.lineArt(lineInput(), Number(s.lineRes))));
    if (!s.faceBoost || !s.faces.length) return base;
    // Gesichter zusätzlich in hoher Auflösung nachzeichnen
    return Run.track('lineart-faces', cached(`${key}:faces:${s.faceStrength}:${s.mouthStrength}:${s.noseStrength}:${s.chinStrength}:${s.cheekStrength}`, () =>
      AI.enhanceFacesLineArt(lineInput(), base, s.faces, s.faceStrength, Processing.faceFeatureLevels(s))));
  }
  if (s.mode === 'relief') {
    const key = KEYS.depth(up, s.depthRes);
    if (!state.cache.has(key)) await ensureModelReady('depth');
    return Run.track('depth', cached(key, () => AI.depthMap(bitmap, Number(s.depthRes))));
  }
  return bitmap;
}

/** Zeigt im Original-Fenster das freigestellte Bild bzw. das unveränderte Original. */
async function updateOriginalView(s, mask, base = state.source.bitmap) {
  const markers = s.bgRemove === 'color'
    ? s.bgSeeds.map((p) => ({ ...p, positive: false }))
    : s.bgRemove === 'sam' ? s.samPoints : [];
  const boxes = s.textBlocks || [];
  const key = `${mask ? state.mask.key : 'plain'}|${JSON.stringify(markers)}|${JSON.stringify(boxes)}|${restoreSig(s)}`;
  if (state.originalViewKey === key) return;
  state.originalViewKey = key;
  const img = $('#img-original');
  if (state.originalUrl) {
    URL.revokeObjectURL(state.originalUrl);
    state.originalUrl = null;
  }
  if (!mask && !markers.length && !boxes.length && base === state.source.bitmap) {
    img.src = state.source.url;
    $('#pane-original').classList.remove('checker');
    return;
  }
  const png = await Pipeline.cutout(base, mask, markers, boxes);
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
    const peak = state.sys?.modelPeakMB?.[m.id];
    if (peak && peak >= 1000) {
      const req = document.createElement('div');
      req.className = 'model-req' + (state.sys && peak > state.sys.totalMB * 0.6 ? ' warn' : '');
      req.textContent = `braucht ca. ${fmtGB(peak)} RAM`;
      label.append(req);
    }
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

// Download-Fortschritt mit Restzeit aus der bisherigen Datenrate
const downloadStarts = new Map();
window.api.models.onProgress((p) => {
  if (p.done) {
    downloadStarts.delete(p.id);
    Run.downloading = downloadStarts.size > 0;
    if (!Run.downloading) {
      if (Run.cur) Run.render();
      else hideProgress();
    }
    return;
  }
  Run.downloading = true;
  if (!downloadStarts.has(p.id)) downloadStarts.set(p.id, { t: performance.now(), bytes: p.received });
  const start = downloadStarts.get(p.id);
  const el = performance.now() - start.t;
  const rate = el > 500 ? (p.received - start.bytes) / el : 0; // Bytes pro ms
  const eta = rate > 0 && p.total ? ` · ${fmtDuration((p.total - p.received) / rate)}` : '';
  const name = MODEL_NAMES[p.id] || p.id;
  const frac = p.total ? p.received / p.total : null;
  showProgress(`Lade Modell „${name}“: ${fmtMB(p.received)} / ${fmtMB(p.total)}${eta}`, frac);
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
refreshSystem().then(renderModels);
refreshModels();
refreshPresets();
