'use strict';

/**
 * KI-Modelle: Registry, Download (für große Modelle) und Inferenz über onnxruntime.
 * Kleine Modelle liegen der App bei (models/), große werden beim ersten Gebrauch
 * nach <userData>/models geladen und per SHA-256 geprüft.
 */

const { app, net, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');

const resources = require('./resources');
const prefs = require('./prefs');
const resultCache = require('./result-cache');

const HF = 'https://huggingface.co';

const MODELS = {
  u2netp: {
    label: 'Freistellen – schnell (U²-Net)',
    file: 'u2netp.onnx',
    license: 'Apache-2.0',
  },
  lineart: {
    label: 'Strichzeichnung – Feine Linien (Informative Drawings, anime)',
    file: 'lineart.onnx',
    license: 'MIT',
  },
  // Weitere Stile desselben Modells (offizielle Gewichte, fp16 mit float32-Ein-/Ausgabe)
  lineart_contour: {
    label: 'Strichzeichnung – Kräftige Konturen (Informative Drawings, contour)',
    file: 'informative-drawings-contour.onnx',
    license: 'MIT',
    url: `${HF}/ipsilondev/informative-drawings-onnx/resolve/8b82fc0163faed5e4e2c002c51cfa9cdaddee1cc/contour.onnx`,
    size: 8602686,
    sha256: 'df4e518f3a958d2eba69cbc4e1fea63d3b0feb57f6aa4f8315a7575efcbc5e11',
  },
  lineart_sketch: {
    label: 'Strichzeichnung – Zarte Skizze (Informative Drawings, opensketch)',
    file: 'informative-drawings-opensketch.onnx',
    license: 'MIT',
    url: `${HF}/ipsilondev/informative-drawings-onnx/resolve/8b82fc0163faed5e4e2c002c51cfa9cdaddee1cc/opensketch.onnx`,
    size: 8602686,
    sha256: 'e4abb6849fc3f3e47ab07dcdc44ee93a7b2b60cb3a841b77c95483633d812cad',
  },
  // U²-Net Portrait (xuebinqin/U-2-Net, Apache-2.0) über LiteRT → ONNX (tf2onnx, opset 17).
  // Feste Eingabe 1×3×512×512 (x/max, ImageNet-Norm), Ausgabe 0..1 (Striche hell).
  lineart_portrait: {
    label: 'Strichzeichnung – Tusche-Porträt (U²-Net Portrait)',
    file: 'u2net_portrait.onnx',
    license: 'Apache-2.0',
    url: `${HF}/mlboydaisuke/U2Net-Portrait-Sketch-OpenVINO/resolve/7ce77a23cec25d110578610dcfa69f1a11fac3e1/portrait.onnx`,
    size: 176264390,
    sha256: '21583a62c262134c1e975b79f2d13eaa24f7e81b945847feb59cd2fc0d678057',
  },
  // TEED (xavysp/TEED, MIT, 58 K Parameter): Kantendetektor. Eingabe BGR 0..255 minus Mittelwert,
  // Ausgabe Kantenwahrscheinlichkeit 0..1.
  lineart_teed: {
    label: 'Strichzeichnung – Feine Kanten (TEED)',
    file: 'teed.onnx',
    license: 'MIT',
    url: `${HF}/Shaboomi/teed-onnx/resolve/21b62020eba372c54ef1d9c07f9a3eb8adc364ab/teed.onnx`,
    size: 248429,
    sha256: 'b81f5787d21a6021a3608f9db2e0bbb5d8c1df0ed0938abd9522128f3dba1f98',
  },
  esrgan: {
    label: 'KI-Vergrößerung (Real-ESRGAN general x4v3)',
    file: 'realesr-general-x4v3.onnx',
    license: 'BSD-3-Clause',
  },
  text: {
    label: 'Texterkennung (PaddleOCR PP-OCRv4)',
    file: 'ppocr-det-v4.onnx',
    license: 'Apache-2.0',
  },
  yunet: {
    label: 'Gesichtspunkte (YuNet)',
    file: 'yunet-2023mar.onnx',
    license: 'MIT',
  },
  scunet: {
    label: 'Rauschen & Körnung entfernen (SCUNet)',
    file: 'scunet_color_real_psnr.onnx',
    license: 'Apache-2.0',
    url: `${HF}/Heliosoph/scunet-onnx/resolve/6d11417ee2fbcc73783c502a238ac115097754fe/scunet_color_real_psnr.onnx`,
    size: 3798678,
    sha256: '231be201ab413dbc999d7951caa9844846b93a12a40a41e037d6b5888ed4e88c',
    // Gewichte liegen in einer zweiten Datei (ONNX „external data“)
    extra: [{
      file: 'scunet_color_real_psnr.onnx.data',
      url: `${HF}/Heliosoph/scunet-onnx/resolve/6d11417ee2fbcc73783c502a238ac115097754fe/scunet_color_real_psnr.onnx.data`,
      size: 73138176,
      sha256: '98825ea1210b641c71e5f052f582c70c49fd44b35387ebe2c034268c17df3feb',
    }],
  },
  lama: {
    label: 'Kratzer & Staub auffüllen (LaMa)',
    file: 'lama_fp32.onnx',
    license: 'Apache-2.0',
    url: `${HF}/Carve/LaMa-ONNX/resolve/c3c0c9e468934d62e79c329e35d82dd09ff8c444/lama_fp32.onnx`,
    size: 208044816,
    sha256: '1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6',
  },
  restoreformer: {
    label: 'Gesichter restaurieren (RestoreFormer++)',
    file: 'restoreformer_pp_fp16w.onnx',
    license: 'Apache-2.0',
    url: `${HF}/Saimon8420/restoreformer-pp-web/resolve/9e5912e04026135bc1a7c8557a2da66f521a7b8e/restoreformer_pp_fp16w.onnx`,
    size: 147524528,
    sha256: '1242189ac358f6eb05952f82c2a8ed01c0b03f2c0a6da1fe0f495128fe3d8d8a',
  },
  faces: {
    label: 'Gesichtserkennung (UltraFace)',
    file: 'ultraface-rfb-320.onnx',
    license: 'MIT',
  },
  sam_encoder: {
    label: 'Objekt anklicken – Encoder (MobileSAM)',
    file: 'mobilesam_encoder.onnx',
    license: 'Apache-2.0 / MIT',
  },
  sam_decoder: {
    label: 'Objekt anklicken – Decoder (MobileSAM)',
    file: 'mobilesam_decoder.onnx',
    license: 'Apache-2.0 / MIT',
  },
  modnet: {
    label: 'Freistellen – Porträt (MODNet)',
    file: 'modnet.onnx',
    license: 'Apache-2.0',
    url: `${HF}/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12/onnx/model.onnx`,
    size: 25888640,
    sha256: '07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9',
  },
  isnet: {
    label: 'Freistellen – präzise (IS-Net)',
    file: 'isnet-general-use.onnx',
    license: 'Apache-2.0',
    url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx',
    size: 178648008,
    sha256: '60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a',
  },
  birefnet: {
    label: 'Freistellen – beste Qualität (BiRefNet lite)',
    file: 'birefnet_lite.onnx',
    license: 'MIT',
    url: `${HF}/onnx-community/BiRefNet_lite-ONNX/resolve/de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model.onnx`,
    size: 224005088,
    sha256: '5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333',
  },
  // BEN2 Base (PramaLLC, MIT), int8-Gewichte von moonbox-dev – laut deren Messung auf DIS5K
  // gleichauf mit fp16 (IoU 0,9965). Eingabe RGB 0..1, Ausgabe Maske (min/max-normiert).
  ben2: {
    label: 'Freistellen – gut & sparsam (BEN2 Base)',
    file: 'ben2_base_int8.onnx',
    license: 'MIT',
    url: `${HF}/moonbox-dev/BEN2-ONNX/resolve/c9244145da7534dbfc0005f4f7d748f9802cacba/int8/model.onnx`,
    size: 130627316,
    sha256: 'dc60def496e0625875a3241cc2859aa189bc2143ff9f2c65fd5ec424e82f05f2',
  },
  depth: {
    label: 'Tiefenkarte für Relief (Depth Anything V2 Small)',
    file: 'depth_anything_v2_small.onnx',
    license: 'Apache-2.0',
    url: `${HF}/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model.onnx`,
    size: 99060839,
    sha256: 'afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c',
  },
};

const BUNDLED_DIR = path
  .join(__dirname, '..', '..', 'models')
  .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const DOWNLOAD_DIR = () => path.join(app.getPath('userData'), 'models');

function getModel(id) {
  const m = MODELS[id];
  if (!m) throw new Error(`Unbekanntes Modell: ${id}`);
  return m;
}

/** Pfad der Modelldatei, falls vorhanden (mitgeliefert oder heruntergeladen). */
function modelPath(id) {
  const m = getModel(id);
  const files = [m.file, ...(m.extra || []).map((e) => e.file)];
  for (const dir of [BUNDLED_DIR, DOWNLOAD_DIR()]) {
    if (files.every((f) => fsSync.existsSync(path.join(dir, f)))) return path.join(dir, m.file);
  }
  return null;
}

/** Alle Dateien eines Modells (Hauptdatei + ggf. externe Gewichte). */
const modelParts = (m) => [{ file: m.file, url: m.url, size: m.size, sha256: m.sha256 }, ...(m.extra || [])];

function status() {
  return Object.entries(MODELS).map(([id, m]) => {
    const p = modelPath(id);
    return {
      id,
      label: m.label,
      license: m.license,
      size: modelParts(m).reduce((sum, p) => sum + (p.size || 0), 0) || null,
      available: !!p,
      downloadable: !!m.url,
      bundled: !!p && p.startsWith(BUNDLED_DIR),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Download                                                           */
/* ------------------------------------------------------------------ */

const downloads = new Map(); // id -> Promise<string>

function download(id, onProgress) {
  if (downloads.has(id)) return downloads.get(id);
  const m = getModel(id);
  if (!m.url) return Promise.reject(new Error(`Modell ${id} fehlt in der Installation.`));

  const p = (async () => {
    await fs.mkdir(DOWNLOAD_DIR(), { recursive: true });
    const parts = modelParts(m);
    const total = parts.reduce((sum, x) => sum + (x.size || 0), 0);
    let before = 0;
    for (const part of parts) {
      const target = path.join(DOWNLOAD_DIR(), part.file);
      if (fsSync.existsSync(target)) { before += part.size || 0; continue; }
      await downloadFile(part, target, (received) => onProgress?.({ id, received: before + received, total }));
      before += part.size || 0;
    }
    onProgress?.({ id, received: total, total, done: true });
    return path.join(DOWNLOAD_DIR(), m.file);
  })();

  downloads.set(id, p);
  p.finally(() => downloads.delete(id)).catch(() => {});
  return p;
}

// laufende Downloads (zum Abbrechen)
const activeDownloads = new Set();

/** Lädt eine Datei, prüft die SHA-256-Prüfsumme und legt sie erst danach ab (abbrechbar). */
async function downloadFile(part, target, onBytes) {
  const tmp = `${target}.part`;
  const ctrl = new AbortController();
  activeDownloads.add(ctrl);
  try {
    return await downloadFileInner(part, target, tmp, onBytes, ctrl.signal);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw ctrl.signal.aborted ? new Error('cancelled') : err;
  } finally {
    activeDownloads.delete(ctrl);
  }
}

async function downloadFileInner(part, target, tmp, onBytes, signal) {
  const res = await net.fetch(part.url, { signal });
  if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
  const hash = crypto.createHash('sha256');
  const out = fsSync.createWriteStream(tmp);
  let received = 0;
  let lastReport = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      received += value.length;
      if (!out.write(value)) await new Promise((r) => out.once('drain', r));
      const now = Date.now();
      if (now - lastReport > 150) {
        lastReport = now;
        onBytes(received);
      }
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  } catch (err) {
    out.destroy();
    await fs.rm(tmp, { force: true });
    throw err;
  }
  if (part.sha256 && hash.digest('hex') !== part.sha256) {
    await fs.rm(tmp, { force: true });
    throw new Error('Prüfsumme des heruntergeladenen Modells stimmt nicht.');
  }
  await fs.rename(tmp, target);
}

async function ensure(id, onProgress) {
  return modelPath(id) || download(id, onProgress);
}

async function remove(id) {
  const m = getModel(id);
  const file = path.join(DOWNLOAD_DIR(), m.file);
  if (worker.proc) worker.proc.postMessage({ type: 'drop', file });
  for (const part of modelParts(m)) await fs.rm(path.join(DOWNLOAD_DIR(), part.file), { force: true });
}

/* ------------------------------------------------------------------ */
/* Inferenz                                                           */
/* ------------------------------------------------------------------ */

// Die Inferenz läuft in einem eigenen Utility-Prozess (model-worker.js), weil
// onnxruntime-node im aufrufenden Thread rechnet und sonst das Fenster blockiert.
const worker = {
  proc: null,
  nextId: 1,
  pending: new Map(), // id -> { resolve, reject }

  ensureProc() {
    if (this.proc) return this.proc;
    // Speicherbudget und Thread-Zahl je nach Leistungsstufe des Rechners
    const limits = resources.LIMITS[resources.tierFor(resources.totalMB())];
    const p = prefs.get();
    this.proc = utilityProcess.fork(path.join(__dirname, 'model-worker.js'), [], {
      serviceName: 'Pic2Laser KI',
      env: {
        ...process.env,
        PIC2LASER_MODEL_BUDGET_MB: String(limits.modelBudgetMB),
        PIC2LASER_THREADS: String(limits.threads),
        PIC2LASER_GPU: p.gpu && GPU_LABEL ? '1' : '0',
        PIC2LASER_GPU_BLOCKED: JSON.stringify(p.gpuBlocked || []),
      },
    });
    const proc = this.proc;
    proc.on('message', (msg) => {
      if (msg.type === 'gpu-failed') {
        // Modell läuft künftig direkt auf der CPU (spart den erneuten Fehlversuch)
        blockGpu(msg.file);
        return;
      }
      if (msg.type === 'gpu-unblock') {
        prefs.set({ gpuBlocked: (prefs.get().gpuBlocked || []).filter((f) => f !== msg.file) });
        return;
      }
      if (proc !== this.proc) return; // Antwort eines abgebrochenen Prozesses ignorieren
      const job = this.pending.get(msg.id);
      if (!job) return;
      this.pending.delete(msg.id);
      if (msg.ok) job.resolve({ result: msg.result, device: msg.device });
      else job.reject(new Error(msg.error));
    });
    proc.on('exit', () => {
      if (proc !== this.proc) return; // abgebrochener Prozess – dessen Jobs sind schon abgelehnt
      this.proc = null;
      const jobs = [...this.pending.values()];
      this.pending.clear();
      for (const job of jobs) {
        if (!job.msg) { job.reject(new Error('KI-Prozess wurde beendet')); continue; }
        // Absturz während einer GPU-Berechnung (z. B. Grafiktreiber): Modell künftig auf der CPU, einmal neu versuchen
        if (job.onGpu && !job.retried) {
          blockGpu(job.msg.file);
          this.run(job.msg.file, job.msg.feeds, job.msg.outputs, job.msg.arena, true).then(job.resolve, job.reject);
        } else {
          job.reject(new Error('KI-Prozess wurde beendet'));
        }
      }
    });
    return proc;
  },

  // Zählt Abbrüche – ein Lauf, der vor dem Abbruch begonnen hat, rechnet danach nicht weiter
  epoch: 0,

  /**
   * Laufende und wartende KI-Berechnungen abbrechen. Der Prozess wird nur beendet, wenn er
   * tatsächlich etwas rechnet (sonst bleiben die geladenen Modelle erhalten). Neue Anfragen
   * gehen sofort an einen neuen Prozess, nicht an den sterbenden.
   */
  cancel() {
    this.epoch++;
    if (!this.proc || this.pending.size === 0) return;
    const old = this.proc;
    this.proc = null;
    for (const job of this.pending.values()) job.reject(new Error('cancelled'));
    this.pending.clear();
    old.kill();
    this.warmUp(); // Ersatzprozess gleich vorstarten
  },

  /** Prozess neu starten (z. B. nach Umschalten der GPU-Nutzung); laufende Berechnungen werden abgebrochen. */
  restart() {
    this.epoch++;
    const old = this.proc;
    this.proc = null;
    for (const job of this.pending.values()) job.reject(new Error('cancelled'));
    this.pending.clear();
    if (old) old.kill();
    this.warmUp();
  },

  /** Prozess starten und die KI-Laufzeit vorab laden (spart Zeit beim ersten KI-Schritt). */
  warmUp() {
    this.ensureProc().postMessage({ type: 'warm' });
  },

  /**
   * Alle zwischengespeicherten Modelle außer `keep` freigeben. Wartet, bis der KI-Prozess
   * fertig ist. Rückgabe: { released, loaded } oder null (kein Prozess / keine Antwort).
   */
  trim(keep) {
    const proc = this.proc;
    if (!proc) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve(null); }, 5000);
      const done = (v) => { clearTimeout(timer); resolve(v); };
      this.pending.set(id, { resolve: (r) => done(r.result), reject: () => done(null), msg: null, onGpu: false, retried: true });
      proc.postMessage({ type: 'trim', keep, id });
    });
  },

  /**
   * KI-Prozess beenden, damit wirklich aller Speicher an das System zurückgeht – auch der,
   * den onnxruntime nach dem Freigeben von Modellen noch zerstückelt im Prozess hält.
   * Nur aufrufen, wenn nichts rechnet (innerhalb von exclusive). Der nächste Lauf startet neu.
   */
  async recycle() {
    const old = this.proc;
    if (!old) return false;
    this.proc = null;
    for (const job of this.pending.values()) job.reject(new Error('cancelled'));
    this.pending.clear();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      old.once('exit', () => { clearTimeout(timer); resolve(); });
      old.kill();
    });
    return true;
  },

  run(file, feeds, outputs, arena = false, retried = false) {
    const proc = this.ensureProc();
    const id = this.nextId++;
    const msg = { id, file, feeds, outputs, arena };
    const onGpu = gpuEligible(file);
    // Absturzschutz: vermerken, welches Modell gerade auf der GPU rechnet (siehe recoverFromGpuCrash)
    if (onGpu) gpuGuard.start(file);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, msg, onGpu, retried });
      proc.postMessage(msg);
    }).finally(() => { if (onGpu) gpuGuard.end(); });
  },
};

