'use strict';

/**
 * Läuft als Electron-Utility-Prozess: KI-Inferenz mit onnxruntime.
 * onnxruntime-node rechnet trotz asynchroner API im aufrufenden Thread –
 * im Main-Prozess würde das Fenster (inkl. Maus/Tastatur) solange hängen.
 */
const fs = require('fs/promises');
const os = require('os');

const sessions = new Map(); // Dateipfad -> Promise<{ ort, session }>

/**
 * Bevorzugt die native Laufzeit (onnxruntime-node, schnell). Wo es keine nativen
 * Binärdateien gibt (z. B. Intel-Macs), wird onnxruntime-web (WebAssembly) genutzt.
 */
async function createSession(file) {
  try {
    const ort = require('onnxruntime-node');
    // Ohne Speicher-Arena: etwas langsamer, aber z. B. BiRefNet braucht ~0,5 statt ~8 GB RAM
    const options = { enableCpuMemArena: false, enableMemPattern: false, logSeverityLevel: 3 };
    return { ort, session: await ort.InferenceSession.create(file, options) };
  } catch (nativeErr) {
    console.warn('onnxruntime-node nicht verfügbar, nutze WebAssembly:', nativeErr.message);
    const ort = require('onnxruntime-web');
    ort.env.wasm.numThreads = Math.max(1, Math.min(4, os.cpus().length));
    const bytes = await fs.readFile(file);
    return { ort, session: await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }) };
  }
}

function getSession(file) {
  if (!sessions.has(file)) {
    const p = createSession(file);
    sessions.set(file, p);
    p.catch(() => sessions.delete(file));
  }
  return sessions.get(file);
}

async function run(file, feeds, outputs) {
  const { ort, session } = await getSession(file);
  const inputs = {};
  for (const [name, t] of Object.entries(feeds)) {
    inputs[name] = new ort.Tensor(t.type || 'float32', t.data, t.dims);
  }
  const fetches = outputs && outputs.length ? outputs : [session.outputNames[0]];
  const res = await session.run(inputs, fetches);
  const result = {};
  for (const name of fetches) result[name] = { data: res[name].data, dims: res[name].dims };
  return result;
}

process.parentPort.on('message', async (e) => {
  const msg = e.data;
  if (msg.type === 'drop') {
    sessions.delete(msg.file);
    return;
  }
  try {
    const result = await run(msg.file, msg.feeds, msg.outputs);
    process.parentPort.postMessage({ id: msg.id, ok: true, result });
  } catch (err) {
    process.parentPort.postMessage({ id: msg.id, ok: false, error: String((err && err.message) || err) });
  }
});
