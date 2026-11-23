'use strict';

/**
 * Stickdateien (PES, DST, EXP): Rücklesen mit eigenen Lesern und pyembroidery, Grenzwerte der
 * Formate, Vergleich mit den Referenzdateien. Aufruf: npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { E, CMD, MOTIFS, FIXTURES, motifFiles, normalize, readDst, readExp, readPes } = require('./embroidery-helpers');

const { STITCH, JUMP, TRIM, COLOR, END } = CMD;
const KEYS = Object.keys(MOTIFS);
const files = Object.fromEntries(KEYS.map((k) => [k, motifFiles(k)]));

/** Erwartete Folge; PES kennt keinen Fadenschnitt ohne folgenden Sprung (Ende). */
function expected(pat, format) {
  const n = normalize(pat.ops);
  if (format === 'pes') while (n.length && n[n.length - 1] === 'TRIM') n.pop();
  return n;
}

/** Gleichheit der Folgen mit lesbarer Meldung an der ersten Abweichung. */
function sameSeq(got, want, what) {
  let i = 0;
  while (i < got.length && i < want.length && got[i] === want[i]) i++;
  if (i === got.length && i === want.length) return;
  assert.fail(`${what}: Abweichung bei Befehl ${i} von ${want.length} – erwartet ${JSON.stringify(want.slice(i, i + 3))}, gelesen ${JSON.stringify(got.slice(i, i + 3))}`);
}

// als Text: -0 und 0 (Math.round) sollen gleich zählen
// [...ops]: Arrays aus dem vm-Kontext haben einen anderen Prototyp (deepStrictEqual)
const stitchPositions = (ops) => [...ops].filter((p) => p.c === STITCH).map((p) => `${p.x},${p.y}`);

/* ---------------- Stichplanung (Voraussetzung für alle Formate) ---------------- */

for (const key of KEYS) {
  test(`${key}: Stichmuster innerhalb der Grenzen gängiger Maschinen`, () => {
    const { pat } = files[key];
    assert.ok(pat.stats.stitches > 0, 'keine Stiche');
    assert.equal(pat.ops[pat.ops.length - 1].c, END, 'Muster endet nicht mit END');
    let x = 0, y = 0, longest = 0;
    for (const p of pat.ops) {
      if (p.c === STITCH) longest = Math.max(longest, Math.hypot(p.x - x, p.y - y));
      if (p.c === STITCH || p.c === JUMP) { x = p.x; y = p.y; }
    }
    assert.ok(longest <= 121, `längster Stich ${longest / 10} mm – über 12,1 mm (DST-Grenze, viele Maschinen)`);
    assert.ok(pat.stats.stitches < 1e6, 'Stichzahl passt nicht in den DST-Kopf');
    assert.ok(pat.threads.length <= 64, 'mehr als 64 Farben');
  });
}

/* ---------------- DST ---------------- */

for (const key of KEYS) {
  test(`${key}: DST rücklesen und Kopf prüfen`, () => {
    const { pat, dst } = files[key];
    const r = readDst(dst);
    sameSeq(normalize(r.ops), expected(pat, 'dst'), 'DST');
    assert.ok(r.end, 'kein Ende-Datensatz (00 00 F3)');
    assert.equal(r.trailing, 0, 'Daten nach dem Ende-Datensatz');
    assert.ok(r.headerEndsWithEof, 'Kopf ohne 0x1A');
    const h = r.header;
    assert.equal(h.la.trim(), key);
    assert.equal(h.la.length, 16);
    assert.equal(Number(h.st), r.records.length - 1, 'ST ≠ Zahl der Datensätze');
    assert.equal(Number(h.co), pat.ops.filter((p) => p.c === COLOR).length, 'CO ≠ Farbwechsel');
    const [bx0, by0, bx1, by1] = pat.bounds;
    assert.deepEqual([Number(h.px), Number(h.mx), Number(h.py), Number(h.my)], [bx1, -bx0, -by0, by1], 'Ausdehnung im Kopf');
    const last = r.ops.filter((p) => p.c === STITCH || p.c === JUMP).pop();
    assert.deepEqual([Number(h.ax.replace(/\s/g, '')), Number(h.ay.replace(/\s/g, ''))], [last.x, -last.y], 'AX/AY ≠ Endposition');
  });
}