/** Modell dauerhaft auf der CPU rechnen lassen (nach Fehler oder Absturz auf der GPU). */
function blockGpu(file) {
  const name = path.basename(file);
  const blocked = new Set(prefs.get().gpuBlocked || []);
  if (blocked.has(name)) return;
  blocked.add(name);
  prefs.set({ gpuBlocked: [...blocked] });
  console.warn(`GPU für ${name} abgeschaltet, Modell rechnet künftig auf der CPU.`);
}

/** Läuft dieses Modell im KI-Prozess auf der GPU? (gleiche Regel wie in model-worker.js) */
function gpuEligible(file) {
  const p = prefs.get();
  return !!(p.gpu && GPU_LABEL && !(p.gpuBlocked || []).includes(path.basename(file)));
}

/*
 * Reißt ein GPU-Absturz die ganze App mit (z. B. hängender Grafiktreiber), bleibt der
 * Vermerk „gpuInFlight“ in prefs.json stehen. Beim nächsten Start wird das Modell dann auf
 * die CPU verlegt, statt erneut abzustürzen. Geschrieben wird nur bei einem Wechsel des
 * Modells; gelöscht erst, wenn eine Weile nichts mehr auf der GPU lief (Kacheln in Folge).
 */
const gpuGuard = {
  timer: null,
  start(file) {
    clearTimeout(this.timer);
    const name = path.basename(file);
    if (prefs.get().gpuInFlight !== name) prefs.set({ gpuInFlight: name });
  },
  end() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => prefs.set({ gpuInFlight: null }), 1500);
  },
};

