/** Einstellungen: Regler, Formatierung, Hinweise, App-Menü. */

import { Processing } from '../processing.js';
import { updateOriginalView } from './ai-steps.js';
import { $, $$, toast } from './dom.js';
import { invalidateDrag, scheduleDragPrepare } from './drag.js';
import { scheduleEmbRefresh } from './emb.js';
import { isSam, usesSeeds } from './keys.js';
import { scheduleProcess } from './pipeline.js';
import { presetTab, renderPresets, updatePresetHint } from './presets.js';
import { refreshStages, revealInStage } from './stages.js';
import { DEFAULTS, EMB_MODES, MODE_HINTS, embFormats, embModeOk, outputPrefs, persistSettings, saveUi, state, ui } from './state.js';
import { imagePointFromEvent, markerAt, renderMarkers } from './view.js';

export const FORMATTERS = {
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
export const LINE_HINTS = {
  fine: 'Zeichnet Fotos wie von Hand nach, mit vielen Details und Schraffur. Höherer Detailgrad = feinere Linien, dauert länger.',
  contour: 'Dicke, geschlossene Umrisse mit wenig Schraffur – gut für kleine Gravuren. Höherer Detailgrad = mehr Umrisse.',
  sketch: 'Zarte, lockere Bleistiftstriche mit wenig Details. Bei blassem Ergebnis die Linienschwelle erhöhen.',
  portrait: 'Nur für Porträts: Gesicht wie mit Tusche gezeichnet, Haare als dunkle Fläche. Rechnet immer mit 512 px (kein Detailgrad) – Gesicht möglichst groß und mittig.',
  teed: 'Kantendetektor: feine, durchgehende Umrisse. Zeichnet auch Strukturen wie Stoff oder Holzmaserung mit – ggf. vorher freistellen.',
};

/** PES/DST/EXP im Modus Foto und Relief ausgegraut (dort entsteht keine Stickdatei), Stickeinstellungen nur mit PES/DST/EXP. */
export function syncEmbFormats() {
  const s = state.settings;
  for (const el of $$('[data-key="fmtPes"], [data-key="fmtDst"], [data-key="fmtExp"]')) {
    el.disabled = !embModeOk(s);
    el.closest('label').classList.toggle('disabled', el.disabled);
  }
  $('#emb-group').hidden = !embFormats(s);
}

export function syncControls() {
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
  refreshStages();
}

/*
 * Lange Erklärungen (.hint.info) sind standardmäßig eingeklappt und lassen sich je Abschnitt über
 * ein kleines ⓘ in der Überschrift einblenden. Der Zustand bleibt je Abschnitt gespeichert.
 */
export const INFO_KEY = 'pic2laser.infoOpen';

export function loadInfoOpen() {
  try { return new Set(JSON.parse(localStorage.getItem(INFO_KEY) || '[]')); } catch { return new Set(); }
}

export function bindInfoToggles() {
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
    btn.group = group;
    btn.addEventListener('click', () => {
      const on = !group.classList.contains('info-open');
      apply(on);
      if (on) revealInStage(group);
      const ids = [...loadInfoOpen()].filter((x) => x !== id);
      if (on) ids.push(id);
      try { localStorage.setItem(INFO_KEY, JSON.stringify(ids)); } catch { /* nur Komfort */ }
    });
    // Kompakte Abschnitte (nur eine Checkbox, Überschrift unsichtbar): ⓘ hinter die Checkbox
    // Einziger Abschnitt eines Bereichs (Überschrift = Kopfzeile des Bereichs): ⓘ in die Kopfzeile
    const host = group.classList.contains('compact') ? group.querySelector(':scope > label.check')
      : group.classList.contains('solo') ? group.closest('.stage')?.querySelector('.stage-bar') : null;
    if (host) host.append(btn);
    else {
      h3.classList.add('has-info');
      h3.append(btn);
    }
  }
}

/** ⓘ nur zeigen, wenn im Abschnitt gerade eine Erklärung sichtbar wäre (abhängig von Modus/Optionen). */
export function refreshInfoToggles() {
  for (const btn of $$('.info-btn')) {
    const group = btn.group || btn.closest('.group');
    btn.hidden = ![...group.querySelectorAll('.hint.info')].some((h) => h.textContent.trim() && !h.closest('[hidden]'));
  }
}

/** Zahnrad oben rechts: KI-Modelle und Leistung. */
export function bindAppMenu() {
  const btn = $('#btn-app-menu');
  const menu = $('#app-menu');
  const place = () => {
    const r = btn.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  };
  const open = (on) => {
    menu.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    btn.classList.toggle('active', on);
    if (on) { place(); menu.querySelector('.menu-item')?.focus(); }
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); open(menu.hidden); });
  for (const item of menu.querySelectorAll('.menu-item')) item.addEventListener('click', () => open(false));
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) open(false);
  });
  window.addEventListener('keydown', (e) => {
    if (menu.hidden || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(false);
    btn.focus();
  }, true);
  window.addEventListener('resize', () => { if (!menu.hidden) place(); });
}

export function updateHeightField() {
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

export function round1(v) { return Math.round(v * 10) / 10; }

export function setSetting(key, value) {
  state.settings[key] = value;
  persistSettings();
  syncControls();
  if (key === 'bgSeeds' || key === 'samPoints' || key === 'bgRemove') renderMarkers();
  updatePresetHint();
  if (key.startsWith('emb') || key === 'fmtPes' || key === 'fmtDst' || key === 'fmtExp') {
    scheduleEmbRefresh(); // Stiche neu planen (Vorschau, Herausziehen) – ohne neue Berechnung
  } else if (!key.startsWith('fmt')) {
    state.cancelRetries = 0; // neue Eingabe: wieder Neustarts erlauben
    invalidateDrag(); // bis zum neuen Ergebnis nicht das veraltete herausziehen
    scheduleProcess();
  } else scheduleDragPrepare(); // andere Formate zum Herausziehen
}

export function bindControls() {
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
    invalidateDrag();
    renderPresets();
    persistSettings();
    syncControls();
    scheduleProcess();
  });
}
