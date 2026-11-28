/** Verarbeitungs-Worker (Spuren) und Steuerung der Durchläufe. */

import { runProcess } from './process.js';
import { isOutputKey, state } from './state.js';

/**
 * Web Worker für die schwere Bildverarbeitung. Läuft schon eine Berechnung,
 * wird sie bei einem neuen Auftrag sofort abgebrochen (Worker neu gestartet),
 * damit nur die aktuellen Einstellungen gerechnet werden.
 */
export const Pipeline = (() => {
  function cancelled() {
    const err = new Error('cancelled');
    err.cancelled = true;
    return err;
  }

  /**
   * Eine Spur = ein eigener Worker. Neue Aufträge brechen nur Aufträge derselben Spur ab:
   * Die Vorschau des Originals (cutout) darf die eigentliche Berechnung nicht abbrechen und umgekehrt.
   */
  function makeLane(url = 'pipeline-worker.js') {
    let worker = null;
    let job = null; // { reject }
    return {
      call(type, payload, transfer = []) {
        this.cancel();
        if (!worker) worker = new Worker(url, { type: 'module' });
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
  // Stichplanung: eigener Worker; „Abbrechen“ lässt sie weiterlaufen (sie hängt nicht an der Berechnung)
  const stitch = makeLane('stitch-worker.js');

  return {
    /** Alle laufenden Aufträge sofort abbrechen. */
    cancel() {
      work.cancel();
      view.cancel();
      mix.cancel();
    },
    /** Stiche planen (Embroidery.plan im Worker); ein neuer Auftrag bricht den laufenden ab. */
    planStitches(layers, opts) {
      return stitch.call('plan', { layers, opts });
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
export const isStaleRun = (s) => !!s && s.gen != null && (s.gen !== state.generation || s.source !== state.source); // auch: Bild gewechselt

/** Überholter Durchlauf: still aussteigen (wie ein Abbruch), statt die Worker des aktuellen zu belegen. */
export function throwIfStale(s) {
  if (!isStaleRun(s)) return;
  const err = new Error('cancelled');
  err.cancelled = true;
  throw err;
}

export const isCancelled = (err) => !!err && (err.cancelled || /cancelled$/.test(String(err.message)));

export let processTimer = null;

/** Kennung der Einstellungen ohne Exportformate und Stickeinstellungen (die ändern das Ergebnis nicht). */
export const resultSig = (s) => JSON.stringify(Object.keys(s).filter((k) => !isOutputKey(k)).sort().map((k) => [k, s[k]]));

/** Passt das angezeigte Ergebnis noch zu den aktuellen Einstellungen? */
export const resultIsCurrent = (r) => !!r && !!r.settings && resultSig(r.settings) === resultSig(state.settings) && !state.mergePending;

export function scheduleProcess(delay = 120) {
  if (!state.source) return;
  clearTimeout(processTimer);
  processTimer = setTimeout(runProcess, delay);
}
