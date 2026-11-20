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
  const bundled = path.join(BUNDLED_DIR, m.file);
  if (fsSync.existsSync(bundled)) return bundled;
  const downloaded = path.join(DOWNLOAD_DIR(), m.file);
  if (fsSync.existsSync(downloaded)) return downloaded;
  return null;
}

function status() {
  return Object.entries(MODELS).map(([id, m]) => {
    const p = modelPath(id);
    return {
      id,
      label: m.label,
      license: m.license,
      size: m.size || null,
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
    const target = path.join(DOWNLOAD_DIR(), m.file);
    const part = `${target}.part`;
    const res = await net.fetch(m.url);
    if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
    const total = Number(res.headers.get('content-length')) || m.size || 0;
    const hash = crypto.createHash('sha256');
    const out = fsSync.createWriteStream(part);
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
          onProgress?.({ id, received, total });
        }
      }
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    } catch (err) {
      out.destroy();
      await fs.rm(part, { force: true });
      throw err;
    }
    const digest = hash.digest('hex');
    if (m.sha256 && digest !== m.sha256) {
      await fs.rm(part, { force: true });
      throw new Error('Prüfsumme des heruntergeladenen Modells stimmt nicht.');
    }
    await fs.rename(part, target);
    onProgress?.({ id, received: total, total, done: true });
    return target;
  })();

  downloads.set(id, p);
  p.finally(() => downloads.delete(id)).catch(() => {});
  return p;
}

async function ensure(id, onProgress) {
  return modelPath(id) || download(id, onProgress);
}

async function remove(id) {
  const m = getModel(id);
  const file = path.join(DOWNLOAD_DIR(), m.file);
  if (worker.proc) worker.proc.postMessage({ type: 'drop', file });
  await fs.rm(path.join(DOWNLOAD_DIR(), m.file), { force: true });
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
    this.proc = utilityProcess.fork(path.join(__dirname, 'model-worker.js'), [], { serviceName: 'Pic2Laser KI' });
    this.proc.on('message', (msg) => {
      const job = this.pending.get(msg.id);
      if (!job) return;
      this.pending.delete(msg.id);
      if (msg.ok) job.resolve(msg.result);
      else job.reject(new Error(msg.error));
    });
    this.proc.on('exit', () => {
      this.proc = null;
      for (const job of this.pending.values()) job.reject(new Error('KI-Prozess wurde beendet'));
      this.pending.clear();
    });
    return this.proc;
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
  const file = await ensure(id, onProgress);
  return worker.run(file, feeds, outputs);
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
}

module.exports = { register, MODELS };
