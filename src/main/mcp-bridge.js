'use strict';

/**
 * stdio-Brücke zum MCP-Server von Pic2Laser – für Clients, die Server nur als Prozess starten
 * (z. B. Claude Desktop). Läuft mit der App selbst als Node:
 *
 *   ELECTRON_RUN_AS_NODE=1 <Pic2Laser> <userData>/mcp-bridge.js
 *
 * Liest JSON-RPC-Nachrichten zeilenweise von stdin, schickt sie per HTTP an die laufende App und
 * schreibt die Antworten auf stdout. Läuft die App nicht, wird sie gestartet (sofern der
 * MCP-Server zuletzt eingeschaltet war). Die App legt diese Datei beim Einschalten neben
 * mcp-endpoint.json ab; beide liegen im Ordner mit den Benutzerdaten.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ENDPOINT = path.join(__dirname, 'mcp-endpoint.json');
const OFF = 'Der MCP-Server von Pic2Laser ist ausgeschaltet. In Pic2Laser links in den Einstellungen unter „KI-Assistent (MCP)“ einschalten und den Client neu verbinden.';

const log = (...a) => process.stderr.write(`[pic2laser-mcp] ${a.join(' ')}\n`);
const write = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);

function endpoint() {
  try { return JSON.parse(fs.readFileSync(ENDPOINT, 'utf8')); } catch { return null; }
}

function post(ep, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(ep.url);
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${ep.token}`,
        'Content-Length': data.length,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode === 202) return resolve(null);
        try { resolve(JSON.parse(text)); } catch { reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}

let launching = null;

/** App starten (ohne ELECTRON_RUN_AS_NODE, sonst liefe sie wieder als Node) und warten, bis sie antwortet. */
function launch(ep) {
  if (launching) return launching;
  launching = (async () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const { command, args = [] } = ep.launch || {};
    if (!command) throw new Error('Pic2Laser läuft nicht.');
    log('starte', command);
    spawn(command, args, { detached: true, stdio: 'ignore', env }).unref();
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const cur = endpoint();
      if (!cur) throw new Error(OFF);
      try {
        await post(cur, { jsonrpc: '2.0', id: '__probe', method: 'ping' });
        return;
      } catch { /* noch nicht bereit */ }
    }
    throw new Error('Pic2Laser antwortet nicht – bitte die App von Hand starten.');
  })().finally(() => { launching = null; });
  return launching;
}

async function forward(msg) {
  let ep = endpoint();
  if (!ep) throw new Error(OFF);
  try {
    return await post(ep, msg);
  } catch (err) {
    if (!['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH'].includes(err.code)) throw err;
    await launch(ep);
    ep = endpoint();
    if (!ep) throw new Error(OFF);
    return post(ep, msg);
  }
}

let inflight = 0;
let ended = false;
const maybeExit = () => { if (ended && !inflight) process.exit(0); };

async function onMessage(msg) {
  const isRequest = msg && msg.method && msg.id !== undefined && msg.id !== null;
  inflight++;
  try {
    const reply = await forward(msg);
    if (reply) for (const r of Array.isArray(reply) ? reply : [reply]) write(r);
  } catch (err) {
    log(err.message);
    if (isRequest) write({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: err.message } });
  } finally {
    inflight--;
    maybeExit();
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    onMessage(msg);
  }
});
// Client hat die Verbindung geschlossen: noch laufende Anfragen zu Ende bringen
process.stdin.on('end', () => { ended = true; maybeExit(); });
