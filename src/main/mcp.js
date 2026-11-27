'use strict';

/**
 * MCP-Server (Model Context Protocol): KI-Assistenten wie Claude steuern die laufende App –
 * Bild öffnen, Presets und Einstellungen setzen, das Ergebnis als Bild ansehen, exportieren.
 *
 * Transport „Streamable HTTP“ ohne SSE (jede Anfrage bekommt eine JSON-Antwort), nur auf
 * 127.0.0.1 und nur mit Schlüssel (Authorization: Bearer …). Standardmäßig aus; eingeschaltet
 * wird er in den Einstellungen unter „KI-Assistent (MCP)“. Clients, die nur stdio können (Claude Desktop), starten die
 * Brücke mcp-bridge.js mit der App selbst als Node (ELECTRON_RUN_AS_NODE=1) – ohne eigenes Node.
 *
 * Die Werkzeuge laufen im Fenster (src/renderer/mcp.js) und damit genau wie bei Bedienung von
 * Hand: der Benutzer sieht jeden Schritt. Aufrufe laufen nacheinander, nie gleichzeitig.
 */

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { app, ipcMain, clipboard } = require('electron');
const prefs = require('./prefs');

const DEFAULT_PORT = 39017;
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY = 4 * 1024 * 1024;
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif', 'ico', 'svg'];
const MAX_IMAGE_BYTES = 200 * 1024 * 1024;
const EXPORT_FORMATS = ['svg', 'png', 'jpg', 'bmp', 'pes', 'dst', 'exp'];

const ENDPOINT_FILE = () => path.join(app.getPath('userData'), 'mcp-endpoint.json');
const BRIDGE_FILE = () => path.join(app.getPath('userData'), 'mcp-bridge.js');

let getWindow = () => null;
let server = null;
let port = null;
let lastError = null;
let queue = Promise.resolve();
const pending = new Map(); // id → { resolve, reject, timer }
let nextCallId = 1;

/* ------------------------------------------------------------------ */
/* Einstellungen und Status                                           */
/* ------------------------------------------------------------------ */

function cfg() {
  const c = prefs.get().mcp || {};
  const out = { enabled: !!c.enabled, port: Number(c.port) || DEFAULT_PORT, token: c.token || null };
  if (!out.token) {
    out.token = crypto.randomBytes(24).toString('base64url');
    prefs.set({ mcp: out });
  }
  return out;
}

/** Programm, mit dem die Brücke gestartet wird (bzw. die App neu startet). */
function launcher() {
  // AppImage: die AppImage-Datei (der eingehängte Ordner wechselt bei jedem Start);
  // Windows portabel: die portable EXE (entpackt sich bei jedem Start neu)
  const exe = process.env.APPIMAGE || process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  // Linux ohne eingerichteten Sandbox-Helfer: mit denselben Schaltern starten wie jetzt
  const flags = process.argv.filter((a) => a === '--no-sandbox');
  return { command: exe, args: [...(app.isPackaged ? [] : [app.getAppPath()]), ...flags] };
}

function info() {
  const c = cfg();
  const url = `http://127.0.0.1:${port || c.port}/mcp`;
  const exe = launcher().command;
  return {
    enabled: c.enabled,
    running: !!server && port != null,
    port: port || c.port,
    url,
    token: c.token,
    error: lastError,
    portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
    claudeCode: `claude mcp add --transport http pic2laser ${url} --header "Authorization: Bearer ${c.token}"`,
    desktopConfig: JSON.stringify({
      mcpServers: {
        pic2laser: { command: exe, args: [BRIDGE_FILE()], env: { ELECTRON_RUN_AS_NODE: '1' } },
      },
    }, null, 2),
  };
}

