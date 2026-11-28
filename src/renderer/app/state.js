/** Standardwerte, Einstellungen laden/speichern und der zentrale Zustand der App. */

export const DEFAULTS = Object.freeze({
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

export const SETTINGS_STORAGE_KEY = 'pic2laser.settings';

// Reine Anzeige-Vorlieben (nicht in Presets/Historie, kein Einfluss auf das Ergebnis)
export const UI_STORAGE_KEY = 'pic2laser.ui';
export const ui = (() => {
  try { return { hideBackground: false, ...JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || '{}') }; } catch { return { hideBackground: false }; }
})();
export function saveUi() {
  try { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(ui)); } catch { /* ignorieren */ }
}
// Die App startet immer im Bereich „Lasern“; „Sticken“ gilt nur bis zum Beenden
ui.presetTab = 'laser';
export const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16];
export const ZOOM_MAX = 16;

export const MODE_HINTS = {
  vector: 'Ideal für Logos, Schriften, Strichzeichnungen und Silhouetten. Ergebnis sind echte Vektorpfade – in LightBurn als Füllung (Fill) gravieren.',
  edges: 'Zeichnet die Kanten und Randkonturen des Bildes als Linien nach – ergibt eine Strichzeichnung als Vektor. In LightBurn als Füllung (Fill) gravieren.',
  color: 'Zerlegt das Bild in wenige Farbflächen – je Farbe eine eigene Ebene im SVG. Für Stickerei (Ink/Stitch, Hatch, Wilcom …) und Laser mit mehreren Farben/Ebenen.',
  sine: 'Zeichnet das Bild mit Sinuswellen: dunkle Stellen ergeben dichte Wellen, helle flache Linien. Ergebnis sind Vektorlinien – in LightBurn im Modus Linie (Line) gravieren.',
  relief: 'Erzeugt per KI eine Tiefenkarte des Fotos als Graustufenbild – für 3D-Reliefgravur in Holz (Laserleistung bestimmt die Tiefe).',
  dither: 'Ideal für Fotos. Graustufen werden in Punktmuster umgewandelt. Für LightBurn am besten zusätzlich PNG/BMP exportieren und als Bild im Modus „Passthrough" gravieren.',
};

export const state = {
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

/**
 * Standardwerte ergänzen. Ältere Einstellungen/Presets ohne Hauptschalter für die Restaurierung:
 * eingeschaltet, sobald eine Restaurierungsoption aktiv ist.
 */
/** Exportformate und Stickeinstellungen: ändern das berechnete Ergebnis nicht, bleiben bei Vorlagen erhalten. */
export const isOutputKey = (k) => k.startsWith('fmt') || k.startsWith('emb');
export const outputPrefs = (s) => Object.fromEntries(Object.keys(DEFAULTS).filter(isOutputKey).map((k) => [k, s[k]]));
export const laserFormats = (s) => s.fmtSvg || s.fmtPng || s.fmtJpg || s.fmtBmp;
export const EMB_MODES = ['vector', 'edges', 'color', 'sine']; // Modi mit Stickdatei
/**
 * Stickdatei möglich: nur in Modi mit Vektorflächen bzw. -linien (nicht Foto/Relief) – oder bei einer
 * Vereinigung, die als Vektor nachgezeichnet sein kann. Sonst gelten PES/DST/EXP als abgewählt (die Haken
 * bleiben gespeichert und gelten wieder, sobald man in einen passenden Modus wechselt).
 */
export const embModeOk = (s) => EMB_MODES.includes(s.mode) || !!state.merge;
export const embFormats = (s) => embModeOk(s) && !!(s.fmtPes || s.fmtDst || s.fmtExp);

export function withDefaults(settings = {}) {
  const restoreOn = settings.restoreOn ?? !!(settings.restoreDenoise || settings.restoreScratches || settings.restoreFaces);
  return { ...DEFAULTS, ...settings, restoreOn };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return withDefaults(JSON.parse(raw));
  } catch { /* ignorieren */ }
  return { ...DEFAULTS };
}

export function persistSettings() {
  try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings)); } catch { /* ignorieren */ }
}
