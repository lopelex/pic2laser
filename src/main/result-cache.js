'use strict';

/**
 * Festplatten-Cache für KI-Ergebnisse: gleiche Eingabe an dasselbe Modell → gespeichertes
 * Ergebnis statt neuer Berechnung. Wirkt über Bildwechsel und Neustarts hinweg (z. B. beim
 * erneuten Öffnen eines Bildes oder Historie-Eintrags). Schlüssel: Modell + App-Version +
 * Eingabedaten (SHA-256). Begrenzte Größe, am längsten unbenutzte Einträge fliegen zuerst raus.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

const DIR = () => path.join(app.getPath('userData'), 'ai-cache');
const LIMIT_BYTES = 2 * 1024 ** 3;
const NAME = /^[a-f0-9]{64}\.bin$/;

const TYPES = {
  Float32Array, Float64Array, Int8Array, Uint8Array, Int16Array, Uint16Array,
  Int32Array, Uint32Array, BigInt64Array, BigUint64Array,
};
// fp16-Modelle (z. B. BEN2) liefern Float16Array – ohne diesen Eintrag würden sie nie gespeichert
if (typeof Float16Array === 'function') TYPES.Float16Array = Float16Array;

let indexPromise = null; // Promise<Map name -> { size, t }>
let writing = Promise.resolve();

/** Index einmal laden; gleichzeitige Aufrufer warten auf denselben, vollständigen Index. */
function loadIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const idx = new Map();
      await fs.mkdir(DIR(), { recursive: true });
      for (const name of await fs.readdir(DIR())) {
        // Reste abgebrochener Schreibvorgänge (Absturz) wegräumen
        if (name.endsWith('.tmp')) { await fs.rm(path.join(DIR(), name), { force: true }); continue; }
        if (!NAME.test(name)) continue;
        try {
          const st = await fs.stat(path.join(DIR(), name));
          idx.set(name, { size: st.size, t: st.mtimeMs });
        } catch { /* inzwischen gelöscht */ }
      }
      return idx;
    })();
    indexPromise.catch(() => { indexPromise = null; });
  }
  return indexPromise;
}

const bytesOf = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

/** Schlüssel aus Modell, Ausgaben und Eingabedaten. */
function keyFor(id, modelFile, feeds, outputs) {
  const h = crypto.createHash('sha256');
  h.update(`${app.getVersion()}|${id}|${path.basename(modelFile)}|${JSON.stringify(outputs || null)}`);
  for (const name of Object.keys(feeds).sort()) {
    const t = feeds[name];
    h.update(`|${name}|${t.type || 'float32'}|${t.dims.join('x')}|`);
    h.update(bytesOf(t.data));
  }
  return h.digest('hex');
}

/** Gespeichertes Ergebnis oder null. */
async function get(key) {
  const idx = await loadIndex();
  const name = `${key}.bin`;
  if (!idx.has(name)) return null;
  const file = path.join(DIR(), name);
  try {
    const buf = await fs.readFile(file);
    const headLen = buf.readUInt32LE(0);
    const head = JSON.parse(buf.toString('utf8', 4, 4 + headLen));
    let off = 4 + headLen;
    const result = {};
    for (const [n, o] of Object.entries(head)) {
      const Ctor = TYPES[o.type];
      if (!Ctor) throw new Error('unbekannter Typ');
      // kopieren, damit die Daten korrekt ausgerichtet sind
      const ab = buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + o.bytes);
      result[n] = { data: new Ctor(ab), dims: o.dims };
      off += o.bytes;
    }
    const now = Date.now();
    idx.get(name).t = now;
    fs.utimes(file, now / 1000, now / 1000).catch(() => {});
    return result;
  } catch {
    idx.delete(name);
    fs.rm(file, { force: true }).catch(() => {});
    return null;
  }
}

/** Ergebnis im Hintergrund speichern (blockiert die Rückgabe nicht). */
function put(key, result) {
  writing = writing.then(async () => {
    const idx = await loadIndex();
    const head = {};
    const parts = [];
    for (const [n, r] of Object.entries(result)) {
      const type = r.data.constructor.name;
      if (!TYPES[type]) { // unbekannter Typ – nicht speichern (sonst wird diese Berechnung jedes Mal wiederholt)
        console.warn(`KI-Cache: Ergebnistyp ${type} wird nicht unterstützt`);
        return;
      }
      head[n] = { type, dims: r.dims, bytes: r.data.byteLength };
      parts.push(bytesOf(r.data));
    }
    const headBuf = Buffer.from(JSON.stringify(head));
    const len = Buffer.alloc(4);
    len.writeUInt32LE(headBuf.length);
    const size = 4 + headBuf.length + parts.reduce((s, p) => s + p.length, 0);
    if (size > LIMIT_BYTES / 4) return;
    await evict(size);
    const name = `${key}.bin`;
    const tmp = path.join(DIR(), `${name}.tmp`);
    await fs.writeFile(tmp, Buffer.concat([len, headBuf, ...parts]));
    await fs.rename(tmp, path.join(DIR(), name));
    idx.set(name, { size, t: Date.now() });
  }).catch((err) => console.warn('KI-Cache: Speichern fehlgeschlagen', err.message));
}

/** Älteste Einträge löschen, bis `incoming` Bytes Platz haben. */
async function evict(incoming) {
  const idx = await loadIndex();
  let total = [...idx.values()].reduce((s, e) => s + e.size, 0);
  if (total + incoming <= LIMIT_BYTES) return;
  for (const [name, e] of [...idx.entries()].sort((a, b) => a[1].t - b[1].t)) {
    if (total + incoming <= LIMIT_BYTES) break;
    await fs.rm(path.join(DIR(), name), { force: true });
    idx.delete(name);
    total -= e.size;
  }
}

async function stats() {
  const idx = await loadIndex();
  return { count: idx.size, bytes: [...idx.values()].reduce((s, e) => s + e.size, 0), limit: LIMIT_BYTES };
}

function clear() {
  // in die Schreibkette einreihen: ein gleichzeitig angefragtes put läuft danach, nicht parallel zum Löschen
  const done = writing.then(async () => {
    await fs.rm(DIR(), { recursive: true, force: true });
    indexPromise = null;
    await loadIndex();
  });
  writing = done.catch(() => {});
  return done;
}

module.exports = { keyFor, get, put, stats, clear };