function broadcast(channel, payload) {
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/* ------------------------------------------------------------------ */
/* Aufrufe ins Fenster                                                */
/* ------------------------------------------------------------------ */

/** Fenster geladen (gerade gestartet, z. B. von der Brücke)? Bis zu 30 s darauf warten. */
async function readyWindow() {
  for (let i = 0; i < 150; i++) {
    const win = getWindow();
    if (win && !win.isDestroyed() && !win.webContents.isLoading()) return win;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Das Pic2Laser-Fenster ist nicht bereit – bitte kurz warten und erneut versuchen.');
}

async function callRenderer(tool, args, timeoutMs = 15 * 60 * 1000) {
  const win = await readyWindow();
  const id = nextCallId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Zeitüberschreitung – Pic2Laser hat nicht geantwortet.'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    win.webContents.send('mcp-call', { id, tool, args });
  });
}

/** Fenster neu geladen oder abgestürzt: offene Aufrufe beenden. */
function failPending(message) {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(message));
    pending.delete(id);
  }
}

/* ------------------------------------------------------------------ */
/* Werkzeuge                                                          */
/* ------------------------------------------------------------------ */

const WAIT = {
  max_wait_s: {
    type: 'number', minimum: 1, maximum: 600,
    description: 'Höchstens so lange auf das neue Ergebnis warten (Standard 50 s). Rechnet es danach noch, get_result erneut aufrufen.',
  },
};
const VIEW = {
  max_size: { type: 'integer', minimum: 256, maximum: 2048, description: 'Längste Seite des Vorschaubilds in Pixeln (Standard 1024).' },
  include_original: { type: 'boolean', description: 'Zusätzlich die Originalansicht (mit markiertem Hintergrund, Schrift-/Gesichtsrahmen) zurückgeben.' },
};

