'use strict';

/**
 * Hilfen für die Tests der Stickdateien: lädt embroidery.js (ES-Modul der Oberfläche) in Node, baut die
 * Prüfmotive und liest PES, DST und EXP mit eigenen, vom Schreiber unabhängigen Lesern wieder ein.
 */
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');

// embroidery.js ist ein ES-Modul der Oberfläche; Node lädt es per require() (src/renderer/package.json: type module)
const { Embroidery: E } = require(path.join(ROOT, 'src/renderer/embroidery.js'));
const { STITCH, JUMP, TRIM, COLOR, END } = E.CMD;

/* ---------------- Prüfmotive (Pfade in mm) ---------------- */

const circle = (cx, cy, r) => `M${cx - r},${cy} A${r},${r} 0 1,0 ${cx + r},${cy} A${r},${r} 0 1,0 ${cx - r},${cy} Z`;
const rect = (x, y, w, h) => `M${x},${y} h${w} v${h} h${-w} Z`;
function wave(x0, x1, y, amp, period) {
  const pts = [];
  for (let x = x0; x <= x1 + 1e-9; x += 0.25) pts.push(`${x.toFixed(2)},${(y + amp * Math.sin(((x - x0) / period) * 2 * Math.PI)).toFixed(3)}`);
  return `M${pts.join(' L')}`;
}

/**
 * kind wie in app.js: 'fill' Füllstich (Automatik je Stoff), 'run' Umrisslinie, 'line' offene Linien (Wellen).
 * Die Beschreibungen stehen auch in der Checkliste.
 */
const MOTIFS = {
  pruefmotiv: {
    title: 'Prüfmotiv (3 Farben, ca. 83 × 70 mm)',
    about: 'Rotes Quadrat mit rundem Loch, kleines rotes Quadrat weit rechts (Sprung mit Fadenschnitt), '
      + 'schmaler roter Streifen (Kontur im Steppstich), blauer Kreis, schwarze Wellenlinie unten und schwarzer Rahmen '
      + '(gleiche Farbe wie die Welle – kein Farbwechsel dazwischen).',
    layers: [
      { kind: 'fill', hex: '#d01c1c', name: 'Rot', d: `${rect(0, 0, 30, 30)} ${circle(15, 15, 6)} ${rect(65, 2, 10, 10)} ${rect(36, 2, 0.25, 25)}` },
      { kind: 'fill', hex: '#1c3cd0', name: 'Blau', d: circle(48, 42, 13) },
      { kind: 'line', hex: '#000000', name: 'Schwarz', d: wave(0, 75, 60, 3, 10) },
      { kind: 'run', hex: '#000000', name: 'Rahmen', d: rect(-4, -4, 83, 70) },
    ],
  },
  sprung: {
    title: 'Langer Sprung (1 Farbe, ca. 170 × 10 mm)',
    about: 'Zwei Quadrate 10 × 10 mm mit 150 mm Abstand: der Sprung muss in Teilschritte zerlegt und vorher abgeschnitten werden.',
    layers: [{ kind: 'fill', hex: '#000000', name: 'Schwarz', d: `${rect(0, 0, 10, 10)} ${rect(160, 0, 10, 10)}` }],
  },
  einfach: {
    title: 'Einfaches Quadrat (1 Farbe, 20 × 20 mm)',
    about: 'Ein schwarzes Quadrat – kleinster Test, ob die Maschine die Datei überhaupt annimmt.',
    layers: [{ kind: 'fill', hex: '#000000', name: 'Schwarz', d: rect(0, 0, 20, 20) }],
  },
};

/** Stichmuster eines Motivs, so wie app.js es für die Ausgabe plant (Stoff Webware, Schnitt ab 3 mm). */
function motifPattern(m, fabric = 'woven') {
  let prevAngle = null;
  const layers = m.layers.map((l) => {
    const rings = E.scaleRings(E.pathToRings(l.d, 0.3, l.kind === 'line'), 1, 0, 0);
    const an = l.kind === 'fill' ? E.analyze(rings) : null;
    const p = E.autoParams(an, fabric, prevAngle, l.kind).params;
    if (p.type === 'fill') prevAngle = Number(p.angle);
    return { rings, an, hex: l.hex, kind: l.kind, name: l.name, p };
  });
  const pat = E.plan(layers, { trimMm: 3 });
  pat.widthMm = (pat.bounds[2] - pat.bounds[0]) / 10;
  pat.heightMm = (pat.bounds[3] - pat.bounds[1]) / 10;
  return pat;
}

/** Alle drei Dateien eines Motivs. */
function motifFiles(key) {
  const pat = motifPattern(MOTIFS[key]);
  return {
    pat,
    pes: new Uint8Array(E.toPes(pat, key)),
    dst: new Uint8Array(E.toDst(pat, key)),
    exp: new Uint8Array(E.toExp(pat)),
    inf: new Uint8Array(E.toInf(pat)),
  };
}

/* ---------------- Vergleichsform ---------------- */

