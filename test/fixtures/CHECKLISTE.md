# Checkliste: Stickdateien prüfen

Erzeugt von `npm run test:fixtures` – nicht von Hand ändern.

Die Dateien in diesem Ordner sind die Referenzausgabe von Pic2Laser. `npm test` prüft bei jeder Änderung,
dass die Ausgabe gleich bleibt und von unabhängigen Lesern (eigene Leser im Test, pyembroidery) richtig
gelesen wird. **Ob ein Stickprogramm oder eine Maschine die Dateien annimmt, prüft nur diese Checkliste** –
einmal je Format und Programm/Maschine und erneut, wenn sich die Referenzdateien ändern.

## Prüfmotive

| Motiv | Inhalt | Größe | Stiche | Farben | Fadenschnitte |
|---|---|---|---|---|---|
| `pruefmotiv` – Prüfmotiv (3 Farben, ca. 83 × 70 mm) | Rotes Quadrat mit rundem Loch, kleines rotes Quadrat weit rechts (Sprung mit Fadenschnitt), schmaler roter Streifen (Kontur im Steppstich), blauer Kreis, schwarze Wellenlinie unten und schwarzer Rahmen (gleiche Farbe wie die Welle – kein Farbwechsel dazwischen). | 83,0 × 70,0 mm | 3304 | 3: Rot (#d01c1c, Brother-Nr. 5) → Blau (#1c3cd0, Brother-Nr. 2) → Schwarz (#000000, Brother-Nr. 20) | 6 |
| `sprung` – Langer Sprung (1 Farbe, ca. 170 × 10 mm) | Zwei Quadrate 10 × 10 mm mit 150 mm Abstand: der Sprung muss in Teilschritte zerlegt und vorher abgeschnitten werden. | 170,2 × 10,4 mm | 604 | 1: Schwarz (#000000, Brother-Nr. 20) | 2 |
| `einfach` – Einfaches Quadrat (1 Farbe, 20 × 20 mm) | Ein schwarzes Quadrat – kleinster Test, ob die Maschine die Datei überhaupt annimmt. | 20,2 × 20,2 mm | 880 | 1: Schwarz (#000000, Brother-Nr. 20) | 1 |

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
- [ ] DesignShop 12 mit `.inf` im selben Ordner: Farben genau wie in der Tabelle (Hex-Werte), Namen
  Rot/Blau/Schwarz – auch für die DST, solange die `.inf` daneben liegt
- [ ] Fadenschnitte vor den langen Sprüngen (Programm zeigt Schnitt-Symbole bzw. zählt sie)
- [ ] `sprung`: der lange Sprung ist ein Sprung (keine Stichlinie quer über den Stoff)

## Melco EMT16X (Melco OS)

Aus dem Handbuch „Melco OS – Advanced Interface“ (v11):
- Melco OS lädt EXP und DST direkt (File → Load Design); Melcos eigene Testmuster (AMPASS/BRAVOPASS) sind EXP.
- **Fadenschnitt:** Einstellung **„Jump Count For Trim“** – mehr Sprünge in Folge als eingestellt werden zu
  einem Schnitt vor den Sprüngen. Standard **3**, 0 schaltet es ab. Pic2Laser schreibt in DST jeden Schnitt
  als 3 Sprünge ohne Bewegung plus den Weg (also mindestens 4 Sprünge) und Wege ohne Schnitt mit höchstens
  3 Sprüngen – das prüft `npm test`. **Den Wert auf 3 lassen** (bei 0 oder über 3 schneidet DST nicht).
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

Am besten `pruefmotiv` auf Webware mit Vlies, sonst `einfach`.

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
- [ ] Melco: `sprung` und `pruefmotiv` je einmal als EXP und als DST – schneidet beides vor den langen
  Sprüngen? Wenn nur DST schneidet: melden, dann schreibt Pic2Laser EXP-Schnitte ebenfalls als Sprungfolge.