/** Beim Start: Ist die App zuletzt während einer GPU-Berechnung abgestürzt? */
function recoverFromGpuCrash() {
  const name = prefs.get().gpuInFlight;
  if (!name) return null;
  blockGpu(name);
  prefs.set({ gpuInFlight: null });
  const id = Object.keys(MODELS).find((k) => MODELS[k].file === name);
  return id ? MODELS[id].label : name;
}

let runChain = Promise.resolve();
/** Führt fn aus, sobald alle vorher angefragten Berechnungen fertig sind. */
function exclusive(fn) {
  const p = runChain.then(fn, fn);
  runChain = p.catch(() => {});
  return p;
}

/**
 * feeds: { name: { data: TypedArray, dims: number[], type?: 'float32' } }
 * outputs: Liste der gewünschten Ausgaben (Standard: erste Ausgabe)
 * Rückgabe: { name: { data, dims } }
 */
async function run(id, feeds, outputs, onProgress) {
  const epoch = worker.epoch;
  // schon einmal gerechnet (auch in einer früheren Sitzung)? Dann aus dem Festplatten-Cache
  const useCache = prefs.get().diskCache;
  const key = useCache ? resultCache.keyFor(id, getModel(id).file, feeds, outputs) : null;
  if (key) {
    const hit = await resultCache.get(key);
    if (hit) {
      stats.cacheHits++;
      hit.__fromCache = true; // für die Zeitschätzung im Fenster (Treffer nicht als Rechendauer lernen)
      return hit;
    }
  }
  const file = await ensure(id, onProgress);
  // Speicherprüfung erst, wenn die vorige Berechnung fertig ist – sonst zählt deren Bedarf mit
  // (Kacheln werden vom Fenster schon vorab angefragt). Der KI-Prozess rechnet ohnehin nacheinander.
  const attempt = async () => {
    await checkMemory(id, file, feeds);
    // inzwischen abgebrochen (z. B. während der Speicherprüfung)? Dann nicht mehr rechnen.
    if (epoch !== worker.epoch) throw new Error('cancelled');
    return worker.run(file, feeds, outputs, ARENA_MODELS.has(id));
  };
  const { result, device } = await exclusive(async () => {
    try {
      return await attempt();
    } catch (err) {
      // Speicher reichte beim Rechnen doch nicht (Bedarf ist geschätzt) oder das System hat den
      // KI-Prozess beendet (Speicher voll): alle Modelle verwerfen, frischen Prozess starten, erneut.
      if (epoch !== worker.epoch || !isRetryableMemoryError(err)) throw err;
      console.warn(`${id}: ${err.message} – KI-Prozess wird neu gestartet und die Berechnung wiederholt.`);
      await worker.recycle();
      await settleMemory(resources.peakMB(id, feeds));
      try {
        return await attempt();
      } catch (err2) {
        if (/^OOM: /.test(err2.message)) throw lowMemoryError(id, resources.peakMB(id, feeds), await resources.availableMB());
        throw err2;
      }
    }
  });
  stats.devices[id] = device;
  if (key && epoch === worker.epoch) resultCache.put(key, result);
  return result;
}