const TOOLS = [
  {
    name: 'get_status',
    title: 'Status',
    description: 'Aktueller Zustand: geöffnetes Bild, Modus, aktives Preset, vom Standard abweichende Einstellungen, ob gerade gerechnet wird, Ergebniskennzahlen.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_settings_schema',
    title: 'Alle Einstellungen',
    description: 'Beschreibung aller Einstellungen: Schlüssel, Typ, Wertebereich bzw. Auswahl, Standard, aktueller Wert, Beschriftung und Tooltip aus der App, in welchem Modus bzw. unter welcher Bedingung sie gilt. Vor dem Optimieren einmal lesen.',
    inputSchema: { type: 'object', properties: { only_current_mode: { type: 'boolean', description: 'Nur Einstellungen, die im aktuellen Modus wirken (Standard true).' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_presets',
    title: 'Presets auflisten',
    description: 'Mitgelieferte und eigene Presets mit Gruppe, Zweck (laser/emb) und Beschreibung. Ein Preset ist meist der beste Startpunkt.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'open_image',
    title: 'Bild öffnen',
    description: 'Öffnet eine Bilddatei (PNG, JPG, WebP, BMP, GIF, AVIF, SVG) in Pic2Laser, wartet auf das Ergebnis mit den aktuellen Einstellungen und gibt Original und Ergebnis als Bild zurück.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absoluter Pfad zur Bilddatei.' }, ...WAIT, ...VIEW },
      required: ['path'],
    },
  },
  {
    name: 'apply_preset',
    title: 'Preset anwenden',
    description: 'Wendet ein Preset an (Name aus list_presets), wartet auf das Ergebnis und gibt es als Bild mit Kennzahlen zurück. Mitgelieferte Presets behalten Breite und Exportformate.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Name des Presets (wie in list_presets).' }, ...WAIT, ...VIEW },
      required: ['name'],
    },
  },
  {
    name: 'set_settings',
    title: 'Einstellungen ändern',
    description: 'Ändert beliebig viele Einstellungen auf einmal (Schlüssel aus get_settings_schema), rechnet neu und gibt das Ergebnis als Bild mit Kennzahlen zurück. Zahlen außerhalb des Bereichs werden begrenzt (wird gemeldet). Klickpunkte bgSeeds/samPoints als [{x,y}] bzw. [{x,y,positive}] mit x,y von 0 bis 1 relativ zum Original.',
    inputSchema: {
      type: 'object',
      properties: {
        settings: { type: 'object', description: 'Schlüssel → Wert, z. B. {"mode":"vector","threshold":140}.', additionalProperties: true },
        reset: { type: 'boolean', description: 'Vorher alle Einstellungen auf Standard zurücksetzen (Breite und Exportformate bleiben).' },
        ...WAIT,
        ...VIEW,
      },
      required: ['settings'],
    },
  },
  {
    name: 'get_result',
    title: 'Ergebnis ansehen',
    description: 'Wartet, bis die laufende Berechnung fertig ist, und gibt das Ergebnis als Bild mit Kennzahlen zurück. Mit region lässt sich ein Ausschnitt vergrößert ansehen (Details, Krümel, Linienstärken).',
    inputSchema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['result', 'original', 'both'], description: 'Was zurückgegeben wird (Standard result).' },
        region: {
          type: 'object',
          description: 'Ausschnitt relativ zum Bild (0–1), z. B. {"x":0.4,"y":0.2,"width":0.2,"height":0.2}.',
          properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } },
          required: ['x', 'y', 'width', 'height'],
        },
        max_size: VIEW.max_size,
        ...WAIT,
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'export_result',
    title: 'Exportieren',
    description: 'Speichert das aktuelle Ergebnis ohne Dialog in einen Ordner (und in der Historie). Ohne formats gelten die in der App gewählten Exportformate.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Absoluter Zielordner (Standard: zuletzt benutzter Exportordner bzw. „Bilder“).' },
        base_name: { type: 'string', description: 'Dateiname ohne Endung (Standard: Name des Bildes).' },
        formats: { type: 'array', items: { type: 'string', enum: EXPORT_FORMATS }, description: 'Formate, z. B. ["svg","png"]. EXP schreibt zusätzlich eine INF-Datei.' },
        overwrite: { type: 'boolean', description: 'Vorhandene Dateien ersetzen (Standard false).' },
      },
    },
    annotations: { destructiveHint: false },
  },
  {
    name: 'send_to_lightburn',
    title: 'An LightBurn senden',
    description: 'Fügt das aktuelle Ergebnis ins geöffnete LightBurn-Projekt ein (wie der Knopf „An LightBurn“). LightBurn muss laufen.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'save_preset',
    title: 'Preset speichern',
    description: 'Speichert die aktuellen Einstellungen als eigenes Preset (ein vorhandenes mit gleichem Namen wird ersetzt).',
    inputSchema: { type: 'object', properties: { name: { type: 'string', maxLength: 60 } }, required: ['name'] },
  },
  {
    name: 'list_history',
    title: 'Historie auflisten',
    description: 'Einträge der Historie (id, Name, Datum, Modus).',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 200 } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'open_history',
    title: 'Historie-Eintrag öffnen',
    description: 'Öffnet einen Historie-Eintrag mit seinen Einstellungen und gibt das Ergebnis zurück.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, ...WAIT, ...VIEW }, required: ['id'] },
  },
  {
    name: 'save_to_history',
    title: 'In Historie speichern',
    description: 'Sichert das aktuelle Ergebnis mit allen Einstellungen in der Historie (ohne Datei).',
    inputSchema: { type: 'object', properties: {} },
  },
];

const INSTRUCTIONS = `Pic2Laser wandelt Bilder in Laser-Vorlagen (SVG/PNG …) und Stickdateien um. Alles, was du tust, passiert sichtbar in der geöffneten App.
Ablauf: open_image → list_presets und passendes Preset mit apply_preset → Ergebnisbild kritisch ansehen (bei Bedarf get_result mit region für Details) → mit set_settings gezielt nachbessern (Schlüssel und Bereiche aus get_settings_schema) → export_result oder send_to_lightburn.
Achte beim Begutachten auf: verlorene oder zugelaufene Details, Krümel/Rauschen, zu dünne Linien für den Laser (unter ca. 0,1–0,2 mm), sauberen Hintergrund, lesbare Schrift. Ändere pro Schritt wenige Einstellungen und vergleiche. KI-Modelle laden beim ersten Gebrauch automatisch nach (kann dauern); rechnet es nach max_wait_s noch, get_result aufrufen.`;

