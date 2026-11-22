'use strict';

/**
 * Updates über die GitHub-Releases: Prüfung beim Start und danach alle 24 Stunden.
 *
 * Der Nutzer bekommt einen Hinweis und entscheidet selbst („Aktualisieren“). Danach läuft alles
 * automatisch (installierte App): Die neue Version wird nach `<userData>/updates` geladen (SHA-256 aus
 * der GitHub-API geprüft) und entweder sofort („Jetzt neu starten“) oder beim nächsten Beenden
 * installiert – ohne dass der Nutzer selbst etwas herunterladen oder installieren muss:
 *   - Windows-Installer: NSIS still (/S --updated), bei Bedarf mit Administratorrechten (UAC)
 *   - Windows portabel: laufende EXE umbenennen, neue an ihre Stelle, alte beim nächsten Start löschen
 *   - macOS: ZIP entpacken, .app-Paket nach dem Beenden austauschen
 *   - Linux-AppImage: Datei ersetzen (die laufende behält ihren Inhalt)
 * Manueller Modus (Entwicklung, kein Schreibrecht, unbekanntes Paket): Datei in den
 * Download-Ordner laden und im Ordner zeigen bzw. die Download-Seite öffnen.
 */
const { app, net, shell } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');

const prefs = require('./prefs');

const REPO = 'lopelex/pic2laser';
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const PAGE_PREFIX = `https://github.com/${REPO}/`;
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
// Stündlich nachsehen, ob 24 h vorbei sind – ein einziger 24-h-Timer verschiebt sich im Ruhezustand
const TICK = 60 * 60 * 1000;
const FIRST_CHECK_DELAY = 5000;
const STALL_MS = 60000;

const UPDATES_DIR = () => path.join(app.getPath('userData'), 'updates');

let send = () => {};
// newer: eine neuere Version ist bekannt (bleibt auch bei einem Download-Fehler gesetzt)
// auto: Update wird ohne Zutun geladen und installiert (sonst manueller Download)
let state = { phase: 'idle', current: app.getVersion(), platform: process.platform, newer: false, auto: false };
let checking = null;
let download = null; // { ctrl }
let tickTimer = null;
let installed = false; // Installation schon angestoßen (nicht beim Beenden noch einmal)
let mode = null;

function setState(patch) {
  state = { ...state, ...patch };
  send(state);
}

