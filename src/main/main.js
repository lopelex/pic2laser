'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, utilityProcess, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

const models = require('./models');

const HISTORY_DIR = () => path.join(app.getPath('userData'), 'history');
const ID_PATTERN = /^[a-f0-9-]{36}$/;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#16181d',
    title: 'Pic2Laser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Hintergrundprozesse vorstarten, sobald das Fenster steht – die erste Umwandlung
  // muss dann nicht auf Prozessstart und Laden der Bibliotheken warten
  mainWindow.webContents.once('did-finish-load', () => {
    for (const t of Object.values(tracers)) t.ensureProc();
    models.warmUp();
    if (crashedGpuModel) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        message: 'Pic2Laser wurde bei einer GPU-Berechnung beendet',
        detail: `Das Modell „${crashedGpuModel}“ läuft ab jetzt auf dem Prozessor. Die übrigen Modelle nutzen weiter die GPU. Unter „Leistung“ lässt sich die GPU ganz ausschalten.`,
      });
    }
  });

  // Links nie im App-Fenster öffnen
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
}

// Ist die App zuletzt während einer GPU-Berechnung abgestürzt? Dann das Modell auf die CPU verlegen
// (muss vor dem Start des KI-Prozesses passieren, der die Liste beim Start übernimmt)
let crashedGpuModel = null;