/**
 * Bringt eine Befehlsfolge [{c, x, y}] in eine Form, die alle Formate gleich darstellen können:
 * aufeinanderfolgende Sprünge zusammengefasst (Formate zerlegen lange Sprünge), Stiche ohne Bewegung
 * entfernt, Steuerbefehle zwischen zwei Bewegungen sortiert, Ende weggelassen.
 * Ergebnis: Liste von Zeichenketten wie 'S 12,-4', 'J 0,0', 'TRIM', 'COLOR'.
 */
function normalize(ops) {
  const out = [];
  let ctl = [];
  let x = 0, y = 0, last = null;
  const flush = () => {
    out.push(...ctl.sort());
    ctl = [];
  };
  for (const p of ops) {
    if (p.c === STITCH) {
      if (p.x === x && p.y === y) continue;
      flush();
      out.push(`S ${p.x},${p.y}`);
      last = STITCH;
    } else if (p.c === JUMP) {
      // zerlegter Sprung: Teilschritte zusammenfassen. PEC (wie pyembroidery) markiert jeden Teilschritt
      // nach einem Schnitt erneut mit Schnitt – „TRIM, J, TRIM, J“ ist ein einziger Sprung mit Schnitt.
      const reTrim = ctl.length === 1 && ctl[0] === 'TRIM' && out[out.length - 2] === 'TRIM';
      if (last === JUMP && (!ctl.length || reTrim)) { out.pop(); ctl = []; } else flush();
      out.push(`J ${p.x},${p.y}`);
      last = JUMP;
    } else if (p.c === TRIM || p.c === COLOR) {
      ctl.push(p.c === TRIM ? 'TRIM' : 'COLOR'); // last bleibt die letzte Bewegung
      continue;
    } else continue;
    x = p.x;
    y = p.y;
  }
  flush();
  // Sprung ohne Bewegung (z. B. nach dem Zusammenfassen) zählt nicht
  return out.filter((s, i) => !(s.startsWith('J ') && s.slice(2) === prevPos(out, i)));
}
function prevPos(list, i) {
  for (let k = i - 1; k >= 0; k--) if (list[k][0] === 'S' || list[k][0] === 'J') return list[k].slice(2);
  return '0,0';
}

/* ---------------- Unabhängige Leser ---------------- */

const s8 = (v) => (v > 127 ? v - 256 : v);

/** DST lesen: Kopf (512 Byte, Textfelder) und Datensätze nach der Tajima-Bitbelegung. */
function readDst(buf) {
  const head = Buffer.from(buf.subarray(0, 512)).toString('latin1');
  const field = (k) => {
    const m = new RegExp(`${k.replace('+', '\\+')}:([^\\r]*)\\r`).exec(head);
    return m ? m[1] : null;
  };
  const bit = (b, n) => (b >> n) & 1;
  const ops = [];
  const recs = [];
  let x = 0, y = 0, end = false;
  for (let i = 512; i + 2 < buf.length; i += 3) {
    const [b0, b1, b2] = [buf[i], buf[i + 1], buf[i + 2]];
    const dx = bit(b0, 0) - bit(b0, 1) + 9 * (bit(b0, 2) - bit(b0, 3)) + 3 * (bit(b1, 0) - bit(b1, 1))
      + 27 * (bit(b1, 2) - bit(b1, 3)) + 81 * (bit(b2, 2) - bit(b2, 3));
    const dyUp = bit(b0, 7) - bit(b0, 6) + 9 * (bit(b0, 5) - bit(b0, 4)) + 3 * (bit(b1, 7) - bit(b1, 6))
      + 27 * (bit(b1, 5) - bit(b1, 4)) + 81 * (bit(b2, 5) - bit(b2, 4));
    const kind = b2 & 0xc3;
    recs.push({ b2, dx, dy: -dyUp });
    if ((b2 & 0x03) !== 0x03) throw new Error(`DST: Datensatz ${(i - 512) / 3} ohne Pflichtbits (b2=${b2.toString(16)})`);
    if (kind === 0xf3 || b2 === 0xf3) { end = true; ops.push({ c: END }); break; }
    if (kind === 0xc3) { ops.push({ c: COLOR }); continue; }
    x += dx;
    y -= dyUp;
    ops.push({ c: kind === 0x83 ? JUMP : STITCH, x, y, dx, dy: -dyUp });
  }
  // Fadenschnitt: drei Sprünge ohne Nettobewegung → TRIM
  const out = [];
  for (let k = 0; k < ops.length; k++) {
    const [a, b, c] = [ops[k], ops[k + 1], ops[k + 2]];
    if (a.c === JUMP && b && c && b.c === JUMP && c.c === JUMP && a.dx + b.dx + c.dx === 0 && a.dy + b.dy + c.dy === 0
      && (a.dx || a.dy) && Math.abs(a.dx) <= 4 && Math.abs(b.dx) <= 4) {
      out.push({ c: TRIM });
      k += 2;
    } else out.push(a);
  }
  return {
    ops: out, records: recs, end, trailing: buf.length - 512 - recs.length * 3,
    header: { la: field('LA'), st: field('ST'), co: field('CO'), px: field('+X'), mx: field('-X'), py: field('+Y'), my: field('-Y'), ax: field('AX'), ay: field('AY') },
    headerEndsWithEof: head.indexOf('\x1a') > 0,
  };
}