const PUBLIC_TOOLS = TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
  name, title, description, inputSchema, ...(annotations ? { annotations: { title, ...annotations } } : {}),
}));

function absPath(p, what) {
  if (typeof p !== 'string' || !p.trim()) throw new Error(`${what} fehlt.`);
  const s = p.trim().replace(/^~(?=$|[\\/])/, app.getPath('home'));
  if (!path.isAbsolute(s)) throw new Error(`${what} muss ein absoluter Pfad sein: ${p}`);
  return path.normalize(s);
}

async function readImage(p) {
  const file = absPath(p, 'Pfad');
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!IMAGE_EXTS.includes(ext)) throw new Error(`Kein unterstütztes Bildformat (${IMAGE_EXTS.join(', ')}): ${file}`);
  const st = await fs.stat(file).catch(() => null);
  if (!st || !st.isFile()) throw new Error(`Datei nicht gefunden: ${file}`);
  if (st.size > MAX_IMAGE_BYTES) throw new Error('Die Datei ist zu groß (über 200 MB).');
  return { name: path.basename(file), bytes: await fs.readFile(file) };
}

const sanitize = (name) => String(name || 'bild').replace(/[\\/:*?"<>|\0]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'bild';

async function writeExport({ directory, base_name: baseName, overwrite }, files) {
  const lastDir = prefs.get().exportDir;
  const dir = directory ? absPath(directory, 'Ordner') : (lastDir || app.getPath('pictures'));
  await fs.mkdir(dir, { recursive: true });
  const id = crypto.randomUUID();
  const targets = files.map((f) => {
    if (!['svg', 'png', 'jpg', 'bmp', 'pes', 'dst', 'exp', 'inf'].includes(f.ext)) throw new Error(`Unbekanntes Format: ${f.ext}`);
    return { f, target: path.join(dir, `${sanitize(baseName)}.${f.ext}`) };
  });
  if (!overwrite) {
    const existing = [];
    for (const { target } of targets) if (await fs.stat(target).catch(() => null)) existing.push(target);
    if (existing.length) throw new Error(`Bereits vorhanden (overwrite: true zum Ersetzen):\n${existing.join('\n')}`);
  }
  const written = [];
  for (const { f, target } of targets) {
    const tmp = `${target}.${id}.tmp`;
    await fs.writeFile(tmp, typeof f.data === 'string' ? f.data : Buffer.from(f.data));
    await fs.rename(tmp, target);
    written.push(target);
  }
  return written;
}

/** Antwort aus dem Fenster → MCP-Inhalt (Text als JSON, Bilder als Base64). */
function toContent(res) {
  const content = [];
  if (res.text != null) content.push({ type: 'text', text: typeof res.text === 'string' ? res.text : JSON.stringify(res.text, null, 2) });
  for (const img of res.images || []) {
    if (img.label) content.push({ type: 'text', text: img.label });
    content.push({ type: 'image', data: Buffer.from(img.data).toString('base64'), mimeType: img.mimeType });
  }
  if (!content.length) content.push({ type: 'text', text: 'OK' });
  return { content, ...(res.isError ? { isError: true } : {}) };
}

async function runTool(name, args) {
  args = args && typeof args === 'object' ? args : {};
  switch (name) {
    case 'open_image': {
      const { name: file, bytes } = await readImage(args.path);
      return callRenderer('open_image', { ...args, name: file, bytes });
    }
    case 'export_result': {
      const res = await callRenderer('export_files', args);
      if (res.isError) return res;
      const written = await writeExport({ ...args, base_name: args.base_name || res.baseName }, res.files);
      await callRenderer('after_export', {}).catch(() => {});
      return { text: { written, ...(res.warning ? { warning: res.warning } : {}) } };
    }
    default:
      return callRenderer(name, args);
  }
}

/* ------------------------------------------------------------------ */
/* JSON-RPC                                                           */
/* ------------------------------------------------------------------ */

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function dispatch(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return msg && msg.id !== undefined && !('result' in msg) && !('error' in msg) ? rpcError(msg.id, -32600, 'Invalid Request') : null;
  }
  const isRequest = msg.id !== undefined && msg.id !== null;
  if (!isRequest) return null; // Benachrichtigung (initialized, cancelled …)
  const p = msg.params || {};
  switch (msg.method) {
    case 'initialize': {
      const protocolVersion = PROTOCOLS.includes(p.protocolVersion) ? p.protocolVersion : PROTOCOLS[0];
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'pic2laser', title: 'Pic2Laser', version: app.getVersion() },
          instructions: INSTRUCTIONS,
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id: msg.id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id: msg.id, result: { tools: PUBLIC_TOOLS } };
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === p.name);
      if (!tool) return rpcError(msg.id, -32602, `Unbekanntes Werkzeug: ${p.name}`);
      // nacheinander: die App hat nur einen Zustand (ein Bild, eine Einstellung)
      const job = queue.then(async () => {
        broadcast('mcp-activity', { tool: tool.title, busy: true });
        try {
          return toContent(await runTool(tool.name, p.arguments));
        } catch (err) {
          return toContent({ text: String(err && err.message ? err.message : err), isError: true });
        } finally {
          broadcast('mcp-activity', { tool: tool.title, busy: false, at: Date.now() });
        }
      });
      queue = job.catch(() => {});
      return { jsonrpc: '2.0', id: msg.id, result: await job };
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/* ------------------------------------------------------------------ */
/* HTTP                                                               */
/* ------------------------------------------------------------------ */

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

function send(res, status, body, headers = {}) {
  const data = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { ...(body != null ? { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json' } : {}), ...headers });
  res.end(data);
}

function tokenOk(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return false;
  const a = Buffer.from(m[1].trim());
  const b = Buffer.from(cfg().token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(req, res) {
  // Schutz vor DNS-Rebinding und Aufrufen aus Webseiten im Browser
  if (!LOCAL_HOST.test(req.headers.host || '')) return send(res, 403, 'Forbidden');
  const origin = req.headers.origin;
  if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin)) return send(res, 403, 'Forbidden');
  const { pathname } = new URL(req.url, 'http://127.0.0.1');
  if (pathname !== '/mcp') return send(res, 404, 'Not Found');
  if (!tokenOk(req)) return send(res, 401, rpcError(null, -32001, 'Pic2Laser: falscher oder fehlender Schlüssel (Authorization: Bearer …) – in Pic2Laser unter „KI-Assistent (MCP)“ → „Einrichten…“ neu kopieren.'));
  if (req.method !== 'POST') return send(res, 405, 'Method Not Allowed', { Allow: 'POST' });

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return send(res, 413, rpcError(null, -32600, 'Request too large'));
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return send(res, 400, rpcError(null, -32700, 'Parse error'));
  }
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map(dispatch))).filter(Boolean);
  if (!replies.length) return send(res, 202, null);
  return send(res, 200, batch ? replies : replies[0]);
}

function writeEndpoint() {
  const c = cfg();
  const data = { url: `http://127.0.0.1:${port}/mcp`, token: c.token, launch: launcher(), pid: process.pid };
  try {
    fsSync.writeFileSync(ENDPOINT_FILE(), JSON.stringify(data, null, 2), { mode: 0o600 });
    // Brücke an einen festen Ort kopieren: Pfade im Programmpaket ändern sich (AppImage, portabel, Updates)
    fsSync.writeFileSync(BRIDGE_FILE(), fsSync.readFileSync(path.join(__dirname, 'mcp-bridge.js')));
  } catch (err) {
    console.warn('MCP: Verbindungsdatei konnte nicht geschrieben werden:', err.message);
  }
}

function listen(p) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      handle(req, res).catch((err) => {
        console.error('MCP:', err);
        if (!res.headersSent) send(res, 500, rpcError(null, -32603, 'Internal error'));
      });
    });
    srv.keepAliveTimeout = 60000;
    srv.requestTimeout = 0; // Werkzeuge können Minuten rechnen (Modell-Download)
    srv.once('error', reject);
    srv.listen(p, '127.0.0.1', () => {
      srv.removeListener('error', reject);
      resolve(srv);
    });
  });
}