/* ------------------------------------------------------------------ */
/* Leistung: GPU & Cache                                              */
/* ------------------------------------------------------------------ */

// Grafikbeschleunigung, die die mitgelieferte KI-Laufzeit auf diesem System anbietet
const GPU_LABEL = process.platform === 'win32' ? 'DirectML'
  : process.platform === 'darwin' && process.arch === 'arm64' ? 'CoreML (Apple GPU/Neural Engine)'
    : process.platform === 'linux' ? 'WebGPU über Vulkan (experimentell)'
      : null;

const stats = { devices: {}, cacheHits: 0 }; // zuletzt genutztes Gerät je Modell

async function perfStatus() {
  const p = prefs.get();
  const blockedFiles = new Set(p.gpuBlocked || []);
  return {
    gpuAvailable: GPU_LABEL,
    gpu: !!p.gpu,
    diskCache: !!p.diskCache,
    devices: stats.devices,
    cpuOnly: Object.entries(MODELS).filter(([, m]) => blockedFiles.has(m.file)).map(([id]) => id),
    cacheHits: stats.cacheHits,
    cache: await resultCache.stats(),
  };
}

async function perfSet(patch) {
  const before = prefs.get();
  const next = {};
  if (typeof patch.gpu === 'boolean') {
    next.gpu = patch.gpu;
    if (patch.gpu) next.gpuBlocked = []; // beim Einschalten alle Modelle erneut auf der GPU versuchen
  }
  if (typeof patch.diskCache === 'boolean') next.diskCache = patch.diskCache;
  prefs.set(next);
  if ('gpu' in next && next.gpu !== before.gpu) {
    stats.devices = {};
    worker.restart();
  }
  return perfStatus();
}

