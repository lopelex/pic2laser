'use strict';

/* global Processing, Encoders, Segmentation, AI */

window.api.version().then((v) => {
  const el = document.getElementById('appVersion');
  if (el) el.textContent = `v${v}`;
}).catch(() => {});

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
  fmtPes: false, // Stickdatei Brother
  fmtDst: false, // Stickdatei Tajima
  fmtExp: false, // Stickdatei Melco (DesignShop)
  // Stickdatei (PES/DST/EXP): Füllstich und Umrisslinie
  embFabric: 'woven', // Stoffart: Grundwerte der Automatik je Farbe
  embTrimMm: 3, // längere Sprünge mit Fadenschnitt
  embLayers: {}, // je Bild: { [Ebenen-Schlüssel]: { type, angle, spacing, len, pull, underlay, thin } } – von Hand gesetzt
  embPreview: false, // Stiche statt Flächen in der Vorschau
  // Freistellen
  bgRemove: 'none',
  maskThreshold: 0.5,
  // Maske verfeinern (für alle Methoden)
  maskShiftMm: 0,
  maskSmoothMm: 0,
  maskSpeckPct: 0,
  maskHolePct: 0,
  maskLargest: false,
  bgTolerance: 20,
  bgBorder: true,
  bgSeeds: [],
  samPoints: [],
  // KI-Verbesserung
  upscale: false,
  // Linien
  edgeMethod: 'ai',
  lineStyle: 'fine',
  lineRes: 768,
  lineBoldMm: 0,
  edgeSensitivity: 60,
  lineWidthMm: 0.4,
  // Relief
  depthRes: '518',
  depthModel: 'small', // 'small' (Apache-2.0), 'base' / 'large' (CC BY-NC 4.0)
  reliefTransparent: false,
  // Wellen (Sinuswellen-Schattierung)
  sineSpacingMm: 1.2, // Abstand der Wellen
  sineAmplitude: 0.4, // Ausschlag als Anteil des Abstands (0,5 = Wellen berühren sich)
  sineDensity: 1.5, // Wellen je mm bei Schwarz
  sineMinDensity: 0, // Wellen je mm bei Weiß (0 = gerade Linie)
  sineStrokeMm: 0.15, // Strichbreite in Vorschau und Rasterexporten
  sineDirection: 'h', // 'h' = waagrecht, 'v' = senkrecht
  sineSkipWhite: false, // weiße Flächen auslassen (keine Linie)
  sineNormalize: true, // Helligkeitsumfang des Bildes auf die Wellendichte strecken
  // Farben (Farbflächen, z. B. für Stickerei)
  colorCount: 0, // Anzahl Farben, 0 = automatisch
  colorPalette: 'image', // 'image' = Bildfarben, 'brother' = Brother-Garnfarben
  colorSmoothMm: 0.15, // Kanten glätten (Mehrheitsfilter)
  colorMinAreaMm2: 0.5, // kleinere Flächen gehen in der Nachbarfarbe auf
  colorOverlapMm: 0.1, // untere Ebenen reichen so weit unter die oberen
  colorSkipBg: true, // Hintergrundfarbe (überwiegt am Bildrand) weglassen
  colorEdits: [], // je Bild: [{ from, to?, off?, into? }] – Farben ausblenden, umfärben, zusammenführen
  // Umrisslinie
  outline: false,
  outlineOffsetMm: 2,
  outlineCloseMm: 2,
  outlineOnly: false,
  // Formen verbessern
  shapeFit: false,
  shapeTolMm: 0.1,
  shapeSnap: true,
  shapeOrder: 'after', // „Formen verbessern“ zusammen mit „Schrift & Logos“: 'before' = erkannte Schrift bleibt unverändert, 'after' = gilt auch für die Schrift
  smoothContours: false,
  lineClean: false,
  lineSmoothMm: 0.3,
  lineMinMm: 1,
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
  faceOrder: 'before', // Gesichter erkennen: 'before' = ganzes Bild, 'after' = nur im freigestellten Motiv
  faceLocate: 'box', // Merkmale: 'box' = aus dem Gesichtsrahmen geschätzt, 'parse' = Face Parsing (nicht kommerziell)
  // Altes Foto restaurieren
  restoreOn: false, // Hauptschalter „Altes Foto restaurieren“
  restoreDenoise: false,
  restoreScratches: false,
  scratchSensitivity: 50,
  scratchProtect: 'points', // Gesichtsschutz: 'points' = aus 5 Gesichtspunkten, 'parse' = Face Parsing (nicht kommerziell)
  restoreFaces: false,
  faceRestoreStrength: 1,
  faceRestoreModel: 'restoreformer', // 'restoreformer' (Apache-2.0) oder 'codeformer' (nicht kommerziell)
  faceFidelity: 0.7, // CodeFormer: 0 = stärker restauriert, 1 = näher am Original
  restoreOrder: 'before', // 'before' = ganzes Bild restaurieren, 'after' = erst freistellen, dann nur das Motiv
  // Schrift & Logos
  textClean: false,
  textOrder: 'before', // Schrift erkennen: 'before' = vor dem Freistellen (ganzes Bild), 'after' = nur im freigestellten Motiv
  textPad: 1,
  textBold: 0,
  textModel: 'text', // 'text' = PP-OCRv4 (mitgeliefert), 'text_v5' = PP-OCRv5 mobil, 'text_v5_server' = PP-OCRv5 Server
  // Erweiterte Erkennung (Voreinstellungen = Verhalten bis 1.21.0)
  textSens: 50, // Empfindlichkeit 0..100: höher findet blassere Schrift, niedriger weniger Fehltreffer
  textRes: 1280, // längste Bildseite für die Erkennung (px)
  textUnclip: 1.5, // Rahmen um die Schrift (Erweiterung des erkannten Kerns)
  textMerge: 0.6, // Zeilen zusammenfassen bis zu diesem Abstand (× Zeilenhöhe)
  textMinPct: 0, // kleinste Schrifthöhe in % der Bildhöhe (0 = nur Krümel verwerfen)
  textMaxPct: 25, // größte Zeilenhöhe in % der Bildhöhe (100 = keine Grenze; flache Zeilen gelten immer)
  textFaces: true, // Bereiche in Gesichtern ignorieren
  textMulti: false, // zusätzlich in doppelter Auflösung suchen (kleine Schrift)
});

const SETTINGS_STORAGE_KEY = 'pic2laser.settings';

// Reine Anzeige-Vorlieben (nicht in Presets/Historie, kein Einfluss auf das Ergebnis)
const UI_STORAGE_KEY = 'pic2laser.ui';
const ui = (() => {
  try { return { hideBackground: false, ...JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || '{}') }; } catch { return { hideBackground: false }; }
})();
function saveUi() {
  try { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(ui)); } catch { /* ignorieren */ }
}
// Die App startet immer im Bereich „Lasern“; „Sticken“ gilt nur bis zum Beenden
ui.presetTab = 'laser';
const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16];
const ZOOM_MAX = 16;

const MODE_HINTS = {
  vector: 'Ideal für Logos, Schriften, Strichzeichnungen und Silhouetten. Ergebnis sind echte Vektorpfade – in LightBurn als Füllung (Fill) gravieren.',
  edges: 'Zeichnet die Kanten und Randkonturen des Bildes als Linien nach – ergibt eine Strichzeichnung als Vektor. In LightBurn als Füllung (Fill) gravieren.',
  color: 'Zerlegt das Bild in wenige Farbflächen – je Farbe eine eigene Ebene im SVG. Für Stickerei (Ink/Stitch, Hatch, Wilcom …) und Laser mit mehreren Farben/Ebenen.',
  sine: 'Zeichnet das Bild mit Sinuswellen: dunkle Stellen ergeben dichte Wellen, helle flache Linien. Ergebnis sind Vektorlinien – in LightBurn im Modus Linie (Line) gravieren.',
  relief: 'Erzeugt per KI eine Tiefenkarte des Fotos als Graustufenbild – für 3D-Reliefgravur in Holz (Laserleistung bestimmt die Tiefe).',
  dither: 'Ideal für Fotos. Graustufen werden in Punktmuster umgewandelt. Für LightBurn am besten zusätzlich PNG/BMP exportieren und als Bild im Modus „Passthrough" gravieren.',
};

const state = {
  settings: loadSettings(),
  source: null, // { name, ext, bytes: Uint8Array, bitmap, url, savedId }
  result: null, // { w, h, bits, svg, widthMm, heightMm, dpi, ... } – angezeigtes Ergebnis (ggf. vereinigt)
  baseResult: null, // Ergebnis der Umwandlung selbst, vor dem Vereinigen
  merge: null, // { id, name, svg, mode, widthMm, ditherAlgo, top: 'current'|'history', opacity } – vereinigter Historie-Eintrag
  mergePending: false, // Vereinigen-Einstellung geändert, neues Ergebnis noch nicht fertig
  processing: false, // eine Umwandlung (runProcess) läuft
  cancelRetries: 0, // Neustarts nach geerbtem Abbruch (siehe runProcess)
  cache: new Map(), // Zwischenergebnisse der KI-Modelle für das aktuelle Bild (Promises)
  inflight: new Map(), // Cache-Schlüssel → Startzeit noch laufender Berechnungen
  mask: null, // { key, canvas }
  maskRaw: null, // { key, canvas } – Maske vor dem Verfeinern
  models: [], // Status der KI-Modelle
  sys: null, // Speicher/CPU des Rechners und daraus abgeleitete Grenzen
  presets: [], // eigene Presets
  activePreset: null, // { key, settings } – zuletzt angewendetes Preset
  originalViewKey: null,
  historyId: null,
  historyName: null, // Name des geöffneten Historie-Eintrags (auch umbenannt) – Name der exportierten Dateien
  history: [],
  generation: 0,
  zoom: 1,
  viewMode: 'split',
  resultUrl: null,
};

// Letzte Meldungen – der MCP-Server gibt die während eines Werkzeugaufrufs gezeigten mit zurück
const toastLog = [];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ------------------------------------------------------------------ */
/* Einstellungen                                                      */
/* ------------------------------------------------------------------ */

/**
 * Standardwerte ergänzen. Ältere Einstellungen/Presets ohne Hauptschalter für die Restaurierung:
 * eingeschaltet, sobald eine Restaurierungsoption aktiv ist.
 */
/** Exportformate und Stickeinstellungen: ändern das berechnete Ergebnis nicht, bleiben bei Vorlagen erhalten. */
const isOutputKey = (k) => k.startsWith('fmt') || k.startsWith('emb');
const outputPrefs = (s) => Object.fromEntries(Object.keys(DEFAULTS).filter(isOutputKey).map((k) => [k, s[k]]));
const laserFormats = (s) => s.fmtSvg || s.fmtPng || s.fmtJpg || s.fmtBmp;
const EMB_MODES = ['vector', 'edges', 'color', 'sine']; // Modi mit Stickdatei
/**
 * Stickdatei möglich: nur in Modi mit Vektorflächen bzw. -linien (nicht Foto/Relief) – oder bei einer
 * Vereinigung, die als Vektor nachgezeichnet sein kann. Sonst gelten PES/DST/EXP als abgewählt (die Haken
 * bleiben gespeichert und gelten wieder, sobald man in einen passenden Modus wechselt).
 */
const embModeOk = (s) => EMB_MODES.includes(s.mode) || !!state.merge;
const embFormats = (s) => embModeOk(s) && !!(s.fmtPes || s.fmtDst || s.fmtExp);

function withDefaults(settings = {}) {
  const restoreOn = settings.restoreOn ?? !!(settings.restoreDenoise || settings.restoreScratches || settings.restoreFaces);
  return { ...DEFAULTS, ...settings, restoreOn };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return withDefaults(JSON.parse(raw));
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
  maskShiftMm: (v) => (Number(v) ? `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1).replace('.', ',')} mm` : 'aus'),
  maskSmoothMm: (v) => (Number(v) ? `${Number(v).toFixed(1).replace('.', ',')} mm` : 'aus'),
  maskSpeckPct: (v) => (Number(v) ? `< ${Number(v).toFixed(1).replace('.', ',')} %` : 'aus'),
  maskHolePct: (v) => (Number(v) ? `< ${Number(v).toFixed(1).replace('.', ',')} %` : 'aus'),
  bgTolerance: (v) => `${v}`,
  edgeSensitivity: (v) => `${v}`,
  lineRes: (v) => `${v} px`,
  lineBoldMm: (v) => (Number(v) ? `${Number(v).toFixed(2)} mm` : 'aus'),
  lineWidthMm: (v) => `${Number(v).toFixed(2)} mm`,
  sineSpacingMm: (v) => `${Number(v).toFixed(1).replace('.', ',')} mm`,
  sineAmplitude: (v) => `${Math.round(Number(v) * 200)} %`,
  sineDensity: (v) => `${Number(v).toFixed(1).replace('.', ',')} / mm`,
  sineMinDensity: (v) => (Number(v) ? `${Number(v).toFixed(1).replace('.', ',')} / mm` : 'gerade'),
  colorCount: (v) => (Number(v) ? String(v) : 'Auto'),
  colorSmoothMm: (v) => (Number(v) ? `${Number(v).toFixed(2).replace('.', ',')} mm` : 'aus'),
  colorMinAreaMm2: (v) => (Number(v) ? `${Number(v).toFixed(1).replace('.', ',')} mm²` : 'aus'),
  colorOverlapMm: (v) => (Number(v) ? `${Number(v).toFixed(2).replace('.', ',')} mm` : 'aus'),
  embTrimMm: (v) => `${Number(v).toFixed(1).replace('.', ',')} mm`,
  sineStrokeMm: (v) => `${Number(v).toFixed(2).replace('.', ',')} mm`,
  outlineOffsetMm: (v) => `${Number(v).toFixed(1)} mm`,
  shapeTolMm: (v) => `${Number(v).toFixed(2).replace('.', ',')} mm`,
  lineSmoothMm: (v) => (Number(v) ? `${Number(v).toFixed(2).replace('.', ',')} mm` : 'aus'),
  lineMinMm: (v) => (Number(v) ? `< ${Number(v).toFixed(1).replace('.', ',')} mm` : 'aus'),
  outlineCloseMm: (v) => (Number(v) ? `${Number(v).toFixed(1)} mm` : 'aus'),
  subjectLineMm: (v) => `${Number(v).toFixed(2)} mm`,
  faceStrength: (v) => `${Math.round(Number(v) * 100)} %`,
  mouthStrength: (v) => (Number(v) ? `${Math.round(Number(v) * 100)} %` : 'aus'),
  noseStrength: (v) => (Number(v) ? `${Math.round(Number(v) * 100)} %` : 'aus'),
  chinStrength: (v) => (Number(v) ? `${Math.round(Number(v) * 100)} %` : 'aus'),
  cheekStrength: (v) => (Number(v) ? `${Math.round(Number(v) * 100)} %` : 'aus'),
  scratchSensitivity: (v) => `${v}`,
  faceRestoreStrength: (v) => `${Math.round(Number(v) * 100)} %`,
  faceFidelity: (v) => `${Math.round(Number(v) * 100)} %`,
  textPad: (v) => (Number(v) ? `${Number(v).toFixed(1)} × Zeilenhöhe` : 'nur Schrift'),
  textBold: (v) => (Number(v) > 0 ? `+${v}` : `${v}`),
  textSens: (v) => `${v}`,
  textUnclip: (v) => `${Number(v).toFixed(1)}×`,
  textMerge: (v) => (Number(v) ? `${Number(v).toFixed(1)} × Zeilenhöhe` : 'nur überlappende'),
  textMinPct: (v) => (Number(v) ? `${Number(v).toFixed(2).replace(/0$/, '')} % der Höhe` : 'aus'),
  textMaxPct: (v) => (Number(v) >= 100 ? 'keine Grenze' : `${v} % der Höhe`),
};

/** Hinweis unter der Modellauswahl (Modus Linien, KI). */
const LINE_HINTS = {
  fine: 'Zeichnet Fotos wie von Hand nach, mit vielen Details und Schraffur. Höherer Detailgrad = feinere Linien, dauert länger.',
  contour: 'Dicke, geschlossene Umrisse mit wenig Schraffur – gut für kleine Gravuren. Höherer Detailgrad = mehr Umrisse.',
  sketch: 'Zarte, lockere Bleistiftstriche mit wenig Details. Bei blassem Ergebnis die Linienschwelle erhöhen.',
  portrait: 'Nur für Porträts: Gesicht wie mit Tusche gezeichnet, Haare als dunkle Fläche. Rechnet immer mit 512 px (kein Detailgrad) – Gesicht möglichst groß und mittig.',
  teed: 'Kantendetektor: feine, durchgehende Umrisse. Zeichnet auch Strukturen wie Stoff oder Holzmaserung mit – ggf. vorher freistellen.',
};

/** PES/DST/EXP im Modus Foto und Relief ausgegraut (dort entsteht keine Stickdatei), Stickeinstellungen nur mit PES/DST/EXP. */
function syncEmbFormats() {
  const s = state.settings;
  for (const el of $$('[data-key="fmtPes"], [data-key="fmtDst"], [data-key="fmtExp"]')) {
    el.disabled = !embModeOk(s);
    el.closest('label').classList.toggle('disabled', el.disabled);
  }
  $('#emb-group').hidden = !embFormats(s);
}

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
  // Modus ohne Stickdatei (Foto, Relief) gewählt, z. B. aus der Historie: zurück zu den Laser-Presets
  if (presetTab() === 'emb' && !EMB_MODES.includes(s.mode)) {
    ui.presetTab = 'laser';
    saveUi();
    renderPresets();
  }
  for (const btn of $$('#mode button')) {
    btn.classList.toggle('active', btn.dataset.value === s.mode);
    // Presets „Sticken“: Foto und Relief ausgegraut
    btn.disabled = presetTab() === 'emb' && !EMB_MODES.includes(btn.dataset.value);
    if (btn.dataset.tip === undefined) btn.dataset.tip = btn.title;
    btn.title = btn.disabled ? 'Liefert keine Stickdatei – zum Lasern oben bei den Presets auf „Lasern“ umschalten' : btn.dataset.tip;
  }
  for (const g of $$('[data-mode]')) g.hidden = !g.dataset.mode.split(' ').includes(s.mode);
  syncEmbFormats();
  for (const el of $$('[data-algo]')) el.hidden = s.ditherAlgo !== el.dataset.algo;
  for (const el of $$('[data-bg]')) el.hidden = !el.dataset.bg.split(' ').includes(s.bgRemove);
  for (const el of $$('[data-edge]')) el.hidden = el.dataset.edge !== s.edgeMethod;
  for (const el of $$('[data-line-hide]')) el.hidden = el.dataset.lineHide.split(' ').includes(s.lineStyle);
  $('#line-model-hint').textContent = LINE_HINTS[s.lineStyle] || LINE_HINTS.fine;
  for (const el of $$('[data-show]')) el.hidden = !s[el.dataset.show];
  // data-if="schlüssel:wert1 wert2" – sichtbar, wenn die Einstellung einen der Werte hat
  for (const el of $$('[data-if]')) {
    const [key, values] = el.dataset.if.split(':');
    el.hidden = !values.split(' ').includes(String(s[key]));
  }
  const seeds = s.bgSeeds.length;
  $('#btn-clear-seeds').textContent = seeds ? `Klickpunkte zurücksetzen (${seeds})` : 'Klickpunkte zurücksetzen';
  $('#btn-clear-seeds').disabled = !seeds;
  const pts = s.samPoints.length;
  $('#btn-clear-sam').textContent = pts ? `Punkte zurücksetzen (${pts})` : 'Punkte zurücksetzen';
  $('#btn-clear-sam').disabled = !pts;
  const pickable = (usesSeeds(s.bgRemove) || isSam(s.bgRemove)) && !!state.source;
  $('#pane-original').classList.toggle('pickable', pickable);
  $('#pane-original').dataset.pick = isSam(s.bgRemove) ? 'sam' : s.bgRemove;
  $('#mode-hint').textContent = MODE_HINTS[s.mode];
  refreshInfoToggles();
  updateHeightField();
}

/*
 * Lange Erklärungen (.hint.info) sind standardmäßig eingeklappt und lassen sich je Abschnitt über
 * ein kleines ⓘ in der Überschrift einblenden. Der Zustand bleibt je Abschnitt gespeichert.
 */
const INFO_KEY = 'pic2laser.infoOpen';

function loadInfoOpen() {
  try { return new Set(JSON.parse(localStorage.getItem(INFO_KEY) || '[]')); } catch { return new Set(); }
}

function bindInfoToggles() {
  const open = loadInfoOpen();
  for (const group of $$('.group')) {
    const h3 = group.querySelector('h3');
    if (!h3 || !group.querySelector('.hint.info')) continue;
    const id = h3.textContent.trim();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'info-btn';
    btn.textContent = 'i';
    btn.title = 'Erklärungen ein-/ausblenden';
    btn.setAttribute('aria-label', `Erklärungen zu „${id}“ ein-/ausblenden`);
    const apply = (on) => {
      group.classList.toggle('info-open', on);
      btn.setAttribute('aria-expanded', String(on));
    };
    apply(open.has(id));
    btn.addEventListener('click', () => {
      const on = !group.classList.contains('info-open');
      apply(on);
      const ids = [...loadInfoOpen()].filter((x) => x !== id);
      if (on) ids.push(id);
      try { localStorage.setItem(INFO_KEY, JSON.stringify(ids)); } catch { /* nur Komfort */ }
    });
    h3.classList.add('has-info');
    h3.append(btn);
  }
}

