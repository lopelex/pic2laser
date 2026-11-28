/** Dialog: Stickparameter je Farbe. */

import { Embroidery } from '../embroidery.js';
import { $, toast } from './dom.js';
import { embKey, embLayerParams, embSummary, embroideryProblem, fmtInt, planStitches, renderEmbManualInfo, scheduleEmbRefresh } from './emb.js';
import { isCancelled } from './pipeline.js';
import { setSetting } from './settings.js';
import { saveUi, state, ui } from './state.js';

/* ---- Dialog: Stickparameter je Farbe ---- */

export const embDlg = { sel: 0, view: null, timer: null, sig: '', dpr: 1, seq: 0 };
export const EMB_TYPES_FILL = [['fill', 'Füllstich'], ['run', 'Kontur – Steppstich'], ['triple', 'Kontur – Dreifachstich'], ['off', 'Nicht sticken']];
export const EMB_TYPES_RUN = [['run', 'Steppstich'], ['triple', 'Dreifachstich'], ['off', 'Nicht sticken']];
export const EMB_UNDERLAYS = [['none', 'Aus'], ['light', 'Leicht'], ['normal', 'Normal'], ['strong', 'Kräftig (mit Kantenlauf)']];
export const EMB_TYPE_NAMES = { fill: 'Füllstich', run: 'Kontur (Steppstich)', triple: 'Kontur (Dreifachstich)', off: 'nicht sticken' };
// Regler im Dialog: [Parameter, Beschriftung, min, max, Schritt, Format, Hinweis]
export const EMB_SLIDERS = {
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
export const fmtMm1 = (v) => `${Number(v).toFixed(1).replace('.', ',')} mm`;
export const fmtMm2 = (v) => `${Number(v).toFixed(2).replace('.', ',')} mm`;
export const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function openEmbDialog() {
  const r = state.result;
  if (!r || !r.emb) return toast(embroideryProblem(r, state.settings) || 'Kein Ergebnis zum Sticken.', true);
  embDlg.sel = Math.max(0, Math.min(embDlg.sel, r.emb.layers.length - 1));
  embDlg.view = null; // beim ersten Zeichnen einpassen
  embDlg.sig = '';
  $('#emb-dialog').showModal();
  renderEmbDialog();
}

/** Von Hand gesetzte Werte einer Ebene ändern (undefined = zurück zur Automatik). */
export function setEmbManual(key, patch) {
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

export function embLayerSummary(lp, pat, i) {
  const p = lp.params;
  let t = lp.kind === 'line' && p.type !== 'off' ? (p.type === 'triple' ? 'Dreifachstich' : 'Steppstich') : EMB_TYPE_NAMES[p.type] || p.type;
  if (p.type === 'fill') t += ` ${Math.round(p.angle)}° · ${fmtMm2(p.spacing)}`;
  if (pat && p.type !== 'off' && pat.layers && pat.layers[i]) t += ` · ${fmtInt(pat.layers[i].stitches)} Stiche`;
  return t;
}

/** Liste, Einstellungen der gewählten Farbe, Stichvorschau. */
export function renderEmbDialog() {
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

export function renderEmbLayerList(lp, pat) {
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
export function renderEmbEdit(lp) {
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

export function embSliderHtml([k, label, min, max, step, , title]) {
  return `<label class="slider" title="${escHtml(title)}"><span>${label} <output data-o="${k}"></output></span>`
    + `<input type="range" data-p="${k}" min="${min}" max="${max}" step="${step}" /></label>`;
}

/** Stiche neu planen und zeichnen (nach kurzer Pause, damit Regler flüssig bleiben). */
export function scheduleEmbDialog(delay = 120) {
  clearTimeout(embDlg.timer);
  $('#emb-busy').hidden = false;
  const seq = ++embDlg.seq;
  embDlg.timer = setTimeout(async () => {
    const r = state.result;
    if (!$('#emb-dialog').open || !r || !r.emb) return;
    let pat;
    try {
      pat = await planStitches(r);
    } catch (err) {
      if (!isCancelled(err)) { console.error(err); $('#emb-busy').hidden = true; }
      return; // abgebrochen: eine neuere Planung zeichnet
    }
    // inzwischen neu angestoßen, geschlossen oder anderes Ergebnis: die neuere Planung zeichnet
    if (seq !== embDlg.seq || !$('#emb-dialog').open || r !== state.result) return;
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
export const embLayerBoundsCache = new WeakMap();
export function embLayerBounds(pat, layer) {
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
export function embFitView(focus = false) {
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

export function fitEmbView(focus = false) {
  const v = embFitView(focus);
  if (v) embDlg.view = v;
}

/** Sanft zur neuen Ansicht zoomen (0,35 s); bei „Bewegung reduzieren“ sofort. */
export let embAnim = 0;
export function animateEmbView(target) {
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

export function drawEmbCanvas() {
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

export function bindEmbDialog() {
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
