/** Einklappbare Bereiche (Stufen) der Seitenleiste. */

import { $, $$ } from './dom.js';
import { round1 } from './settings.js';
import { DEFAULTS, saveUi, state, ui } from './state.js';

/*
 * Einklappbare Bereiche der Seitenleiste (Vorbereitung, Vektorisierung, Formen verbessern, Schrift & Konturen, Ausgabe). Eingeklappt zeigt die Kopfzeile,
 * was darin eingeschaltet ist; ein Punkt markiert Bereiche, in denen etwas vom Standard abweicht.
 * Der Zustand je Bereich bleibt gespeichert.
 */
export const STAGE_DEFAULT_COLLAPSED = { vectorize: false, shapes: false, prep: true, extras: false, output: false };
// Kurznamen für die Kopfzeilen von „Vektorisierung“ und „Formen verbessern“
export const VECTORIZE_NAMES = { threshold: 'Schwellwert', turdSize: 'Flecken', alphaMax: 'Ecken', optTolerance: 'Kurven', workRes: 'Auflösung' };
export const SHAPE_NAMES = { smoothContours: 'Glatte Konturen', lineClean: 'Ruhige Linien', shapeFit: 'Formen begradigen' };
export const BG_SHORT = {
  ai: 'U²-Net', isnet: 'IS-Net', ben2: 'BEN2', birefnet: 'BiRefNet', modnet: 'MODNet',
  sam: 'MobileSAM', sam2: 'SAM 2.1', sky: 'Himmel', skyai: 'Himmel (BEN2)', color: 'nach Farbe',
};
export const ADJUST_KEYS = ['brightness', 'contrast', 'gamma', 'blur', 'sharpen', 'invert'];
export const FORMAT_KEYS = [['fmtSvg', 'SVG'], ['fmtPng', 'PNG'], ['fmtJpg', 'JPG'], ['fmtBmp', 'BMP'], ['fmtPes', 'PES'], ['fmtDst', 'DST'], ['fmtExp', 'EXP']];

export function stageCollapsed(id) {
  const c = ui.stages || {};
  return id in c ? !!c[id] : !!STAGE_DEFAULT_COLLAPSED[id];
}

export function setStageCollapsed(stage, collapsed, remember = true) {
  stage.classList.toggle('collapsed', collapsed);
  stage.querySelector('.stage-head').setAttribute('aria-expanded', String(!collapsed));
  if (remember) {
    ui.stages = { ...(ui.stages || {}), [stage.dataset.stage]: collapsed };
    saveUi();
  }
}

/** Öffnet den Bereich, in dem ein Element liegt (z. B. für die Tour). */
export const tempOpenStages = new Set(); // von der Tour nur vorübergehend aufgeklappt

export function revealInStage(el, temporary = false) {
  const stage = el?.closest?.('.stage');
  if (!stage || !stage.classList.contains('collapsed')) return;
  setStageCollapsed(stage, false, !temporary);
  if (temporary) tempOpenStages.add(stage);
  refreshStagesAll();
}

/** Nach der Tour: Bereiche, die sie aufgeklappt hat, wieder zuklappen (sofern nicht inzwischen von Hand bedient). */
export function restoreRevealedStages() {
  for (const stage of tempOpenStages) {
    if (stageCollapsed(stage.dataset.stage)) setStageCollapsed(stage, true, false);
  }
  tempOpenStages.clear();
  refreshStagesAll();
}

export function bindStages() {
  for (const stage of $$('.stage')) {
    setStageCollapsed(stage, stageCollapsed(stage.dataset.stage), false);
    stage.querySelector('.stage-head').addEventListener('click', () => {
      tempOpenStages.delete(stage);
      setStageCollapsed(stage, !stage.classList.contains('collapsed'));
      refreshStagesAll();
    });
  }
  // Knopf in der Modus-Überschrift: alle sichtbaren Bereiche auf- bzw. zuklappen
  $('#btn-stages-all').addEventListener('click', () => {
    const stages = $$('.stage').filter((s) => !s.hidden);
    const expand = stages.some((s) => s.classList.contains('collapsed'));
    for (const s of stages) setStageCollapsed(s, !expand);
    tempOpenStages.clear();
    refreshStagesAll();
  });
}