/** ⓘ nur zeigen, wenn im Abschnitt gerade eine Erklärung sichtbar wäre (abhängig von Modus/Optionen). */
function refreshInfoToggles() {
  for (const btn of $$('.info-btn')) {
    const group = btn.closest('.group');
    btn.hidden = ![...group.querySelectorAll('.hint.info')].some((h) => h.textContent.trim() && !h.closest('[hidden]'));
  }
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
  if (key === 'bgSeeds' || key === 'samPoints' || key === 'bgRemove') renderMarkers();
  updatePresetHint();
  if (key.startsWith('emb') || key === 'fmtPes' || key === 'fmtDst' || key === 'fmtExp') {
    scheduleEmbRefresh(); // Stiche neu planen (Vorschau, Herausziehen) – ohne neue Berechnung
  } else if (!key.startsWith('fmt')) {
    state.cancelRetries = 0; // neue Eingabe: wieder Neustarts erlauben
    dragReady = false; // bis zum neuen Ergebnis nicht das veraltete herausziehen
    scheduleProcess();
  } else scheduleDragPrepare(); // andere Formate zum Herausziehen
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
    // nie 0 mm (sehr schmale Bilder mit kleiner Höhe) – sonst Division durch 0 in der Verarbeitung
    setSetting('widthMm', Math.max(0.1, round1((h * width) / height)));
  });

  for (const btn of $$('#mode button')) {
    btn.addEventListener('click', () => setSetting('mode', btn.dataset.value));
  }
  $('#btn-clear-seeds').addEventListener('click', () => setSetting('bgSeeds', []));
  $('#btn-clear-sam').addEventListener('click', () => setSetting('samPoints', []));
  $('#btn-color-reset').addEventListener('click', () => setSetting('colorEdits', []));

  // Anzeige: entfernten Hintergrund rot markieren oder ausblenden (nur Vorschau)
  $('#bg-hide').checked = ui.hideBackground;
  $('#bg-hide').addEventListener('change', async (e) => {
    ui.hideBackground = e.target.checked;
    saveUi();
    const v = state.lastView;
    if (state.source && v && v.mask) {
      try {
        await updateOriginalView(v.s, v.mask, v.base);
      } catch (err) {
        console.error(err);
      }
    }
  });

  // Klick ins Original: Hintergrundpunkt (nach Farbe) bzw. Motiv-/Ausschlusspunkt (Objekt anklicken).
  // Ein Klick auf einen vorhandenen Punkt (Plus/Minus) entfernt ihn wieder.
  const pickPoints = () => (usesSeeds(state.settings.bgRemove) ? state.settings.bgSeeds : state.settings.samPoints);
  const pickActive = () => !!state.source && (usesSeeds(state.settings.bgRemove) || isSam(state.settings.bgRemove));
  const pick = (e, negative) => {
    if (!pickActive()) return;
    const mode = state.settings.bgRemove;
    const hit = markerAt(e.currentTarget, e, pickPoints());
    if (hit >= 0) {
      const points = pickPoints().filter((_, i) => i !== hit);
      setSetting(usesSeeds(mode) ? 'bgSeeds' : 'samPoints', points);
      return;
    }
    const p = imagePointFromEvent(e.currentTarget, e);
    if (!p) return;
    if (usesSeeds(mode)) setSetting('bgSeeds', [...state.settings.bgSeeds, p]);
    else setSetting('samPoints', [...state.settings.samPoints, { ...p, positive: !negative }]);
  };
  $('#img-original').addEventListener('click', (e) => pick(e, e.altKey));
  $('#img-original').addEventListener('contextmenu', (e) => {
    if (!isSam(state.settings.bgRemove)) return;
    e.preventDefault();
    pick(e, true);
  });
  // Mauszeiger: Hand über einem Punkt (anklicken = entfernen), sonst Fadenkreuz
  $('#img-original').addEventListener('mousemove', (e) => {
    const over = pickActive() && markerAt(e.currentTarget, e, pickPoints()) >= 0;
    e.currentTarget.style.cursor = over ? 'pointer' : '';
    e.currentTarget.title = over ? 'Klicken, um diesen Punkt zu entfernen' : '';
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
    const keep = outputPrefs(state.settings);
    for (const k of Object.keys(keep)) if (k.startsWith('emb')) delete keep[k]; // Stickeinstellungen zurücksetzen
    state.settings = { ...DEFAULTS, ...keep, bgSeeds: [], samPoints: [], colorEdits: [] };
    state.activePreset = null;
    state.cancelRetries = 0;
    dragReady = false;
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
/** Gemeinsame Einstellungen der Stickerei-Vorlagen: Farbflächen auf Brother-Garne, PES-Export. */
const EMB_LOGO = { mode: 'color', colorCount: 0, colorPalette: 'brother', colorSmoothMm: 0.3, colorSkipBg: true, workRes: 2000, alphaMax: 1.1, fmtPes: true };

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
  {
    group: 'Logos, Schrift & Grafik', name: 'Schild / Piktogramm (exakte Formen)',
    desc: 'Für Schilder, Piktogramme und technische Grafiken: Kanten werden zu exakten Geraden, Kreisen und rechten Winkeln.',
    settings: { mode: 'vector', threshold: 128, turdSize: 8, alphaMax: 1, optTolerance: 0.2, workRes: 2400, shapeFit: true, shapeTolMm: 0.15, shapeSnap: true },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Pixeliges Logo / Icon glätten',
    desc: 'Für winzige Logos, Icons und Favicons mit sichtbaren Pixelstufen: KI vergrößert und rundet die Umrisse.',
    settings: { mode: 'vector', smoothContours: true, threshold: 128, turdSize: 8, alphaMax: 1.2, optTolerance: 0.3, workRes: 2400 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Stempel (Gummi, invertiert)',
    desc: 'Für Gummistempel: Der Hintergrund wird graviert, das Motiv bleibt erhaben. In LightBurn spiegeln!',
    settings: { mode: 'vector', invert: true, threshold: 128, turdSize: 10, alphaMax: 1, optTolerance: 0.2, workRes: 2400 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Fahrzeug / Maschine mit Schriftzug – Linien',
    desc: 'Für Autos, Traktoren und Maschinen: kräftige, ruhige Umrisse, Schriftzüge und Logos bleiben gefüllt.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'contour', lineRes: 1024, threshold: 150, lineClean: true, lineSmoothMm: 0.3, lineMinMm: 1.5, textClean: true, textPad: 1.5, shapeOrder: 'before' },
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
    settings: { mode: 'vector', bgRemove: 'modnet', contrast: 25, blur: 2, gamma: 1.25, threshold: 100, turdSize: 40, alphaMax: 1.2, optTolerance: 0.4, subjectLine: true, subjectLineMm: 0.4, faceBoost: true, faceStrength: 1, mouthStrength: 1, noseStrength: 0.6, chinStrength: 0.6, cheekStrength: 0.3 },
  },
  {
    group: 'Porträts & Personen', name: 'Porträt – Strichzeichnung',
    desc: 'Für Porträtfotos: KI zeichnet das Gesicht wie von Hand nach.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineRes: 832, threshold: 150, bgRemove: 'modnet', faceBoost: true, faceStrength: 1, mouthStrength: 0.8, noseStrength: 0, chinStrength: 0.4, cheekStrength: 0.3 },
  },
  {
    group: 'Porträts & Personen', name: 'Porträt – Tuschezeichnung',
    desc: 'Für Porträts mit großem, mittigem Gesicht: wie mit Tusche gezeichnet, Haare als dunkle Fläche.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'portrait', threshold: 150, bgRemove: 'modnet' },
  },
  {
    group: 'Porträts & Personen', name: 'Porträt – Bleistiftskizze',
    desc: 'Für Porträts als lockere, zarte Skizze mit wenigen Strichen.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'sketch', lineRes: 896, threshold: 170, bgRemove: 'modnet', faceBoost: true, faceStrength: 0.8, mouthStrength: 1, noseStrength: 0.6, chinStrength: 0.4, cheekStrength: 0 },
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
    group: 'Fotos & Landschaft', name: 'Himmel entfernen – Fotogravur',
    desc: 'Für Fahrzeuge, Gebäude und Landschaften: Der Himmel wird nicht graviert, alles darunter bleibt vollständig erhalten. Das Motiv wird per KI (BEN2) geschützt.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 15, sharpen: 0.6, bgRemove: 'skyai', bgTolerance: 20, maskSpeckPct: 0.2, subjectLine: true, subjectLineMm: 0.25 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Himmel entfernen – Strichzeichnung',
    desc: 'Für Fahrzeuge, Gebäude und Landschaften als Strichzeichnung ohne Himmel; Schriftzüge bleiben gefüllt.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineRes: 1024, threshold: 150, bgRemove: 'skyai', bgTolerance: 20, maskSpeckPct: 0.2, subjectLine: true, subjectLineMm: 0.3, textClean: true, textPad: 1.5 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Gebäude – gerade Linien',
    desc: 'Für Häuser, Kirchen und Brücken: ruhige Umrisse, Kanten werden zu exakten Geraden und Bögen.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'contour', lineRes: 1024, threshold: 150, lineClean: true, lineSmoothMm: 0.2, lineMinMm: 1.5, shapeFit: true, shapeTolMm: 0.2, shapeSnap: true },
  },
  {
    group: 'Fotos & Landschaft', name: 'Ausmalbild / Malvorlage',
    desc: 'Für Kinder-Ausmalbilder aus Fotos: Motiv freigestellt, wenige, geschlossene und gleichmäßig dicke Umrisse ohne Krümel.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'contour', lineRes: 640, threshold: 150, bgRemove: 'ben2', subjectLine: true, subjectLineMm: 0.4, lineClean: true, lineSmoothMm: 0.6, lineMinMm: 4, lineBoldMm: 0.2 },
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
  {
    group: 'Schneiden & Relief', name: 'Relief-Motiv freigestellt (PNG, transparent)',
    desc: 'Für Objekte und Figuren: nur das Motiv als Tiefenkarte, Hintergrund transparent – als PNG direkt in LightBurn.',
    settings: { mode: 'relief', depthRes: '770', dpi: 254, blur: 1, contrast: 10, bgRemove: 'ben2', reliefTransparent: true, fmtPng: true },
  },
  {
    group: 'Schneiden & Relief', name: 'Relief – maximale Details (nicht kommerziell)',
    desc: 'Plastischste Tiefe mit Depth Anything V2 Large und höchster Auflösung. Download ca. 1,3 GB, braucht ca. 3,5 GB RAM, ca. 30 s. Lizenz CC BY-NC 4.0 – nicht für verkaufte Gravuren.',
    settings: { mode: 'relief', depthModel: 'large', depthRes: '1022', dpi: 254, blur: 0.5, contrast: 10 },
  },
  // ---- Wellen (Sinuswellen-Linienkunst) ----
  // Getestet mit Porträt, Katze, Pavian, S/W-Foto, Kaffeetasse, Bergpanorama, Eiffelturm und Pferde-Silhouette.
  // Gamma > 1 hellt die Mitteltöne auf – sonst wirken sie fast so dicht wie Schwarz (jede Welle deckt Fläche).
  // Mit „Weiße Flächen auslassen“ senkt eine leicht negative Helligkeit die Lichter unter Reinweiß, damit nur der
  // freigestellte Hintergrund (immer 255) leer bleibt und keine Löcher im Motiv entstehen.
  {
    group: 'Porträts & Personen', name: 'Porträt – Wellenlinien',
    desc: 'Porträt als waagrechte Sinuswellen (Linienkunst): Person freigestellt, Hintergrund bleibt leer. Ab ca. 100 mm Breite, in LightBurn als Linie gravieren.',
    settings: { mode: 'sine', bgRemove: 'modnet', maskLargest: true, sineSkipWhite: true, sineSpacingMm: 1, sineAmplitude: 0.45, sineDensity: 2, brightness: -6, contrast: 10, gamma: 1.3, blur: 0.5, faceBoost: true, faceStrength: 0.8, mouthStrength: 0.5, noseStrength: 0.3, chinStrength: 0.3 },
  },
  {
    group: 'Porträts & Personen', name: 'Porträt – Wellen senkrecht (fein)',
    desc: 'Feinere, senkrechte Wellen – mehr Gesichtsdetails, aber längere Gravur. Am besten ab ca. 150 mm Breite.',
    settings: { mode: 'sine', bgRemove: 'modnet', maskLargest: true, sineSkipWhite: true, sineDirection: 'v', sineSpacingMm: 0.8, sineAmplitude: 0.5, sineDensity: 2.5, sineStrokeMm: 0.12, brightness: -8, contrast: 15, gamma: 1.4, blur: 0.4, faceBoost: true, faceStrength: 0.8, mouthStrength: 0.5, noseStrength: 0.3, chinStrength: 0.3 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Foto – Wellenlinien',
    desc: 'Ganzes Foto als waagrechte Sinuswellen – helle Flächen (Himmel) werden ruhige, fast gerade Linien. Liniengravur statt Punktraster.',
    settings: { mode: 'sine', sineSpacingMm: 1, sineAmplitude: 0.45, sineDensity: 1.6, contrast: 20, gamma: 1.8, blur: 0.5 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Landschaft – Wellen, Himmel frei',
    desc: 'Für Berge, Gebäude und Landschaften: Himmel entfernt (Motiv per BEN2 geschützt, Download ca. 131 MB, ca. 3 GB RAM), das Motiv in ruhigen, breiten Wellen. Schnee und helle Flächen bleiben erhalten.',
    settings: { mode: 'sine', bgRemove: 'skyai', bgTolerance: 20, sineSkipWhite: true, sineSpacingMm: 1.4, sineAmplitude: 0.45, sineDensity: 1.4, brightness: -8, contrast: 10, gamma: 1.3, blur: 0.8 },
  },
  {
    group: 'Tiere', name: 'Haustier – Wellenlinien',
    desc: 'Tier freigestellt (BEN2, Download ca. 131 MB, ca. 3 GB RAM) in feinen Wellen – Augen, Nase und Fellzeichnung treten hervor, der Hintergrund bleibt leer.',
    settings: { mode: 'sine', bgRemove: 'ben2', maskLargest: true, sineSkipWhite: true, sineSpacingMm: 1, sineAmplitude: 0.42, sineDensity: 2, brightness: -10, contrast: 15, gamma: 2, sharpen: 0.4 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Silhouette / Logo – mit Wellen gefüllt',
    desc: 'Dunkle Flächen einer Grafik werden mit gleichmäßigen Wellen gefüllt, Weiß bleibt leer – Wellen-Effekt für Logos und Schattenrisse.',
    settings: { mode: 'sine', sineSkipWhite: true, sineSpacingMm: 1.2, sineAmplitude: 0.45, sineDensity: 1.2, contrast: 40, blur: 0.3 },
  },
  // ---- Farben (Farbflächen je Ebene) ----
  {
    group: 'Farben', use: 'both', name: 'Farbiges Logo – Farbflächen',
    desc: 'Erkennt die Farben eines Logos automatisch, je Farbe eine Ebene im SVG; weißer Hintergrund entfällt. Für LightBurn mit mehreren Ebenen oder als Vorlage fürs Sticken.',
    settings: { mode: 'color', colorCount: 0, workRes: 2000 },
  },
  {
    group: 'Farben', use: 'both', name: 'Comic / Illustration – 8 Farben',
    desc: 'Grafiken mit vielen Farben auf 8 Farbflächen reduziert, Rauschen leicht geglättet.',
    settings: { mode: 'color', colorCount: 8, blur: 0.4, colorSmoothMm: 0.25, colorMinAreaMm2: 1.5, workRes: 2000 },
  },
  {
    group: 'Farben', name: 'Foto als Farbposter – 6 Farben',
    desc: 'Foto stark vereinfacht zu 6 ruhigen Farbflächen (Poster-Effekt). Mit Freistellen bleibt nur das Motiv.',
    settings: { mode: 'color', colorCount: 6, colorSkipBg: false, blur: 1.5, colorSmoothMm: 0.5, colorMinAreaMm2: 4, turdSize: 10, alphaMax: 1.2, optTolerance: 0.4 },
  },
  // ---- Stickerei: Stickdatei (PES) mit Stoff, Motivbreite und Brother-Garnen ----
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Logo auf T-Shirt (Jersey)',
    desc: 'Brustlogo 90 mm breit für Strick/Jersey: lockerere Füllung, 0,35 mm Zugausgleich, kräftige Unterlage mit Kantenlauf, 0,4 mm Überlappung gegen Lücken durch Verziehen. Brother-Garne, PES-Export. Mit weichem Schnittvlies (Cut-away) sticken.',
    settings: { ...EMB_LOGO, embFabric: 'knit', widthMm: 90, colorOverlapMm: 0.4, colorMinAreaMm2: 2 },
  },
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Brustlogo auf Polo-Shirt (Piqué)',
    desc: 'Brustlogo 80 mm breit für Piqué: wie Jersey, kleinste Flächen 3 mm² (feine Details versinken in der Waffelstruktur). Brother-Garne, PES-Export.',
    settings: { ...EMB_LOGO, embFabric: 'pique', widthMm: 80, colorOverlapMm: 0.4, colorMinAreaMm2: 3 },
  },
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Logo auf Fleece / Sweatshirt',
    desc: 'Logo 100 mm breit für Fleece und Sweat (große Motive auf der Vorderseite bis etwa 240 mm): 0,40 mm Zugausgleich, kräftige Unterlage, kleinste Flächen 3 mm². Brother-Garne, PES-Export.',
    settings: { ...EMB_LOGO, embFabric: 'fleece', widthMm: 100, colorOverlapMm: 0.4, colorMinAreaMm2: 3 },
  },
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Handtuch (Frottee)',
    desc: 'Motiv 100 mm breit für Frottee: dichtere Füllung, kräftige Unterlage, kleinste Flächen 4 mm² und stärker geglättet – feine Details versinken in den Schlaufen. Wasserlösliche Folie obenauf legen. Brother-Garne, PES-Export.',
    settings: { ...EMB_LOGO, embFabric: 'pile', widthMm: 100, colorOverlapMm: 0.4, colorMinAreaMm2: 4, colorSmoothMm: 0.4 },
  },
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Jeans, Canvas, Tasche (Webware)',
    desc: 'Logo 100 mm breit für feste Webware (Baumwolle, Twill, Jeans, Canvas): Standarddichte 4,5 Linien/mm, 0,20 mm Zugausgleich, 0,3 mm Überlappung. Brother-Garne, PES-Export.',
    settings: { ...EMB_LOGO, embFabric: 'woven', widthMm: 100, colorOverlapMm: 0.3, colorMinAreaMm2: 2 },
  },
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Leder / Kunstleder (Patch)',
    desc: 'Motiv 70 mm breit für Leder: lockere Füllung und wenig Unterlage gegen Perforation, kleinste Flächen 3 mm², wenig Überlappung (Leder verzieht kaum). Spitze Nadel (70) verwenden. Brother-Garne, PES-Export.',
    settings: { ...EMB_LOGO, embFabric: 'leather', widthMm: 70, colorOverlapMm: 0.2, colorMinAreaMm2: 3 },
  },
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Schriftzug / Silhouette einfarbig',
    desc: 'Schwarze Fläche aus Logo, Schrift oder Schattenriss als einfarbige Stickdatei, 100 mm breit, für Webware. Die Garnfarbe wählt man an der Maschine; schmale Linien unter 1 mm werden als Kontur gestickt.',
    settings: { mode: 'vector', alphaMax: 1.1, turdSize: 10, widthMm: 100, fmtPes: true, embFabric: 'woven' },
  },

  // ---- Stickerei nach Stil: Linien, Tusche, Skizze, Fläche, Wellen, Farben ----
  // Setzen Breite und PES, lassen den gewählten Stoff stehen. Getestet mit Porträt, Ente, Landschaft und
  // Vereinslogo: Linien mit „Ruhige Linien“ und etwas verstärkt (0,6–0,9 mm breit, ruhiger Füllstich statt
  // Krümeln, wenige Sprünge), Wellen höchstens etwa 1 Welle/mm mit 1,4–1,8 mm Abstand (Steppstich folgt
  // der Welle noch), Farben auf Brother-Garne (gleiche Garne werden zusammengelegt – 16 ergibt oft 10–12).
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Linienzeichnung (Motiv freigestellt)',
    desc: 'Motiv aus einem Foto freigestellt (BEN2, Download ca. 131 MB) als ruhige, kräftige Umrisslinien, 100 mm breit – ca. 6.000–10.000 Stiche. Kurze Striche und Krümel werden entfernt, damit wenig Sprünge entstehen. PES-Export, Stoff bleibt.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'contour', lineRes: 768, threshold: 150, bgRemove: 'ben2', maskLargest: true, lineClean: true, lineSmoothMm: 0.4, lineMinMm: 3, lineBoldMm: 0.3, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Porträt als Linienzeichnung',
    desc: 'Porträt freigestellt als klare Umrisslinien wie gezeichnet, 100 mm breit, Gesichtszüge verstärkt. Wenige, ca. 0,9 mm breite Linien – gut für Kissen, Taschen und Shirts.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'contour', lineRes: 768, threshold: 150, bgRemove: 'modnet', maskLargest: true, lineClean: true, lineSmoothMm: 0.4, lineMinMm: 3, lineBoldMm: 0.3, faceBoost: true, faceStrength: 1, mouthStrength: 0.8, noseStrength: 0.4, chinStrength: 0.4, cheekStrength: 0, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Gebäude / Fahrzeug (gerade Linien)',
    desc: 'Häuser, Kirchen, Autos und Maschinen als Linienstickerei, 120 mm breit: Kanten werden zu exakten Geraden und Bögen, Schriftzüge bleiben gefüllt.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'contour', lineRes: 1024, threshold: 150, lineClean: true, lineSmoothMm: 0.3, lineMinMm: 4, lineBoldMm: 0.3, shapeFit: true, shapeTolMm: 0.2, shapeSnap: true, textClean: true, textPad: 1.5, shapeOrder: 'before', widthMm: 120, fmtPes: true },
  },
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Tusche-Porträt',
    desc: 'Porträt wie mit Tusche gezeichnet (U²-Net, Download 176 MB), Haare und dunkle Kleidung als gefüllte Fläche, 100 mm breit. Kräftiger Stil, ca. 20.000–25.000 Stiche – auf Webware oder mit Vlies sticken.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'portrait', threshold: 150, bgRemove: 'modnet', maskLargest: true, lineClean: true, lineSmoothMm: 0.4, lineMinMm: 2, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Tuschezeichnung / Comic (Scan)',
    desc: 'Gescannte oder fotografierte Tusche- und Comiczeichnung, 100 mm breit: Striche werden geschlossen und geglättet, Papierstruktur verschwindet. Haarfeine Striche (unter 0,35 mm) werden automatisch als Kontur gestickt.',
    settings: { mode: 'vector', contrast: 45, brightness: 15, gamma: 0.8, sharpen: 0.3, blur: 0.4, threshold: 150, turdSize: 12, alphaMax: 1.1, optTolerance: 0.3, workRes: 2400, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Bleistiftskizze Porträt',
    desc: 'Porträt als lockere, zarte Skizze mit wenigen Strichen, 100 mm breit – ca. 8.000 Stiche. Striche leicht verstärkt, damit der Faden deckt.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'sketch', lineRes: 768, threshold: 170, bgRemove: 'modnet', maskLargest: true, lineClean: true, lineSmoothMm: 0.3, lineMinMm: 2, lineBoldMm: 0.2, faceBoost: true, faceStrength: 0.8, mouthStrength: 1, noseStrength: 0.6, chinStrength: 0.4, cheekStrength: 0, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Skizze Tier / Motiv',
    desc: 'Haustier oder Gegenstand freigestellt (BEN2, Download ca. 131 MB) als leichte Bleistiftskizze, 100 mm breit.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'sketch', lineRes: 832, threshold: 165, bgRemove: 'ben2', maskLargest: true, lineClean: true, lineSmoothMm: 0.3, lineMinMm: 2, lineBoldMm: 0.2, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Silhouette aus Foto (gefüllt)',
    desc: 'Motiv freigestellt (BEN2, Download ca. 131 MB) als komplett gefüllter Schattenriss ohne Innendetails, 90 mm breit – eine ruhige Füllstichfläche mit kaum Sprüngen, ideal für Tiere und Personen.',
    settings: { mode: 'vector', bgRemove: 'ben2', maskLargest: true, brightness: -100, threshold: 254, turdSize: 30, alphaMax: 1.2, optTolerance: 0.4, widthMm: 90, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Porträt als Schablone (Stencil)',
    desc: 'Porträt als flächige Schwarz-Weiß-Grafik (Stencil), 80 mm breit (passt hochkant in den 130 × 180-mm-Rahmen): große, zusammenhängende Flächen, kleine Inseln entfernt – einfarbig gestickt.',
    settings: { mode: 'vector', bgRemove: 'modnet', maskLargest: true, contrast: 25, blur: 2, gamma: 1.25, threshold: 100, turdSize: 60, alphaMax: 1.2, optTolerance: 0.4, faceBoost: true, faceStrength: 1, mouthStrength: 1, noseStrength: 0.6, chinStrength: 0.6, cheekStrength: 0.3, widthMm: 80, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Kleiner Schriftzug / Monogramm (Cap)',
    desc: 'Schrift, Initialen oder kleines Logo einfarbig, 55 mm breit – z. B. für Mützen, Ärmel und Handtuch-Monogramme. Kleine Flächen werden geglättet, haarfeine Stellen als Kontur gestickt.',
    settings: { mode: 'vector', threshold: 128, blur: 0.3, turdSize: 8, alphaMax: 1.1, optTolerance: 0.2, workRes: 2400, widthMm: 55, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Porträt in Wellen',
    desc: 'Porträt freigestellt als waagrechte Wellenlinien im Steppstich, 120 mm breit (Rahmen ab 130 × 180 mm), ca. 15.000–20.000 Stiche. Für kräftigere Linien unter „Je Farbe einstellen…“ den Dreifachstich wählen.',
    settings: { mode: 'sine', bgRemove: 'modnet', maskLargest: true, sineSkipWhite: true, sineSpacingMm: 1.4, sineAmplitude: 0.45, sineDensity: 1.2, brightness: -6, contrast: 15, gamma: 1.4, blur: 0.6, faceBoost: true, faceStrength: 0.8, mouthStrength: 0.5, noseStrength: 0.3, chinStrength: 0.3, widthMm: 120, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Haustier in Wellen',
    desc: 'Tier freigestellt (BEN2, Download ca. 131 MB) in Wellen mit 1,4 mm Abstand, 110 mm breit – Augen und Fellzeichnung bleiben erkennbar, der Hintergrund bleibt leer.',
    settings: { mode: 'sine', bgRemove: 'ben2', maskLargest: true, sineSkipWhite: true, sineSpacingMm: 1.4, sineAmplitude: 0.45, sineDensity: 1.2, brightness: -10, contrast: 15, gamma: 1.8, sharpen: 0.4, blur: 0.4, widthMm: 110, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Landschaft / Foto in Wellen',
    desc: 'Ganzes Foto als ruhige, breite Wellen mit 1,8 mm Abstand, 120 mm breit – wenige Stiche (ca. 5.000–8.000), helle Flächen werden fast gerade Linien.',
    settings: { mode: 'sine', sineSpacingMm: 1.8, sineAmplitude: 0.45, sineDensity: 1, contrast: 20, gamma: 1.6, blur: 1, widthMm: 120, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Silhouette / Logo mit Wellen gefüllt',
    desc: 'Dunkle Flächen einer Grafik oder eines Schattenrisses werden mit gleichmäßigen Wellen gefüllt, Weiß bleibt leer, 100 mm breit – leichter Stickeffekt statt schwerer Füllung.',
    settings: { mode: 'sine', sineSkipWhite: true, sineSpacingMm: 1.5, sineAmplitude: 0.45, sineDensity: 1, contrast: 40, blur: 0.3, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Farben (4–16)', name: 'Stickerei – 4 Farben (Logo / Wappen)',
    desc: 'Logo, Wappen oder Vereinsemblem auf höchstens 4 Brother-Garne reduziert, 90 mm breit – wenige Farbwechsel, kräftige Flächen. Weißer Hintergrund entfällt.',
    settings: { ...EMB_LOGO, colorCount: 4, blur: 0.4, colorMinAreaMm2: 2, colorOverlapMm: 0.3, widthMm: 90 },
  },
  {
    group: 'Stickerei – Farben (4–16)', name: 'Stickerei – 6 Farben (Comic / Clipart)',
    desc: 'Comic, Clipart oder Sticker-Motiv mit bis zu 6 Brother-Garnen, 100 mm breit. Leicht geglättet, Flächen unter 2 mm² gehen in der Nachbarfarbe auf.',
    settings: { ...EMB_LOGO, colorCount: 6, blur: 0.4, colorMinAreaMm2: 2, colorOverlapMm: 0.3, widthMm: 100 },
  },
  {
    group: 'Stickerei – Farben (4–16)', name: 'Stickerei – 8 Farben (Illustration)',
    desc: 'Illustration oder farbiges Motiv mit bis zu 8 Brother-Garnen, 100 mm breit, kleinste Flächen 3 mm² – guter Kompromiss aus Farbtreue und Farbwechseln.',
    settings: { ...EMB_LOGO, colorCount: 8, blur: 0.8, colorSmoothMm: 0.4, colorMinAreaMm2: 3, colorOverlapMm: 0.3, widthMm: 100 },
  },
  {
    group: 'Stickerei – Farben (4–16)', name: 'Stickerei – 10 Farben (Foto vereinfacht)',
    desc: 'Foto als Farbposter mit bis zu 10 Brother-Garnen, 90 mm breit, kräftig geglättet. Motiv freigestellt (BEN2, Download ca. 131 MB) – der Hintergrund wird nicht gestickt.',
    settings: { ...EMB_LOGO, colorCount: 10, colorSkipBg: false, bgRemove: 'ben2', maskLargest: true, blur: 1.2, colorSmoothMm: 0.5, colorMinAreaMm2: 4, colorOverlapMm: 0.3, turdSize: 10, alphaMax: 1.2, optTolerance: 0.4, widthMm: 90 },
  },
  {
    group: 'Stickerei – Farben (4–16)', name: 'Stickerei – 12 Farben (Foto / Landschaft)',
    desc: 'Foto oder Landschaft mit bis zu 12 Brother-Garnen, 110 mm breit – mehr Farbabstufungen, ca. 30.000–40.000 Stiche. Ähnliche Garne werden zusammengelegt, oft bleiben 8–10 Farben.',
    settings: { ...EMB_LOGO, colorCount: 12, colorSkipBg: false, blur: 1.2, colorSmoothMm: 0.5, colorMinAreaMm2: 4, colorOverlapMm: 0.3, turdSize: 10, alphaMax: 1.2, optTolerance: 0.4, widthMm: 110 },
  },
  {
    group: 'Stickerei – Farben (4–16)', name: 'Stickerei – 16 Farben (Porträt / Foto, maximal)',
    desc: 'Größte Farbtreue mit bis zu 16 Brother-Garnen für Porträts und Fotos, Motiv freigestellt (BEN2, Download ca. 131 MB), 100 mm breit. Ähnliche Garne werden zusammengelegt (oft 10–12 Farben); viele Farbwechsel und ca. 40.000–50.000 Stiche.',
    settings: { ...EMB_LOGO, colorCount: 16, colorSkipBg: false, bgRemove: 'ben2', maskLargest: true, blur: 1.5, colorSmoothMm: 0.5, colorMinAreaMm2: 4, colorOverlapMm: 0.3, turdSize: 10, alphaMax: 1.2, optTolerance: 0.4, widthMm: 100 },
  },
];

// Werte, die zum einzelnen Bild gehören und nicht in Presets gespeichert werden
const PER_IMAGE_KEYS = ['bgSeeds', 'samPoints', 'colorEdits', 'embLayers'];

function presetSettingsFromCurrent() {
  const out = { ...state.settings };
  for (const k of PER_IMAGE_KEYS) delete out[k];
  return out;
}

/**
 * Wendet ein Preset an. Vorlagen behalten Ausgabegröße, Exportformate und Stickeinstellungen bei –
 * außer sie setzen sie selbst (Stickerei-Vorlagen: Breite, PES, Stoff).
 */
function applyPreset(key) {
  const [kind, ...rest] = key.split(':');
  const name = rest.join(':');
  const preset = kind === 'builtin'
    ? BUILTIN_PRESETS.find((p) => p.name === name)
    : state.presets.find((p) => p.name === name);
  if (!preset) return;
  const cur = state.settings;
  const keep = kind === 'builtin'
    ? { widthMm: cur.widthMm, ...outputPrefs(cur) }
    : {};
  state.settings = {
    ...withDefaults({ ...keep, ...preset.settings }),
    bgSeeds: cur.bgSeeds,
    samPoints: cur.samPoints,
    colorEdits: cur.colorEdits,
    embLayers: cur.embLayers,
  };
  state.activePreset = { key, settings: presetSettingsFromCurrent() };
  state.cancelRetries = 0;
  dragReady = false;
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

/**
 * Wofür ein Preset gedacht ist: 'laser', 'emb' (Sticken) oder 'both' (in beiden Listen).
 * Mitgelieferte: Gruppen „Stickerei …“ zum Sticken, sonst Lasern, außer use ist gesetzt.
 * Eigene: Sticken, wenn PES/DST/EXP gewählt sind und der Modus eine Stickdatei liefert.
 */
function presetUse(p, kind) {
  if (kind === 'user') {
    const s = p.settings || {};
    return (s.fmtPes || s.fmtDst || s.fmtExp) && EMB_MODES.includes(s.mode) ? 'emb' : 'laser';
  }
  return p.use || (p.group.startsWith('Stickerei') ? 'emb' : 'laser');
}
const presetTab = () => (ui.presetTab === 'emb' ? 'emb' : 'laser');
const inPresetTab = (p, kind) => ['both', presetTab()].includes(presetUse(p, kind));
// In der Liste „Sticken“ ist der Vorsatz „Stickerei – “ überflüssig
const presetLabel = (s) => (presetTab() === 'emb' ? s.replace(/^Stickerei – /, '') : s);

function renderPresets() {
  for (const b of $$('#preset-tab button')) b.classList.toggle('active', b.dataset.value === presetTab());
  const sel = $('#preset-select');
  sel.replaceChildren();
  const placeholder = new Option('– Preset wählen –', '');
  sel.append(placeholder);
  const group = (label, items, kind) => {
    items = items.filter((p) => inPresetTab(p, kind));
    if (!items.length) return;
    const g = document.createElement('optgroup');
    g.label = presetLabel(label);
    for (const p of items) g.append(new Option(presetLabel(p.name), `${kind}:${p.name}`));
    sel.append(g);
  };
  group('Eigene Presets', state.presets, 'user');
  let groups = [...new Set(BUILTIN_PRESETS.map((p) => p.group))];
  // Sticken: eigene Stickerei-Gruppen zuerst, gemeinsame Laser-Vorlagen (ohne PES) danach
  if (presetTab() === 'emb') groups = [...groups.filter((n) => n.startsWith('Stickerei')), ...groups.filter((n) => !n.startsWith('Stickerei'))];
  for (const name of groups) {
    const label = presetTab() === 'emb' && !name.startsWith('Stickerei') ? `${name} – SVG-Ebenen für Stickprogramme` : name;
    group(label, BUILTIN_PRESETS.filter((p) => p.group === name), 'builtin');
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
  for (const b of $$('#preset-tab button')) {
    b.addEventListener('click', () => {
      if (presetTab() === b.dataset.value) return;
      // Sticken: Foto und Relief liefern keine Stickdatei – auf Fläche wechseln
      if (b.dataset.value === 'emb' && !EMB_MODES.includes(state.settings.mode)) {
        setSetting('mode', 'vector');
        toast('Zum Sticken auf Modus Fläche gewechselt – Foto und Relief liefern keine Stickdatei.');
      }
      ui.presetTab = b.dataset.value;
      saveUi();
      renderPresets();
      syncControls();
    });
  }
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

/** Ist das eine SVG-Datei? (Endung oder Inhalt, z. B. beim Einfügen ohne Namen) */
function isSvgFile(name, bytes) {
  if (/\.svg$/i.test(name)) return true;
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^\uFEFF/, '').trimStart();
  return /^<(\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head);
}

const SVG_RASTER_PX = 3000; // längere Seite beim Rastern von SVG-Vorlagen (reicht für alle Arbeitsauflösungen)

/**
 * SVG als Bild laden: im Browser (ohne Skripte) gerendert und auf SVG_RASTER_PX gerastert,
 * Transparenz bleibt erhalten. widthMm: Breite aus dem width-Attribut, falls in mm/cm/in angegeben.
 */
async function rasterizeSvg(bytes) {
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

async function loadImage(name, bytes, { historyId = null, settings = null } = {}) {
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
  dragReady = false; // altes Ergebnis lässt sich nicht mehr herausziehen
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
  function cancelled() {
    const err = new Error('cancelled');
    err.cancelled = true;
    return err;
  }

  /**
   * Eine Spur = ein eigener Worker. Neue Aufträge brechen nur Aufträge derselben Spur ab:
   * Die Vorschau des Originals (cutout) darf die eigentliche Berechnung nicht abbrechen und umgekehrt.
   */
  function makeLane() {
    let worker = null;
    let job = null; // { reject }
    return {
      call(type, payload, transfer = []) {
        this.cancel();
        if (!worker) worker = new Worker('pipeline-worker.js');
        return new Promise((resolve, reject) => {
          const w = worker;
          const mine = { reject };
          job = mine;
          w.onmessage = (e) => {
            if (job === mine) job = null;
            if (e.data.ok) resolve(e.data.result);
            else reject(new Error(e.data.error));
          };
          w.onerror = (e) => {
            e.preventDefault();
            if (job === mine) job = null;
            w.terminate();
            if (worker === w) worker = null;
            reject(new Error(e.message || 'Fehler im Verarbeitungs-Worker'));
          };
          w.postMessage({ type, payload }, transfer);
        });
      },
      /** Laufenden Auftrag sofort abbrechen (Worker beenden). */
      cancel() {
        if (!job) return;
        worker.terminate();
        worker = null;
        job.reject(cancelled());
        job = null;
      },
    };
  }

  const work = makeLane(); // Umwandlung: render, colorMask, refineMask
  const view = makeLane(); // Vorschau des Originals: cutout
  const mix = makeLane(); // Vereinigen mit einem Historie-Ergebnis

  return {
    /** Alle laufenden Aufträge sofort abbrechen. */
    cancel() {
      work.cancel();
      view.cancel();
      mix.cancel();
    },
    merge(payload) {
      return mix.call('merge', payload, [payload.bits, payload.gray8].filter(Boolean).map((a) => a.buffer));
    },
    async render(source, mask, s, lineMask = null, textSource = null) {
      const src = await createImageBitmap(source);
      const m = mask ? await createImageBitmap(mask) : null;
      const lm = lineMask ? await createImageBitmap(lineMask) : null;
      const ts = textSource ? await createImageBitmap(textSource) : null;
      return work.call('render', { source: src, mask: m, lineMask: lm, textSource: ts, s }, [src, m, lm, ts].filter(Boolean));
    },
    async cutout(source, mask, markers, boxes = [], hideBackground = false, faceBoxes = []) {
      const src = await createImageBitmap(source);
      const m = mask ? await createImageBitmap(mask) : null;
      return view.call('cutout', { source: src, mask: m, markers, boxes, hideBackground, faceBoxes }, m ? [src, m] : [src]);
    },
    async skyMask(source, tolerance, seeds, protect = null) {
      const src = await createImageBitmap(source);
      const p = protect ? await createImageBitmap(protect) : null;
      return work.call('skyMask', { source: src, tolerance, seeds, protect: p }, p ? [src, p] : [src]);
    },
    async colorMask(source, tolerance, border, seeds) {
      const src = await createImageBitmap(source);
      return work.call('colorMask', { source: src, tolerance, border, seeds }, [src]);
    },
    async refineMask(mask, opts) {
      const m = await createImageBitmap(mask);
      return work.call('refineMask', { mask: m, opts }, [m]);
    },
  };
})();

/** Gehört dieser Durchlauf-Kontext zu einem überholten Durchlauf? */
const isStaleRun = (s) => !!s && s.gen != null && (s.gen !== state.generation || s.source !== state.source); // auch: Bild gewechselt

/** Überholter Durchlauf: still aussteigen (wie ein Abbruch), statt die Worker des aktuellen zu belegen. */
function throwIfStale(s) {
  if (!isStaleRun(s)) return;
  const err = new Error('cancelled');
  err.cancelled = true;
  throw err;
}

const isCancelled = (err) => !!err && (err.cancelled || /cancelled$/.test(String(err.message)));

let processTimer = null;

/** Kennung der Einstellungen ohne Exportformate und Stickeinstellungen (die ändern das Ergebnis nicht). */
const resultSig = (s) => JSON.stringify(Object.keys(s).filter((k) => !isOutputKey(k)).sort().map((k) => [k, s[k]]));

/** Passt das angezeigte Ergebnis noch zu den aktuellen Einstellungen? */
const resultIsCurrent = (r) => !!r && !!r.settings && resultSig(r.settings) === resultSig(state.settings) && !state.mergePending;

function scheduleProcess(delay = 120) {
  if (!state.source) return;
  clearTimeout(processTimer);
  processTimer = setTimeout(() => {
    processTimer = null; // null = keine Berechnung mehr angesetzt (MCP wartet darauf)
    runProcess();
  }, delay);
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
    const hits = AI.cacheHits;
    this.render();
    const res = await promise;
    if (st && !st.done) {
      st.done = true;
      // aus dem Festplatten-Cache geholt → nicht als Rechendauer lernen
      if (!st.inherited && AI.cacheHits === hits) Timing.learn(st.tkey, st.units, performance.now() - st.started);
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

const SEG_MODEL = { ai: 'u2netp', isnet: 'isnet', birefnet: 'birefnet', ben2: 'ben2', modnet: 'modnet', sam: 'sam_encoder', sam2: 'sam2_encoder' };
/** Freistellen per Klickpunkten (MobileSAM oder SAM 2.1)? */
const isSam = (method) => method === 'sam' || method === 'sam2';
/** Methoden mit Hintergrund-Klickpunkten (bgSeeds). */
const usesSeeds = (method) => method === 'color' || isSky(method);
/** Himmel entfernen – ohne bzw. mit KI-Schutz des Motivs (BEN2). */
const isSky = (method) => method === 'sky' || method === 'skyai';
/** Embedding und Maske je Klick-Modell. */
const SAM_IMPL = {
  sam: { decoder: 'sam_decoder', embed: (b) => AI.samEmbedding(b), mask: (e, p, w, h) => AI.samMask(e, p, w, h), embMs: 2500, maskMs: 500 },
  sam2: { decoder: 'sam2_decoder', embed: (b) => AI.sam2Embedding(b), mask: (e, p, w, h) => AI.sam2Mask(e, p, w, h), embMs: 3500, maskMs: 400 },
};
const SEG_SEED_MS = { ai: 1500, isnet: 4000, birefnet: 26000, ben2: 14000, modnet: 2200 };
const MODEL_NAMES = {
  u2netp: 'Motiv – schnell (U²-Net)', isnet: 'Motiv – präzise (IS-Net)', birefnet: 'Motiv – beste Qualität (BiRefNet)', ben2: 'Motiv – gut & sparsam (BEN2)',
  modnet: 'Motiv – Porträt & Haare (MODNet)', sam_encoder: 'Objekt anklicken – schnell (MobileSAM)', sam_decoder: 'Objekt anklicken – schnell (MobileSAM)',
  sam2_encoder: 'Objekt anklicken – genau (SAM 2.1)', sam2_decoder: 'Objekt anklicken – genau (SAM 2.1)',
  lineart: 'KI-Strichzeichnung', lineart_contour: 'KI-Strichzeichnung (Konturen)', lineart_sketch: 'KI-Strichzeichnung (Skizze)',
  lineart_portrait: 'KI-Strichzeichnung (Tusche-Porträt)', lineart_teed: 'KI-Strichzeichnung (Kanten)', esrgan: 'KI-Vergrößerung', depth: 'Tiefenkarte', faces: 'Gesichtserkennung',
  depth_base: 'Tiefenkarte (fein)', depth_large: 'Tiefenkarte (sehr fein)', codeformer: 'Gesichter restaurieren (CodeFormer)',
  faceparse: 'Gesichtsmerkmale (Face Parsing)',
  scunet: 'Rauschen entfernen', lama: 'Kratzer auffüllen', restoreformer: 'Gesichter restaurieren', yunet: 'Gesichtspunkte',
  text: 'Texterkennung (PP-OCRv4)', text_v5: 'Texterkennung – genauer (PP-OCRv5)', text_v5_server: 'Texterkennung – beste Qualität (PP-OCRv5 Server)',
};

/** Kennung der Restaurierungs-Einstellungen ('' = keine Restaurierung). */
function restoreSig(s) {
  if (!s.restoreOn || (!s.restoreDenoise && !s.restoreScratches && !s.restoreFaces)) return '';
  const scratch = s.restoreScratches ? `S${s.scratchSensitivity}${s.scratchProtect === 'parse' ? 'p' : ''}` : '';
  const faces = s.restoreFaces ? `F${s.faceRestoreStrength}${s.faceRestoreModel === 'codeformer' ? `c${s.faceFidelity}` : ''}` : '';
  return `r${s.restoreDenoise ? 'D' : ''}${scratch}${faces}`;
}
// Alle KI-Zwischenergebnisse hängen am Eingangsbild: Restaurierung + Vergrößerung
// Restaurierung nach dem Freistellen: Maske kommt vom unbearbeiteten Original, Restaurierung hängt an der Maske
const restoreAfterCut = (s) => s.restoreOrder === 'after' && !!restoreSig(s) && s.bgRemove !== 'none';
const upTag = (s) => {
  const sig = restoreSig(s);
  if (!sig) return s.upscale ? 'up' : 'orig';
  return `${s.upscale ? 'up' : 'orig'}|${sig}${restoreAfterCut(s) ? `@${maskKeyFor(s)}` : ''}`;
};
/** Kennung des Bildes, aus dem die Maske berechnet wird. */
const maskTag = (s) => (restoreAfterCut(s) ? 'src' : upTag(s));
/** Kennung der Restaurierung (inkl. Maske, wenn erst freigestellt wird). */
const restoreKey = (s) => `${restoreSig(s)}${restoreAfterCut(s) ? `@${maskKeyFor(s)}` : ''}`;
const KEYS = {
  seg: (method, up) => `seg:${method}:${up}`,
  samEmb: (up, method = 'sam') => `sam-emb:${method === 'sam' ? '' : `${method}:`}${up}`,
  samMask: (up, points, method = 'sam') => `sam-mask:${method === 'sam' ? '' : `${method}:`}${up}:${JSON.stringify(points)}`,
  lineart: (up, res, maskKey, style = 'fine') => `lineart${style === 'fine' ? '' : `-${style}`}:${up}:${res}:${maskKey}`,
  depth: (up, res, model = 'depth') => `depth${model === 'depth' ? '' : `-${model}`}:${up}:${res}`,
  faces: (up, maskKey = null) => (maskKey ? `faces:${up}:cut:${maskKey}` : `faces:${up}`),
  faceParts: (up, maskKey = null) => `${KEYS.faces(up, maskKey)}:parse`,
  text: (up, maskKey = null, sig = '') => `text:${up}${maskKey ? `:cut:${maskKey}` : ''}${sig ? `:${sig}` : ''}`,
  smooth: (up) => `upscale:smooth:${up}`, // „Glatte Konturen“: Vergrößerung nur für die Fläche
};

const textWanted = (s) => s.textClean && s.mode !== 'relief' && s.mode !== 'sine';

const TEXT_MODELS = new Set(['text', 'text_v5', 'text_v5_server']);
/** Modell der Texterkennung (unbekannte Werte aus alten Presets → PP-OCRv4). */
const textModelOf = (s) => (TEXT_MODELS.has(s.textModel) ? s.textModel : 'text');

/** Einstellungen der Texterkennung für AI.detectText (Regler → Modellparameter). */
function textOpts(s) {
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const sens = Math.max(0, Math.min(100, num(s.textSens, 50)));
  return {
    model: textModelOf(s),
    limit: Math.max(320, Math.min(2560, num(s.textRes, 1280))),
    thresh: 0.3 - (sens - 50) * 0.004, // 0,5 … 0,1
    boxScore: 0.55 - (sens - 50) * 0.006, // 0,85 … 0,25
    unclip: num(s.textUnclip, 1.5),
    merge: num(s.textMerge, 0.6),
    minLine: num(s.textMinPct, 0) / 100,
    maxLine: num(s.textMaxPct, 25) / 100,
    faces: s.textFaces !== false,
    multi: !!s.textMulti,
  };
}
/** Kennung der Erkennungs-Einstellungen für den Zwischenspeicher ('' = Voreinstellung). */
function textSig(s) {
  const o = textOpts(s), d = AI.TEXT_DEFAULTS;
  const parts = ['model', 'limit', 'thresh', 'boxScore', 'unclip', 'merge', 'minLine', 'maxLine', 'faces', 'multi'];
  return parts.every((k) => o[k] === d[k]) ? '' : parts.map((k) => `${o[k]}`).join(',');
}
/** Aufwand der Texterkennung relativ zu einem Durchlauf mit 1280 px (für die Restzeit). */
function textUnits(s) {
  const o = textOpts(s);
  const one = (o.limit / 1280) ** 2;
  return o.multi ? one * 5 : one; // zweiter Durchlauf in doppelter Auflösung ≈ 4× so viele Pixel
}
const TEXT_SEED_MS = { text: 900, text_v5: 1000, text_v5_server: 7000 };

/** Maske, auf die sich die Texterkennung bezieht (null = ganzes Bild). */
const textMaskKey = (s) => (s.textOrder === 'after' ? maskKeyFor(s) : null);

const facesWanted = (s) => s.faceBoost && s.mode !== 'relief';
const faceMaskKey = (s) => (s.faceOrder === 'after' ? maskKeyFor(s) : null);

/** Schlüssel der Freistellmaske für die aktuellen Einstellungen (null = keine Maske). */
function maskKeyFor(s) {
  const base = rawMaskKeyFor(s);
  if (!base) return null;
  const r = maskRefineSig(s);
  return r ? `${base}|${r}` : base;
}

/** Schlüssel der Maske vor dem Verfeinern. */
function rawMaskKeyFor(s) {
  const method = s.bgRemove;
  if (method === 'none' || (isSam(method) && !s.samPoints.length)) return null;
  const up = maskTag(s);
  if (method === 'color') return `color:${up}:${s.bgTolerance}:${s.bgBorder}:${JSON.stringify(s.bgSeeds)}`;
  if (isSky(method)) return `${method}:${up}:${s.bgTolerance}:${JSON.stringify(s.bgSeeds)}`;
  if (isSam(method)) return `${method}:${up}:${s.maskThreshold}:${JSON.stringify(s.samPoints)}`;
  return `${method}:${up}:${s.maskThreshold}`;
}

/** Kennung der Maskenverfeinerung ('' = keine). Angaben in mm hängen von der Ausgabebreite ab. */
function maskRefineSig(s) {
  const mm = Number(s.maskShiftMm) || 0, smooth = Number(s.maskSmoothMm) || 0;
  const speck = Number(s.maskSpeckPct) || 0, hole = Number(s.maskHolePct) || 0;
  if (!mm && !smooth && !speck && !hole && !s.maskLargest) return '';
  return `r${mm}:${smooth}:${speck}:${hole}:${s.maskLargest ? 1 : 0}${mm || smooth ? `@${s.widthMm}` : ''}`;
}

/** Verfeinerungs-Optionen in Pixeln der Maske (die Maske deckt die volle Ausgabebreite ab). */
function maskRefineOpts(s, maskWidth) {
  const pxPerMm = maskWidth / s.widthMm;
  return {
    shiftPx: (Number(s.maskShiftMm) || 0) * pxPerMm,
    smoothPx: (Number(s.maskSmoothMm) || 0) * pxPerMm,
    speckPct: Number(s.maskSpeckPct) || 0,
    holePct: Number(s.maskHolePct) || 0,
    largestOnly: !!s.maskLargest,
  };
}

/** Zwischenspeicher pro Bild: gleiche Anfrage → gleiches Promise. Laufende Berechnungen werden vermerkt. */
/**
 * Zwischenspeicher eines Durchlaufs. runProcess hält den Cache des Bildes fest (s.cache), mit dem
 * er gestartet ist: Ein veralteter Durchlauf schreibt nach einem Bildwechsel so nie in den Cache
 * des neuen Bildes.
 */
const cacheOf = (s) => (s && s.cache) || state.cache;

// Höchstens so viele fertige Ergebnisse je Schrittart (z. B. „restore“, „lineart“) im Speicher.
// Beim Ziehen eines Reglers entsteht je Zwischenwert ein Eintrag – ohne Grenze wüchse der Speicher
// (Restaurierung und 4×-Vergrößerung belegen je Eintrag Dutzende MB).
const CACHE_PER_KIND = 6;
// große Bilder (Restaurierung, 4×-Vergrößerung): nur die letzten zwei behalten
const CACHE_LIMIT = { restore: 2, upscale: 2 };
const settledKeys = new WeakMap(); // cache -> Set fertiger Schlüssel

function trimCache(cache, kind) {
  const done = settledKeys.get(cache);
  if (!done) return;
  const keys = [...cache.keys()].filter((k) => k.split(':')[0] === kind && done.has(k));
  for (const k of keys.slice(0, Math.max(0, keys.length - (CACHE_LIMIT[kind] ?? CACHE_PER_KIND)))) {
    cache.delete(k);
    done.delete(k);
  }
}

function cached(key, fn, s = null) {
  const cache = cacheOf(s);
  if (cache.has(key)) {
    // zuletzt benutzt → ans Ende (Map hält die Einfügereihenfolge)
    const p = cache.get(key);
    cache.delete(key);
    cache.set(key, p);
    return p;
  }
  const p = fn();
  cache.set(key, p);
  const inflight = cache === state.cache ? state.inflight : null;
  if (inflight) inflight.set(key, performance.now());
  p.then(() => {
    if (!settledKeys.has(cache)) settledKeys.set(cache, new Set());
    settledKeys.get(cache).add(key);
    trimCache(cache, key.split(':')[0]);
  }, () => cache.delete(key)).finally(() => { if (inflight) inflight.delete(key); });
  return p;
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
/** „Glatte Konturen“ vergrößert per KI, wenn das nicht schon „KI-Vergrößerung“ getan hat. */
const smoothUpscaleApplies = (s, size) => s.mode === 'vector' && s.smoothContours && !s.upscale
  && upscaleApplies({ width: size.w ?? size.width, height: size.h ?? size.height });

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
    const key = `restore:${restoreKey(s)}`;
    if (s.restoreDenoise) add('restore-denoise', 'Rauschen entfernen', 'restore-denoise', Restore.denoiseTiles(work.w, work.h), 6000, key);
    if (s.restoreScratches) add('restore-scratch', 'Kratzer & Staub entfernen', 'restore-scratch', 1, 6000, key);
    if (s.restoreFaces) {
      const cf = s.faceRestoreModel === 'codeformer';
      add('restore-faces', 'Gesichter restaurieren', cf ? 'restore-faces:codeformer' : 'restore-faces', state.restoreFaceCount ?? 1, cf ? 5500 : 5000, key);
    }
  }
  if (s.upscale && upscaleApplies({ width: work.w, height: work.h })) {
    const sc = Math.min(1, 1024 / Math.max(work.w, work.h));
    const iw = Math.round(work.w * sc), ih = Math.round(work.h * sc);
    add('upscale', 'KI-Vergrößerung', 'upscale', Math.ceil(iw / 192) * Math.ceil(ih / 192), 450, `upscale:${restoreKey(s)}`);
    work = { w: iw * 4, h: ih * 4 };
  }

  const method = s.bgRemove;
  const maskKey = maskKeyFor(s);
  if (maskKey && !(state.mask && state.mask.key === maskKey)) {
    if (state.maskRaw && state.maskRaw.key === rawMaskKeyFor(s)) {
      // Rohmaske liegt schon vor – nur neu verfeinern
    } else if (method === 'color' || isSky(method)) {
      const a = Segmentation.analysisSize({ width: work.w, height: work.h });
      if (method === 'skyai') add('seg', MODEL_NAMES[SEG_MODEL.ben2], 'seg:ben2', 1, SEG_SEED_MS.ben2, KEYS.seg('ben2', maskTag(s)));
      add('colormask', isSky(method) ? 'Himmel entfernen' : 'Freistellen nach Farbe', 'colormask', (a.w * a.h) / 1e6, 250);
    } else if (isSam(method)) {
      const impl = SAM_IMPL[method];
      add('sam-emb', 'Objekt erkennen', method === 'sam' ? 'sam-emb' : `sam-emb:${method}`, 1, impl.embMs, KEYS.samEmb(maskTag(s), method));
      add('sam-mask', 'Objekt auswählen', method === 'sam' ? 'sam-mask' : `sam-mask:${method}`, 1, impl.maskMs, KEYS.samMask(maskTag(s), s.samPoints, method));
    } else {
      add('seg', MODEL_NAMES[SEG_MODEL[method]], `seg:${method}`, 1, SEG_SEED_MS[method], KEYS.seg(method, maskTag(s)));
    }
    if (maskRefineSig(s)) {
      const a = Segmentation.analysisSize({ width: work.w, height: work.h });
      add('maskrefine', 'Maske verfeinern', 'maskrefine', (a.w * a.h) / 1e6, 300);
    }
  }

  if (facesWanted(s)) {
    add('faces', 'Gesichtserkennung', 'faces', 1, 300, KEYS.faces(up, faceMaskKey(s)));
    if (s.faceLocate === 'parse' && (state.faceCount ?? 1) > 0) {
      add('face-parse', 'Gesichtsmerkmale finden', 'face-parse', state.faceCount ?? 1, 300, KEYS.faceParts(up, faceMaskKey(s)));
    }
  }
  if (textWanted(s)) {
    const model = textModelOf(s);
    add('text', MODEL_NAMES[model], model === 'text' ? 'text' : `text:${model}`, textUnits(s), TEXT_SEED_MS[model], KEYS.text(up, textMaskKey(s), textSig(s)));
  }

  let src = work;
  if (smoothUpscaleApplies(s, work)) {
    const sc = Math.min(1, 1024 / Math.max(work.w, work.h));
    const iw = Math.round(work.w * sc), ih = Math.round(work.h * sc);
    add('upscale-smooth', 'KI-Vergrößerung (glatte Konturen)', 'upscale', Math.ceil(iw / 192) * Math.ceil(ih / 192), 450, KEYS.smooth(up));
    src = { w: iw * 4, h: ih * 4 };
  }
  if (s.mode === 'edges' && s.edgeMethod === 'ai') {
    const sc = Number(s.lineRes) / Math.max(work.w, work.h);
    src = { w: Math.round(work.w * sc), h: Math.round(work.h * sc) };
    const lineKey = KEYS.lineart(up, s.lineRes, maskKey || 'none', s.lineStyle);
    const lineModel = AI.lineModel(s.lineStyle);
    add('lineart', MODEL_NAMES[lineModel], lineModel, (src.w * src.h) / 1e6, 6000, lineKey);
    if (s.faceBoost) {
      const n = state.faceCount ?? 1;
      if (n > 0) add('lineart-faces', 'Gesichtsdetails zeichnen', 'lineart-face', n, 2500, lineFacesKey(lineKey, s, maskKey));
    }
  } else if (s.mode === 'relief') {
    const sc = Number(s.depthRes) / Math.max(work.w, work.h);
    const model = AI.depthModel(s.depthModel);
    add('depth', MODEL_NAMES[model], model, (work.w * sc * work.h * sc) / 1e6, DEPTH_SEED_MS[model], KEYS.depth(up, s.depthRes, model));
  }
  if (s.subjectLine && !maskKey && s.mode !== 'relief') {
    add('contour', 'Motivkontur', `seg:ai`, 1, SEG_SEED_MS.ai, KEYS.seg('ai', up));
  }

  const out = Processing.targetSize(src.w, src.h, s);
  const mp = (out.w * out.h) / 1e6;
  const variant = s.mode === 'edges' ? `:${s.edgeMethod}` : s.mode === 'dither' ? `:${s.ditherAlgo}` : '';
  const renderSeed = { vector: 250, edges: s.edgeMethod === 'ai' ? 300 : 700, dither: 700, relief: 250, sine: 400, color: 900 }[s.mode] + (s.outline ? 1500 : 0);
  add('render', 'Bildverarbeitung', `render:${s.mode}${variant}${s.outline ? '+outline' : ''}`, mp, renderSeed);
  if (!(s.outline && s.outlineOnly) && (s.mode === 'vector' || s.mode === 'edges' || s.mode === 'color')) {
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
  AI.beginRun();
  const settingsSnap = { ...state.settings }; // Einstellungen, zu denen das Ergebnis gehört (Export/Historie)
  // Durchlauf-Kontext: eigener Cache-Verweis und Generation (siehe cached / isStaleRun)
  const s = { ...state.settings, gen, maskKey: null };
  // nicht aufzählbar: wird weder an Worker geschickt (Promises sind nicht kopierbar) noch gespeichert
  Object.defineProperty(s, 'cache', { value: state.cache, enumerable: false });
  Object.defineProperty(s, 'source', { value: state.source, enumerable: false }); // Bild dieses Durchlaufs
  setBusy(true);
  state.processing = true;
  state.lastError = null;

  // UI erst neu zeichnen lassen, bevor gerechnet wird
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  if (gen !== state.generation) return;

  try {
    const t0 = performance.now();
    const stale = () => gen !== state.generation;
    // Grenzen hängen nur von der Leistungsstufe ab: einmal abwarten, danach nur im
    // Hintergrund aktualisieren (Anzeige des freien Speichers), statt jeden Durchlauf zu bremsen
    if (state.sys) refreshSystem();
    else await refreshSystem();
    if (stale()) return;
    applyLimits(s);
    Run.start(planSteps(s));

    // Restaurierung nach dem Freistellen: Maske zuerst aus dem unbearbeiteten Original
    const restoreAfter = restoreAfterCut(s);
    const preMask = restoreAfter ? await ensureMask(s, state.source.bitmap) : null;
    if (stale()) return;

    // 1. Optional Restaurierung und KI-Vergrößerung
    const work = await workingBitmap(s, preMask);
    if (stale()) return;
    const viewBase = restoreSig(s) ? await restoredBitmap(s, preMask) : state.source.bitmap;
    $('#restore-info').textContent = restoreSig(s) ? (viewBase.restoreInfo || '') : '';

    // Schrift & Logos erkennen – je nach Einstellung vor oder nach dem Freistellen
    // (immer vor der Vorschau, damit die Bereiche dort markiert werden)
    const textAfterCut = s.textOrder === 'after';
    s.textBlocks = textWanted(s) && !textAfterCut ? await detectText(s, work) : [];
    if (stale()) return;

    // 2. Freistellen
    const mask = restoreAfter ? preMask : await ensureMask(s, work);
    if (stale()) return;
    if (textWanted(s) && textAfterCut) {
      s.textBlocks = await detectText(s, work, mask);
      if (stale()) return;
    }
    state.lastTextBlocks = s.textBlocks;

    // Gesichter erkennen (für „Gesichtszüge hervorheben“) – vor der Vorschau, damit sie dort markiert werden
    s.faces = facesWanted(s) ? await detectFaces(s, work, s.faceOrder === 'after' ? mask : null) : [];
    if (stale()) return;

    state.lastViewBase = viewBase;
    // genau diese Ansicht merken: „Hintergrund ausblenden“ zeichnet sie neu (nicht state.mask/state.settings,
    // die zu einem anderen Stand gehören können)
    state.lastView = { s: { ...s, textBlocks: s.textBlocks, faces: s.faces }, mask, base: viewBase };
    await updateOriginalView(s, mask, viewBase);
    if (stale()) return;
    scheduleOriginalDrag(s, work, mask);

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
    let { w, h, bits, gray8, alpha8, trace, imagePng, imageB64, sil, strokePath, colorLayers, colorMasks, colorContour, contourBits } =
      await Run.track('render', Pipeline.render(source, mask, s, lineMask, textSourceFor(s, source, work)));
    if (stale()) return;
    const widthMm = Math.max(0.1, s.widthMm);
    const heightMm = (widthMm * h) / w;
    const mmPerPx = widthMm / w;
    // Immer die tatsächliche Auflösung: wurde das Bild wegen der Pixelgrenze verkleinert, stimmt s.dpi
    // nicht mehr – Rasterdateien wären in LightBurn sonst kleiner als das SVG
    const dpi = w / (widthMm / 25.4);
    const dpiWarn = (s.mode === 'dither' || s.mode === 'relief' || s.mode === 'sine') && dpi < s.dpi * 0.98 ? `${Math.round(dpi)}/${s.dpi}` : null;
    if (dpiWarn && state.dpiWarn !== dpiWarn) {
      toast(`Auflösung auf ${Math.round(dpi)} DPI begrenzt (Arbeitsspeicher). Die Größe in mm bleibt korrekt.`);
    }
    state.dpiWarn = dpiWarn;

    // 5. Vektorisierung (Potrace im eigenen Prozess) – Füllung und Umrisslinie parallel
    // Modus Farben: alle Farbebenen in einem Auftrag (ein Pfad je Ebene)
    const fillJob = colorMasks && colorMasks.length
      ? Run.track('trace', window.api.trace({ layers: colorMasks, w, h }, traceParams(s, mmPerPx, w, h, s.textBlocks), 'fill'))
      : trace
        ? Run.track('trace', window.api.trace({ bits, w, h }, traceParams(s, mmPerPx, w, h, s.textBlocks), 'fill'))
        : contourBits && !(s.outline && s.outlineOnly)
          // Wellen mit Motivkontur: der Ring als gefüllte Fläche (die Wellen sind schon Vektorpfade)
          ? Run.track('trace', window.api.trace({ bits: contourBits, w, h }, { turdSize: 2, alphaMax: 1, optTolerance: 0.2 }, 'fill'))
          : null;
    const outlineJob = sil
      ? Run.track('trace-outline', window.api.trace({ bits: sil.bits, w: sil.w, h: sil.h }, {
        turdSize: Math.round(sil.w * sil.h * 0.0005), // Kleinteile ignorieren
        alphaMax: 1.2,
        optTolerance: 0.5,
      }, 'outline'))
      : null;
    // beide abwarten, auch wenn einer scheitert (sonst bliebe eine Ablehnung unbehandelt)
    const [fillRes, outlineRes] = await Promise.allSettled([fillJob, outlineJob]);
    if (stale()) return;
    if (fillRes.status === 'rejected') throw fillRes.reason;
    if (outlineRes.status === 'rejected') throw outlineRes.reason;
    const colors = colorLayers ? colorSvgLayers(colorLayers, fillRes.value || [], colorContour) : null;
    const fillPath = colors ? null : fillRes.value;
    // Farben: Rasterexporte, Vorschaubild und Herausziehen zeigen genau die vektorisierten Flächen
    const rgba8 = colors ? rasterizeColors(colors, w, h) : null;
    if (colorLayers && !colors.some((c) => c.d) && !(s.outline && s.outlineOnly)) {
      toast(colorLayers.length ? 'Alle Farben sind ausgeblendet – das Ergebnis ist leer.' : 'Keine Farben gefunden – das Bild ist leer oder vollständig freigestellt.', true);
    }
    // Formen begradigt: Rasterexporte (PNG/JPG/BMP) und Vereinigen sollen dieselben Formen zeigen wie das SVG
    if (s.shapeFit && fillPath && bits && !strokePath) bits = rasterizePath(fillPath, w, h);
    // leere Silhouette (alles unter der Mindestgröße): keine Umrisslinie – sonst hätte das SVG einen Rand, die Rasterbilder nicht
    const outline = sil && String(outlineRes.value || '').trim() ? { d: outlineRes.value, pad: sil.pad } : null;
    if (sil && !outline && s.outlineOnly) toast('Kein Motiv für die Umrisslinie gefunden – das Ergebnis ist leer.', true);

    const stroke = strokePath != null ? { d: strokePath, width: s.sineStrokeMm / mmPerPx } : null;
    if (stroke && !stroke.d) toast('Keine Wellen – das Bild ist vollständig weiß.', true);
    const doc = { w, h, widthMm, fillPath, imageB64, stroke, colors, outline };
    const svg = Encoders.svgDocument(doc);
    const previewSvg = Encoders.svgDocument({ ...doc, preview: true });

    const pad = outline ? outline.pad : 0;
    const totalW = (w + 2 * pad) * mmPerPx, totalH = (h + 2 * pad) * mmPerPx;
    state.baseResult = {
      w, h, bits, gray8, alpha8, rgba8, svg, widthMm, heightMm, dpi, mode: s.mode,
      colorLayers: colorLayers || null, // Modus Farben: Ebenen für die Farbliste
      emb: embSource({ mode: s.mode, colors, fillPath, stroke, outline, outlineOnly: !!(s.outline && s.outlineOnly), mmPerPx }),
      // Relief: eigene Option „Weißen Hintergrund transparent“ (gilt für PNG/SVG)
      transparent: s.mode === 'relief' ? !!alpha8 : s.transparent,
      mmPerPx, outline, outlineOnly: !!(s.outline && s.outlineOnly), // für Rasterexporte mit Umrisslinie
      textBlocks: s.textBlocks, // für „Formen verbessern vor Schrift & Logos“ beim Vereinigen
      totalWmm: totalW, totalHmm: totalH, // inkl. Umrisslinie (SVG-Gesamtgröße)
      settings: settingsSnap,
      // Rasterergebnisse ohne Umriss als PNG anzeigen (schärfer), sonst das SVG
      preview: imagePng && !outline
        ? { blob: new Blob([imagePng], { type: 'image/png' }), pixelated: s.mode === 'dither' }
        : { blob: new Blob([previewSvg], { type: 'image/svg+xml' }), pixelated: false },
    };
    state.cancelRetries = 0;
    renderColorList();
    await composeMerged(true); // mit Historie-Eintrag vereinigen (falls gewählt) und anzeigen
    if (stale()) return;

    const ms = Math.round(performance.now() - t0);
    const kb = ((state.result || state.baseResult).svg.length / 1024).toFixed(0);
    $('#status').textContent =
      `${w} × ${h} px · ${round1(totalW)} × ${round1(totalH)} mm · ${Math.round(dpi)} DPI · SVG ${kb} KB · ${ms} ms`;
  } catch (err) {
    if (gen !== state.generation) return;
    if (isCancelled(err)) {
      // Aktueller Durchlauf wurde nicht vom Benutzer abgebrochen, hat aber ein abgebrochenes
      // Zwischenergebnis eines früheren Durchlaufs geerbt (gemeinsamer Cache) → einmal neu starten
      if (state.cancelRetries < 2) {
        state.cancelRetries++;
        scheduleProcess(0);
      } else {
        state.lastError = 'Die Berechnung wurde mehrfach unterbrochen.';
        toast('Die Berechnung wurde mehrfach unterbrochen – bitte eine Einstellung ändern oder neu laden.', true);
      }
      return;
    }
    console.error(err);
    state.lastError = cleanError(err);
    toast(`Umwandlung fehlgeschlagen: ${cleanError(err)}`, true);
  } finally {
    if (gen === state.generation) {
      setBusy(false);
      state.processing = false;
      Run.stop();
      refreshPerf(); // GPU/CPU je Modell und Cache-Größe aktualisieren
    }
  }
}

/**
 * Vorlage für die Schriftbereiche: Ist die Bildquelle eine KI-Strichzeichnung, wird die Schrift
 * aus dem Arbeitsbild gerechnet. Bei „Glatte Konturen“ ist die Quelle dasselbe Bild, nur per KI
 * vergrößert – nach der Schrifterkennung bekommt auch die Schrift die Vergrößerung, davor bleibt
 * sie wie ohne „Glatte Konturen“.
 */
function textSourceFor(s, source, work) {
  if (!s.textBlocks.length || source === work) return null;
  if (smoothUpscaleApplies(s, work) && s.shapeOrder !== 'before') return null;
  return work;
}

/**
 * Parameter für Potrace (inkl. „Formen begradigen“, Toleranz in Pixeln des Arbeitsbildes).
 * Begradigen vor „Schrift & Logos“: Die Bereiche der Schrift (samt einbezogener Logo-Elemente)
 * gehen in Pixeln mit; Konturen darin bleiben, wie die Schrifterkennung sie zeichnet.
 */
function traceParams(s, mmPerPx, w = 0, h = 0, textBlocks = null) {
  const skip = s.shapeFit && s.shapeOrder === 'before' && s.textClean && textBlocks?.length && w && h
    ? textBlocks.map((b) => {
      // wie in cleanText: Schrift + „Logos einbeziehen“ (Vielfaches der Zeilenhöhe), mind. eine halbe Zeile
      const m = Math.max(2, (b.lineH || 0) * h * Math.max(0.5, Number(s.textPad ?? 1)));
      return [b.x1 * w - m, b.y1 * h - m, b.x2 * w + m, b.y2 * h + m];
    })
    : null;
  return {
    shapeSkip: skip,
    turdSize: s.turdSize,
    alphaMax: s.alphaMax,
    optTolerance: s.optTolerance,
    shapes: !!s.shapeFit,
    shapeTol: Math.max(0.5, (Number(s.shapeTolMm) || 0.1) / mmPerPx),
    shapeSnap: s.shapeSnap !== false,
  };
}

/** SVG-Pfad (gerade/gerade-ungerade gefüllt) als Binärbild w × h (1 = schwarz). */
function rasterizePath(d, w, h) {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fill(new Path2D(d), 'evenodd');
  const data = ctx.getImageData(0, 0, w, h).data;
  const bits = new Uint8Array(w * h);
  for (let p = 0, i = 3; p < bits.length; p++, i += 4) bits[p] = data[i] >= 128 ? 1 : 0;
  return bits;
}

/**
 * Modus Farben: Ebenen fürs SVG (Pfad, Farbe, Name) – Reihenfolge von unten nach oben,
 * nur sichtbare Farben (paths gehört zu den sichtbaren Ebenen in dieser Reihenfolge).
 */
function colorSvgLayers(layers, paths, contour = false) {
  const vis = layers.filter((l) => !l.off);
  const out = vis.map((l, i) => ({
    d: String(paths[i] || '').trim(), hex: l.hex, label: `${i + 1} ${l.name} (${l.hex})`,
    name: l.name, key: `c${l.from}`, // Schlüssel für die Stickparameter: ursprüngliche Bildfarbe
  }));
  // Motivkontur: letzte Maske, eigene schwarze Ebene ganz oben
  if (contour) {
    out.push({
      d: String(paths[vis.length] || '').trim(), hex: '#000000', label: `${vis.length + 1} Motivkontur (#000000)`,
      name: 'Motivkontur', key: 'contour',
    });
  }
  return out;
}

/** Farbebenen (SVG-Pfade) als RGBA-Bild w × h, leere Stellen transparent. */
function rasterizeColors(colors, w, h) {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  for (const c of colors) {
    if (!c.d) continue;
    ctx.fillStyle = c.hex;
    ctx.fill(new Path2D(c.d), 'evenodd');
  }
  return ctx.getImageData(0, 0, w, h).data;
}

/* ---- Stickdateien (PES/DST/EXP) ---- */

/**
 * Vektordaten fürs Sticken: Farbflächen bzw. die Fläche (schwarz) als Füllstich, die Umrisslinie
 * als Steppstich. Nur Modi mit Vektorflächen (Fläche, Linien, Farben).
 */
function embSource({ mode, colors, fillPath, stroke = null, outline, outlineOnly, mmPerPx }) {
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
function embGeometry(r) {
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
function embScaled(r, s = state.settings) {
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
function embLayerParams(r, s = state.settings) {
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

const embKey = (s) => JSON.stringify([s.embFabric, s.embTrimMm, s.embLayers || {}, s.widthMm]);

/** Geplante Stiche des Ergebnisses (zwischengespeichert je Stoff, Schnittlänge, Handeinstellungen und Breite). */
function stitchPattern(r, s = state.settings) {
  if (!r || !r.emb) return null;
  const key = embKey(s);
  if (r.embCache && r.embCache.key === key) return r.embCache.pat;
  const e = embGeometry(r);
  const sc = embScaled(r, s);
  const lp = embLayerParams(r, s);
  const pat = Embroidery.plan(e.layers.map((l, i) => ({
    rings: sc.rings[i], an: sc.an[i], hex: l.hex, kind: l.kind, name: l.name, p: lp[i].params, own: !!l.own,
  })), { trimMm: s.embTrimMm });
  pat.widthMm = (pat.bounds[2] - pat.bounds[0]) / 10;
  pat.heightMm = (pat.bounds[3] - pat.bounds[1]) / 10;
  r.embCache = { key, pat };
  return pat;
}

const EMB_MAX_MM = 400; // größere Motive passen in keinen Stickrahmen (und sprengen PES-Sprünge)

/** PES/DST/EXP-Dateien des Ergebnisses (leer, wenn nicht gewählt oder nichts zu sticken). */
function embroideryFiles(r, s) {
  if (!embFormats(s) || !r.emb) return [];
  const pat = stitchPattern(r, s);
  if (!pat || !pat.stats.stitches || Math.max(pat.widthMm, pat.heightMm) > EMB_MAX_MM) return [];
  const files = [];
  if (s.fmtPes) files.push({ ext: 'pes', data: Embroidery.toPes(pat, baseName()) });
  if (s.fmtDst) files.push({ ext: 'dst', data: Embroidery.toDst(pat, baseName()) });
  if (s.fmtExp) files.push({ ext: 'exp', data: Embroidery.toExp(pat) });
  // Farben zu EXP (und DST mit gleichem Namen) für Melco DesignShop 12
  if (s.fmtExp) files.push({ ext: 'inf', data: Embroidery.toInf(pat) });
  return files;
}

/** Hinweis, warum keine Stickdatei entsteht (oder null). */
function embroideryProblem(r, s) {
  if (!embFormats(s)) return null;
  if (!r.emb) {
    return EMB_MODES.includes(r.mode) || r.merge
      ? 'Keine Stickdatei – das Ergebnis ist leer.'
      : 'PES/DST/EXP gibt es nur in den Modi Fläche, Linien, Wellen und Farben.';
  }
  const pat = stitchPattern(r, s);
  if (!pat || !pat.stats.stitches) return 'Keine Stickdatei – die Flächen sind zu klein für Stiche.';
  if (Math.max(pat.widthMm, pat.heightMm) > EMB_MAX_MM) return `Keine Stickdatei – das Motiv ist größer als ${EMB_MAX_MM} mm. Breite unter „Ausgabegröße“ verringern.`;
  return null;
}

/** Stiche als Vorschaubild (Fadenfarben, gleicher Maßstab wie das Ergebnis, höchstens 2400 px). */
async function stitchPreviewBlob(r, s) {
  const pat = stitchPattern(r, s);
  if (!pat || !pat.stats.stitches) return null;
  const [x0, y0, x1, y1] = pat.bounds;
  const margin = 12;
  const scale = Math.min(0.1 / (r.emb.mmPerPx * embScaled(r, s).f), 2400 / Math.max(1, x1 - x0), 2400 / Math.max(1, y1 - y0)); // px je 0,1 mm
  const c = new OffscreenCanvas(Math.ceil((x1 - x0) * scale) + 2 * margin, Math.ceil((y1 - y0) * scale) + 2 * margin);
  Embroidery.draw(c.getContext('2d'), pat, scale, margin - x0 * scale, margin - y0 * scale);
  return c.convertToBlob({ type: 'image/png' });
}

const fmtInt = (v) => Math.round(v).toLocaleString('de-DE');
const fmtMm = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');

/** Kennzahlen der Stickdatei im Abschnitt „Stickdatei“ (nur wenn die Stiche schon geplant sind). */
function renderEmbInfo(r = state.result) {
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
function embSummary(pat) {
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
function renderEmbManualInfo() {
  const n = Object.keys(state.settings.embLayers || {}).length;
  $('#emb-manual-info').textContent = n ? `${n} ${n === 1 ? 'Farbe' : 'Farben'} von Hand angepasst` : 'Automatik je Farbe';
  $('#btn-emb-dialog').disabled = !(state.result && state.result.emb);
}

let embTimer = null;

/** Stickeinstellungen geändert: Stiche neu planen, Vorschau und Herausziehen aktualisieren. */
function scheduleEmbRefresh() {
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

/* ---- Dialog: Stickparameter je Farbe ---- */

const embDlg = { sel: 0, view: null, timer: null, sig: '', dpr: 1 };
const EMB_TYPES_FILL = [['fill', 'Füllstich'], ['run', 'Kontur – Steppstich'], ['triple', 'Kontur – Dreifachstich'], ['off', 'Nicht sticken']];
const EMB_TYPES_RUN = [['run', 'Steppstich'], ['triple', 'Dreifachstich'], ['off', 'Nicht sticken']];
const EMB_UNDERLAYS = [['none', 'Aus'], ['light', 'Leicht'], ['normal', 'Normal'], ['strong', 'Kräftig (mit Kantenlauf)']];
const EMB_TYPE_NAMES = { fill: 'Füllstich', run: 'Kontur (Steppstich)', triple: 'Kontur (Dreifachstich)', off: 'nicht sticken' };
// Regler im Dialog: [Parameter, Beschriftung, min, max, Schritt, Format, Hinweis]
const EMB_SLIDERS = {
  fill: [
    ['angle', 'Stichwinkel', 0, 175, 5, (v) => `${Math.round(v)}°`, 'Richtung der Stichreihen (0° = waagrecht)'],
    ['spacing', 'Reihenabstand', 0.15, 0.6, 0.01, (v) => `${fmtMm2(v)} · ${(1 / Number(v)).toFixed(1).replace('.', ',')}/mm`, 'Tatsächlicher Abstand benachbarter Stichreihen – kleiner = dichter. Üblich 0,20–0,25 mm (PE-Design: 4,5 Linien/mm = 0,22 mm; Ink/Stitch 0,25 mm). Wilcom misst zwischen zwei Hinreihen: dessen 0,40 mm entsprechen hier 0,20 mm.'],
    ['len', 'Stichlänge', 2, 7, 0.5, (v) => fmtMm1(v), 'Längster Stich im Füllstich, üblich 3–4 mm'],
    ['pull', 'Zugausgleich', 0, 0.6, 0.05, (v) => (Number(v) ? fmtMm2(v) : 'aus'), 'Reihen werden an beiden Enden so weit verlängert – gleicht das Zusammenziehen des Stoffs aus'],
    ['thin', 'Schmale Stellen als Kontur', 0, 2, 0.1, (v) => (Number(v) ? `unter ${fmtMm1(v)}` : 'aus'), 'Teilflächen schmaler als dieser Wert werden als Kontur im Steppstich gestickt (Füllstich deckt dort nicht)'],
  ],
  run: [['len', 'Stichlänge', 1, 4, 0.5, (v) => fmtMm1(v), 'Länge der Steppstiche – kürzer folgt Rundungen genauer']],
  line: [
    ['len', 'Längster Stich', 1, 4, 0.5, (v) => fmtMm1(v), 'Gerade Stücke der Wellen werden in Stiche höchstens dieser Länge geteilt'],
    ['min', 'Kürzester Stich', 0.3, 1.5, 0.1, (v) => fmtMm1(v), 'Kürzere Stücke werden zusammengefasst – sehr kurze Stiche fasst die Maschine schlecht (Fadenriss, Knoten)'],
    ['tol', 'Genauigkeit', 0.03, 0.3, 0.01, (v) => `± ${fmtMm2(v)}`, 'Wie genau die Stiche der Welle folgen – kleiner = mehr Stiche, rundere Wellen'],
  ],
};
const fmtMm1 = (v) => `${Number(v).toFixed(1).replace('.', ',')} mm`;
const fmtMm2 = (v) => `${Number(v).toFixed(2).replace('.', ',')} mm`;
const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function openEmbDialog() {
  const r = state.result;
  if (!r || !r.emb) return toast(embroideryProblem(r, state.settings) || 'Kein Ergebnis zum Sticken.', true);
  embDlg.sel = Math.max(0, Math.min(embDlg.sel, r.emb.layers.length - 1));
  embDlg.view = null; // beim ersten Zeichnen einpassen
  embDlg.sig = '';
  $('#emb-dialog').showModal();
  renderEmbDialog();
}

/** Von Hand gesetzte Werte einer Ebene ändern (undefined = zurück zur Automatik). */
function setEmbManual(key, patch) {
  const all = { ...(state.settings.embLayers || {}) };
  const cur = { ...(all[key] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete cur[k];
    else cur[k] = v;
  }
  if (Object.keys(cur).length) all[key] = cur;
  else delete all[key];
  setSetting('embLayers', all);
}

function embLayerSummary(lp, pat, i) {
  const p = lp.params;
  let t = lp.kind === 'line' && p.type !== 'off' ? (p.type === 'triple' ? 'Dreifachstich' : 'Steppstich') : EMB_TYPE_NAMES[p.type] || p.type;
  if (p.type === 'fill') t += ` ${Math.round(p.angle)}° · ${fmtMm2(p.spacing)}`;
  if (pat && p.type !== 'off' && pat.layers && pat.layers[i]) t += ` · ${fmtInt(pat.layers[i].stitches)} Stiche`;
  return t;
}

/** Liste, Einstellungen der gewählten Farbe, Stichvorschau. */
function renderEmbDialog() {
  const r = state.result;
  if (!r || !r.emb) { $('#emb-dialog').close(); return; }
  const lp = embLayerParams(r);
  embDlg.sel = Math.min(embDlg.sel, lp.length - 1);
  const key = embKey(state.settings);
  const pat = r.embCache && r.embCache.key === key ? r.embCache.pat : null;
  renderEmbLayerList(lp, pat);
  renderEmbEdit(lp);
  scheduleEmbDialog(0);
}

function renderEmbLayerList(lp, pat) {
  const list = $('#emb-layers');
  list.replaceChildren(...lp.map((l, i) => {
    const row = document.createElement('div');
    row.className = 'emb-layer';
    row.classList.toggle('sel', i === embDlg.sel);
    row.classList.toggle('off', l.params.type === 'off');
    row.dataset.i = i;
    const manual = Object.keys(l.manual).length;
    row.innerHTML = `<input type="checkbox" title="Diese Farbe sticken" ${l.params.type !== 'off' ? 'checked' : ''} />`
      + `<span class="emb-swatch" style="background:${escHtml(l.hex)}"></span>`
      + `<span class="emb-layer-name">${i + 1} ${escHtml(l.name)}${manual ? '<span class="emb-badge">● von Hand</span>' : ''}</span>`
      + `<span class="emb-layer-sum">${escHtml(embLayerSummary(l, pat, i))}</span>`;
    row.title = 'Farbe auswählen – rechts einstellen';
    return row;
  }));
}

/** Einstellungen der gewählten Farbe; gleiche Ebene und Stichart: Werte nur aktualisieren (Regler nicht neu bauen). */
function renderEmbEdit(lp) {
  const box = $('#emb-edit');
  const l = lp[embDlg.sel];
  if (!l) { box.replaceChildren(); return; }
  const p = l.params;
  const group = p.type === 'fill' ? 'fill' : p.type === 'off' ? 'off' : 'run';
  const sig = `${embDlg.sel}|${l.key}|${group}|${l.kind}`;
  const why = `<b>Automatik:</b><ul>${l.auto.why.map((w) => `<li>${escHtml(w)}</li>`).join('')}</ul>`;
  if (sig !== embDlg.sig) {
    embDlg.sig = sig;
    const types = l.kind === 'fill' ? EMB_TYPES_FILL : EMB_TYPES_RUN;
    let html = `<div class="emb-edit-head"><span class="emb-swatch" style="background:${escHtml(l.hex)}"></span><b>${embDlg.sel + 1} ${escHtml(l.name)}</b></div>`
      + `<div class="emb-why">${why}</div>`
      + `<label class="field"><span>Stichart <i data-m="type"></i></span><select data-p="type">${types.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`;
    if (group === 'fill') {
      html += EMB_SLIDERS.fill.slice(0, 4).map(embSliderHtml).join('');
      html += `<label class="field" title="Lockere Stichlage unter dem Deckstich: hält den Stoff, gibt dem Deckstich Halt. Schmale Teilflächen bekommen automatisch weniger."><span>Unterlage <i data-m="underlay"></i></span><select data-p="underlay">${EMB_UNDERLAYS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`;
      html += embSliderHtml(EMB_SLIDERS.fill[4]);
    } else if (group === 'run') {
      html += (l.kind === 'line' ? EMB_SLIDERS.line : EMB_SLIDERS.run).map(embSliderHtml).join('');
    }
    html += `<div class="emb-edit-actions">
        <button class="btn btn-small" id="emb-auto-one" title="Alle Handeinstellungen dieser Farbe verwerfen">Automatik für diese Farbe</button>
        <button class="btn btn-small" id="emb-copy-all" title="Die von Hand gesetzten Werte dieser Farbe auf alle anderen Farben übertragen">Auf alle Farben übertragen</button>
      </div>
      <p class="hint">Doppelklick auf einen Regler = zurück zur Automatik.</p>`;
    box.innerHTML = html;
  } else {
    box.querySelector('.emb-why').innerHTML = why;
  }
  // Werte und Kennzeichnung „von Hand“
  for (const el of box.querySelectorAll('[data-p]')) {
    const k = el.dataset.p;
    const v = p[k];
    if (document.activeElement !== el && v !== undefined) el.value = v;
    const out = box.querySelector(`output[data-o="${k}"]`);
    if (out) {
      const def = (group === 'fill' ? EMB_SLIDERS.fill : l.kind === 'line' ? EMB_SLIDERS.line : EMB_SLIDERS.run).find((d) => d[0] === k);
      out.textContent = def ? def[5](el.value) : el.value;
      out.classList.toggle('manual', k in l.manual);
    }
    const mark = box.querySelector(`i[data-m="${k}"]`);
    if (mark) mark.className = k in l.manual ? 'manual' : '';
  }
  $('#emb-auto-one').disabled = !Object.keys(l.manual).length;
  $('#emb-copy-all').disabled = !Object.keys(l.manual).length || lp.length < 2;
}

function embSliderHtml([k, label, min, max, step, , title]) {
  return `<label class="slider" title="${escHtml(title)}"><span>${label} <output data-o="${k}"></output></span>`
    + `<input type="range" data-p="${k}" min="${min}" max="${max}" step="${step}" /></label>`;
}

/** Stiche neu planen und zeichnen (nach kurzer Pause, damit Regler flüssig bleiben). */
function scheduleEmbDialog(delay = 120) {
  clearTimeout(embDlg.timer);
  $('#emb-busy').hidden = false;
  embDlg.timer = setTimeout(() => {
    const r = state.result;
    if (!$('#emb-dialog').open || !r || !r.emb) return;
    const pat = stitchPattern(r);
    $('#emb-busy').hidden = true;
    embDlg.pat = pat;
    const lp = embLayerParams(r);
    renderEmbLayerList(lp, pat);
    renderEmbEdit(lp);
    drawEmbCanvas();
    if (embDlg.refocus) {
      embDlg.refocus = false;
      if ($('#emb-zoom').checked) animateEmbView(embFitView(true));
    }
    const sel = lp[embDlg.sel];
    const selText = sel && pat.layers && pat.layers[embDlg.sel]
      ? ` · gewählt: ${embDlg.sel + 1} ${sel.name} – ${fmtInt(pat.layers[embDlg.sel].stitches)} Stiche` : '';
    $('#emb-stats').textContent = pat.stats.stitches ? embSummary(pat) + selText : 'Keine Stiche – alle Farben ausgeschaltet oder zu klein.';
    renderEmbManualInfo();
  }, delay);
}

/** Umriss der Stiche einer Farbe (0,1 mm), je Stichmuster zwischengespeichert; null = keine Stiche. */
const embLayerBoundsCache = new WeakMap();
function embLayerBounds(pat, layer) {
  let all = embLayerBoundsCache.get(pat);
  if (!all) {
    all = new Map();
    for (const p of pat.ops) {
      if (p.c !== Embroidery.CMD.STITCH) continue;
      const l = p.l || 0;
      const b = all.get(l);
      if (!b) all.set(l, [p.x, p.y, p.x, p.y]);
      else {
        if (p.x < b[0]) b[0] = p.x;
        if (p.y < b[1]) b[1] = p.y;
        if (p.x > b[2]) b[2] = p.x;
        if (p.y > b[3]) b[3] = p.y;
      }
    }
    embLayerBoundsCache.set(pat, all);
  }
  return all.get(layer) || null;
}

/**
 * Ansicht, die das ganze Motiv zeigt – oder mit focus und „Auf gewählte Farbe zoomen“ die Stiche der
 * gewählten Farbe (mindestens 15 mm Ausschnitt, damit kleine Farben nicht riesig werden).
 */
function embFitView(focus = false) {
  const pat = embDlg.pat;
  const view = $('#emb-view');
  const W = view.clientWidth, H = view.clientHeight;
  if (!pat || !W || !H) return null;
  const fit = ([x0, y0, x1, y1], margin) => Math.min(W / Math.max(1, x1 - x0), H / Math.max(1, y1 - y0)) * margin;
  let box = pat.bounds;
  let scale = fit(box, 0.92);
  const lb = focus && $('#emb-zoom').checked ? embLayerBounds(pat, embDlg.sel) : null;
  if (lb) {
    const MIN = 150; // 15 mm
    const cx = (lb[0] + lb[2]) / 2, cy = (lb[1] + lb[3]) / 2;
    const w = Math.max(MIN, lb[2] - lb[0]), h = Math.max(MIN, lb[3] - lb[1]);
    box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    // Rand für die Werkzeugleiste oben; nie kleiner als das ganze Motiv
    scale = Math.max(scale, fit(box, 0.78));
  }
  return { scale, ox: W / 2 - ((box[0] + box[2]) / 2) * scale, oy: H / 2 - ((box[1] + box[3]) / 2) * scale };
}

function fitEmbView(focus = false) {
  const v = embFitView(focus);
  if (v) embDlg.view = v;
}

/** Sanft zur neuen Ansicht zoomen (0,35 s); bei „Bewegung reduzieren“ sofort. */
let embAnim = 0;
function animateEmbView(target) {
  if (!target) return;
  const from = embDlg.view;
  const run = ++embAnim;
  if (!from || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    embDlg.view = target;
    drawEmbCanvas();
    return;
  }
  // im logarithmischen Maßstab überblenden, Bildpunkt unter der Mitte gleitet mit
  const view = $('#emb-view');
  const W = view.clientWidth, H = view.clientHeight;
  const c0 = { x: (W / 2 - from.ox) / from.scale, y: (H / 2 - from.oy) / from.scale };
  const c1 = { x: (W / 2 - target.ox) / target.scale, y: (H / 2 - target.oy) / target.scale };
  const t0 = performance.now();
  const ease = (k) => 1 - (1 - k) ** 3;
  const frame = (now) => {
    if (run !== embAnim || !$('#emb-dialog').open) return;
    const k = Math.min(1, (now - t0) / 350);
    const e = ease(k);
    const scale = Math.exp(Math.log(from.scale) + (Math.log(target.scale) - Math.log(from.scale)) * e);
    const cx = c0.x + (c1.x - c0.x) * e, cy = c0.y + (c1.y - c0.y) * e;
    embDlg.view = { scale, ox: W / 2 - cx * scale, oy: H / 2 - cy * scale };
    drawEmbCanvas();
    if (k < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function drawEmbCanvas() {
  const view = $('#emb-view');
  const canvas = $('#emb-canvas');
  const dpr = window.devicePixelRatio || 1;
  const W = view.clientWidth, H = view.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pat = embDlg.pat;
  if (!pat || !pat.stats.stitches) return;
  if (!embDlg.view) fitEmbView(true);
  const v = embDlg.view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  Embroidery.draw(ctx, pat, v.scale, v.ox, v.oy, $('#emb-dim').checked ? embDlg.sel : -1);
}

function bindEmbDialog() {
  $('#btn-emb-dialog').addEventListener('click', openEmbDialog);
  $('#emb-dialog').addEventListener('close', () => {
    // „close“ kommt verzögert – wurde der Dialog inzwischen wieder geöffnet, nicht dessen Planung abbrechen
    if ($('#emb-dialog').open) return;
    clearTimeout(embDlg.timer);
    if (embDlg.dirty) {
      embDlg.dirty = false;
      scheduleEmbRefresh();
    }
  });
  $('#emb-layers').addEventListener('click', (e) => {
    const row = e.target.closest('.emb-layer');
    if (!row) return;
    const i = Number(row.dataset.i);
    const r = state.result;
    if (e.target.matches('input[type=checkbox]')) {
      const l = embLayerParams(r)[i];
      const on = e.target.checked;
      // einschalten: zurück zur automatischen Stichart (bzw. Füllstich, falls die Automatik „aus“ hätte)
      setEmbManual(l.key, { type: on ? (l.auto.params.type !== 'off' ? undefined : 'fill') : 'off' });
    }
    if (embDlg.sel !== i) embDlg.refocus = true;
    embDlg.sel = i;
    renderEmbDialog();
  });
  const edit = $('#emb-edit');
  const onInput = (e) => {
    const el = e.target.closest('[data-p]');
    if (!el) return;
    const l = embLayerParams(state.result)[embDlg.sel];
    const k = el.dataset.p;
    const v = el.tagName === 'SELECT' ? el.value : Number(el.value);
    setEmbManual(l.key, { [k]: v });
    if (el.tagName === 'SELECT') renderEmbDialog();
    else renderEmbEdit(embLayerParams(state.result)); // Anzeige sofort, Stiche nach kurzer Pause
  };
  edit.addEventListener('input', onInput);
  edit.addEventListener('dblclick', (e) => {
    const el = e.target.closest('.slider, .field');
    const inp = el && el.querySelector('[data-p]');
    if (!inp) return;
    const l = embLayerParams(state.result)[embDlg.sel];
    setEmbManual(l.key, { [inp.dataset.p]: undefined });
    renderEmbDialog();
  });
  edit.addEventListener('click', (e) => {
    const lp = embLayerParams(state.result);
    const l = lp[embDlg.sel];
    if (e.target.id === 'emb-auto-one') {
      const all = { ...(state.settings.embLayers || {}) };
      delete all[l.key];
      setSetting('embLayers', all);
      renderEmbDialog();
    } else if (e.target.id === 'emb-copy-all') {
      const all = { ...(state.settings.embLayers || {}) };
      for (const o of lp) {
        if (o.key === l.key) continue;
        // nur passende Werte übertragen (Umrisslinie kennt keinen Füllstich)
        const patch = { ...l.manual };
        if (o.kind === 'run') for (const k of Object.keys(patch)) if (k !== 'len' && !(k === 'type' && patch.type !== 'fill')) delete patch[k];
        if (Object.keys(patch).length) all[o.key] = { ...(all[o.key] || {}), ...patch };
      }
      setSetting('embLayers', all);
      renderEmbDialog();
      toast('Einstellungen auf alle Farben übertragen.');
    }
  });
  $('#emb-reset-all').addEventListener('click', () => {
    setSetting('embLayers', {});
    renderEmbDialog();
  });
  $('#emb-dim').addEventListener('change', drawEmbCanvas);
  $('#emb-zoom').checked = !!ui.embZoom;
  $('#emb-zoom').addEventListener('change', (e) => {
    ui.embZoom = e.target.checked;
    saveUi();
    animateEmbView(embFitView(e.target.checked));
  });
  $('#emb-fit').addEventListener('click', () => animateEmbView(embFitView(false))); // immer das ganze Motiv
  // Zoom und Verschieben
  const view = $('#emb-view');
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    embAnim++; // laufende Zoom-Animation abbrechen
    if (!embDlg.view) return;
    const rect = view.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    const v = embDlg.view;
    const scale = Math.min(60, Math.max(0.02, v.scale * f));
    const k = scale / v.scale;
    embDlg.view = { scale, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k };
    drawEmbCanvas();
  }, { passive: false });
  let drag = null;
  view.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.emb-view-tools') || !embDlg.view) return;
    embAnim++;
    drag = { x: e.clientX, y: e.clientY, ox: embDlg.view.ox, oy: embDlg.view.oy };
    view.setPointerCapture(e.pointerId);
    view.classList.add('dragging');
  });
  view.addEventListener('pointermove', (e) => {
    if (!drag) return;
    embDlg.view = { ...embDlg.view, ox: drag.ox + e.clientX - drag.x, oy: drag.oy + e.clientY - drag.y };
    drawEmbCanvas();
  });
  const end = () => { drag = null; view.classList.remove('dragging'); };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  view.addEventListener('dblclick', (e) => {
    if (e.target.closest('.emb-view-tools')) return;
    animateEmbView(embFitView(false));
  });
  new ResizeObserver(() => { if ($('#emb-dialog').open) drawEmbCanvas(); }).observe(view);
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
async function workingBitmap(s, mask = null) {
  const bitmap = await restoredBitmap(s, mask);
  if (!s.upscale) return bitmap;
  if (!upscaleApplies(bitmap)) {
    if (!cacheOf(s).has('upscale-skip')) {
      cacheOf(s).set('upscale-skip', Promise.resolve());
      toast('Das Bild ist bereits groß genug – KI-Vergrößerung wird übersprungen.');
    }
    return bitmap;
  }
  const key = `upscale:${restoreKey(s)}`;
  if (!cacheOf(s).has(key)) await ensureModelReady('esrgan');
  return Run.track('upscale', cached(key, () =>
    AI.upscale(bitmap, (done, total) => Run.progress('upscale', done / total)), s));
}

/** Altes Foto restaurieren: Rauschen, Kratzer/Staub, Gesichter (zwischengespeichert). */
async function restoredBitmap(s, mask = null) {
  const sig = restoreSig(s);
  if (!sig) return state.source.bitmap;
  const key = `restore:${restoreKey(s)}`;
  // nur das Motiv restaurieren (Gesichter und Kratzer im Hintergrund bleiben unberührt)
  const subject = restoreAfterCut(s) ? mask : null;
  if (!cacheOf(s).has(key)) {
    // Modelle vorher laden, damit der Download nicht in die Zeitmessung fällt
    if (s.restoreDenoise) await ensureModelReady('scunet');
    if (s.restoreScratches) await ensureModelReady('lama');
    if (s.restoreFaces || s.restoreScratches) await ensureModelReady('yunet');
    if (s.restoreScratches && s.scratchProtect === 'parse') await ensureModelReady('faceparse');
    if (s.restoreFaces) await ensureModelReady(s.faceRestoreModel === 'codeformer' ? 'codeformer' : 'restoreformer');
  }
  const restored = await cached(key, async () => {
    const canvas = Restore.workingCopy(state.source.bitmap);
    const info = [];
    if (s.restoreDenoise) {
      await Run.track('restore-denoise', Restore.denoise(canvas, (d, t) => Run.progress('restore-denoise', d / t)));
      info.push('Rauschen entfernt');
    }
    let faces = s.restoreFaces || s.restoreScratches ? await Restore.landmarks(canvas) : [];
    const inside = subject ? maskAlpha(subject, canvas.width, canvas.height) : null;
    if (inside) faces = faces.filter((f) => inside[Math.round(f.kps[2][1]) * canvas.width + Math.round(f.kps[2][0])] > 127);
    if (s.restoreScratches) {
      await Run.track('restore-scratch', (async () => {
        const parsed = s.scratchProtect === 'parse' && faces.length ? await AI.faceProtectZones(canvas, faces, Restore.alignFace) : null;
        const { mask, count } = Restore.detectScratches(canvas, s.scratchSensitivity, Restore.protectZones(faces, parsed));
        if (inside) for (let i = 0; i < mask.length; i++) if (inside[i] <= 127) mask[i] = 0;
        if (count) await Restore.inpaint(canvas, mask, (d, t) => Run.progress('restore-scratch', d / t));
        info.push(count ? `${count} Kratzer/Staubstellen aufgefüllt` : 'keine Kratzer gefunden');
      })());
    }
    if (s.restoreFaces) {
      canvas.restoreFaceCount = faces.length;
      await Run.track('restore-faces', Restore.restoreFaces(canvas, faces, s.faceRestoreStrength,
        (d, t) => Run.progress('restore-faces', d / t),
        { model: s.faceRestoreModel === 'codeformer' ? 'codeformer' : 'restoreformer', fidelity: Number(s.faceFidelity) }));
      info.push(faces.length ? `${faces.length} Gesicht${faces.length === 1 ? '' : 'er'} restauriert` : 'kein Gesicht gefunden');
    }
    // Info gehört zum Ergebnis (bei einem Cache-Treffer passt sie so zur angezeigten Restaurierung)
    canvas.restoreInfo = info.join(' · ');
    return canvas;
  }, s);
  if (s.cache === state.cache) {
    state.restoreInfo = restored.restoreInfo || '';
    if (restored.restoreFaceCount != null) state.restoreFaceCount = restored.restoreFaceCount;
  }
  return restored;
}

/** Deckkraft der Maske (0..255) je Pixel in der Größe w × h. */
function maskAlpha(mask, w, h) {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(mask, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return a;
}

async function ensureModelReady(id) {
  const info = state.models.find((m) => m.id === id);
  if (info && info.available) return;
  await ensureModel(id);
}

/**
 * Sparsamere Ausweichmodelle, falls der Speicher nicht reicht: BiRefNet (ca. 6,7 GB) → BEN2
 * (ca. 3 GB, bei sauberen Fotos fast gleich gut) → IS-Net (ca. 0,75 GB).
 */
const SEG_FALLBACK = { birefnet: 'ben2', ben2: 'isnet' };
const SEG_LABEL = { birefnet: '„Motiv – beste Qualität“ (BiRefNet)', ben2: '„Motiv – gut & sparsam“ (BEN2)', isnet: '„Motiv – präzise“ (IS-Net)' };

/**
 * Rohe KI-Maske. Der Hauptprozess hat bei LOW_MEMORY schon alle anderen Modelle freigegeben und
 * den KI-Prozess neu gestartet – reicht es dann immer noch nicht, das nächstsparsamere Modell nehmen.
 */
async function segmentWithFallback(method, bitmap, up, s) {
  let current = method;
  for (;;) {
    try {
      const run = cached(KEYS.seg(current, up), () => AI.segment(current, bitmap), s);
      const raw = await (current === method ? Run.track('seg', run) : run);
      if (current !== method) {
        toast(`Auch nach dem Freigeben aller anderen KI-Modelle reicht der Arbeitsspeicher nicht für ${SEG_LABEL[method]} – es wurde ${SEG_LABEL[current]} verwendet. Andere Programme schließen und erneut versuchen.`);
      }
      return raw;
    } catch (err) {
      const next = SEG_FALLBACK[current];
      if (!next || !isLowMemory(err)) throw err;
      current = next;
      await ensureModelReady(SEG_MODEL[current]);
    }
  }
}

/**
 * Motivmaske für „Himmel entfernen (KI-geschützt)“: BEN2 (bei Speichermangel IS-Net). Steht keine KI
 * zur Verfügung, wird der Himmel ohne Schutz entfernt statt abzubrechen.
 */
async function skyProtectMask(s, bitmap, up) {
  try {
    await ensureModelReady(SEG_MODEL.ben2);
    const raw = await segmentWithFallback('ben2', bitmap, up, s);
    return Segmentation.aiMask(raw, bitmap, 0.5);
  } catch (err) {
    if (isCancelled(err)) throw err;
    console.error(err);
    toast(`KI-Schutz des Motivs nicht möglich (${cleanError(err)}) – Himmel wurde ohne Schutz entfernt.`, true);
    return null;
  }
}

/** Liefert die Freistellmaske (zwischengespeichert) oder null. */
async function ensureMask(s, bitmap) {
  const method = s.bgRemove;
  const key = maskKeyFor(s);
  if (!key) return null;
  if (state.mask && state.mask.key === key) {
    s.maskKey = key;
    return state.mask.canvas;
  }
  const up = maskTag(s);
  const rawKey = rawMaskKeyFor(s);

  let canvas;
  try {
    if (state.maskRaw && state.maskRaw.key === rawKey) {
      canvas = state.maskRaw.canvas; // nur die Verfeinerung hat sich geändert
    } else if (method === 'color') {
      throwIfStale(s);
      canvas = await Run.track('colormask', Pipeline.colorMask(bitmap, s.bgTolerance, s.bgBorder, s.bgSeeds));
    } else if (isSky(method)) {
      throwIfStale(s);
      const protect = method === 'skyai' ? await skyProtectMask(s, bitmap, up) : null;
      throwIfStale(s);
      canvas = await Run.track('colormask', Pipeline.skyMask(bitmap, s.bgTolerance, s.bgSeeds, protect));
    } else {
      await ensureModelReady(SEG_MODEL[method]);
      let raw;
      if (isSam(method)) {
        const impl = SAM_IMPL[method];
        await ensureModelReady(impl.decoder);
        const emb = await Run.track('sam-emb', cached(KEYS.samEmb(up, method), () => impl.embed(bitmap), s));
        const { w, h } = Segmentation.analysisSize(bitmap);
        raw = await Run.track('sam-mask', cached(KEYS.samMask(up, s.samPoints, method), () => impl.mask(emb, s.samPoints, w, h), s));
      } else {
        raw = await segmentWithFallback(method, bitmap, up, s);
      }
      canvas = Segmentation.aiMask(raw, bitmap, s.maskThreshold);
    }
    // Ein veralteter Durchlauf (z. B. nach Bildwechsel) darf die gemeinsame Maske nicht überschreiben
    if (!isStaleRun(s)) state.maskRaw = { key: rawKey, canvas };
    if (maskRefineSig(s)) {
      throwIfStale(s); // ein veralteter Durchlauf darf die Worker-Spur des aktuellen nicht abbrechen
      canvas = await Run.track('maskrefine', Pipeline.refineMask(canvas, maskRefineOpts(s, canvas.width)));
    }
  } catch (err) {
    if (isCancelled(err)) throw err;
    console.error(err);
    toast(`Freistellen fehlgeschlagen: ${cleanError(err)}`, true);
    return null;
  }
  if (!isStaleRun(s)) state.mask = { key, canvas };
  s.maskKey = key; // Schlüssel der Maske, die dieser Durchlauf tatsächlich verwendet
  return canvas;
}

/** Erkennt Schrift im (ggf. vergrößerten) Bild und zeigt die Anzahl der Bereiche an. */
async function detectText(s, bitmap, mask = null) {
  try {
    const maskKey = mask ? s.maskKey : null;
    const key = KEYS.text(upTag(s), maskKey, textSig(s));
    if (!cacheOf(s).has(key)) await ensureModelReady(textModelOf(s));
    const blocks = await Run.track('text', cached(key, () => AI.detectText(mask ? maskedBitmap(bitmap, mask) : bitmap, textOpts(s)), s));
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

/** Bild mit ausgeblendetem Hintergrund (transparent → bei der Erkennung weiß). */
function maskedBitmap(bitmap, mask) {
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0, c.width, c.height);
  return c;
}

/** Erkennt Gesichter im (ggf. vergrößerten) Bild und zeigt die Anzahl an. */
async function detectFaces(s, bitmap, mask = null) {
  try {
    const maskKey = mask ? s.maskKey : null;
    let faces = await Run.track('faces', cached(KEYS.faces(upTag(s), maskKey), () => AI.detectFaces(mask ? maskedBitmap(bitmap, mask) : bitmap), s));
    state.faceCount = faces.length;
    if (s.faceLocate === 'parse' && faces.length) {
      const key = KEYS.faceParts(upTag(s), maskKey);
      if (!cacheOf(s).has(key)) await ensureModelReady('faceparse');
      const found = faces;
      faces = await Run.track('face-parse', cached(key, () => AI.faceParts(bitmap, found), s));
    }
    $('#face-info').textContent = faces.length
      ? `${faces.length} Gesicht${faces.length === 1 ? '' : 'er'} erkannt (im Original orange markiert).`
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
    const raw = await Run.track('contour', cached(KEYS.seg('ai', up), () => AI.segment('ai', bitmap), s));
    return await cached(`contour-mask:${up}`, async () => Segmentation.aiMask(raw, bitmap, 0.5), s);
  } catch (err) {
    if (isCancelled(err)) throw err;
    console.error(err);
    toast(`Motivkontur fehlgeschlagen: ${cleanError(err)}`, true);
    return null;
  }
}

/** Schlüssel der hochaufgelöst nachgezeichneten Gesichter; enthält auch, wo die Gesichter gesucht wurden (vor/nach dem Freistellen). */
function lineFacesKey(lineKey, s, maskKey) {
  const where = s.faceOrder === 'after' && maskKey ? `cut:${maskKey}` : 'all';
  return `${lineKey}:faces:${where}:${s.faceLocate === 'parse' ? 'parse:' : ''}${s.faceStrength}:${s.mouthStrength}:${s.noseStrength}:${s.chinStrength}:${s.cheekStrength}`;
}

// Erste Schätzung der Rechendauer je Tiefenmodell in ms pro Megapixel (aus Messungen hochgerechnet, wird gelernt)
const DEPTH_SEED_MS = { depth: 6000, depth_base: 15000, depth_large: 35000 };
// Reicht der Speicher nicht: nächstkleineres Tiefenmodell
const DEPTH_FALLBACK = { depth_large: 'depth_base', depth_base: 'depth' };

/**
 * KI-Tiefenkarte mit dem gewählten Modell. Reicht der Arbeitsspeicher auch nach dem Freigeben aller
 * anderen Modelle nicht (LOW_MEMORY), wird das nächstkleinere Modell genommen.
 */
async function depthWithFallback(s, bitmap, up) {
  const wanted = AI.depthModel(s.depthModel);
  let model = wanted;
  for (;;) {
    const key = KEYS.depth(up, s.depthRes, model);
    try {
      if (!cacheOf(s).has(key)) await ensureModelReady(model);
      const run = cached(key, () => AI.depthMap(bitmap, Number(s.depthRes), model), s);
      const map = await (model === wanted ? Run.track('depth', run) : run);
      if (model !== wanted) {
        toast(`Zu wenig Arbeitsspeicher für „${MODEL_NAMES[wanted]}“ – es wurde „${MODEL_NAMES[model]}“ verwendet. Andere Programme schließen oder ein geringeres Tiefen-Detail wählen.`);
      }
      return map;
    } catch (err) {
      const next = DEPTH_FALLBACK[model];
      if (!next || !isLowMemory(err)) throw err;
      model = next;
    }
  }
}

/** Bild, das tatsächlich umgewandelt wird: Original, KI-Strichzeichnung oder KI-Tiefenkarte. */
async function contentSource(s, bitmap, mask) {
  const up = upTag(s);
  if (s.mode === 'edges' && s.edgeMethod === 'ai') {
    const key = KEYS.lineart(up, s.lineRes, mask ? s.maskKey : 'none', s.lineStyle);
    if (!cacheOf(s).has(key)) await ensureModelReady(AI.lineModel(s.lineStyle));
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
    const base = await Run.track('lineart', cached(key, () => AI.lineArt(lineInput(), Number(s.lineRes), s.lineStyle), s));
    if (!s.faceBoost || !s.faces.length) return base;
    // Gesichter zusätzlich in hoher Auflösung nachzeichnen
    const facesKey = lineFacesKey(key, s, s.maskKey);
    return Run.track('lineart-faces', cached(facesKey, () =>
      AI.enhanceFacesLineArt(lineInput(), base, s.faces, s.faceStrength, Processing.faceFeatureLevels(s), s.lineStyle), s));
  }
  if (smoothUpscaleApplies(s, bitmap)) {
    const key = KEYS.smooth(up);
    if (!cacheOf(s).has(key)) await ensureModelReady('esrgan');
    return Run.track('upscale-smooth', cached(key, () =>
      AI.upscale(bitmap, (done, total) => Run.progress('upscale-smooth', done / total)), s));
  }
  if (s.mode === 'relief') return depthWithFallback(s, bitmap, up);
  return bitmap;
}

/** Zeigt im Original-Fenster das freigestellte Bild bzw. das unveränderte Original. */
async function updateOriginalView(s, mask, base = state.source.bitmap) {
  const markers = []; // Klickpunkte zeichnet die Marker-Ebene (renderMarkers) – immer gleich groß
  const boxes = s.textBlocks || [];
  // erkannte Gesichter: nur als Hinweis in der Vorschau (nur der Rahmen, keine weiteren Daten)
  const faceBoxes = (s.faces || []).map((f) => ({ x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2 }));
  const hideBg = ui.hideBackground;
  const key = `${mask ? s.maskKey : 'plain'}|${JSON.stringify(markers)}|${JSON.stringify(boxes)}|${JSON.stringify(faceBoxes)}|${restoreKey(s)}|${hideBg}`;
  if (state.originalViewKey === key) {
    state.originalViewPending = null; // eine noch laufende, andere Ansicht ist überholt
    return;
  }
  const img = $('#img-original');
  const source = state.source;
  if (!mask && !markers.length && !boxes.length && !faceBoxes.length && base === source.bitmap) {
    state.originalViewPending = null;
    state.originalViewKey = key;
    if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
    state.originalUrl = null;
    img.src = source.url;
    $('#pane-original').classList.remove('checker');
    return;
  }
  // Ansicht ist nur eine Vorschau: Fehler hier dürfen die Umwandlung nicht scheitern lassen.
  // Der Schlüssel wird erst nach Erfolg gesetzt – sonst würde ein abgebrochener Aufbau nie wiederholt.
  state.originalViewPending = key;
  let png;
  try {
    png = await Pipeline.cutout(base, mask, markers, boxes, hideBg, faceBoxes);
  } catch (err) {
    if (!isCancelled(err)) console.error('Vorschau des Originals fehlgeschlagen:', err);
    return;
  }
  // inzwischen neues Bild oder neuere Ansicht angefordert → dieses Ergebnis verwerfen
  if (state.source !== source || state.originalViewPending !== key) return;
  if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  state.originalUrl = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
  state.originalViewKey = key;
  img.src = state.originalUrl;
  $('#pane-original').classList.toggle('checker', !!mask && hideBg);
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

/* ------------------------------------------------------------------ */
/* Leistung: GPU & Festplatten-Cache                                  */
/* ------------------------------------------------------------------ */

function renderPerf(p) {
  if (!p) return;
  const gpu = $('#perf-gpu');
  gpu.checked = !!p.gpu && !!p.gpuAvailable;
  gpu.disabled = !p.gpuAvailable;
  $('#perf-cache').checked = !!p.diskCache;
  $('#perf-cache-info').textContent = p.cache.count
    ? `Cache: ${fmtMB(p.cache.bytes)} (${p.cache.count} Ergebnisse)`
    : 'Cache: leer';
  $('#btn-perf-cache-clear').disabled = !p.cache.count;
  const used = Object.entries(p.devices);
  const name = (id) => MODEL_NAMES[id] || id;
  let info;
  if (!p.gpuAvailable) info = 'Für dieses System gibt es keine GPU-Beschleunigung – die KI rechnet auf dem Prozessor.';
  else if (!p.gpu) info = `GPU-Beschleunigung ist ausgeschaltet – verfügbar: ${p.gpuAvailable}.`;
  else {
    const onGpu = used.filter(([, d]) => d === 'gpu').map(([id]) => name(id));
    info = `GPU: ${p.gpuAvailable}.` + (onGpu.length ? ` Auf der GPU: ${onGpu.join(', ')}.` : ' Noch kein Modell gelaufen.');
    if (p.cpuOnly.length) info += ` Auf dem Prozessor (GPU nicht unterstützt): ${p.cpuOnly.map(name).join(', ')}.`;
  }
  $('#perf-info').textContent = info;
  const gpuShort = !p.gpuAvailable ? 'Prozessor' : p.gpu ? 'GPU an' : 'GPU aus';
  const cacheShort = !p.diskCache ? 'Cache aus' : p.cache.count ? `Cache ${fmtMB(p.cache.bytes)}` : 'Cache leer';
  $('#perf-summary').textContent = `${gpuShort} · ${cacheShort}`;
}

async function refreshPerf() {
  try { renderPerf(await window.api.perf.status()); } catch { /* ignorieren */ }
}

function bindPerf() {
  $('#btn-perf').addEventListener('click', () => {
    refreshPerf(); // aktuelle Cache-Größe und genutzte Geräte
    $('#perf-dialog').showModal();
  });
  $('#perf-gpu').addEventListener('change', async (e) => {
    // KI-Prozess startet neu (laufende Berechnung wird abgebrochen) → danach neu umwandeln
    renderPerf(await window.api.perf.set({ gpu: e.target.checked }));
    toast(e.target.checked ? 'GPU-Beschleunigung eingeschaltet' : 'GPU-Beschleunigung ausgeschaltet');
    if (state.source) scheduleProcess(0);
  });
  $('#perf-cache').addEventListener('change', async (e) => {
    renderPerf(await window.api.perf.set({ diskCache: e.target.checked }));
  });
  $('#btn-perf-cache-clear').addEventListener('click', async () => {
    renderPerf(await window.api.perf.clearCache());
    toast('Cache geleert');
  });
}

/** Stellt sicher, dass ein Modell vorhanden ist (lädt es bei Bedarf mit Fortschrittsanzeige). */
async function ensureModel(id) {
  state.cancelledAt = 0; // neu angestoßener Download: Fortschritt wieder anzeigen
  const info = state.models.find((m) => m.id === id);
  if (info && !info.available && info.downloadable) {
    showProgress(`Lade Modell „${MODEL_NAMES[id] || id}“ (${fmtMB(info.size)}) …`, 0);
  }
  try {
    await window.api.models.ensure(id);
  } finally {
    // abgebrochene/fehlgeschlagene Downloads senden kein „done“ – Eintrag hier aufräumen
    downloadStarts.delete(id);
    Run.downloading = downloadStarts.size > 0;
  }
  if (info && !info.available) await refreshModels();
}

/** Gruppen im Modell-Dialog (Reihenfolge = Anzeige); nicht aufgeführte Modelle landen unter „Weitere“. */
const MODEL_GROUPS = [
  ['Freistellen', ['u2netp', 'isnet', 'birefnet', 'ben2', 'modnet', 'sam_encoder', 'sam2_encoder']],
  ['Strichzeichnung', ['lineart', 'lineart_contour', 'lineart_sketch', 'lineart_portrait', 'lineart_teed']],
  ['Restaurieren & Verbessern', ['scunet', 'lama', 'restoreformer', 'codeformer', 'yunet', 'esrgan']],
  ['Erkennung & Relief', ['faces', 'faceparse', 'text', 'text_v5', 'text_v5_server', 'depth', 'depth_base', 'depth_large']],
];
// Teilmodelle, die mit ihrem Hauptmodell geladen und entfernt werden
const MODEL_HIDDEN = new Set(['sam_decoder', 'sam2_decoder']);
const modelsLoading = new Set(); // ids, deren Download aus dem Dialog läuft

function renderModels() {
  const models = state.models.filter((m) => !MODEL_HIDDEN.has(m.id));
  const extra = models.filter((m) => !m.bundled);
  const installed = extra.filter((m) => m.available);
  const usedMB = installed.reduce((sum, m) => sum + (m.size || 0), 0);
  const summary = extra.length
    ? `${installed.length} von ${extra.length} Zusatzmodellen installiert${installed.length ? ` (${fmtMB(usedMB)})` : ''}`
    : '';
  $('#models-summary').textContent = summary;
  $('#models-dialog-summary').textContent = summary ? `${summary} · ${models.length - extra.length} mitgeliefert` : '';

  const root = $('#model-list');
  root.replaceChildren();
  const byId = new Map(models.map((m) => [m.id, m]));
  const grouped = new Set();
  const groups = MODEL_GROUPS.map(([title, ids]) => {
    const list = ids.map((id) => byId.get(id)).filter(Boolean);
    list.forEach((m) => grouped.add(m.id));
    return [title, list];
  });
  groups.push(['Weitere', models.filter((m) => !grouped.has(m.id))]);

  for (const [title, list] of groups) {
    if (!list.length) continue;
    const sec = document.createElement('section');
    sec.className = 'model-group';
    const h = document.createElement('h3');
    h.textContent = title;
    const ul = document.createElement('ul');
    ul.className = 'model-list';
    for (const m of list) ul.append(modelRow(m, title));
    sec.append(h, ul);
    root.append(sec);
  }
}

/** Anzeigename im Dialog: Gruppenname und technische Zusätze weglassen („Freistellen – schnell“ → „schnell“). */
function modelDisplayName(m, group) {
  let name = m.label.replace(' – Encoder', '');
  const prefix = `${group} – `;
  if (name.startsWith(prefix)) name = name.slice(prefix.length);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function modelRow(m, group = '') {
  const li = document.createElement('li');
  li.className = 'model-row' + (m.available ? ' is-installed' : '');

  const info = document.createElement('div');
  info.className = 'model-info';
  const name = document.createElement('div');
  name.className = 'model-name';
  name.textContent = modelDisplayName(m, group);
  const meta = document.createElement('div');
  meta.className = 'model-meta';
  const lic = document.createElement('span');
  lic.className = 'model-license' + (m.nc ? ' nc' : '');
  lic.textContent = `Lizenz ${m.license}`;
  if (m.nc) lic.title = 'Nicht-kommerzielle Lizenz: nur für private bzw. nicht-kommerzielle Zwecke. Wird nicht mitgeliefert, sondern bei Bedarf direkt von der Quelle geladen.';
  meta.append(lic);
  if (m.size) meta.append(` · ${fmtMB(m.size)}`);
  const peak = state.sys?.modelPeakMB?.[m.id];
  if (peak && peak >= 1000) {
    const req = document.createElement('span');
    req.className = 'model-req' + (state.sys && peak > state.sys.totalMB * 0.6 ? ' warn' : '');
    req.textContent = ` · braucht ca. ${fmtGB(peak)} RAM`;
    meta.append(req);
  }
  info.append(name, meta);

  const actions = document.createElement('div');
  actions.className = 'model-actions';
  const badge = document.createElement('span');
  badge.className = 'model-badge';
  if (m.bundled) {
    badge.textContent = 'mitgeliefert';
    actions.append(badge);
  } else if (m.available) {
    badge.textContent = 'installiert';
    badge.classList.add('ok');
    const del = document.createElement('button');
    del.className = 'btn btn-small btn-ghost';
    del.textContent = 'Entfernen';
    del.addEventListener('click', async () => {
      if (!confirm(`„${m.label}“ entfernen? Es wird bei Bedarf erneut geladen (${fmtMB(m.size)}).`)) return;
      del.disabled = true;
      state.models = await window.api.models.remove(m.id);
      state.cache = new Map();
      state.mask = null;
      state.maskRaw = null;
      renderModels();
    });
    actions.append(badge, del);
  } else {
    const loading = modelsLoading.has(m.id);
    const dl = document.createElement('button');
    dl.className = 'btn btn-small';
    dl.textContent = loading ? 'Lädt …' : 'Laden';
    dl.disabled = loading;
    dl.addEventListener('click', async () => {
      modelsLoading.add(m.id);
      renderModels();
      try {
        await ensureModel(m.id);
        toast(`Modell „${m.label}“ installiert`);
      } catch (err) {
        if (!isCancelled(err)) toast(`Download fehlgeschlagen: ${cleanError(err)}`, true);
      } finally {
        modelsLoading.delete(m.id);
        hideProgress();
        refreshModels();
      }
    });
    actions.append(dl);
  }
  li.append(info, actions);
  return li;
}

function bindModelsDialog() {
  const dlg = $('#models-dialog');
  $('#btn-models').addEventListener('click', () => {
    renderModels();
    $('#models-dialog-system').textContent = $('#system-info').textContent;
    dlg.showModal();
  });
}

/* ------------------------------------------------------------------ */
/* Webcam-Aufnahme                                                    */
/* ------------------------------------------------------------------ */

const CAMERA_PREF_KEY = 'pic2laser.cameraDevice';

function cameraErrorText(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Kein Zugriff auf die Kamera. Bitte in den Datenschutz-Einstellungen des Systems für Pic2Laser erlauben.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Keine Kamera gefunden.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Die Kamera lässt sich nicht starten – vielleicht benutzt sie gerade ein anderes Programm.';
    default:
      return `Kamera konnte nicht gestartet werden${err?.message ? ` (${err.message})` : ''}.`;
  }
}

function bindCameraDialog() {
  const dlg = $('#camera-dialog');
  const video = $('#camera-video');
  const msg = $('#camera-msg');
  const select = $('#camera-device');
  const info = $('#camera-info');
  const captureBtn = $('#camera-capture');
  const view = dlg.querySelector('.camera-view');
  let stream = null;
  let token = 0; // verwirft Streams, die erst nach dem Schließen/Umschalten fertig werden

  const savedDevice = () => { try { return localStorage.getItem(CAMERA_PREF_KEY) || ''; } catch { return ''; } };
  const saveDevice = (id) => { try { localStorage.setItem(CAMERA_PREF_KEY, id); } catch { /* egal */ } };

  function stop() {
    token++;
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null;
    video.srcObject = null;
    captureBtn.disabled = true;
    info.textContent = '';
  }

  async function listDevices() {
    let cams = [];
    try {
      cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    } catch { /* ohne Liste geht es mit der Standardkamera weiter */ }
    const current = stream?.getVideoTracks()[0]?.getSettings().deviceId || savedDevice();
    select.replaceChildren(...cams.map((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `Kamera ${i + 1}`;
      return o;
    }));
    if (cams.some((d) => d.deviceId === current)) select.value = current;
    select.hidden = cams.length < 2;
  }

  async function start(deviceId) {
    stop();
    const my = token;
    msg.textContent = 'Kamera wird gestartet …';
    try {
      // Möglichst hohe Auflösung anfordern – die Kamera liefert das Beste, was sie kann
      const constraints = { width: { ideal: 3840 }, height: { ideal: 2160 } };
      if (deviceId) constraints.deviceId = { exact: deviceId };
      let s;
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
      } catch (err) {
        // Gespeicherte Kamera nicht mehr da → Standardkamera
        if (!deviceId || (err.name !== 'NotFoundError' && err.name !== 'OverconstrainedError')) throw err;
        delete constraints.deviceId;
        s = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
      }
      if (my !== token || !dlg.open) { for (const t of s.getTracks()) t.stop(); return; }
      stream = s;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (stream === s) { stop(); msg.textContent = 'Die Kamera wurde getrennt.'; }
      });
      video.srcObject = stream;
      await listDevices();
    } catch (err) {
      if (my !== token) return;
      msg.textContent = cameraErrorText(err);
    }
  }

  video.addEventListener('loadedmetadata', () => {
    if (!stream || !video.videoWidth) return;
    msg.textContent = '';
    view.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    info.textContent = `${video.videoWidth} × ${video.videoHeight} px`;
    captureBtn.disabled = false;
  });

  async function capture() {
    if (captureBtn.disabled || !video.videoWidth) return;
    captureBtn.disabled = true;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const flash = $('#camera-flash');
    flash.classList.remove('on');
    void flash.offsetWidth; // Animation neu starten
    flash.classList.add('on');
    // PNG: verlustfrei, das Originalbild soll keine zusätzlichen JPEG-Artefakte bekommen
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      toast('Die Aufnahme konnte nicht gespeichert werden.', true);
      captureBtn.disabled = false;
      return;
    }
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = `kamera-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      + `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    dlg.close();
    await loadImage(name, bytes);
  }

  async function open(e) {
    e?.preventDefault();
    if (dlg.open) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Kamerazugriff wird hier nicht unterstützt.', true);
      return;
    }
    view.style.aspectRatio = '';
    select.hidden = true;
    dlg.showModal();
    msg.textContent = 'Kamera wird gestartet …';
    const allowed = await window.api.cameraAccess().catch(() => true);
    if (!dlg.open) return;
    if (!allowed) {
      msg.textContent = cameraErrorText({ name: 'NotAllowedError' });
      return;
    }
    await start(savedDevice());
  }

  select.addEventListener('change', () => {
    saveDevice(select.value);
    start(select.value);
  });
  navigator.mediaDevices?.addEventListener?.('devicechange', () => {
    if (!dlg.open) return;
    if (stream) listDevices();
    else start(savedDevice()); // z. B. Kamera erst nach dem Öffnen eingesteckt
  });
  captureBtn.addEventListener('click', capture);
  dlg.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      capture();
    }
  });
  dlg.addEventListener('close', stop);
  $('#btn-camera').addEventListener('click', open);
  $('#drop-camera').addEventListener('click', open);
}

/** Gemeinsames Verhalten aller Dialoge: [data-close] und Klick auf den abgedunkelten Hintergrund schließen. */
function bindDialogs() {
  for (const dlg of $$('dialog.dialog')) {
    for (const btn of dlg.querySelectorAll('[data-close]')) btn.addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
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
  // Nachzügler eines abgebrochenen Downloads (Main hat sie vor dem Abbruch abgeschickt) ignorieren
  if (state.cancelledAt && performance.now() - state.cancelledAt < 1500) return;
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
/**
 * Index des Klickpunkts unter dem Mauszeiger (oder −1). Die Trefferfläche entspricht
 * der Größe des gezeichneten Markers (Segmentation.drawMarkers), mindestens 10 px.
 */
function markerAt(img, e, points) {
  if (!points || !points.length) return -1;
  const rect = img.getBoundingClientRect();
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (!nw || !nh) return -1;
  const scale = Math.min(rect.width / nw, rect.height / nh);
  const dw = nw * scale, dh = nh * scale;
  const ox = rect.left + (rect.width - dw) / 2;
  const oy = rect.top + (rect.height - dh) / 2;
  const radius = 13; // Marker sind 18 px groß (Marker-Ebene), etwas großzügiger treffen
  let best = -1, bestDist = Infinity;
  points.forEach((p, i) => {
    const d = Math.hypot(ox + p.x * dw - e.clientX, oy + p.y * dh - e.clientY);
    if (d <= radius && d < bestDist) { best = i; bestDist = d; }
  });
  return best;
}

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

/** Dateiname (ohne Endung) für Export, Herausziehen, LightBurn und Stickdateien: Name des geöffneten
 * Historie-Eintrags (auch nach dem Umbenennen), sonst der Name der Bilddatei. */
function baseName() {
  if (!state.source) return 'bild';
  if (state.historyId && state.historyName) return state.historyName;
  return state.source.name.replace(/\.[^.]+$/, '') || 'bild';
}

/**
 * Rasterbild des Ergebnisses – mit Umrisslinie, falls aktiv. Das Bild wird dann um den
 * Rand der Umrisslinie erweitert (gleiche Größe und Lage wie das SVG). In Bildern ist die
 * Linie schwarz (1-Bit-Formate kennen keine Farbe), mind. 0,2 mm breit.
 */
function rasterCanvas(r, transparent) {
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

async function buildRasterFiles(r, formats) {
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

/* ------------------------------------------------------------------ */
/* Drag & Drop des Ergebnisses                                        */
/* ------------------------------------------------------------------ */

let dragReady = false;
let dragTimer = null;

/** Bereitet die Dateien zum Herausziehen vor (gewählte Exportformate), im Hintergrund. */
function scheduleDragPrepare(delay = 250) {
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
      console.error(err);
    }
  }, delay);
}

/**
 * Dateien zum Herausziehen bzw. Senden an LightBurn: gewählte Exportformate, ohne Auswahl das SVG.
 * embroidery: auch PES/DST/EXP (nur beim Herausziehen – LightBurn kann damit nichts anfangen).
 */
async function handoverFiles(r, s, embroidery = false, lightburn = false) {
  const files = [];
  const emb = embroidery ? embroideryFiles(r, s) : [];
  // LightBurn: jede Ebene in eigener LightBurn-Farbe (sonst landen gleiche/ähnliche Farben in einer Ebene)
  if (s.fmtSvg || (!laserFormats(s) && !emb.length)) files.push({ ext: 'svg', data: lightburn ? lightBurnSvg(r) : r.svg });
  files.push(...(await buildRasterFiles(r, { png: s.fmtPng, jpg: s.fmtJpg, bmp: s.fmtBmp })));
  files.push(...emb);
  return files;
}

/** Kleine Info im Ergebnisfeld: herausziehbar, welche Dateien, welche Größe. */
function renderResultInfo(exts) {
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
const origDrag = { ready: false, key: null, timer: null, info: null };
const MOD_KEY = /Mac/.test(navigator.platform) ? '⌘' : 'Strg';

function resetOriginalDrag() {
  clearTimeout(origDrag.timer);
  Object.assign(origDrag, { ready: false, key: null, info: null });
  renderOriginalInfo();
}

/** Bereitet das optimierte Original als PNG zum Herausziehen vor (im Hintergrund, nur bei Änderungen). */
function scheduleOriginalDrag(s, work, mask) {
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
function renderOriginalInfo() {
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
async function dragIcon(r) {
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
async function cancelAll() {
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

function bindCancel() {
  $('#btn-cancel').addEventListener('click', cancelAll);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('dialog[open]')) return; // Esc schließt nur den Dialog, Berechnungen/Downloads laufen weiter
    const busy = $('#busy').classList.contains('on') || !$('#progress').hidden;
    if (busy) { e.preventDefault(); cancelAll(); }
  });
}

function bindOriginalDrag() {
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

function bindResultDrag() {
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

async function exportCurrent() {
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
  // PES/DST/EXP nicht möglich (falscher Modus, leer, zu groß): melden, die übrigen Formate trotzdem speichern
  const embProblem = embroideryProblem(r, s);
  if (embProblem && !laserFormats(s)) return toast(embProblem, true);

  let written;
  try {
    const files = [];
    if (s.fmtSvg) files.push({ ext: 'svg', data: r.svg });
    files.push(...(await buildRasterFiles(r, { png: s.fmtPng, jpg: s.fmtJpg, bmp: s.fmtBmp })));
    files.push(...embroideryFiles(r, s));
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
function lightBurnSvg(r) {
  if (r.svgLightBurn) return r.svgLightBurn;
  if (r.mode !== 'color') return r.svg;
  const layers = svgLayersOf(r.svg, r.w, r.h, { label: 'Ergebnis', id: 'farbe', widthMm: r.widthMm, isColor: true });
  if (layers.filter((l) => l.fromColor).length < 2) return r.svg;
  r.svgLightBurn = Encoders.svgDocument({ w: r.w, h: r.h, widthMm: r.widthMm, layers: lightBurnLayers(layers), outline: r.outline });
  return r.svgLightBurn;
}

let lightburnBusy = false;

async function sendToLightBurn() {
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

async function makeThumb(r) {
  const { canvas: full, w: fw, h: fh } = rasterCanvas(r, false); // inkl. Umrisslinie
  const scale = Math.min(1, 240 / Math.max(fw, fh));
  const tw = Math.max(1, Math.round(fw * scale));
  const th = Math.max(1, Math.round(fh * scale));
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
      // Einstellungen, mit denen dieses Ergebnis berechnet wurde (nicht die eventuell schon geänderten)
      settings: { ...(r.settings || state.settings), ...outputPrefs(state.settings) },
      merge: r.merge || null, // mit welchem Eintrag dieses Ergebnis vereinigt wurde
      svg: r.svg,
      raster: rasterFiles[0],
      thumb,
      width: r.w,
      height: r.h,
    });
    state.historyId = meta.id;
    state.historyName = meta.name || null;
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
const nameCollator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
const HISTORY_SORTS = ['date-desc', 'date-asc', 'name-asc', 'name-desc'];

/** Historie nach der gewählten Reihenfolge sortieren (Datum = zuletzt gespeichert, wie angezeigt). */
function sortHistory(items) {
  const sort = HISTORY_SORTS.includes(ui.historySort) ? ui.historySort : 'date-desc';
  const date = (e) => e.updated || e.created || 0;
  const byName = (a, b) => nameCollator.compare(a.name || '', b.name || '');
  const cmp = {
    'date-desc': (a, b) => date(b) - date(a),
    'date-asc': (a, b) => date(a) - date(b),
    'name-asc': (a, b) => byName(a, b) || date(b) - date(a),
    'name-desc': (a, b) => byName(b, a) || date(b) - date(a),
  }[sort];
  return [...items].sort(cmp);
}

// Eintrag, dessen Name gerade bearbeitet wird – übersteht ein Neuzeichnen der Liste
let historyRename = null; // { id, value, fresh }

function startRename(e) {
  historyRename = { id: e.id, value: e.name || '', fresh: true };
  renderHistory();
}

/** Eingabefeld für den Namen (Enter oder Klick daneben übernimmt, Esc bricht ab). */
function renameInput(e) {
  const r = historyRename;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'name-edit';
  input.value = r.value;
  input.maxLength = 200;
  const finish = async (save) => {
    if (historyRename !== r) return; // schon erledigt
    historyRename = null;
    const name = input.value.trim();
    if (!save || !name || name === e.name) { renderHistory(); return; }
    try {
      await window.api.history.rename(e.id, name);
      if (state.merge?.id === e.id) { state.merge.name = name; renderMergePanel(); }
      if (state.historyId === e.id) {
        // geöffneter Eintrag: exportierte Dateien heißen ab jetzt so (auch die schon vorbereiteten zum Herausziehen)
        state.historyName = name;
        if (state.result) scheduleDragPrepare();
      }
      await refreshHistory();
    } catch (err) {
      toast(`Umbenennen fehlgeschlagen: ${cleanError(err)}`, true);
      renderHistory();
    }
  };
  input.addEventListener('input', () => { r.value = input.value; });
  input.addEventListener('keydown', (ev) => {
    ev.stopPropagation(); // keine Tastenkürzel der App beim Tippen
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => { if (input.isConnected) finish(true); });
  for (const type of ['click', 'dblclick', 'pointerdown']) input.addEventListener(type, (ev) => ev.stopPropagation());
  requestAnimationFrame(() => {
    if (!input.isConnected) return;
    input.focus();
    if (r.fresh) input.select();
    r.fresh = false;
  });
  return input;
}

function renderHistory() {
  const list = $('#history-list');
  const q = $('#history-search').value.trim().toLowerCase();
  const items = sortHistory(state.history).filter((e) => !q || (e.name || '').toLowerCase().includes(q) || (e.originalName || '').toLowerCase().includes(q));
  list.replaceChildren();
  $('#history-empty').hidden = state.history.length > 0;

  for (const e of items) {
    const li = document.createElement('li');
    li.className = 'history-item' + (e.id === state.historyId ? ' active' : '') + (e.id === state.merge?.id ? ' merged' : '');
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
    if (historyRename?.id === e.id) {
      name.append(renameInput(e));
    } else {
      name.textContent = e.name || 'Bild';
      name.title = 'Doppelklick zum Umbenennen';
      name.addEventListener('dblclick', (ev) => { ev.stopPropagation(); startRename(e); });
    }
    const meta = document.createElement('div');
    meta.className = 'meta';
    const mode = { dither: 'Foto', edges: 'Linien', relief: 'Relief', sine: 'Wellen', color: 'Farben' }[e.settings?.mode] || 'Fläche';
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
      iconButton('✎', 'Umbenennen', () => startRename(e)),
      iconButton('⧉', 'Duplizieren', async () => {
        try {
          await window.api.history.duplicate(e.id);
          await refreshHistory();
          toast(`„${e.name}“ dupliziert`);
        } catch (err) {
          toast(`Duplizieren fehlgeschlagen: ${cleanError(err)}`, true);
        }
      }),
      mergeButton(e),
      iconButton('📁', 'Speicherordner öffnen', async () => {
        try {
          const r = await window.api.history.openFolder(e.id);
          if (r?.error) toast(`Ordner ließ sich nicht direkt öffnen (${r.error}) – versuche Dateimanager: ${r.dir}`, true);
        } catch (err) {
          toast(`Speicherordner öffnen fehlgeschlagen: ${cleanError(err)}`, true);
        }
      }),
      iconButton('✕', 'Aus Historie löschen', async () => {
        if (!confirm(`„${e.name}“ aus der Historie löschen?`)) return;
        await window.api.history.remove(e.id);
        if (state.historyId === e.id) state.historyId = null;
        await refreshHistory();
      }),
    );

    li.append(thumb, info, actions);
    li.addEventListener('click', (ev) => {
      if (ev.detail > 1 || historyRename) return; // Doppelklick (Umbenennen) öffnet nicht ein zweites Mal
      openHistoryEntry(e.id);
    });
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
    // gespeichertes Ergebnisbild parallel laden und sofort zeigen – die Neuberechnung läuft dahinter
    const preview = window.api.history.loadPreview(id).catch(() => null);
    const { meta, original } = await window.api.history.load(id);
    await loadImage(meta.originalName || `${meta.name}.png`, new Uint8Array(original), {
      historyId: id,
      settings: meta.settings,
    });
    if (state.historyId === id) state.historyName = meta.name || null;
    const source = state.source;
    preview.then((p) => {
      // nur, solange dieser Eintrag offen ist und noch kein frisches Ergebnis vorliegt
      if (!p || state.source !== source || state.historyId !== id || state.result) return;
      showResult(new Blob([p.data], { type: p.type }), p.type === 'image/png' && meta.settings?.mode === 'dither');
    });
    // war das Ergebnis mit einem anderen Eintrag vereinigt: wiederherstellen
    if (meta.merge && state.historyId === id) {
      try {
        const layer = await loadMergeLayer(meta.merge.id);
        if (state.source !== source) return; // inzwischen anderes Bild geöffnet
        setMerge({ ...layer, top: meta.merge.top, opacity: meta.merge.opacity });
      } catch {
        if (state.source === source) toast(`Der damit vereinigte Eintrag „${meta.merge.name || '?'}“ ist nicht mehr in der Historie.`, true);
      }
    }
  } catch (err) {
    console.error(err);
    toast('Eintrag konnte nicht geladen werden.', true);
  }
}

/* ------------------------------------------------------------------ */
/* Mit einem Historie-Eintrag vereinigen                              */
/* ------------------------------------------------------------------ */

/*
 * Das aktuelle Ergebnis (state.baseResult) und das gespeicherte Ergebnis eines Historie-Eintrags
 * werden übereinandergelegt: Weiß ist durchsichtig, die obere Ebene wird mit der Deckkraft
 * („Überblenden“) abgeschwächt. Ändert sich eine Einstellung, rechnet runProcess das aktuelle
 * Ergebnis neu und vereinigt am Ende wieder (composeMerged); Reihenfolge und Deckkraft ändern nur
 * die Vereinigung, ohne neue Umwandlung.
 */

let mergeSeq = 0; // jede Vereinigung bekommt eine Nummer; nur die neueste darf ihr Ergebnis zeigen
let mergeRev = 0; // Stand der Vereinigen-Einstellungen (Reihenfolge, Deckkraft, Eintrag)
let mergeTimer = null;

const isRasterMode = (mode) => mode === 'dither' || mode === 'relief';

/** Ergebnis anzeigen und für Export, Herausziehen und Historie bereitstellen. */
function publishResult(r, rev = mergeRev) {
  state.result = r;
  if (rev === mergeRev) state.mergePending = false;
  scheduleDragPrepare();
  showPreview(r);
}

/** Vorschau des Ergebnisses: Flächen bzw. mit „Stiche in der Vorschau zeigen“ die geplanten Stiche. */
async function showPreview(r) {
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
async function composeMerged(inRun = false) {
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
async function composeColorMerge(base, m, top, opacity, stale, rev) {
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
    outlineOnly: false,
    merge: { id: m.id, name: m.name, top, opacity },
  }, rev);
  renderMergePanel();
}

/**
 * Ebenenfarben von LightBurn (00–29). LightBurn ordnet importierte Farben der nächstliegenden Ebenenfarbe
 * zu – zwei ähnliche Farben landeten sonst in einer Ebene.
 */
const LIGHTBURN_COLORS = [
  '#000000', '#0000ff', '#ff0000', '#00e000', '#d0d000', '#ff8000', '#00e0e0', '#ff00ff', '#b4b4b4', '#0000a0',
  '#a00000', '#00a000', '#a0a000', '#c08000', '#00a0ff', '#a000a0', '#808080', '#7d87b9', '#bb7784', '#4a6fe3',
  '#d33f6a', '#8cd78c', '#f0b98d', '#f6c4e1', '#fa9ed4', '#500a78', '#b45a00', '#004754', '#86fa88', '#ffdb66',
];

const hexRgb = (hex) => {
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
function lightBurnLayers(layers) {
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
function svgLayersOf(svg, w, h, { label, prefix = '', id, widthMm, isColor = false, color = null }) {
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
function mergeLayers(base, m, top, opacity, topImageB64) {
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
async function rasterizeLayers(layers, w, h) {
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
function mergeEmbColors(layers) {
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

/* ------------------------------------------------------------------ */
/* Modus Farben: Farbliste                                            */
/* ------------------------------------------------------------------ */

/**
 * Bearbeitung einer Farbe ändern (Schlüssel: from = ursprüngliche Bildfarbe). patch-Werte
 * undefined entfernen den Eintrag; leere Bearbeitungen fallen weg.
 */
function editColor(from, patch) {
  const edits = (state.settings.colorEdits || []).map((e) => ({ ...e }));
  let e = edits.find((x) => x.from === from);
  if (!e) edits.push((e = { from }));
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') delete e[k];
    else e[k] = v;
  }
  setSetting('colorEdits', edits.filter((x) => Object.keys(x).length > 1));
}

/** Liste der Farbebenen (Reihenfolge = Ebenen im SVG bzw. Stickreihenfolge, von unten nach oben). */
function renderColorList() {
  const box = $('#color-list');
  const r = state.baseResult;
  const layers = r && r.mode === 'color' ? r.colorLayers || [] : [];
  box.textContent = '';
  $('#btn-color-reset').disabled = !(state.settings.colorEdits || []).length;
  if (!layers.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = r && r.mode === 'color' ? 'Keine Farben gefunden.' : 'Die Farben erscheinen nach der Umwandlung.';
    box.append(p);
    return;
  }
  let n = 0;
  for (const l of layers) {
    const row = document.createElement('div');
    row.className = 'color-row' + (l.off ? ' off' : '');

    const on = document.createElement('input');
    on.type = 'checkbox';
    on.checked = !l.off;
    on.title = l.off ? 'Farbe ausgeben' : 'Farbe weglassen (z. B. Stofffarbe)';
    on.addEventListener('change', () => editColor(l.from, { off: on.checked ? undefined : true }));

    const pick = document.createElement('input');
    pick.type = 'color';
    pick.value = l.hex;
    pick.title = state.settings.colorPalette === 'image' ? 'Farbe ändern' : 'Farbe ändern (rastet auf das nächste Garn ein)';
    pick.addEventListener('change', () => editColor(l.from, { to: pick.value }));

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = `${l.off ? '–' : ++n} · ${l.name}`;
    name.title = `${l.name} ${l.hex}${l.merged.length ? ` – zusammengeführt mit ${l.merged.length} weiteren Farbe(n)` : ''}`;

    const pct = document.createElement('span');
    pct.className = 'pct';
    const share = l.share * 100;
    pct.textContent = share < 0.1 ? '< 0,1 %' : `${share.toFixed(share < 10 ? 1 : 0).replace('.', ',')} %`;

    const into = document.createElement('select');
    into.title = 'Mit einer anderen Farbe zusammenführen';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '⇢';
    into.append(opt0);
    for (const o of layers) {
      if (o === l) continue;
      const opt = document.createElement('option');
      opt.value = o.from;
      opt.textContent = `→ ${o.name}`;
      into.append(opt);
    }
    into.addEventListener('change', () => into.value && editColor(l.from, { into: into.value }));

    const tools = [on, pick, name, pct, into];
    const edited = l.edited || l.merged.length;
    if (edited) {
      const undo = document.createElement('button');
      undo.className = 'btn btn-small icon';
      undo.textContent = '↺';
      undo.title = 'Änderungen an dieser Farbe zurücknehmen (auch Zusammenführen)';
      undo.addEventListener('click', () => {
        const all = [l.from, ...l.merged];
        setSetting('colorEdits', (state.settings.colorEdits || []).filter((e) => !all.includes(e.from)));
      });
      tools.push(undo);
    }
    row.append(...tools);
    box.append(row);
  }
}

/** Vereinigen-Einstellung geändert: neu vereinigen (nach einer laufenden Umwandlung). */
function scheduleMerge(delay = 60) {
  mergeRev++;
  state.mergePending = true;
  dragReady = false; // bis zum neuen Ergebnis nicht das veraltete herausziehen
  clearTimeout(mergeTimer);
  const tick = () => {
    if (!state.mergePending) return; // schon von runProcess erledigt
    if (state.processing) { mergeTimer = setTimeout(tick, 150); return; }
    composeMerged();
  };
  mergeTimer = setTimeout(tick, delay);
}

/** Gespeichertes Ergebnis eines Historie-Eintrags als Ebene laden. */
async function loadMergeLayer(id) {
  const { meta, svg } = await window.api.history.loadResult(id);
  const st = meta.settings || {};
  return { id, name: meta.name || 'Bild', svg, mode: st.mode || 'vector', widthMm: st.widthMm || 100, ditherAlgo: st.ditherAlgo || 'floyd' };
}

function setMerge(merge) {
  state.merge = merge;
  renderMergePanel();
  renderHistory();
  scheduleMerge(0);
}

async function startMerge(e) {
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

function clearMerge() {
  if (!state.merge) return;
  state.merge = null;
  mergeRev++;
  clearTimeout(mergeTimer);
  renderMergePanel();
  renderHistory();
  composeMerged(); // zeigt wieder das eigene Ergebnis
}

function mergeButton(e) {
  const b = iconButton('⊕', 'Mit dem aktuellen Ergebnis vereinigen (übereinanderlegen)', () => startMerge(e));
  if (e.id === state.historyId) {
    b.disabled = true;
    b.title = 'Das ist das geöffnete Bild – zum Vereinigen einen anderen Eintrag wählen';
  }
  return b;
}

function renderMergePanel() {
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

function bindMerge() {
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

  // Knöpfe: zur nächsten Zoomstufe, Mittelpunkt der Ansicht bleibt stehen
  $('#zoom-in').addEventListener('click', () => setZoomValue(ZOOM_STEPS.find((z) => z > state.zoom + 0.01) ?? ZOOM_MAX));
  $('#zoom-out').addEventListener('click', () => setZoomValue([...ZOOM_STEPS].reverse().find((z) => z < state.zoom - 0.01) ?? 1));
  $('#zoom-fit').addEventListener('click', () => setZoomValue(1));

  // Mausrad zoomt auf die Mausposition (Trackpad: Pinch zoomt, zwei Finger verschieben)
  $('#panes').addEventListener('wheel', (e) => {
    if (!state.source) return;
    // Mausrad: deltaY in festen Schritten (meist 100/120 bzw. Zeilen), kein seitlicher Anteil.
    // Trackpad-Wischen liefert kleine, fließende Werte – das bleibt normales Scrollen.
    const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (!e.ctrlKey && !mouseWheel) return;
    e.preventDefault();
    const scroller = e.target.closest('.pane-scroll');
    if (!scroller) return;
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const factor = Math.exp(-delta * (e.ctrlKey && !mouseWheel ? 0.01 : 0.0015));
    setZoomValue(state.zoom * factor, { scroller, x: e.clientX, y: e.clientY });
  }, { passive: false });

  // Verschieben mit gedrückter Maustaste (erst ab einigen Pixeln – ein Klick setzt weiterhin Punkte)
  let drag = null;
  let suppressClick = false;
  for (const scroller of $$('.pane-scroll')) {
    scroller.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      // Strg/Cmd + Ziehen = Datei herausziehen statt verschieben (Original und Ergebnis)
      if (e.button === 0 && (e.ctrlKey || e.metaKey)) return;
      if (e.button === 1) e.preventDefault(); // kein Auto-Scroll-Modus
      drag = { scroller, x: e.clientX, y: e.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, moved: false, id: e.pointerId };
    });
  }
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      document.body.classList.add('panning');
    }
    drag.scroller.scrollLeft = drag.left - dx;
    drag.scroller.scrollTop = drag.top - dy;
  });
  window.addEventListener('pointerup', () => {
    if (drag && drag.moved) suppressClick = true;
    drag = null;
    document.body.classList.remove('panning');
  });
  // Klick nach dem Verschieben nicht als Punkt werten
  $('#img-original').addEventListener('click', (e) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.stopImmediatePropagation();
  }, true);
  window.addEventListener('pointerdown', () => { suppressClick = false; }, true);

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
  const sortSel = $('#history-sort');
  sortSel.value = HISTORY_SORTS.includes(ui.historySort) ? ui.historySort : 'date-desc';
  sortSel.addEventListener('change', () => { ui.historySort = sortSel.value; saveUi(); renderHistory(); });
  $('#btn-clear-history').addEventListener('click', async () => {
    if (await window.api.history.clear()) {
      state.historyId = null;
      if (state.source) state.source.savedId = null;
      await refreshHistory();
    }
  });

  $('#btn-export').addEventListener('click', exportCurrent);
  $('#btn-lightburn').addEventListener('click', sendToLightBurn);
  $('#btn-save-history').addEventListener('click', () => saveToHistory(false));

  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === 'o') { e.preventDefault(); $('#btn-open').click(); }
    if (e.key === 'k') { e.preventDefault(); $('#btn-camera').click(); }
    if (e.key === 'e') { e.preventDefault(); if (state.result) exportCurrent(); }
    if (e.key === 's') { e.preventDefault(); if (state.result) saveToHistory(false); } // nur sichern, keine Datei
    if (e.key === 'l') { e.preventDefault(); if (state.result) sendToLightBurn(); }
  });
}

function setZoom(i) {
  setZoomValue(ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, i))]);
}

/**
 * Stufenloser Zoom. anchor = { scroller, x, y }: Der Bildpunkt unter (x, y) bleibt stehen.
 * Ohne anchor bleibt die Mitte der Ansicht stehen.
 */
function setZoomValue(value, anchor = null) {
  const z = Math.max(1, Math.min(ZOOM_MAX, value));
  const scroller = anchor?.scroller || $$('.pane-scroll').find((el) => el.offsetParent) || $('.pane-scroll');
  const img = scroller.querySelector('img');
  const rect = scroller.getBoundingClientRect();
  const ax = anchor ? anchor.x : rect.left + rect.width / 2;
  const ay = anchor ? anchor.y : rect.top + rect.height / 2;
  // relative Lage des Ankerpunkts im Bild vor dem Zoom
  const before = img.getBoundingClientRect();
  const fx = before.width ? (ax - before.left) / before.width : 0.5;
  const fy = before.height ? (ay - before.top) / before.height : 0.5;

  state.zoom = z;
  document.documentElement.style.setProperty('--zoom', z);
  $('#zoom-label').textContent = `${Math.round(z * 100)} %`;

  // nach dem Umbruch so scrollen, dass derselbe Bildpunkt wieder unter dem Anker liegt
  const after = img.getBoundingClientRect();
  scroller.scrollLeft += after.left + fx * after.width - ax;
  scroller.scrollTop += after.top + fy * after.height - ay;
  renderMarkers();
}

/**
 * Klickpunkte (Plus/Minus) als eigene Ebene über dem Original – unabhängig von
 * Bildgröße und Zoom immer gleich groß und sofort sichtbar.
 */
function renderMarkers() {
  const layer = $('#marker-layer');
  const img = $('#img-original');
  const mode = state.settings.bgRemove;
  const points = !state.source ? [] : usesSeeds(mode)
    ? state.settings.bgSeeds.map((p) => ({ ...p, positive: false }))
    : isSam(mode) ? state.settings.samPoints : [];
  layer.textContent = '';
  if (!points.length || !img.naturalWidth) return;
  // Lage des Bildinhalts (object-fit: contain) innerhalb des <img>
  const iw = img.clientWidth, ih = img.clientHeight;
  const sc = Math.min(iw / img.naturalWidth, ih / img.naturalHeight);
  const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
  const ox = img.offsetLeft + (iw - dw) / 2, oy = img.offsetTop + (ih - dh) / 2;
  for (const p of points) {
    const m = document.createElement('div');
    m.className = `marker ${p.positive ? 'plus' : 'minus'}`;
    m.style.left = `${ox + p.x * dw}px`;
    m.style.top = `${oy + p.y * dh}px`;
    layer.append(m);
  }
}

/* ------------------------------------------------------------------ */
/* Toast                                                              */
/* ------------------------------------------------------------------ */

let toastTimer = null;
function toast(msg, isError = false, action = null) {
  toastLog.push({ at: Date.now(), msg, isError });
  if (toastLog.length > 50) toastLog.shift();
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
  // 8 s, mit Knopf 11 s – genug Zeit, auch längere Meldungen zu lesen
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 11000 : 8000);
}

/* ------------------------------------------------------------------ */
/* Updates                                                            */
/* ------------------------------------------------------------------ */

/** Release-Notizen (einfaches Markdown: ###, Listen, **fett**, `code`) sicher als DOM aufbauen. */
function renderReleaseNotes(md, box) {
  box.replaceChildren();
  let list = null;
  let lastItem = null;
  const inline = (parent, text) => {
    for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**')) {
        const b = document.createElement('strong');
        b.textContent = part.slice(2, -2);
        parent.append(b);
      } else if (part.startsWith('`') && part.endsWith('`')) {
        const c = document.createElement('code');
        c.textContent = part.slice(1, -1);
        parent.append(c);
      } else {
        parent.append(document.createTextNode(part.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')));
      }
    }
  };
  for (const raw of String(md).replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim() || /^\s*([-*_])\1{2,}\s*$/.test(line)) { list = null; lastItem = null; continue; } // Leerzeile, Trennlinie
    const head = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (head) {
      list = null; lastItem = null;
      const h = document.createElement('h4');
      inline(h, head[1]);
      box.append(h);
    } else if (item) {
      if (!list) { list = document.createElement('ul'); box.append(list); }
      lastItem = document.createElement('li');
      inline(lastItem, item[1]);
      list.append(lastItem);
    } else if (lastItem && /^\s/.test(line)) {
      inline(lastItem, ` ${line.trim()}`); // eingerückte Fortsetzung eines Listenpunkts
    } else {
      list = null; lastItem = null;
      const para = document.createElement('p');
      inline(para, line.trim());
      box.append(para);
    }
  }
  if (!box.childNodes.length) {
    const para = document.createElement('p');
    para.textContent = 'Keine Beschreibung vorhanden.';
    box.append(para);
  }
}

function bindUpdates() {
  const dlg = $('#update-dialog');
  const btn = $('#btn-update');
  const action = $('#update-action');
  let upd = { phase: 'idle' };
  let notesFor = null; // Notizen nur bei neuer Version neu aufbauen (nicht bei jedem Fortschritt)

  const FILE_HINT = {
    win32: 'Die neue portable Version liegt im Download-Ordner. Pic2Laser schließen, die neue Datei starten und die alte löschen.',
    darwin: 'Die neue Version liegt im Download-Ordner. Pic2Laser beenden, die ZIP-Datei entpacken und die App in den Programme-Ordner ziehen (alte ersetzen).',
    linux: 'Die neue AppImage liegt im Download-Ordner. Pic2Laser beenden, die Datei ausführbar machen und starten.',
  };

  function render() {
    const s = upd;
    const l = s.latest;
    btn.hidden = !s.newer;
    if (s.phase === 'downloading' && s.progress?.total) {
      btn.textContent = `Update ${Math.round((s.progress.received / s.progress.total) * 100)} %`;
    } else if (s.phase === 'ready') {
      btn.textContent = 'Update bereit';
    } else if (l) {
      btn.textContent = `Update ${l.version}`;
    }
    if (!l) return;

    const auto = l.installKind === 'auto';
    $('#update-title').textContent = s.phase === 'ready' ? (auto ? 'Update bereit' : 'Neue Version geladen')
      : s.phase === 'downloading' && auto ? 'Update wird geladen' : 'Neue Version verfügbar';
    $('#update-sub').textContent = `Pic2Laser ${l.version} · installiert: ${s.current}${l.asset ? ` · ${fmtMB(l.asset.size)}` : ''}`;
    if (notesFor !== l.version) {
      notesFor = l.version;
      renderReleaseNotes(l.notes, $('#update-notes'));
    }

    const prog = $('#update-progress');
    prog.hidden = s.phase !== 'downloading';
    if (s.phase === 'downloading' && s.progress) {
      const f = s.progress.total ? s.progress.received / s.progress.total : 0;
      $('#update-progress-fill').style.width = `${Math.round(f * 100)}%`;
      $('#update-progress-label').textContent = `${fmtMB(s.progress.received)} / ${fmtMB(s.progress.total || 0)}`;
    }

    const msg = $('#update-msg');
    msg.style.color = '';
    if (s.phase === 'error' && s.error) {
      msg.textContent = s.error;
      msg.style.color = 'var(--danger)';
    } else if (s.phase === 'ready' && auto) {
      msg.textContent = 'Wird beim Beenden von Pic2Laser automatisch installiert. „Jetzt neu starten“ installiert sofort – '
        + 'nicht gespeicherte Ergebnisse vorher exportieren oder in der Historie speichern.';
    } else if (s.phase === 'downloading' && auto) {
      msg.textContent = 'Die neue Version wird im Hintergrund geladen – du kannst normal weiterarbeiten.';
    } else if (s.phase === 'ready') {
      msg.textContent = l.installKind === 'installer'
        ? 'Pic2Laser wird zum Installieren beendet – nicht gespeicherte Ergebnisse vorher exportieren oder in der Historie speichern.'
        : (FILE_HINT[s.platform] || FILE_HINT.linux);
    } else if (s.phase === 'available' && auto) {
      msg.textContent = '„Aktualisieren“ lädt die neue Version und installiert sie – beim nächsten Beenden oder sofort per Neustart.';
    } else if (!l.asset) {
      msg.textContent = 'Für dieses System liegt keine Datei bei – die neue Version gibt es auf der Download-Seite.';
    } else {
      msg.textContent = '';
    }

    $('#update-page').hidden = !l.asset; // ohne Datei ist der Hauptknopf schon die Download-Seite
    $('#update-cancel').hidden = s.phase !== 'downloading';
    $('#update-later').hidden = s.phase === 'downloading' && !auto;
    $('#update-later').textContent = s.phase === 'downloading' ? 'Schließen' : 'Später';
    action.hidden = s.phase === 'downloading';
    action.disabled = false;
    if (s.phase === 'ready') {
      action.textContent = auto ? 'Jetzt neu starten' : l.installKind === 'installer' ? 'Installieren & beenden' : 'Im Ordner zeigen';
    } else if (!l.asset) {
      action.textContent = 'Download-Seite öffnen';
    } else {
      action.textContent = s.phase === 'error' ? 'Erneut versuchen' : auto ? 'Aktualisieren' : 'Herunterladen';
    }
  }

  function apply(next) {
    const prev = upd;
    upd = next;
    render();
    if (prev.phase === next.phase) return;
    const auto = next.latest?.installKind === 'auto';
    if (next.phase === 'ready' && auto) {
      // fertig geladen: Hinweis mit Sofort-Neustart (sonst beim Beenden)
      if (!dlg.open) toast(`Update ${next.latest.version} ist bereit – wird beim Beenden installiert.`, false, { label: 'Jetzt neu starten', action: () => restartForUpdate() });
    } else if (next.phase === 'available' && !prev.newer && !dlg.open) {
      toast(`Neue Version ${next.latest.version} verfügbar`, false, { label: 'Details', action: () => dlg.showModal() });
    } else if (next.phase === 'ready' && !dlg.open) {
      toast(`Version ${next.latest.version} ist geladen.`, false, { label: 'Installieren', action: () => dlg.showModal() });
    } else if (next.phase === 'error' && prev.phase === 'downloading' && !dlg.open) {
      toast(`Update-Download fehlgeschlagen: ${next.error}`, true);
    }
  }

  async function restartForUpdate() {
    try {
      await window.api.update.install();
    } catch (err) {
      toast(`Update fehlgeschlagen: ${cleanError(err)}`, true);
    }
  }

  window.api.update.onState(apply);
  window.api.update.state().then(apply).catch(() => {});

  btn.addEventListener('click', () => { render(); dlg.showModal(); });
  $('#appVersion').addEventListener('click', () => {
    if (upd.newer && upd.latest) { render(); dlg.showModal(); return; }
    toast('Suche nach Updates …');
    window.api.update.check().then((s) => {
      if (s.newer) { render(); dlg.showModal(); }
      else if (s.phase === 'error') toast(`Update-Prüfung fehlgeschlagen: ${s.error}`, true);
      else toast(`Pic2Laser ist auf dem neuesten Stand (v${s.current}).`);
    }).catch((err) => toast(`Update-Prüfung fehlgeschlagen: ${cleanError(err)}`, true));
  });
  $('#update-page').addEventListener('click', () => window.api.update.openPage());
  $('#update-cancel').addEventListener('click', () => window.api.update.cancel());
  action.addEventListener('click', async () => {
    const l = upd.latest;
    if (!l) return;
    try {
      if (upd.phase === 'ready') {
        action.disabled = true;
        const r = await window.api.update.install();
        if (!r?.quitting) dlg.close();
      } else if (!l.asset) {
        window.api.update.openPage();
      } else {
        await window.api.update.download();
      }
    } catch (err) {
      toast(`Update fehlgeschlagen: ${cleanError(err)}`, true);
      action.disabled = false;
    }
  });
}

/* ------------------------------------------------------------------ */

/** Ein Schritt nach oben (+1) oder unten (-1) für einen Regler – wie ein Ziehen von Hand. */
function stepSlider(input, dir) {
  if (input.disabled) return false;
  const before = input.value;
  if (dir > 0) input.stepUp(); else input.stepDown();
  if (input.value === before) return false;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Vor und hinter jeden Regler einen kleinen −/+-Knopf setzen (gedrückt halten wiederholt). */
function addSliderSteppers(root = document) {
  const inputs = root.matches?.('input[type=range]') ? [root] : root.querySelectorAll('input[type=range]');
  for (const input of inputs) {
    if (input.parentElement?.classList.contains('slider-row')) continue;
    const row = document.createElement('span');
    row.className = 'slider-row';
    input.before(row);
    const mk = (dir) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'step-btn';
      b.textContent = dir > 0 ? '+' : '−';
      b.title = dir > 0 ? 'Einen Schritt erhöhen' : 'Einen Schritt verringern';
      b.tabIndex = -1;
      let delay = null, repeat = null;
      const stop = () => { clearTimeout(delay); clearInterval(repeat); delay = repeat = null; };
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        stop();
        if (!stepSlider(input, dir)) return;
        delay = setTimeout(() => { repeat = setInterval(() => { if (!stepSlider(input, dir)) stop(); }, 60); }, 400);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
      // Klicks nicht an das Label weiterreichen, Doppelklick setzt den Regler nicht zurück
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); });
      return b;
    };
    // Regler steht im DOM zuerst, damit das Label weiterhin ihn meint; die Reihenfolge macht CSS
    row.append(input, mk(-1), mk(1));
    const sync = () => { for (const b of row.querySelectorAll('.step-btn')) b.disabled = input.disabled; };
    sync();
    new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['disabled'] });
  }
}

addSliderSteppers();
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) addSliderSteppers(n);
}).observe(document.body, { childList: true, subtree: true });

/* ------------------------------------------------------------------ */

bindInfoToggles();
bindModelsDialog();
bindDialogs();
bindEmbDialog();
bindCameraDialog();
bindControls();
bindPresets();
bindResultDrag();
bindOriginalDrag();
bindCancel();
bindMerge();
bindPerf();
refreshPerf();
bindUpdates();
$('#img-original').addEventListener('load', renderMarkers);
window.addEventListener('resize', renderMarkers);
for (const b of $$('#view-mode button')) b.addEventListener('click', () => requestAnimationFrame(renderMarkers));
bindDragDrop();
bindView();
syncControls();
setZoom(0);
refreshHistory();
refreshSystem().then(renderModels);
refreshModels();
refreshPresets();
bindTour();

/** Hilfe: „?“ und F1 öffnen das Handbuch, darin „Tour starten“. Die Einführungstour läuft automatisch beim ersten Start. */
function bindTour() {
  $('#btn-help').addEventListener('click', () => Manual.open());
  $('#manual-tour').addEventListener('click', () => { $('#manual-dialog').close(); Tour.start(); });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'F1') return;
    e.preventDefault();
    if (Tour.isOpen()) return;
    const open = document.querySelector('dialog[open]');
    if (open && open.id !== 'manual-dialog') return; // nicht über einen anderen Dialog legen
    Manual.toggle();
  });
  Tour.init({ loadDemo: (bytes) => loadImage('beispiel-plakette.svg', bytes) });
}
