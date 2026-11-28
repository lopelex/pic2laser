/** Fortschritt und Restzeit-Schätzung. */

import { AI } from '../ai.js';
import { $ } from './dom.js';
import { MODEL_NAMES } from './keys.js';
import { fmtMB } from './models-ui.js';
import { state } from './state.js';

/**
 * Gelernte Laufzeiten pro Schritt (ms je Einheit, z. B. je Megapixel oder je Modellaufruf).
 * Startwerte stammen aus Messungen; danach passt sich die Schätzung dem Rechner an.
 */
export const Timing = (() => {
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

export function fmtDuration(ms) {
  if (ms < 1500) return 'gleich fertig';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `noch ca. ${sec} s`;
  return `noch ca. ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min`;
}

/** Fortschritt eines Berechnungsdurchlaufs mit Restzeit-Anzeige. */
export const Run = {
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

export function showProgress(label, fraction) {
  $('#progress').hidden = false;
  $('#progress-label').textContent = label;
  const fill = $('#progress-fill');
  fill.classList.toggle('indeterminate', fraction == null);
  fill.style.width = fraction == null ? '' : `${Math.round(fraction * 100)}%`;
}

export function hideProgress() {
  $('#progress').hidden = true;
}

// Download-Fortschritt mit Restzeit aus der bisherigen Datenrate
export const downloadStarts = new Map();
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