/** Symbol und Tooltip des Knopfs „Alle auf-/zuklappen“ passend zum Zustand. */
export function refreshStagesAll() {
  const btn = $('#btn-stages-all');
  const expand = $$('.stage').some((s) => !s.hidden && s.classList.contains('collapsed'));
  const label = expand ? 'Alle Bereiche aufklappen' : 'Alle Bereiche einklappen';
  btn.classList.toggle('expand', expand);
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

export const shown = (el) => !!el && !el.closest('[hidden]');

/** Kurzfassung je Bereich: aktive Punkte – leer, wenn nichts eingeschaltet ist. */
export function stageActive(id) {
  const s = state.settings;
  const parts = [];
  if (id === 'output') {
    const h = $('#heightMm').value;
    parts.push(`${String(round1(s.widthMm)).replace('.', ',')}${h ? ` × ${String(h).replace('.', ',')}` : ''} mm`);
    const fmts = FORMAT_KEYS.filter(([k]) => s[k] && !$(`[data-key="${k}"]`)?.disabled).map(([, n]) => n);
    parts.push(fmts.length ? fmts.join(', ') : 'kein Format');
    return parts;
  }
  if (id === 'vectorize') {
    for (const [k, name] of Object.entries(VECTORIZE_NAMES)) {
      const out = $(`#stage-vectorize output[data-for="${k}"]`);
      if (shown(out) && s[k] !== DEFAULTS[k]) parts.push(`${name} ${out.textContent}`);
    }
    return parts;
  }
  if (id === 'shapes') {
    for (const [k, name] of Object.entries(SHAPE_NAMES)) {
      const cb = $(`#stage-shapes [data-key="${k}"]`);
      if (shown(cb) && cb.checked) parts.push(name);
    }
    return parts;
  }
  // In der Reihenfolge der Abschnitte (= Verarbeitungsreihenfolge). Kompakte Abschnitte: Hauptschalter
  // (erste Checkbox) an und Abschnitt im Modus sichtbar
  for (const g of $$(`#stage-${id} .stage-body > .group`)) {
    if (g.hidden) continue;
    const title = g.querySelector('h3')?.firstChild?.textContent.trim();
    if (g.classList.contains('compact')) {
      if (g.querySelector(':scope > label.check input[type=checkbox]')?.checked) parts.push(g.dataset.sum);
    } else if (title === 'Freistellen') {
      if (s.bgRemove !== 'none') parts.push(`Freistellen (${BG_SHORT[s.bgRemove] || s.bgRemove})`);
    } else if (title === 'Bildanpassung') {
      if (ADJUST_KEYS.some((k) => s[k] !== DEFAULTS[k])) parts.push('Bildanpassung');
    }
  }
  return parts;
}

/** Inhalt eines Bereichs (für die Kopfzeile, wenn nichts eingeschaltet ist). */
export function stageContents(stage) {
  if (stage.dataset.stage === 'vectorize') return ['Standardwerte'];
  if (stage.dataset.stage === 'shapes') {
    return Object.entries(SHAPE_NAMES).filter(([k]) => shown($(`#stage-shapes [data-key="${k}"]`))).map(([, n]) => n);
  }
  return [...stage.querySelectorAll('.stage-body > .group')]
    .filter((g) => !g.hidden)
    .map((g) => g.dataset.sum || g.querySelector('h3')?.firstChild?.textContent.trim())
    .filter(Boolean);
}

export function refreshStages() {
  for (const stage of $$('.stage')) {
    const id = stage.dataset.stage;
    stage.hidden = ![...stage.querySelectorAll('.stage-body > .group')].some((g) => !g.hidden);
    const active = stageActive(id);
    const sum = stage.querySelector('.stage-sum');
    stage.querySelector('.stage-dot').hidden = id === 'output' || !active.length;
    const on = id === 'output' || active.length > 0;
    sum.textContent = (on ? active : stageContents(stage)).join(' · ');
    sum.classList.toggle('on', on);
    sum.title = sum.textContent;
  }
  refreshStagesAll();
}
