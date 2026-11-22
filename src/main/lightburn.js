'use strict';

/**
 * Anbindung an ein laufendes LightBurn über dessen UDP-Schnittstelle (nur dieser Rechner).
 * LightBurn empfängt Befehle auf Port 19840 und antwortet auf 19841 mit
 * „OK“ (erfolgreich), „!“ (fehlgeschlagen) oder „?“ (unbekannter Befehl).
 * https://docs.lightburnsoftware.com/latest/Guides/AutomationWithUDP/
 */
const dgram = require('dgram');

const HOST = '127.0.0.1';
const CMD_PORT = 19840;
const REPLY_PORT = 19841;
const PING_TIMEOUT = 1500;
const IMPORT_TIMEOUT = 20000; // große Bilder brauchen beim Import etwas

class LightBurnError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

let chain = Promise.resolve(); // Antwort-Port ist fest – Sendungen nie überlappen lassen

/**
 * Importiert die Dateien nacheinander ins offene LightBurn-Projekt (Mitte der Arbeitsfläche).
 * Ergebnis: { confirmed } – false, wenn der Antwort-Port belegt war und ohne Rückmeldung
 * gesendet wurde. Fehler: LightBurnError mit code 'not-running' | 'dialog' | 'failed' | 'timeout'.
 */
function importFiles(paths, opts = {}) {
  const job = chain.catch(() => {}).then(() => runImport(paths, opts));
  chain = job;
  return job;
}

async function runImport(paths, { cmdPort = CMD_PORT, replyPort = REPLY_PORT } = {}) {
  const conn = await open(replyPort);
  try {
    if (conn.listening) {
      const pong = await conn.command('PING', cmdPort, PING_TIMEOUT);
      if (pong === null) throw new LightBurnError('not-running', 'LightBurn antwortet nicht – ist LightBurn geöffnet?');
      if (pong !== 'OK') throw new LightBurnError('dialog', 'In LightBurn ist gerade ein Fenster offen – bitte schließen und erneut senden.');
    }
    for (const p of paths) {
      if (!conn.listening) {
        await conn.send(`IMPORT:${p}`, cmdPort);
        continue;
      }
      const reply = await conn.command(`IMPORT:${p}`, cmdPort, IMPORT_TIMEOUT);
      if (reply === null) throw new LightBurnError('timeout', 'LightBurn hat den Import nicht bestätigt.');
      if (reply !== 'OK') {
        // Nicht dokumentiert, wie LightBurn Sonderzeichen im Pfad liest – dann darauf hinweisen
        const hint = /[^\x20-\x7e]/.test(p) ? ' Möglicherweise stören Sonderzeichen (z. B. Umlaute) im Pfad des Temp-Ordners.' : '';
        throw new LightBurnError('failed', `LightBurn konnte die Datei nicht importieren.${hint}`);
      }
    }
    return { confirmed: conn.listening };
  } finally {
    conn.close();
  }
}

/** Socket auf dem Antwort-Port – ist er belegt, wird ohne Rückmeldung gesendet. */
async function open(replyPort) {
  let sock = dgram.createSocket('udp4');
  let listening = true;
  try {
    await new Promise((resolve, reject) => {
      sock.once('error', reject);
      sock.bind(replyPort, HOST, () => {
        sock.removeListener('error', reject);
        resolve();
      });
    });
  } catch (err) {
    if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') throw err;
    try { sock.close(); } catch { /* schon zu */ }
    sock = dgram.createSocket('udp4');
    listening = false;
  }
  sock.on('error', () => {}); // z. B. ICMP „Port nicht erreichbar“ – zählt als keine Antwort

  let waiter = null;
  sock.on('message', (msg) => {
    if (!waiter) return; // verspätete Antwort auf einen früheren Befehl
    const w = waiter;
    waiter = null;
    w(msg.toString('utf8').trim());
  });

  const send = (text, port) => new Promise((resolve, reject) => {
    sock.send(Buffer.from(text, 'utf8'), port, HOST, (err) => (err ? reject(err) : resolve()));
  });

  return {
    listening,
    send,
    async command(text, port, timeout) {
      const reply = new Promise((resolve) => {
        const timer = setTimeout(() => { waiter = null; resolve(null); }, timeout);
        waiter = (t) => { clearTimeout(timer); resolve(t); };
      });
      await send(text, port);
      return reply;
    },
    close() {
      try { sock.close(); } catch { /* schon zu */ }
    },
  };
}

/** Dateiname nur aus ASCII-Zeichen (wie LightBurn Umlaute im Befehl liest, ist nicht dokumentiert). */
function asciiName(name) {
  const s = String(name || '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._ -]+/g, '_')
    .replace(/^[ .]+|[ .]+$/g, '')
    .slice(0, 80);
  return /[A-Za-z0-9]/.test(s) ? s : 'bild';
}

module.exports = { importFiles, asciiName, LightBurnError };