async function start() {
  if (server) return;
  const c = cfg();
  lastError = null;
  // Port belegt: die nächsten versuchen und den gefundenen merken
  for (let p = c.port; p < c.port + 10; p++) {
    try {
      server = await listen(p);
      port = p;
      if (p !== c.port) prefs.set({ mcp: { ...cfg(), port: p } });
      break;
    } catch (err) {
      if (err.code !== 'EADDRINUSE') { lastError = err.message; break; }
    }
  }
  if (!server) {
    lastError = lastError || `Kein freier Port ab ${c.port}`;
    return;
  }
  writeEndpoint();
  const win = getWindow();
  // Fenster im Hintergrund oder minimiert: trotzdem voll weiterrechnen
  if (win && !win.isDestroyed()) win.webContents.setBackgroundThrottling(false);
}

async function stop() {
  if (server) {
    const srv = server;
    server = null;
    port = null;
    srv.closeAllConnections?.();
    await new Promise((r) => srv.close(() => r()));
  }
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.setBackgroundThrottling(true);
}

async function setEnabled(on) {
  prefs.set({ mcp: { ...cfg(), enabled: !!on } });
  if (on) await start();
  else {
    await stop();
    // ausgeschaltet: Brücke soll die App nicht mehr selbst starten
    try { fsSync.rmSync(ENDPOINT_FILE(), { force: true }); } catch { /* egal */ }
  }
  return info();
}

