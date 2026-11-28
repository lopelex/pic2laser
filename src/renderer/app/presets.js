/** Presets: anwenden, speichern, anzeigen. */

import { $, $$, toast } from './dom.js';
import { invalidateDrag } from './drag.js';
import { cleanError } from './keys.js';
import { scheduleProcess } from './pipeline.js';
import { BUILTIN_PRESETS } from './presets-builtin.js';
import { setSetting, syncControls } from './settings.js';
import { EMB_MODES, outputPrefs, persistSettings, saveUi, state, ui, withDefaults } from './state.js';

// Werte, die zum einzelnen Bild gehören und nicht in Presets gespeichert werden
export const PER_IMAGE_KEYS = ['bgSeeds', 'samPoints', 'colorEdits', 'embLayers'];

export function presetSettingsFromCurrent() {
  const out = { ...state.settings };
  for (const k of PER_IMAGE_KEYS) delete out[k];
  return out;
}

/**
 * Wendet ein Preset an. Vorlagen behalten Ausgabegröße, Exportformate und Stickeinstellungen bei –
 * außer sie setzen sie selbst (Stickerei-Vorlagen: Breite, PES, Stoff).
 */
export function applyPreset(key) {
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
  invalidateDrag();
  persistSettings();
  syncControls();
  renderPresets();
  scheduleProcess(0);
}

export async function refreshPresets() {
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
 * Eigene: die Liste, in der sie gespeichert wurden (use); ältere ohne use: Sticken, wenn PES/DST/EXP
 * gewählt sind und der Modus eine Stickdatei liefert, sonst Lasern.
 */
export function presetUse(p, kind) {
  if (kind === 'user') {
    // Eigene Presets erscheinen in der Liste, in der sie gespeichert wurden; ältere Presets ohne diese
    // Angabe werden wie bisher nach ihrem Inhalt einsortiert (Stickformat + Stickmodus = Sticken)
    if (p.use === 'emb' || p.use === 'laser') return p.use;
    const s = p.settings || {};
    return (s.fmtPes || s.fmtDst || s.fmtExp) && EMB_MODES.includes(s.mode) ? 'emb' : 'laser';
  }
  return p.use || (p.group.startsWith('Stickerei') ? 'emb' : 'laser');
}
export const presetTab = () => (ui.presetTab === 'emb' ? 'emb' : 'laser');
export const inPresetTab = (p, kind) => ['both', presetTab()].includes(presetUse(p, kind));
// In der Liste „Sticken“ ist der Vorsatz „Stickerei – “ überflüssig
export const presetLabel = (s) => (presetTab() === 'emb' ? s.replace(/^Stickerei – /, '') : s);

export function renderPresets() {
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

export function updatePresetHint() {
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

/** Rückfrage beim Überschreiben – nennt es, wenn das Preset dabei in die andere Liste wechselt. */
export function presetOverwriteText(name) {
  const old = state.presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
  const tabName = { laser: 'Lasern', emb: 'Sticken' };
  const from = old && presetUse(old, 'user');
  const to = presetTab();
  return from && from !== to
    ? `Preset „${old.name}“ gibt es bereits unter „${tabName[from]}“. Überschreiben? Es steht danach unter „${tabName[to]}“.`
    : `Preset „${name}“ existiert bereits. Überschreiben?`;
}

export async function savePreset() {
  const input = $('#preset-name');
  const name = input.value.trim();
  if (!name) return;
  if (state.presets.some((p) => p.name.toLowerCase() === name.toLowerCase())
      && !confirm(presetOverwriteText(name))) return;
  try {
    const settings = presetSettingsFromCurrent();
    state.presets = await window.api.presets.save({ name, settings, use: presetTab() });
    const saved = state.presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    state.activePreset = { key: `user:${saved.name}`, settings };
    input.value = '';
    $('#btn-preset-save').disabled = true;
    showPresetSave(false);
    renderPresets();
    toast(`Preset „${saved.name}“ gespeichert`);
  } catch (err) {
    toast(`Preset konnte nicht gespeichert werden: ${cleanError(err)}`, true);
  }
}

/** Namensfeld zum Speichern eines Presets ein- bzw. ausblenden (statt dauerhaft sichtbar). */
export function showPresetSave(on) {
  $('#preset-save').hidden = !on;
  $('#btn-preset-new').setAttribute('aria-expanded', String(on));
  if (on) $('#preset-name').focus();
  else { $('#preset-name').value = ''; $('#btn-preset-save').disabled = true; }
}

export function bindPresets() {
  $('#btn-preset-new').addEventListener('click', () => showPresetSave($('#preset-save').hidden));
  $('#btn-preset-cancel').addEventListener('click', () => showPresetSave(false));
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
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); showPresetSave(false); }
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
