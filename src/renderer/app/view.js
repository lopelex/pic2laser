/** Ansicht: Zoom, Vergleich, Klickpunkte. */

import { $, $$ } from './dom.js';
import { exportCurrent, sendToLightBurn } from './export.js';
import { HISTORY_SORTS, historyShown, refreshHistory, renderHistory, saveToHistory, setHistoryShown } from './history.js';
import { isSam, usesSeeds } from './keys.js';
import { ZOOM_MAX, ZOOM_STEPS, saveUi, state, ui } from './state.js';

/** Rechnet einen Klick auf ein <img> mit object-fit: contain in relative Bildkoordinaten um. */
/**
 * Index des Klickpunkts unter dem Mauszeiger (oder −1). Die Trefferfläche entspricht
 * der Größe des gezeichneten Markers (Segmentation.drawMarkers), mindestens 10 px.
 */
export function markerAt(img, e, points) {
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

export function imagePointFromEvent(img, e) {
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

export function bindView() {
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
    setHistoryShown(document.body.classList.contains('history-hidden'));
    document.body.classList.toggle('history-hidden', !historyShown);
    requestAnimationFrame(renderMarkers);
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

export function setZoom(i) {
  setZoomValue(ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, i))]);
}

/**
 * Stufenloser Zoom. anchor = { scroller, x, y }: Der Bildpunkt unter (x, y) bleibt stehen.
 * Ohne anchor bleibt die Mitte der Ansicht stehen.
 */
export function setZoomValue(value, anchor = null) {
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
export function renderMarkers() {
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