app.whenReady().then(() => {
  crashedGpuModel = models.recoverFromGpuCrash();
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ------------------------------------------------------------------ */
/* Vektorisierung                                                     */
/* ------------------------------------------------------------------ */

// Potrace läuft in eigenen Utility-Prozessen, damit das Fenster nie blockiert.
// Je Spur (Füllung, Umrisslinie) ein Prozess, damit beide parallel rechnen. Pro Spur
// läuft immer nur eine Vektorisierung; von den wartenden zählt nur die neueste
// (ältere gehören zu überholten Einstellungen und werden verworfen).
const makeTracer = (name) => ({
  proc: null,
  nextId: 1,
  running: null, // { id, resolve, reject }
  pending: null, // { image, params, resolve, reject }

  ensureProc() {
    if (this.proc) return;
    const proc = utilityProcess.fork(path.join(__dirname, 'trace-worker.js'), [], { serviceName: `Pic2Laser Vektorisierung (${name})` });
    this.proc = proc;
    proc.on('message', (msg) => {
      if (proc !== this.proc) return; // Antwort eines abgebrochenen Prozesses ignorieren
      const job = this.running;
      if (!job || job.id !== msg.id) return;
      this.running = null;
      if (msg.ok) job.resolve(msg.d);
      else job.reject(new Error(msg.error));
      this.next();
    });
    proc.on('exit', () => {
      if (proc !== this.proc) return; // abgebrochener Prozess – schon abgekoppelt
      this.proc = null;
      if (this.running) {
        this.running.reject(new Error('Vektorisierung abgebrochen'));
        this.running = null;
      }
      this.next();
    });
  },

  /**
   * Laufende und wartende Vektorisierungen abbrechen. Der laufende Prozess wird sofort
   * abgekoppelt und beendet – neue Aufträge gehen an einen neuen Prozess.
   */
  cancel() {
    if (this.pending) {
      this.pending.reject(new Error('cancelled'));
      this.pending = null;
    }
    if (this.proc && this.running) {
      const old = this.proc;
      this.proc = null;
      this.running.reject(new Error('cancelled'));
      this.running = null;
      old.kill();
      this.ensureProc(); // Ersatzprozess gleich vorstarten (Start + Laden von Potrace kostet Zeit)
    }
  },

  next() {
    if (this.running || !this.pending) return;
    const job = this.pending;
    this.pending = null;
    this.ensureProc();
    this.running = { id: this.nextId++, resolve: job.resolve, reject: job.reject };
    this.proc.postMessage({ id: this.running.id, image: job.image, params: job.params });
  },

  trace(image, params) {
    return new Promise((resolve, reject) => {
      if (this.pending) {
        const cancelled = new Error('cancelled');
        cancelled.cancelled = true;
        this.pending.reject(cancelled);
      }
      this.pending = { image, params, resolve, reject };
      this.next();
    });
  },
});

const tracers = { fill: makeTracer('Füllung'), outline: makeTracer('Umriss') };

ipcMain.handle('app-version', () => app.getVersion());

ipcMain.handle('trace', (_e, image, params, lane) => (tracers[lane] || tracers.fill).trace(image, params || {}));

// „Abbrechen“: Vektorisierung, KI-Berechnungen und Modell-Downloads stoppen
ipcMain.handle('cancel-all', () => {
  for (const t of Object.values(tracers)) t.cancel();
  models.cancelAll();
  return true;
});

/* ------------------------------------------------------------------ */
/* Presets (eigene Einstellungs-Vorlagen)                             */
/* ------------------------------------------------------------------ */

const PRESETS_FILE = () => path.join(app.getPath('userData'), 'presets.json');

async function readPresets() {
  try {
    const list = JSON.parse(await fs.readFile(PRESETS_FILE(), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writePresets(list) {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  const tmp = `${PRESETS_FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(list, null, 2));
  await fs.rename(tmp, PRESETS_FILE());
}

ipcMain.handle('presets-list', () => readPresets());

ipcMain.handle('presets-save', async (_e, preset) => {
  const name = String(preset?.name || '').trim().slice(0, 60);
  if (!name) throw new Error('Name fehlt');
  if (!preset.settings || typeof preset.settings !== 'object') throw new Error('Einstellungen fehlen');
  const list = (await readPresets()).filter((p) => p.name.toLowerCase() !== name.toLowerCase());
  list.push({ name, settings: preset.settings, updated: Date.now() });
  list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  await writePresets(list);
  return list;
});

ipcMain.handle('presets-delete', async (_e, name) => {
  const list = (await readPresets()).filter((p) => p.name !== name);
  await writePresets(list);
  return list;
});

/* KI-Modelle (Freistellen, Strichzeichnung, Vergrößerung, Tiefenkarte) */
models.register(ipcMain);

/* ------------------------------------------------------------------ */
/* Dateien öffnen / exportieren                                       */
/* ------------------------------------------------------------------ */

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif', 'ico'];

ipcMain.handle('open-image', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Bild öffnen',
    properties: ['openFile'],
    filters: [{ name: 'Bilder', extensions: IMAGE_EXTS }],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const filePath = res.filePaths[0];
  const data = await fs.readFile(filePath);
  return { name: path.basename(filePath), data };
});

/**
 * files: [{ ext: 'svg'|'png'|'jpg'|'bmp', data: string|ArrayBuffer }]
 * Der Benutzer wählt einmal Ordner + Basisnamen, alle Formate werden daneben gespeichert.
 */
ipcMain.handle('export-files', async (_e, { baseName, files }) => {
  if (!files || files.length === 0) return null;
  const first = files[0];
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportieren',
    defaultPath: path.join(app.getPath('pictures'), `${sanitize(baseName)}.${first.ext}`),
    filters: [{ name: first.ext.toUpperCase(), extensions: [first.ext] }],
  });
  if (res.canceled || !res.filePath) return null;

  const parsed = path.parse(res.filePath);
  const written = [];
  for (const f of files) {
    const target = path.join(parsed.dir, `${parsed.name}.${f.ext}`);
    await fs.writeFile(target, typeof f.data === 'string' ? f.data : Buffer.from(f.data));
    written.push(target);
  }
  return written;
});

ipcMain.handle('show-in-folder', (_e, filePath) => {
  if (typeof filePath === 'string') shell.showItemInFolder(filePath);
});

/* ------------------------------------------------------------------ */
/* Drag & Drop des Ergebnisses (z. B. direkt in LightBurn)            */
/* ------------------------------------------------------------------ */

// Die Dateien werden nach jeder Berechnung vorbereitet, damit das Ziehen sofort starten kann
// (startDrag muss synchron während der Mausbewegung aufgerufen werden).
// Getrennte Plätze: 'result' = Ergebnis, 'original' = optimiertes Original (Strg + Ziehen)
const DRAG_KINDS = ['result', 'original'];
const DRAG_DIR = (kind = 'result') => path.join(app.getPath('temp'), 'pic2laser-drag', kind);
const dragPrepared = {}; // kind -> { paths, icon }

ipcMain.handle('drag-prepare', async (_e, { baseName, files, icon, kind = 'result' }) => {
  if (!DRAG_KINDS.includes(kind)) throw new Error('Unbekannte Drag-Art');
  const dir = DRAG_DIR(kind);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const paths = [];
  for (const f of files) {
    const target = path.join(dir, `${sanitize(baseName)}.${f.ext}`);
    await fs.writeFile(target, typeof f.data === 'string' ? f.data : Buffer.from(f.data));
    paths.push(target);
  }
  let img = icon ? nativeImage.createFromBuffer(Buffer.from(icon)) : nativeImage.createEmpty();
  if (img.isEmpty()) img = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
  dragPrepared[kind] = { paths, icon: img };
  return paths;
});

ipcMain.on('drag-start', (e, kind = 'result') => {
  const prepared = dragPrepared[kind];
  if (!prepared || !prepared.paths.length) return;
  e.sender.startDrag({ file: prepared.paths[0], files: prepared.paths, icon: prepared.icon });
});

function sanitize(name) {
  return String(name || 'bild').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'bild';
}

/* ------------------------------------------------------------------ */
/* Historie                                                           */
/* ------------------------------------------------------------------ */

function entryDir(id) {
  if (!ID_PATTERN.test(id)) throw new Error('Ungültige ID');
  return path.join(HISTORY_DIR(), id);
}

async function readMeta(id) {
  const raw = await fs.readFile(path.join(entryDir(id), 'meta.json'), 'utf8');
  return JSON.parse(raw);
}

ipcMain.handle('history-list', async () => {
  await fs.mkdir(HISTORY_DIR(), { recursive: true });
  const ids = (await fs.readdir(HISTORY_DIR())).filter((d) => ID_PATTERN.test(d));
  const entries = [];
  for (const id of ids) {
    try {
      const meta = await readMeta(id);
      let thumb = null;
      try {
        const buf = await fs.readFile(path.join(entryDir(id), 'thumb.png'));
        thumb = `data:image/png;base64,${buf.toString('base64')}`;
      } catch { /* kein Vorschaubild */ }
      entries.push({ ...meta, thumb });
    } catch { /* defekter Eintrag – überspringen */ }
  }
  entries.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  return entries;
});

/**
 * entry: { id?, name, originalName, original: {ext, data}?, settings, svg, raster: {ext,data}?, thumb: ArrayBuffer, width, height }
 * Mit vorhandener id wird der Eintrag aktualisiert (Original bleibt erhalten).
 */
ipcMain.handle('history-save', async (_e, entry) => {
  const isNew = !entry.id;
  const id = isNew ? crypto.randomUUID() : entry.id;
  const dir = entryDir(id);
  await fs.mkdir(dir, { recursive: true });

  let meta = {};
  if (!isNew) {
    try { meta = await readMeta(id); } catch { /* neu anlegen */ }
  }

  if (entry.original && entry.original.data) {
    const ext = safeExt(entry.original.ext);
    if (meta.originalFile && meta.originalFile !== `original.${ext}`) {
      await fs.rm(path.join(dir, meta.originalFile), { force: true });
    }
    await fs.writeFile(path.join(dir, `original.${ext}`), Buffer.from(entry.original.data));
    meta.originalFile = `original.${ext}`;
  }
  if (!meta.originalFile) throw new Error('Originalbild fehlt');

  await fs.writeFile(path.join(dir, 'result.svg'), entry.svg || '');
  if (entry.raster && entry.raster.data) {
    await fs.writeFile(path.join(dir, 'result.png'), Buffer.from(entry.raster.data));
  }
  if (entry.thumb) await fs.writeFile(path.join(dir, 'thumb.png'), Buffer.from(entry.thumb));

  const now = Date.now();
  meta = {
    ...meta,
    id,
    name: entry.name || meta.name || 'Bild',
    originalName: entry.originalName || meta.originalName || '',
    settings: entry.settings || {},
    width: entry.width,
    height: entry.height,
    created: meta.created || now,
    updated: now,
  };
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
});

ipcMain.handle('history-load', async (_e, id) => {
  const meta = await readMeta(id);
  const data = await fs.readFile(path.join(entryDir(id), meta.originalFile));
  return { meta, original: data };
});

// Eintrag mit allen Dateien kopieren (neue ID, Name mit „(Kopie)“)
ipcMain.handle('history-duplicate', async (_e, id) => {
  const meta = await readMeta(id);
  const newId = crypto.randomUUID();
  const dir = entryDir(newId);
  await fs.cp(entryDir(id), dir, { recursive: true });
  const now = Date.now();
  const copy = { ...meta, id: newId, name: `${meta.name || 'Bild'} (Kopie)`, created: now, updated: now };
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(copy, null, 2));
  return copy;
});

ipcMain.handle('history-delete', async (_e, id) => {
  await fs.rm(entryDir(id), { recursive: true, force: true });
  return true;
});

ipcMain.handle('history-clear', async () => {
  const res = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Abbrechen', 'Alles löschen'],
    defaultId: 0,
    cancelId: 0,
    message: 'Gesamte Historie löschen?',
    detail: 'Alle gespeicherten Umwandlungen werden unwiderruflich entfernt.',
  });
  if (res.response !== 1) return false;
  await fs.rm(HISTORY_DIR(), { recursive: true, force: true });
  await fs.mkdir(HISTORY_DIR(), { recursive: true });
  return true;
});

ipcMain.handle('history-export-svg', async (_e, id) => {
  const meta = await readMeta(id);
  const svg = await fs.readFile(path.join(entryDir(id), 'result.svg'), 'utf8');
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'SVG speichern',
    defaultPath: path.join(app.getPath('pictures'), `${sanitize(meta.name)}.svg`),
    filters: [{ name: 'SVG', extensions: ['svg'] }],
  });
  if (res.canceled || !res.filePath) return null;
  await fs.writeFile(res.filePath, svg);
  return res.filePath;
});

ipcMain.handle('history-open-folder', (_e, id) => {
  shell.openPath(entryDir(id));
});

function safeExt(ext) {
  const e = String(ext || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  return IMAGE_EXTS.includes(e) ? e : 'png';
}