/** 1.10.0 > 1.9.2; Vorabversionen (1.9.0-beta) zählen weniger als die fertige Version. */
function compareVersions(a, b) {
  const parse = (v) => {
    const [main, pre] = String(v).replace(/^v/i, '').split('-', 2);
    return { nums: main.split('.').map((n) => parseInt(n, 10) || 0), pre: pre || '' };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] || 0) - (y.nums[i] || 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

function writable(p) {
  try {
    fsSync.accessSync(p, fsSync.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wie lässt sich diese Installation aktualisieren?
 * { kind: 'nsis'|'portable'|'mac'|'appimage', target, elevate } oder null (manuell).
 */
function detectMode() {
  if (!app.isPackaged) return null;
  if (process.platform === 'win32') {
    const portable = process.env.PORTABLE_EXECUTABLE_FILE;
    if (portable) return writable(path.dirname(portable)) ? { kind: 'portable', target: portable } : null;
    // Installation für alle Benutzer (Programme-Ordner) → Installer braucht Administratorrechte
    return { kind: 'nsis', target: process.execPath, elevate: !writable(path.dirname(process.execPath)) };
  }
  if (process.platform === 'darwin') {
    // …/Pic2Laser.app/Contents/MacOS/Pic2Laser → …/Pic2Laser.app
    const bundle = path.resolve(process.execPath, '..', '..', '..');
    // App-Translocation (direkt aus „Downloads“ gestartet) oder kein Schreibrecht → manuell
    if (!bundle.endsWith('.app') || bundle.includes('/AppTranslocation/')) return null;
    return writable(bundle) && writable(path.dirname(bundle)) ? { kind: 'mac', target: bundle } : null;
  }
  if (process.platform === 'linux') {
    const image = process.env.APPIMAGE;
    return image && writable(path.dirname(image)) ? { kind: 'appimage', target: image } : null;
  }
  return null;
}

/** Passende Datei der Release für dieses System (oder null → Download-Seite öffnen). */
function pickAsset(assets) {
  const by = (re) => assets.find((a) => re.test(a.name)) || null;
  if (process.platform === 'win32') {
    return process.env.PORTABLE_EXECUTABLE_FILE ? by(/-Portable-.*\.exe$/i) : by(/-Setup-.*\.exe$/i);
  }
  if (process.platform === 'darwin') return by(new RegExp(`-mac-${process.arch}\\.zip$`, 'i'));
  if (process.platform === 'linux') return by(/\.AppImage$/i);
  return null;
}

async function fetchLatest() {
  const res = await net.fetch(API_LATEST, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Pic2Laser-Updater' },
  });
  if (!res.ok) throw new Error(`Update-Server antwortet nicht (HTTP ${res.status})`);
  const rel = await res.json();
  const asset = pickAsset(Array.isArray(rel.assets) ? rel.assets : []);
  const sha = asset && /^sha256:([a-f0-9]{64})$/i.exec(asset.digest || '');
  return {
    version: String(rel.tag_name || '').replace(/^v/i, ''),
    name: rel.name || '',
    notes: String(rel.body || ''),
    pageUrl: String(rel.html_url || '').startsWith(PAGE_PREFIX) ? rel.html_url : `${PAGE_PREFIX}releases/latest`,
    asset: asset && {
      name: path.basename(asset.name),
      url: asset.browser_download_url,
      size: asset.size,
      sha256: sha ? sha[1].toLowerCase() : null,
    },
    // 'auto' = wird ohne Zutun geladen und installiert – nur mit Prüfsumme, nie eine ungeprüfte Datei;
    // sonst manuell: Windows-Installer starten bzw. Datei im Ordner zeigen
    installKind: state.auto && sha ? 'auto'
      : process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_FILE ? 'installer' : 'file',
  };
}

/** Prüft auf eine neue Version. manual: Fortschritt („checking“) und Fehler auch bei bekanntem Update melden. */
function check({ manual = false } = {}) {
  if (checking) return checking;
  // Während eines Downloads oder mit fertiger Datei nichts überschreiben
  if (state.phase === 'downloading' || state.phase === 'ready') return Promise.resolve(state);
  checking = (async () => {
    if (manual) setState({ phase: 'checking', error: null });
    try {
      const latest = await fetchLatest();
      prefs.set({ lastUpdateCheck: Date.now() });
      if (latest.version && compareVersions(latest.version, state.current) > 0) {
        setState({ phase: 'available', latest, newer: true, error: null });
      } else {
        setState({ phase: 'uptodate', latest, newer: false, error: null });
      }
    } catch (err) {
      console.warn('Update-Prüfung fehlgeschlagen:', err.message);
      if (state.newer) {
        if (manual) setState({ phase: 'available', error: err.message });
      } else {
        setState({ phase: 'error', error: err.message });
      }
    }
    return state;
  })().finally(() => { checking = null; });
  return checking;
}

/** Lädt die neue Version (automatisch: nach userData/updates, sonst in den Download-Ordner). */
async function startDownload() {
  const latest = state.latest;
  if (download || (state.phase !== 'available' && state.phase !== 'error')) return state;
  if (!latest) throw new Error('Es wurde noch keine neue Version gefunden.');
  if (!latest.asset) throw new Error('Für dieses System gibt es keine passende Datei – bitte die Download-Seite öffnen.');
  if (!/^https:\/\/github\.com\//.test(latest.asset.url)) throw new Error('Ungültige Download-Adresse.');
  const auto = latest.installKind === 'auto';

  const dir = auto ? UPDATES_DIR() : app.getPath('downloads');
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, latest.asset.name);
  // Schon vollständig geladen (z. B. vor einem Neustart)? Dann nicht noch einmal
  if (latest.asset.sha256 && (await fileSha256(target).catch(() => null)) === latest.asset.sha256) {
    return finishDownload(target, auto);
  }

  const ctrl = new AbortController();
  download = { ctrl };
  const tmp = `${target}.${crypto.randomUUID().slice(0, 8)}.part`;
  let stalled = false;
  let timer = null;
  const alive = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { stalled = true; ctrl.abort(); }, STALL_MS);
  };
  setState({ phase: 'downloading', progress: { received: 0, total: latest.asset.size }, error: null });
  alive();
  try {
    const res = await net.fetch(latest.asset.url, { signal: ctrl.signal });
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
        alive();
        hash.update(value);
        received += value.length;
        if (!out.write(value)) await new Promise((r) => out.once('drain', r));
        const now = Date.now();
        if (now - lastReport > 200) {
          lastReport = now;
          setState({ progress: { received, total: latest.asset.size } });
        }
      }
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    } catch (err) {
      out.destroy();
      throw err;
    }
    if (latest.asset.sha256 && hash.digest('hex') !== latest.asset.sha256) {
      throw new Error('Prüfsumme der heruntergeladenen Datei stimmt nicht – bitte erneut versuchen.');
    }
    await fs.rm(target, { force: true });
    await fs.rename(tmp, target);
    clearTimeout(timer);
    download = null;
    return await finishDownload(target, auto);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    if (ctrl.signal.aborted && !stalled) {
      setState({ phase: 'available', progress: null, error: null });
    } else {
      const msg = stalled ? 'Download hängt (keine Daten seit 60 s) – bitte Internetverbindung prüfen.' : err.message;
      setState({ phase: 'error', progress: null, error: msg });
    }
    return state;
  } finally {
    clearTimeout(timer);
    download = null;
  }
}