/**
 * Melco OS (z. B. EMT16X) schneidet bei DST nach „Jump Count For Trim“ (Standard 3): mehr als 3 Sprünge
 * in Folge = Fadenschnitt vor den Sprüngen. Jede Sprungfolge mit unserem Schnitt (drei Sprünge ohne
 * Bewegung) muss also mindestens 4 Sprünge lang sein – außer ein Farbwechsel oder das Ende folgt (dort
 * schneidet die Maschine ohnehin) – und jede Folge ohne Schnitt höchstens 3, sonst schnitte Melco ungewollt
 * (außer der Anfahrt zum ersten Stich).
 */
for (const key of [...KEYS, 'grenze']) {
  test(`${key}: DST-Fadenschnitte auch über die Sprungzählung (Melco OS, Jump Count For Trim = 3)`, () => {
    const dst = key === 'grenze' ? limitDst() : files[key].dst;
    const { records } = readDst(dst);
    const isJump = (r) => (r.b2 & 0xc3) === 0x83;
    let checked = 0;
    for (let i = 0; i < records.length;) {
      if (!isJump(records[i])) { i++; continue; }
      let e = i;
      while (e < records.length && isJump(records[e])) e++;
      const run = records.slice(i, e);
      const hasTrim = run.some((r, k) => k + 2 < run.length && r.dx === 2 && r.dy === 2
        && run[k + 1].dx === -4 && run[k + 1].dy === -4 && run[k + 2].dx === 2 && run[k + 2].dy === 2);
      const next = records[e];
      const beforeColorOrEnd = !next || (next.b2 & 0xc3) === 0xc3 || next.b2 === 0xf3;
      if (hasTrim && !beforeColorOrEnd) assert.ok(run.length > 3, `Schnitt bei Datensatz ${i}: nur ${run.length} Sprünge – Melco schneidet nicht`);
      // Anfahrt vom Nullpunkt zum ersten Stich: noch kein Faden genäht, ein Schnitt dort schadet nicht
      if (!hasTrim && i > 0) assert.ok(run.length <= 3, `Sprungfolge ohne Schnitt bei Datensatz ${i}: ${run.length} Sprünge – Melco schnitte hier`);
      checked++;
      i = e;
    }
    assert.ok(checked > 0);
  });
}

/** DST des Grenzwert-Musters (langer Sprung über 230 mm mit Schnitt). */
function limitDst() {
  const ops = [
    { c: JUMP, x: 0, y: 0 }, { c: STITCH, x: 0, y: 0 }, { c: STITCH, x: 30, y: 0 }, { c: TRIM },
    { c: JUMP, x: 2300, y: 0 }, { c: STITCH, x: 2300, y: 0 }, { c: STITCH, x: 2310, y: 0 }, { c: JUMP, x: 2320, y: 20 },
    { c: STITCH, x: 2330, y: 20 }, { c: TRIM }, { c: END },
  ];
  return new Uint8Array(E.toDst({ ops, bounds: [0, 0, 2330, 20], threads: [{ hex: '#000000', rgb: [0, 0, 0] }] }, 'grenze'));
}

/* ---------------- EXP ---------------- */

for (const key of KEYS) {
  test(`${key}: EXP rücklesen`, () => {
    const { pat, exp } = files[key];
    assert.equal(exp.length % 2, 0, 'ungerade Länge');
    const r = readExp(exp); // wirft bei unbekannten Befehlen
    sameSeq(normalize(r.ops), expected(pat, 'exp'), 'EXP');
  });
}

/* ---------------- PES / PEC ---------------- */