/**
 * Modelle, die mit Speicher-Arena laufen: kleine Modelle mit vielen gleich großen Aufrufen
 * (Kacheln). Gemessen bei Real-ESRGAN: ca. 10–30 % schneller pro Kachel bei ca. 50 MB mehr
 * Speicher. Große Modelle bleiben ohne Arena (BiRefNet bräuchte sonst ~8 statt ~0,5 GB).
 */
const ARENA_MODELS = new Set(['esrgan']);

/**
 * Prüft vor dem Rechnen, ob genug Arbeitsspeicher frei ist (gemessener Bedarf des Modells).
 * Reicht er nicht, wird stufenweise Speicher freigemacht:
 *  1. alle anderen zwischengespeicherten Modelle im KI-Prozess freigeben,
 *  2. reicht das nicht, den KI-Prozess neu starten (gibt wirklich allen Speicher frei,
 *     auch den, den onnxruntime nach dem Freigeben noch im Prozess hält).
 * Erst wenn auch das nicht reicht, wird mit einer verständlichen Meldung abgebrochen
 * (Code LOW_MEMORY), statt dass das System auslagert oder der KI-Prozess abstürzt.
 */
async function checkMemory(id, file, feeds) {
  const need = resources.peakMB(id, feeds);
  // etwas Spielraum nach unten, da der Bedarf geschätzt ist
  const enough = (avail) => avail >= need * 0.9;
  let avail = await resources.availableMBCached();
  if (avail >= need + 300) return;

  const trimmed = await worker.trim(file);
  if (trimmed && trimmed.released > 0) {
    avail = await settleMemory(need);
    if (enough(avail)) return;
  }
  if (await worker.recycle()) {
    console.warn(`${id}: zu wenig Speicher (frei ${avail} MB, Bedarf ${need} MB) – KI-Prozess neu gestartet.`);
    avail = await settleMemory(need);
    if (enough(avail)) return;
  }
  avail = await resources.availableMB();
  if (!enough(avail)) throw lowMemoryError(id, need, avail);
}