/** EXP lesen: 2 Byte je Stich, 0x80-Befehle (01 Farbwechsel, 04 Sprung, 80 Fadenschnitt). */
/** INF lesen (Farben zu EXP/DST): Kopf 1, 8, Restlänge, Zahl der Farben; je Satz Länge, Nummer, RGB, Nadel, Name, Garnkarte. */
function readInf(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const head = [0, 4, 8, 12].map((o) => dv.getUint32(o, false));
  const threads = [];
  let i = 16;
  for (let k = 0; k < head[3]; k++) {
    const len = dv.getUint16(i, false);
    const rec = buf.subarray(i, i + len);
    const str = (from) => {
      const end = rec.indexOf(0, from);
      return { s: Buffer.from(rec.subarray(from, end)).toString('latin1'), next: end + 1 };
    };
    const name = str(9), chart = str(name.next);
    threads.push({
      len, index: dv.getUint16(i + 2, false), rgb: [rec[4], rec[5], rec[6]], needle: dv.getUint16(i + 7, false),
      name: name.s, chart: chart.s, used: chart.next,
    });
    i += len;
  }
  return { head, threads, end: i };
}

function readExp(buf) {
  const ops = [];
  let x = 0, y = 0;
  for (let i = 0; i < buf.length;) {
    if (buf[i] === 0x80) {
      const c = buf[i + 1];
      if (c === 0x04) {
        x += s8(buf[i + 2]);
        y -= s8(buf[i + 3]);
        ops.push({ c: JUMP, x, y });
      } else if (c === 0x01) ops.push({ c: COLOR });
      else if (c === 0x80) ops.push({ c: TRIM });
      else throw new Error(`EXP: unbekannter Befehl 0x80 0x${c.toString(16)} bei Byte ${i}`);
      i += 4;
    } else {
      x += s8(buf[i]);
      y -= s8(buf[i + 1]);
      ops.push({ c: STITCH, x, y });
      i += 2;
    }
  }
  return { ops };
}

/** PEC-Teil lesen (ab „LA:“): Kopf, Farbnummern, Stiche, Vorschaubilder. */
function readPec(buf, at) {
  const label = Buffer.from(buf.subarray(at, at + 19)).toString('latin1');
  const nColors = buf[at + 48] + 1;
  const codes = [...buf.subarray(at + 49, at + 49 + nColors)];
  const start = at + 512;
  const blockLen = buf[start + 2] | (buf[start + 3] << 8) | (buf[start + 4] << 16);
  const w = buf[start + 8] | (buf[start + 9] << 8), h = buf[start + 10] | (buf[start + 11] << 8);
  const ops = [];
  // Blockkopf: 2 Byte, Länge (24 Bit), 31 FF F0, Breite, Höhe, 2 × Bildgröße → Stiche ab +16
  let i = start + 16, x = 0, y = 0, endAt = -1;
  const val = () => {
    const a = buf[i++];
    if (a & 0x80) {
      const b = buf[i++];
      let v = ((a & 0x0f) << 8) | b;
      if (v > 2047) v -= 4096;
      return { v, jump: !!(a & 0x10), trim: !!(a & 0x20) };
    }
    return { v: a > 63 ? a - 128 : a, jump: false, trim: false };
  };
  while (i < start + blockLen) {
    if (buf[i] === 0xff) { endAt = i; i++; break; }
    if (buf[i] === 0xfe && buf[i + 1] === 0xb0) { ops.push({ c: COLOR }); i += 3; continue; }
    const vx = val(), vy = val();
    x += vx.v;
    y += vy.v;
    if (vx.trim || vy.trim) ops.push({ c: TRIM });
    ops.push({ c: vx.jump || vy.jump || vx.trim || vy.trim ? JUMP : STITCH, x, y });
  }
  return { label, codes, blockLen, w, h, ops, endAt, stitchEnd: start + blockLen, start };
}

/** PES lesen: Kopf, PES-Stichgruppen (CSewSeg) und den PEC-Teil. */
function readPes(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = Buffer.from(buf.subarray(0, 8)).toString('latin1');
  const pecAt = dv.getUint32(8, true);
  const hoop = dv.getUint16(14, true);
  const seg = Buffer.from(buf).indexOf('CSewSeg');
  const sections = [];
  let i = seg + 7;
  for (;;) {
    const flag = dv.getUint16(i, true), code = dv.getUint16(i + 2, true), n = dv.getUint16(i + 4, true);
    i += 6;
    const pts = [];
    for (let k = 0; k < n; k++, i += 4) pts.push([dv.getInt16(i, true), dv.getInt16(i + 2, true)]);
    sections.push({ flag, code, pts });
    if (dv.getUint16(i, true) !== 0x8003) break;
    i += 2;
  }
  const sectionCount = dv.getUint16(seg - 8, true);
  return { magic, pecAt, hoop, sections, sectionCount, pec: readPec(buf, pecAt) };
}

module.exports = { E, CMD: E.CMD, MOTIFS, FIXTURES, motifPattern, motifFiles, normalize, readDst, readExp, readInf, readPes, readPec };
