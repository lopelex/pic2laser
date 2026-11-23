'use strict';

/**
 * Schreibt die Referenzdateien der Prüfmotive (test/fixtures/*.pes|dst|exp) und die Checkliste
 * für den Test in Stickprogrammen und auf der Maschine. Aufruf: npm run test:fixtures
 *
 * Nur nach einer gewollten Änderung an den Stichen oder Dateiformaten ausführen – der Test
 * vergleicht die Ausgabe Byte für Byte mit diesen Dateien.
 */
const fs = require('fs');
const path = require('path');
const { E, MOTIFS, FIXTURES, motifFiles } = require('./embroidery-helpers');

fs.mkdirSync(FIXTURES, { recursive: true });
const rows = [];
for (const key of Object.keys(MOTIFS)) {
  const m = MOTIFS[key];
  const f = motifFiles(key);
  for (const ext of ['pes', 'dst', 'exp', 'inf']) fs.writeFileSync(path.join(FIXTURES, `${key}.${ext}`), f[ext]);
  const codes = E.pecIndices(f.pat.threads);
  const fmt = (v) => v.toFixed(1).replace('.', ',');
  rows.push({
    key, m, st: f.pat.stats,
    size: `${fmt(f.pat.widthMm)} × ${fmt(f.pat.heightMm)} mm`,
    colors: f.pat.threads.map((t, i) => `${t.name || t.hex} (${t.hex}, Brother-Nr. ${codes[i]})`).join(' → '),
  });
}

const md = `# Checkliste: Stickdateien prüfen

Erzeugt von \`npm run test:fixtures\` – nicht von Hand ändern.

Die Dateien in diesem Ordner sind die Referenzausgabe von Pic2Laser. \`npm test\` prüft bei jeder Änderung,
dass die Ausgabe gleich bleibt und von unabhängigen Lesern (eigene Leser im Test, pyembroidery) richtig
gelesen wird. **Ob ein Stickprogramm oder eine Maschine die Dateien annimmt, prüft nur diese Checkliste** –
einmal je Format und Programm/Maschine und erneut, wenn sich die Referenzdateien ändern.

## Prüfmotive

| Motiv | Inhalt | Größe | Stiche | Farben | Fadenschnitte |
|---|---|---|---|---|---|
${rows.map((r) => `| \`${r.key}\` – ${r.m.title} | ${r.m.about} | ${r.size} | ${r.st.stitches} | ${r.st.colors}: ${r.colors} | ${r.st.trims} |`).join('\n')}

Stichzahlen weichen in Programmen leicht ab (manche zählen Sprünge und Schnitte mit). Größe ±0,5 mm.
Der Fadenschnitt am Ende fehlt in PES (das Format kennt ihn nur vor einem Sprung) – Brother-Maschinen
schneiden am Ende ohnehin.

## Stufe 2: Im Stickprogramm öffnen

| Format | Programm | Geprüft am / von | Ergebnis |
|---|---|---|---|
| PES | Brother PE-Design oder Artspira | | |
| DST | Wilcom TrueSizer, Embird oder Hatch | | |
| EXP | Melco DesignShop | | |
| EXP + INF | Melco DesignShop 12 (Farben) | | |
| EXP | Wilcom TrueSizer oder Embird | | |

Je Datei prüfen:
- [ ] Öffnet ohne Warnung oder Fehlermeldung
- [ ] Größe wie in der Tabelle, Motiv nicht gespiegelt oder gedreht (Wellenlinie unten, kleines Quadrat rechts oben)
- [ ] Stichzahl ungefähr wie in der Tabelle
- [ ] Farbwechsel an den richtigen Stellen (PES: Farben wie in der Tabelle; DST/EXP: nur die Wechsel)
- [ ] DesignShop 12 mit \`.inf\` im selben Ordner: Farben genau wie in der Tabelle (Hex-Werte), Namen
  Rot/Blau/Schwarz – auch für die DST, solange die \`.inf\` daneben liegt
- [ ] Fadenschnitte vor den langen Sprüngen (Programm zeigt Schnitt-Symbole bzw. zählt sie)
- [ ] \`sprung\`: der lange Sprung ist ein Sprung (keine Stichlinie quer über den Stoff)

## Melco EMT16X (Melco OS)

Aus dem Handbuch „Melco OS – Advanced Interface“ (v11):
- Melco OS lädt EXP und DST direkt (File → Load Design); Melcos eigene Testmuster (AMPASS/BRAVOPASS) sind EXP.
- **Fadenschnitt:** Einstellung **„Jump Count For Trim“** – mehr Sprünge in Folge als eingestellt werden zu
  einem Schnitt vor den Sprüngen. Standard **3**, 0 schaltet es ab. Pic2Laser schreibt in DST jeden Schnitt
  als 3 Sprünge ohne Bewegung plus den Weg (also mindestens 4 Sprünge) und Wege ohne Schnitt mit höchstens
  3 Sprüngen – das prüft \`npm test\`. **Den Wert auf 3 lassen** (bei 0 oder über 3 schneidet DST nicht).
  Änderungen gelten erst nach erneutem Laden des Motivs.
- EXP enthält zusätzlich den Melco-Schnittbefehl, der Weg danach ist meist nur 1 Sprung. Ob Melco OS den
  Befehl auswertet, zeigt erst der Probestick (siehe unten) – sonst DST verwenden.
- **Farben:** DST und EXP haben keine Garnfarben, Melco OS zeigt Zufallsfarben je Farbblock. Die Nadel je
  Farbblock in der Farbfolge (Color Sequence) festlegen, Reihenfolge wie in Pic2Laser.
- **Farben über DesignShop 12:** Zu EXP schreibt Pic2Laser eine INF-Datei (gleicher Name) mit Farbe, Name und
  Nadel je Farbblock. DesignShop 12 liest sie zu EXP und DST („Color information via an accompanying INF
  file“). Als OFM gespeichert zeigt auch Melco OS die Farben. Alternativ PES öffnen (Brother-Garne).
- Stickfeld höchstens 410 × 393 mm (Flachrahmen), Dateien bis 500 KB (EXP ca. 250 000, DST ca. 170 000 Stiche).

## Stufe 3: Probestick auf der Maschine

Am besten \`pruefmotiv\` auf Webware mit Vlies, sonst \`einfach\`.

| Format | Maschine | Geprüft am / von | Ergebnis |
|---|---|---|---|
| PES | Brother / Babylock / Bernette | | |
| DST | | | |
| EXP | Melco EMT16X | | |
| DST | Melco EMT16X | | |

- [ ] Datei wird von der Maschine angenommen, Größe auf dem Display stimmt
- [ ] Hält an jedem Farbwechsel an
- [ ] Schneidet vor den langen Sprüngen (keine Verbindungsfäden zum kleinen Quadrat)
- [ ] Flächen decken, keine Lücken zwischen Rot und Blau, Streifen und Welle sauber gestickt
- [ ] Rahmen sitzt um das Motiv (kein Versatz durch falsch gelesene Schritte)
- [ ] Melco: \`sprung\` und \`pruefmotiv\` je einmal als EXP und als DST – schneidet beides vor den langen
  Sprüngen? Wenn nur DST schneidet: melden, dann schreibt Pic2Laser EXP-Schnitte ebenfalls als Sprungfolge.
`;
fs.writeFileSync(path.join(FIXTURES, 'CHECKLISTE.md'), md);
console.log(`Referenzdateien geschrieben: ${FIXTURES}`);
