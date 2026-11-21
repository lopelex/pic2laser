'use strict';

/**
 * Läuft als Electron-Utility-Prozess: KI-Inferenz mit onnxruntime.
 * onnxruntime-node rechnet trotz asynchroner API im aufrufenden Thread –
 * im Main-Prozess würde das Fenster (inkl. Maus/Tastatur) solange hängen.
 */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

/*
 * GPU-Beschleunigung (sofern eingeschaltet): Windows → DirectML, Apple Silicon → CoreML.
 * Scheitert ein Modell auf der GPU (Laden oder Rechnen), läuft es automatisch auf der CPU
 * weiter und wird dem Hauptprozess gemeldet, der es sich dauerhaft merkt.
 */
const GPU_ON = process.env.PIC2LASER_GPU === '1';
const gpuBlocked = new Set(JSON.parse(process.env.PIC2LASER_GPU_BLOCKED || '[]'));

function gpuProviderWanted() {
  // nur zum Testen: anderen Beschleuniger erzwingen, z. B. PIC2LASER_GPU_EP=webgpu
  if (process.env.PIC2LASER_GPU_EP) return { name: process.env.PIC2LASER_GPU_EP };
  if (process.platform === 'win32') return { name: 'dml' };
  // 0x010 = MLProgram-Format (unterstützt mehr Operationen als das ältere NeuralNetwork-Format)
  if (process.platform === 'darwin' && process.arch === 'arm64') return { name: 'coreml', coreMlFlags: 0x010 };
  // Linux: WebGPU über Vulkan – experimentell, deshalb standardmäßig aus (siehe prefs.js)
  if (process.platform === 'linux') return { name: 'webgpu' };
  return null;
}

let gpuChoice; // undefined = noch nicht ermittelt
function gpuProvider() {
  if (gpuChoice !== undefined) return gpuChoice;
  gpuChoice = null;
  const want = GPU_ON && gpuProviderWanted();
  if (!want) return gpuChoice;
  try {
    // onnxruntime entfernt fehlende Beschleuniger sonst stillschweigend und rechnet auf der CPU
    const ort = require('onnxruntime-node');
    const available = (ort.listSupportedBackends ? ort.listSupportedBackends() : []).map((b) => b.name);
    // DirectML steht nicht in der Liste, ist in den Windows-Binärdateien aber immer enthalten
    if (available.includes(want.name) || want.name === 'dml') gpuChoice = want;
  } catch { /* WebAssembly-Laufzeit: keine GPU */ }
  return gpuChoice;
}

function gpuUnblock(file) {
  const name = path.basename(file);
  if (!gpuBlocked.delete(name)) return;
  process.parentPort.postMessage({ type: 'gpu-unblock', file: name });
}

const wantsGpu = (file) => !!gpuProvider() && !gpuBlocked.has(path.basename(file));

function gpuFailed(file, err) {
  const name = path.basename(file);
  if (gpuBlocked.has(name)) return;
  gpuBlocked.add(name);
  console.warn(`GPU für ${name} nicht nutzbar, weiter auf der CPU:`, String((err && err.message) || err));
  process.parentPort.postMessage({ type: 'gpu-failed', file: name, error: String((err && err.message) || err) });
}


/**
 * Bevorzugt die native Laufzeit (onnxruntime-node, schnell). Wo es keine nativen
 * Binärdateien gibt (z. B. Intel-Macs), wird onnxruntime-web (WebAssembly) genutzt.
 */
async function createSession(file, arena = false) {
  let ort;
  try {
    ort = require('onnxruntime-node');
  } catch (nativeErr) {
    return createWasmSession(file, nativeErr);
  }
  // Standard ohne Speicher-Arena: etwas langsamer, aber z. B. BiRefNet braucht ~0,5 statt ~8 GB RAM.
  // Kleine, oft aufgerufene Modelle (Kacheln) laufen mit Arena schneller.
  const options = { enableCpuMemArena: arena, enableMemPattern: arena, logSeverityLevel: 3 };
  const threads = Number(process.env.PIC2LASER_THREADS) || 0;
  if (threads > 0) options.intraOpNumThreads = threads;
  if (wantsGpu(file)) {
    try {
      // DirectML verlangt sequentielle Ausführung ohne Speichermuster
      const gpuOptions = { ...options, enableMemPattern: false, executionMode: 'sequential', executionProviders: [gpuProvider(), 'cpu'] };
      return { ort, session: await ort.InferenceSession.create(file, gpuOptions), device: 'gpu' };
    } catch (err) {
      gpuFailed(file, err);
    }
  }
  try {
    return { ort, session: await ort.InferenceSession.create(file, options), device: 'cpu' };
  } catch (nativeErr) {
    return createWasmSession(file, nativeErr);
  }
}

async function createWasmSession(file, nativeErr) {
  console.warn('onnxruntime-node nicht verfügbar, nutze WebAssembly:', nativeErr.message);
  const ort = require('onnxruntime-web');
  ort.env.wasm.numThreads = Math.max(1, Math.min(4, os.cpus().length));
  const bytes = await fs.readFile(file);
  const options = { executionProviders: ['wasm'] };
  // externe Gewichte (z. B. SCUNet: *.onnx.data) mitgeben
  const dataFile = `${file}.data`;
  if (require('fs').existsSync(dataFile)) {
    options.externalData = [{ path: path.basename(dataFile), data: await fs.readFile(dataFile) }];
  }
  return { ort, session: await ort.InferenceSession.create(bytes, options), device: 'cpu' };
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
  const { ort, session, device } = await getSession(file, arena);
  const inputs = {};
  for (const [name, t] of Object.entries(feeds)) {
    inputs[name] = new ort.Tensor(t.type || 'float32', t.data, t.dims);
  }
  const fetches = outputs && outputs.length ? outputs : [session.outputNames[0]];
  const res = await session.run(inputs, fetches);
  const result = {};
  for (const name of fetches) result[name] = { data: res[name].data, dims: res[name].dims };
  return { result, device };
}

const isOutOfMemory = (err) => /bad_alloc|failed to allocate|out of memory|allocation/i.test(String(err && err.message || err));

async function run(file, feeds, outputs, arena) {
  try {
    return await runOnce(file, feeds, outputs, arena);
  } catch (err) {
    // Fehler auf der GPU (z. B. nicht unterstützte Operation, Grafikspeicher voll): auf der CPU wiederholen
    const entry = sessions.get(file);
    const onGpu = entry && (await entry.p.then((x) => x.device === 'gpu', () => false));
    if (onGpu) {
      gpuFailed(file, err);
      await release(file);
      try {
        return await run(file, feeds, outputs, arena);
      } catch (cpuErr) {
        // scheitert auch auf der CPU → lag nicht an der GPU (z. B. falsche Eingabe): nicht dauerhaft sperren
        gpuUnblock(file);
        throw cpuErr;
      }
    }
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
      const { result, device } = await run(msg.file, msg.feeds, msg.outputs, !!msg.arena);
      process.parentPort.postMessage({ id: msg.id, ok: true, result, device });
    } catch (err) {
      process.parentPort.postMessage({ id: msg.id, ok: false, error: String((err && err.message) || err) });
    }
  });
});