/** Nach dem Download: macOS-ZIP schon jetzt entpacken (Beenden bleibt schnell, Fehler werden sichtbar). */
async function finishDownload(file, auto) {
  let staged = null;
  try {
    if (auto && mode.kind === 'mac') staged = await stageMac(file);
    setState({ phase: 'ready', file, staged, progress: null, error: null });
  } catch (err) {
    setState({ phase: 'error', progress: null, error: `Update konnte nicht vorbereitet werden: ${err.message}` });
  }
  return state;
}

async function stageMac(zip) {
  const stage = path.join(UPDATES_DIR(), 'stage');
  await fs.rm(stage, { recursive: true, force: true });
  await fs.mkdir(stage, { recursive: true });
  const r = spawnSync('/usr/bin/ditto', ['-x', '-k', zip, stage], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ZIP lässt sich nicht entpacken (${(r.stderr || r.error?.message || '').trim()})`);
  const name = (await fs.readdir(stage)).find((n) => n.endsWith('.app'));
  if (!name) throw new Error('Im ZIP ist keine App.');
  const appDir = path.join(stage, name);
  await fs.access(path.join(appDir, 'Contents', 'Info.plist'));
  spawnSync('/usr/bin/xattr', ['-cr', appDir]); // Quarantäne-Vermerk entfernen, falls vorhanden
  return appDir;
}

function cancelDownload() {
  download?.ctrl.abort();
}

async function fileSha256(file) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    fsSync.createReadStream(file).on('data', (d) => hash.update(d)).on('end', resolve).on('error', reject);
  });
  return hash.digest('hex');
}

/* ---------- Installation ---------- */

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Startet einen Prozess, der unabhängig von Pic2Laser weiterläuft. */
function detached(cmd, args) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', (err) => console.warn('Update-Hilfsprozess:', err.message));
  child.unref();
  return child;
}

/** Shell-Skript, das wartet, bis Pic2Laser beendet ist (POSIX). Argumente: $1 = PID, weitere je Skript. */
function afterExitSh(script, args) {
  detached('/bin/sh', ['-c', `while kill -0 "$1" 2>/dev/null; do sleep 0.3; done; ${script}`, 'pic2laser-update', String(process.pid), ...args]);
}

/**
 * Installiert die geladene Version. relaunch: Pic2Laser danach wieder starten.
 * Synchron genug für „will-quit“: alles Langsame läuft in einem eigenen Prozess weiter.
 */
function applyUpdate(relaunch) {
  const file = state.file;
  switch (mode.kind) {
    case 'nsis': {
      // --updated: Verknüpfungen und Ordner der bisherigen Installation behalten; --force-run: danach starten
      const args = ['/S', '--updated', ...(relaunch ? ['--force-run'] : [])];
      if (mode.elevate) {
        const list = args.map(psQuote).join(',');
        detached('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
          `Start-Process -FilePath ${psQuote(file)} -ArgumentList ${list} -Verb RunAs`]);
      } else {
        detached(file, args);
      }
      break;
    }
    case 'portable': {
      // eine laufende EXE darf umbenannt, aber nicht überschrieben werden
      const exe = mode.target;
      const old = `${exe}.old`;
      fsSync.rmSync(old, { force: true });
      fsSync.renameSync(exe, old);
      try {
        fsSync.copyFileSync(file, exe);
      } catch (err) {
        fsSync.renameSync(old, exe);
        throw err;
      }
      if (relaunch) {
        detached('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
          `Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue; Start-Process -FilePath ${psQuote(exe)}`]);
      }
      break;
    }
    case 'mac': {
      if (!state.staged) throw new Error('Update ist nicht vorbereitet.');
      // nach dem Beenden: altes Paket beiseite, neues an seine Stelle (bei Fehler zurück), ggf. starten
      afterExitSh(
        'b="$2"; n="$3"; o="$b.old-$$"; '
        + 'if mv "$b" "$o"; then '
        + '  if mv "$n" "$b" || /usr/bin/ditto "$n" "$b"; then rm -rf "$o"; else rm -rf "$b"; mv "$o" "$b"; fi; '
        + 'fi; '
        + '[ "$4" = 1 ] && /usr/bin/open "$b"',
        [mode.target, state.staged, relaunch ? '1' : '0'],
      );
      break;
    }
    case 'appimage': {
      // die laufende AppImage ist eingebunden und behält ihren Inhalt, die Datei darf ersetzt werden
      const image = mode.target;
      const tmp = `${image}.update-${process.pid}`;
      fsSync.copyFileSync(file, tmp);
      fsSync.chmodSync(tmp, 0o755);
      fsSync.renameSync(tmp, image);
      if (relaunch) afterExitSh('exec "$2"', [image]);
      break;
    }
    default:
      throw new Error('Diese Installation lässt sich nicht automatisch aktualisieren.');
  }
  installed = true;
}

/**
 * „Jetzt neu starten“ (automatisch) bzw. Installer starten / Datei zeigen (manuell).
 * Gibt { quitting } zurück.
 */
async function install() {
  if (state.phase !== 'ready' || !state.file) throw new Error('Es ist noch keine neue Version geladen.');
  if (state.latest?.installKind === 'auto' && mode) {
    applyUpdate(true);
    setImmediate(() => app.quit());
    return { quitting: true };
  }
  if (state.latest?.installKind === 'installer') {
    const child = spawn(state.file, [], { detached: true, stdio: 'ignore' });
    child.unref();
    // kurz warten, damit ein Startfehler (z. B. Virenscanner) noch gemeldet werden kann
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      setTimeout(resolve, 800);
    });
    setImmediate(() => app.quit());
    return { quitting: true };
  }
  shell.showItemInFolder(state.file);
  return { quitting: false };
}

/** Beim Beenden: fertig geladenes Update still installieren (ohne Neustart). */
function installOnQuit() {
  if (installed || !mode || state.latest?.installKind !== 'auto' || state.phase !== 'ready') return;
  try {
    applyUpdate(false);
  } catch (err) {
    console.warn('Update beim Beenden fehlgeschlagen:', err.message);
  }
}

function openPage() {
  const url = state.latest?.pageUrl || `${PAGE_PREFIX}releases/latest`;
  if (url.startsWith(PAGE_PREFIX)) shell.openExternal(url);
}

/** Reste früherer Updates entfernen (geladene Dateien, alte portable EXE). */
function cleanup() {
  try { fsSync.rmSync(UPDATES_DIR(), { recursive: true, force: true }); } catch { /* Installer läuft evtl. noch */ }
  if (mode?.kind === 'portable') {
    try { fsSync.rmSync(`${mode.target}.old`, { force: true }); } catch { /* alte EXE noch gesperrt */ }
  }
}

/** Startet die automatische Prüfung (beim Start und alle 24 h). */
function start(sendFn) {
  send = sendFn;
  if (tickTimer) return;
  mode = detectMode();
  state = { ...state, auto: !!mode };
  cleanup();
  app.on('will-quit', installOnQuit);
  setTimeout(() => check(), FIRST_CHECK_DELAY);
  tickTimer = setInterval(() => {
    const last = prefs.get().lastUpdateCheck || 0;
    if (Date.now() - last >= CHECK_INTERVAL) check();
  }, TICK);
  tickTimer.unref?.();
}

function getState() {
  return state;
}

module.exports = { start, check, getState, startDownload, cancelDownload, install, openPage, compareVersions };