for (const key of KEYS) {
  test(`${key}: PES rücklesen (PES-Teil und PEC-Teil)`, () => {
    const { pat, pes } = files[key];
    const r = readPes(pes);
    assert.equal(r.magic, '#PES0001');
    assert.equal(r.pec.label.slice(0, 3), 'LA:', 'PEC-Zeiger zeigt nicht auf den PEC-Teil');
    const [bx0, by0, bx1, by1] = pat.bounds;
    assert.equal(r.hoop, bx1 - bx0 <= 1000 && by1 - by0 <= 1000 ? 0 : 1, 'Rahmengröße');

    // PEC: Stiche, Farbnummern, Blocklänge, Vorschaubilder
    const pec = r.pec;
    sameSeq(normalize(pec.ops), expected(pat, 'pes'), 'PEC');
    const codes = E.pecIndices(pat.threads);
    assert.deepEqual(pec.codes, [...codes], 'Farbnummern im PEC-Kopf');
    assert.ok(codes.every((c) => c >= 1 && c <= 64), 'Farbnummer außerhalb 1–64');
    assert.equal(pec.endAt, pec.stitchEnd - 1, 'Ende-Byte (FF) nicht am Ende des Stichblocks');
    assert.deepEqual([pec.w, pec.h], [bx1 - bx0, by1 - by0], 'Größe im PEC-Kopf');
    assert.equal(pes.length, pec.stitchEnd + 228 * (codes.length + 1), 'Vorschaubilder: 1 + je Farbe 48 × 38 Pixel');

    // PES-Teil: Stichgruppen mit Farbnummer, Koordinaten relativ zu links/unten
    assert.equal(r.sectionCount, r.sections.length, 'Zahl der Stichgruppen');
    const abs = (q) => `${q[0] + bx0},${q[1] + by1}`;
    const pesStitches = r.sections.filter((s) => s.flag === 0).flatMap((s) => s.pts.map(abs));
    assert.deepEqual(pesStitches, stitchPositions(pat.ops), 'Stiche im PES-Teil');
    // je zusammenhängende Stich- bzw. Sprungfolge eine Gruppe mit der Farbnummer ihres Farbblocks
    let color = 0, k = 0;
    const ops = pat.ops;
    for (let i = 0; i < ops.length; i++) {
      const c = ops[i].c;
      if (c === COLOR) color++;
      if (c !== STITCH && c !== JUMP) continue;
      if (i + 1 < ops.length && ops[i + 1].c === c) continue; // Gruppe geht weiter
      const s = r.sections[k++];
      assert.ok(s, 'zu wenige Stichgruppen');
      assert.equal(s.flag, c === STITCH ? 0 : 1, `Art der Stichgruppe ${k - 1}`);
      assert.equal(s.code, codes[color], `Farbnummer der Stichgruppe ${k - 1}`);
    }
    assert.equal(k, r.sections.length, 'Stichgruppen ≠ Stich-/Sprungfolgen');
  });
}

/* ---------------- Grenzwerte: lange Sprünge, große Schritte ---------------- */

test('lange Sprünge und Stiche werden in allen Formaten zerlegt und kommen genau an', () => {
  const ops = [
    { c: JUMP, x: -1800, y: 1500 }, // 234 mm Sprung
    { c: STITCH, x: -1800, y: 1500 },
    { c: STITCH, x: -1679, y: 1379 }, // 12,1 mm je Achse
    { c: STITCH, x: -1680, y: 1380 },
    { c: TRIM },
    { c: COLOR },
    { c: JUMP, x: 2000, y: -2000 },
    { c: STITCH, x: 1879, y: -1879 }, // 12,1 mm je Achse
    { c: STITCH, x: 1870, y: -1870 },
    { c: TRIM },
    { c: END },
  ];
  const pat = { ops, bounds: [-1800, -2000, 2000, 1500], threads: [{ hex: '#000000', rgb: [0, 0, 0] }, { hex: '#ff0000', rgb: [255, 0, 0] }] };
  const want = normalize(ops);
  sameSeq(normalize(readDst(new Uint8Array(E.toDst(pat, 'grenze'))).ops), want, 'DST');
  sameSeq(normalize(readExp(new Uint8Array(E.toExp(pat))).ops), want, 'EXP');
  sameSeq(normalize(readPes(new Uint8Array(E.toPes(pat, 'grenze'))).pec.ops), expected(pat, 'pes'), 'PEC');
});

