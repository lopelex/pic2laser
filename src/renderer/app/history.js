/** Historie. */

import { Encoders } from '../encoders.js';
import { $, toast } from './dom.js';
import { scheduleDragPrepare } from './drag.js';
import { baseName, buildRasterFiles, rasterCanvas } from './export.js';
import { loadImage } from './image-load.js';
import { cleanError } from './keys.js';
import { loadMergeLayer, mergeButton, renderMergePanel, setMerge } from './merge.js';
import { showResult } from './process.js';
import { round1 } from './settings.js';
import { outputPrefs, state, ui } from './state.js';
import { renderMarkers } from './view.js';

export async function makeThumb(r) {
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

export async function saveToHistory(silent = false) {
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

export async function refreshHistory() {
  try {
    state.history = await window.api.history.list();
  } catch (err) {
    console.error(err);
    state.history = [];
  }
  renderHistory();
}

export const dateFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
export const nameCollator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
export const HISTORY_SORTS = ['date-desc', 'date-asc', 'name-asc', 'name-desc'];

/** Historie nach der gewählten Reihenfolge sortieren (Datum = zuletzt gespeichert, wie angezeigt). */
export function sortHistory(items) {
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
export let historyRename = null; // { id, value, fresh }

export function startRename(e) {
  historyRename = { id: e.id, value: e.name || '', fresh: true };
  renderHistory();
}

/** Eingabefeld für den Namen (Enter oder Klick daneben übernimmt, Esc bricht ab). */
export function renameInput(e) {
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

/*
 * Historie-Spalte: solange sie leer ist, eingeklappt (mehr Platz für die Vorschau); der erste Eintrag blendet
 * sie ein. Der Knopf „Historie“ übersteuert das, bis die Historie das nächste Mal von leer auf den ersten
 * Eintrag wechselt – dann gilt wieder die Automatik (der neue Eintrag soll sichtbar werden).
 */
export let historyShown = null; // null = automatisch, sonst Wahl über den Knopf
export function setHistoryShown(on) {
  historyShown = on;
}
export let historyHadItems = null;

export function syncHistoryVisibility() {
  const has = state.history.length > 0;
  if (historyHadItems === false && has) historyShown = null; // erster Eintrag: wieder automatisch → einblenden
  historyHadItems = has;
  const show = historyShown ?? has;
  if (document.body.classList.contains('history-hidden') === show) {
    document.body.classList.toggle('history-hidden', !show);
    requestAnimationFrame(renderMarkers);
  }
}

export function renderHistory() {
  const list = $('#history-list');
  const q = $('#history-search').value.trim().toLowerCase();
  const items = sortHistory(state.history).filter((e) => !q || (e.name || '').toLowerCase().includes(q) || (e.originalName || '').toLowerCase().includes(q));
  list.replaceChildren();
  $('#history-empty').hidden = state.history.length > 0;
  syncHistoryVisibility();

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

export function iconButton(text, title, onClick) {
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

export async function openHistoryEntry(id) {
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