/**
 * Nach dem Freigeben dauert es einen Moment, bis das System den Speicher als verfügbar meldet:
 * bis zu ca. 1,5 s messen, bis der Bedarf gedeckt ist. Rückgabe: zuletzt gemessener freier Speicher.
 */
async function settleMemory(need) {
  let avail = 0;
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 100 : 250));
    avail = await resources.availableMB();
    if (avail >= need * 0.9) break;
  }
  return avail;
}

function lowMemoryError(id, need, avail) {
  const gb = (mb) => (mb / 1024).toFixed(1).replace('.', ',');
  return new Error(`LOW_MEMORY: Zu wenig freier Arbeitsspeicher für „${getModel(id).label}“ – benötigt ca. ${gb(need)} GB, frei sind ${gb(avail)} GB (nicht genutzte KI-Modelle wurden bereits freigegeben). Bitte andere Programme schließen oder eine sparsamere Option wählen.`);
}

/** Speicherfehler beim Rechnen oder vom System beendeter KI-Prozess – lohnt einen Neuversuch mit frischem Prozess. */
const isRetryableMemoryError = (err) => /^OOM: |^KI-Prozess wurde beendet/.test(String(err && err.message));

/* ------------------------------------------------------------------ */

function register(ipcMain) {
  const progressTo = (sender) => (p) => {
    if (!sender.isDestroyed()) sender.send('model-progress', p);
  };
  ipcMain.handle('model-status', () => status());
  ipcMain.handle('model-ensure', async (e, id) => {
    await ensure(id, progressTo(e.sender));
    return true;
  });
  ipcMain.handle('model-remove', async (_e, id) => {
    await remove(id);
    return status();
  });
  ipcMain.handle('model-run', (e, id, feeds, outputs) => run(id, feeds, outputs, progressTo(e.sender)));
  ipcMain.handle('system-profile', () => resources.profile());
  ipcMain.handle('perf-status', () => perfStatus());
  ipcMain.handle('perf-set', (_e, patch) => perfSet(patch || {}));
  ipcMain.handle('perf-cache-clear', async () => {
    await resultCache.clear();
    return perfStatus();
  });
}

/** Alles abbrechen: KI-Berechnungen und Modell-Downloads. */
function cancelAll() {
  worker.cancel();
  for (const ctrl of activeDownloads) ctrl.abort();
}

module.exports = { register, cancelAll, warmUp: () => worker.warmUp(), recoverFromGpuCrash, MODELS };