test('EXP: Stich bis 12,7 mm je Achse in einem Schritt, 0x80 nie als Stichbyte', () => {
  const ops = [
    { c: JUMP, x: 0, y: 0 }, { c: STITCH, x: 0, y: 0 },
    { c: STITCH, x: 127, y: -127 }, { c: STITCH, x: 0, y: 0 }, { c: STITCH, x: -128, y: 128 }, { c: END },
  ];
  const pat = { ops, bounds: [-128, -127, 127, 128], threads: [{ hex: '#000000', rgb: [0, 0, 0] }] };
  const exp = new Uint8Array(E.toExp(pat));
  // -128 passt nicht (0x80 wäre ein Befehl) → zwei Schritte über -64,64
  sameSeq(normalize(readExp(exp).ops), ['S 127,-127', 'S 0,0', 'S -64,64', 'S -128,128'], 'EXP');
  assert.equal(exp.length, 4 + 2 + 2 + 2 + 2 * 2, 'Sprung 4 Byte, Stiche 2 Byte, 127 in einem Schritt');
  for (let i = 0; i < exp.length;) {
    if (exp[i] === 0x80) { i += 4; continue; }
    assert.notEqual(exp[i + 1], 0x80, `EXP: 0x80 als y-Wert bei Byte ${i + 1}`);
    i += 2;
  }
});

/* ---------------- Referenzdateien ---------------- */

for (const key of KEYS) {
  for (const ext of ['pes', 'dst', 'exp']) {
    test(`${key}.${ext} entspricht der Referenzdatei`, () => {
      const file = path.join(FIXTURES, `${key}.${ext}`);
      assert.ok(fs.existsSync(file), `${file} fehlt – npm run test:fixtures`);
      const ref = fs.readFileSync(file);
      const cur = Buffer.from(files[key][ext]);
      if (!ref.equals(cur)) {
        assert.fail(`${key}.${ext} hat sich geändert (${ref.length} → ${cur.length} Byte). Gewollt? Dann `
          + '`npm run test:fixtures` ausführen und die Dateien nach der Checkliste (test/fixtures/CHECKLISTE.md) neu prüfen.');
      }
    });
  }
}

/* ---------------- pyembroidery (unabhängiger Leser) ---------------- */

function findPython() {
  for (const py of [process.env.PYTHON, 'python3', 'python'].filter(Boolean)) {
    try {
      execFileSync(py, ['-c', 'import pyembroidery'], { stdio: 'ignore' });
      return py;
    } catch { /* nächster */ }
  }
  return null;
}

test('pyembroidery liest PES, DST und EXP wie geplant', (t) => {
  const py = findPython();
  if (!py) {
    if (process.env.REQUIRE_PYEMBROIDERY) assert.fail('pyembroidery fehlt (pip install pyembroidery)');
    t.skip('pyembroidery nicht installiert – pip install pyembroidery');
    return;
  }
  const paths = KEYS.flatMap((k) => ['pes', 'dst', 'exp'].map((e) => path.join(FIXTURES, `${k}.${e}`)));
  const out = JSON.parse(execFileSync(py, [path.join(__dirname, 'pyembroidery_dump.py'), ...paths], { maxBuffer: 1 << 28 }).toString());
  const C = { STITCH, JUMP, TRIM, COLOR, END };
  for (const p of paths) {
    const r = out[p];
    assert.ok(r, `pyembroidery kann ${path.basename(p)} nicht lesen`);
    const unknown = r.ops.filter((o) => !(o.c in C));
    assert.equal(unknown.length, 0, `${path.basename(p)}: unbekannte Befehle ${[...new Set(unknown.map((o) => o.c))]}`);
    const [key, ext] = path.basename(p).split('.');
    sameSeq(normalize(r.ops.map((o) => ({ ...o, c: C[o.c] }))), expected(files[key].pat, ext), `pyembroidery ${path.basename(p)}`);
    if (ext === 'pes') assert.equal(r.threads, files[key].pat.threads.length, `${path.basename(p)}: Zahl der Garne`);
  }
});
