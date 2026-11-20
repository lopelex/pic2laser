'use strict';

/**
 * Läuft als Electron-Utility-Prozess: KI-Inferenz mit onnxruntime.
 * onnxruntime-node rechnet trotz asynchroner API im aufrufenden Thread –
 * im Main-Prozess würde das Fenster (inkl. Maus/Tastatur) solange hängen.
 */
const fs = require('fs/promises');
const os = require('os');


/**
 * Bevorzugt die native Laufzeit (onnxruntime-node, schnell). Wo es keine nativen
 * Binärdateien gibt (z. B. Intel-Macs), wird onnxruntime-web (WebAssembly) genutzt.
 */
async function createSession(file, arena = false) {
  try {
    const ort = require('onnxruntime-node');
    // Standard ohne Speicher-Arena: etwas langsamer, aber z. B. BiRefNet braucht ~0,5 statt ~8 GB RAM.
    // Kleine, oft aufgerufene Modelle (Kacheln) laufen mit Arena schneller.
    const options = { enableCpuMemArena: arena, enableMemPattern: arena, logSeverityLevel: 3 };
    const threads = Number(process.env.PIC2LASER_THREADS) || 0;
    if (threads > 0) options.intraOpNumThreads = threads;
    return { ort, session: await ort.InferenceSession.create(file, options) };
  } catch (nativeErr) {
    console.warn('onnxruntime-node nicht verfügbar, nutze WebAssembly:', nativeErr.message);
    const ort = require('onnxruntime-web');
    ort.env.wasm.numThreads = Math.max(1, Math.min(4, os.cpus().length));
    const bytes = await fs.readFile(file);
    const options = { executionProviders: ['wasm'] };
    // externe Gewichte (z. B. SCUNet: *.onnx.data) mitgeben
    const dataFile = `${file}.data`;
    if (require('fs').existsSync(dataFile)) {
      options.externalData = [{ path: require('path').basename(dataFile), data: await fs.readFile(dataFile) }];
    }
    return { ort, session: await ort.InferenceSession.create(bytes, options) };
  }
}

/*
 * Speicherverwaltung: Geladene Modelle bleiben für schnelle Wiederholungen im Speicher,
 * aber nur bis zu einem Budget (abhängig vom Arbeitsspeicher). Am längsten unbenutzte
 * Modelle werden vorher freigegeben. Gerechnet wird immer nur eine Anfrage gleichzeitig.
 */
const sessions = new Map(); // Dateipfad -> { p: Promise<{ ort, session }>, size, lastUsed }
// Budget kommt aus der Leistungsstufe des Rechners (resources.js), Fallback: 20 % des RAM
const BUDGET = Number(process.env.PIC2LASER_MODEL_BUDGET_MB) * 1048576 || Math.min(3e9, Math.max(6e8, os.totalmem() * 0.2));

async function fileSize(file) {
  let size = 0;
  for (const f of [file, `${file}.data`]) {
    try { size += (await fs.stat(f)).size; } catch { /* keine externe Datei */ }
  }
  return size;
}

async function release(file) {
  const entry = sessions.get(file);
  if (!entry) return;
  sessions.delete(file);
  try {
    const { session } = await entry.p;
    if (session.release) await session.release();
  } catch { /* war schon fehlerhaft */ }
}

async function makeRoom(file, needed) {
  const loaded = () => [...sessions.entries()].filter(([f]) => f !== file);
  let total = loaded().reduce((sum, [, e]) => sum + e.size, 0);
  for (const [f, e] of loaded().sort((a, b) => a[1].lastUsed - b[1].lastUsed)) {
    if (total + needed <= BUDGET) break;
    await release(f);
    total -= e.size;
  }
}

async function getSession(file, arena) {
  let entry = sessions.get(file);
  if (!entry) {
    const size = await fileSize(file);
    await makeRoom(file, size);
    const p = createSession(file, arena);
    entry = { p, size, lastUsed: Date.now() };
    sessions.set(file, entry);
    p.catch(() => sessions.delete(file));
  }
  entry.lastUsed = Date.now();
  return entry.p;
}

async function runOnce(file, feeds, outputs, arena) {
  const { ort, session } = await getSession(file, arena);
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

const isOutOfMemory = (err) => /bad_alloc|failed to allocate|out of memory|allocation/i.test(String(err && err.message || err));

async function run(file, feeds, outputs, arena) {
  try {
    return await runOnce(file, feeds, outputs, arena);
  } catch (err) {
    if (!isOutOfMemory(err)) throw err;
    // Speicher voll: alle Modelle freigeben und einmal neu versuchen
    for (const f of [...sessions.keys()]) await release(f);
    try {
      return await runOnce(file, feeds, outputs, arena);
    } catch (err2) {
      if (isOutOfMemory(err2)) {
        throw new Error('Nicht genug Arbeitsspeicher für dieses KI-Modell. Bitte andere Programme schließen oder ein kleineres Modell bzw. Bild verwenden.');
      }
      throw err2;
    }
  }
}

// Immer nur eine Berechnung gleichzeitig (abgebrochene Läufe dürfen nicht parallel weiterrechnen)
let queue = Promise.resolve();

process.parentPort.on('message', (e) => {
  const msg = e.data;
  if (msg.type === 'warm') {
    // native Laufzeit vorab laden (dauert beim ersten require spürbar)
    queue = queue.then(() => { try { require('onnxruntime-node'); } catch { /* Fallback WebAssembly */ } });
    return;
  }
  if (msg.type === 'drop') {
    queue = queue.then(() => release(msg.file));
    return;
  }
  if (msg.type === 'trim') {
    // vor speicherhungrigen Modellen: alle anderen freigeben
    queue = queue.then(async () => {
      for (const f of [...sessions.keys()]) if (f !== msg.keep) await release(f);
    });
    return;
  }
  queue = queue.then(async () => {
    try {
      const result = await run(msg.file, msg.feeds, msg.outputs, !!msg.arena);
      process.parentPort.postMessage({ id: msg.id, ok: true, result });
    } catch (err) {
      process.parentPort.postMessage({ id: msg.id, ok: false, error: String((err && err.message) || err) });
    }
  });
});
