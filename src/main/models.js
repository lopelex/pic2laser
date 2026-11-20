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

const HF = 'https://huggingface.co';

const MODELS = {
  u2netp: {
    label: 'Freistellen – schnell (U²-Net)',
    file: 'u2netp.onnx',
    license: 'Apache-2.0',
  },
  lineart: {
    label: 'Strichzeichnung (Informative Drawings)',
    file: 'lineart.onnx',
    license: 'MIT',
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
    this.proc = utilityProcess.fork(path.join(__dirname, 'model-worker.js'), [], {
      serviceName: 'Pic2Laser KI',
      env: { ...process.env, PIC2LASER_MODEL_BUDGET_MB: String(limits.modelBudgetMB), PIC2LASER_THREADS: String(limits.threads) },
    });
    const proc = this.proc;
    proc.on('message', (msg) => {
      if (proc !== this.proc) return; // Antwort eines abgebrochenen Prozesses ignorieren
      const job = this.pending.get(msg.id);
      if (!job) return;
      this.pending.delete(msg.id);
      if (msg.ok) job.resolve(msg.result);
      else job.reject(new Error(msg.error));
    });
    proc.on('exit', () => {
      if (proc !== this.proc) return; // abgebrochener Prozess – dessen Jobs sind schon abgelehnt
      this.proc = null;
      for (const job of this.pending.values()) job.reject(new Error('KI-Prozess wurde beendet'));
      this.pending.clear();
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
  },

  /** Alle zwischengespeicherten Modelle außer `keep` freigeben. */
  trim(keep) {
    if (this.proc) this.proc.postMessage({ type: 'trim', keep });
  },

  run(file, feeds, outputs) {
    const proc = this.ensureProc();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      proc.postMessage({ id, file, feeds, outputs });
    });
  },
};

/**
 * feeds: { name: { data: TypedArray, dims: number[], type?: 'float32' } }
 * outputs: Liste der gewünschten Ausgaben (Standard: erste Ausgabe)
 * Rückgabe: { name: { data, dims } }
 */
async function run(id, feeds, outputs, onProgress) {
  const epoch = worker.epoch;
  const file = await ensure(id, onProgress);
  await checkMemory(id, file, feeds);
  // inzwischen abgebrochen (z. B. während der Speicherprüfung)? Dann nicht mehr rechnen.
  if (epoch !== worker.epoch) throw new Error('cancelled');
  return worker.run(file, feeds, outputs);
}

/**
 * Prüft vor dem Rechnen, ob genug Arbeitsspeicher frei ist (gemessener Bedarf des Modells).
 * Reicht er nicht, werden zuerst zwischengespeicherte Modelle freigegeben. Reicht er dann
 * immer noch nicht, wird mit einer verständlichen Meldung abgebrochen (Code LOW_MEMORY),
 * statt dass das System auslagert oder der KI-Prozess abstürzt.
 */
async function checkMemory(id, file, feeds) {
  const need = resources.peakMB(id, feeds);
  let avail = await resources.availableMBCached();
  if (avail >= need + 300) return;
  worker.trim(file);
  await new Promise((r) => setTimeout(r, 300));
  avail = await resources.availableMB();
  // nach dem Freigeben noch einmal messen; etwas Spielraum, da Bedarf geschätzt ist
  if (avail < need * 0.9) {
    const gb = (mb) => (mb / 1024).toFixed(1).replace('.', ',');
    throw new Error(`LOW_MEMORY: Zu wenig freier Arbeitsspeicher für „${getModel(id).label}“ – benötigt ca. ${gb(need)} GB, frei sind ${gb(avail)} GB. Bitte andere Programme schließen oder eine sparsamere Option wählen.`);
  }
}

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
}

/** Alles abbrechen: KI-Berechnungen und Modell-Downloads. */
function cancelAll() {
  worker.cancel();
  for (const ctrl of activeDownloads) ctrl.abort();
}

module.exports = { register, cancelAll, MODELS };
