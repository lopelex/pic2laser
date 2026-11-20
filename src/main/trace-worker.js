'use strict';

/**
 * Läuft als Electron-Utility-Prozess: Potrace-Vektorisierung, ohne den
 * Main-Prozess (und damit das Fenster) zu blockieren.
 */
const { Potrace } = require('potrace');

function clamp(v, min, max) {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

async function trace(pngBytes, params) {
  const tracer = new Potrace({
    threshold: 128,
    blackOnWhite: true,
    turdSize: clamp(Number(params.turdSize) || 0, 0, 100000),
    alphaMax: clamp(Number(params.alphaMax), 0, 1.3334),
    optCurve: params.optCurve !== false,
    optTolerance: clamp(Number(params.optTolerance) || 0.2, 0.01, 5),
    turnPolicy: Potrace.TURNPOLICY_MINORITY,
  });
  await new Promise((resolve, reject) => {
    tracer.loadImage(Buffer.from(pngBytes), (err) => (err ? reject(err) : resolve()));
  });
  // Nur das "d"-Attribut zurückgeben; das SVG baut der Renderer selbst (mit mm-Maßen)
  const tag = tracer.getPathTag('#000');
  const match = tag.match(/\sd="([^"]*)"/);
  return match ? match[1] : '';
}

process.parentPort.on('message', async (e) => {
  const { id, png, params } = e.data;
  try {
    process.parentPort.postMessage({ id, ok: true, d: await trace(png, params) });
  } catch (err) {
    process.parentPort.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
});
