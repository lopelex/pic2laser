/**
 * Web Worker für die Stichplanung (Embroidery.plan): Bei großen Motiven dauert sie bis zu einer
 * Sekunde und würde sonst die Oberfläche blockieren. Gleiches Protokoll wie pipeline-worker.js.
 */

import { Embroidery } from './embroidery.js';

self.onmessage = (e) => {
  const { type, payload } = e.data;
  try {
    if (type !== 'plan') throw new Error(`Unbekannter Auftrag: ${type}`);
    self.postMessage({ ok: true, result: Embroidery.plan(payload.layers, payload.opts) });
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