/**
 * init({ getWindow }) – einmal beim Start. Startet den Server, wenn er eingeschaltet ist.
 * Die Verbindungsdatei bleibt beim Beenden liegen: So startet die Brücke die App bei Bedarf selbst.
 */
function init(opts) {
  getWindow = opts.getWindow;
  ipcMain.handle('mcp-state', () => info());
  ipcMain.handle('mcp-set', async (_e, patch) => {
    if (patch && patch.newToken) {
      prefs.set({ mcp: { ...cfg(), token: crypto.randomBytes(24).toString('base64url') } });
      if (server) writeEndpoint();
    }
    if (patch && 'enabled' in patch) return setEnabled(patch.enabled);
    return info();
  });
  ipcMain.handle('mcp-reply', (_e, id, result) => {
    const p = pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(id);
    p.resolve(result || {});
  });
  ipcMain.handle('clipboard-write', (_e, text) => clipboard.writeText(String(text)));
  if (cfg().enabled) start().catch((err) => { lastError = err.message; });
}

/** Neues Fenster (macOS) bzw. neu geladen: offene Aufrufe abbrechen, Drosselung passend setzen. */
function attachWindow(win) {
  win.webContents.on('did-start-loading', () => failPending('Das Pic2Laser-Fenster wurde neu geladen.'));
  win.webContents.on('render-process-gone', () => failPending('Das Pic2Laser-Fenster ist abgestürzt.'));
  win.webContents.once('did-finish-load', () => {
    if (server) win.webContents.setBackgroundThrottling(false);
  });
}

module.exports = { init, attachWindow, stop };
