/** KI-Modelle (Download, Status) und Leistung (GPU, Cache). */

import { $, toast } from './dom.js';
import { MODEL_NAMES, cleanError } from './keys.js';
import { isCancelled, scheduleProcess } from './pipeline.js';
import { Run, downloadStarts, hideProgress, showProgress } from './progress.js';
import { state } from './state.js';
import { fmtGB } from './system.js';

export const fmtMB = (b) => `${Math.round(b / 1e6)} MB`;

export async function refreshModels() {
  try {
    state.models = await window.api.models.status();
  } catch {
    state.models = [];
  }
  renderModels();
}

export function renderPerf(p) {
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

export async function refreshPerf() {
  try { renderPerf(await window.api.perf.status()); } catch { /* ignorieren */ }
}

export function bindPerf() {
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
export async function ensureModel(id) {
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
export const MODEL_GROUPS = [
  ['Freistellen', ['u2netp', 'isnet', 'birefnet', 'ben2', 'modnet', 'sam_encoder', 'sam2_encoder']],
  ['Strichzeichnung', ['lineart', 'lineart_contour', 'lineart_sketch', 'lineart_portrait', 'lineart_teed']],
  ['Restaurieren & Verbessern', ['scunet', 'lama', 'restoreformer', 'codeformer', 'yunet', 'esrgan']],
  ['Erkennung & Relief', ['faces', 'faceparse', 'text', 'text_v5', 'text_v5_server', 'depth', 'depth_base', 'depth_large']],
];
// Teilmodelle, die mit ihrem Hauptmodell geladen und entfernt werden
export const MODEL_HIDDEN = new Set(['sam_decoder', 'sam2_decoder']);
export const modelsLoading = new Set(); // ids, deren Download aus dem Dialog läuft

export function renderModels() {
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
export function modelDisplayName(m, group) {
  let name = m.label.replace(' – Encoder', '');
  const prefix = `${group} – `;
  if (name.startsWith(prefix)) name = name.slice(prefix.length);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function modelRow(m, group = '') {
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

export function bindModelsDialog() {
  const dlg = $('#models-dialog');
  $('#btn-models').addEventListener('click', () => {
    renderModels();
    $('#models-dialog-system').textContent = $('#system-info').textContent;
    dlg.showModal();
  });
}
