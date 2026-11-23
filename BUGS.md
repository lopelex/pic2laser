# Bekannte Fehler

> **Status (nach Version 1.4.0):** Alle Punkte 1–14 sind behoben. Die Prüfung von Version 1.4.0
> (vier Bereiche: Main/IPC, KI-Pipeline, Oberfläche, Bildverarbeitung) und ihre Fixes stehen
> unten unter „Prüfung Version 1.4.0“.

Ergebnis einer Code-Prüfung vom 20.11.2026 (Stand: Version 1.1.2 plus noch nicht committete
Abbrechen-Funktion und Ergebnis-Info). Zeilennummern beziehen sich auf diesen Stand.

## Wichtig

### 1. Fortschrittsleiste bleibt nach abgebrochenem Download hängen – ✅ behoben (Rest siehe Nr. 11)
**Ort:** `src/renderer/app.js:1509–1521` (Download-Fortschritt), `src/renderer/app.js:1706–1716` (`cancelAll`)

`cancelAll()` setzt nur `Run.downloading = false`, leert aber `downloadStarts` nicht. Ein
abgebrochener Download schickt kein `done`, sein Eintrag bleibt also stehen.

**So tritt es auf:**
1. Download von Modell A starten und abbrechen.
2. Später lädt ein Durchlauf Modell B.
3. Wenn B fertig ist, steckt A noch in `downloadStarts`, deshalb bleibt `Run.downloading = true`.

**Folgen:**
- Die Leiste zeigt weiter „Lade Modell …“.
- `Run.render()` zeigt nichts mehr an, und `Run.stop()` blendet den Fortschritt nicht aus.
- Weil die App weiter als beschäftigt gilt, meldet jedes Drücken von Esc „Berechnung abgebrochen.“
- Lädt man A erneut, rechnet die Restzeit mit dem alten Startzeitpunkt und der alten Byte-Zahl.

Bei fehlgeschlagenen Downloads passiert das schon heute, durch das Abbrechen jetzt aber regelmäßig.

**Lösung:** In `cancelAll()` (und bei Download-Fehlern) `downloadStarts` leeren bzw. den
betroffenen Eintrag entfernen.

### 2. „Download fehlgeschlagen: cancelled“ nach dem Abbrechen – ✅ behoben
**Ort:** `src/renderer/app.js:1477–1483` (Knopf „laden“ in der Modellliste)

Im `catch` fehlt die Prüfung `isCancelled(err)`. Wird ein Download aus der Modellliste
abgebrochen, erscheint nach „Berechnung abgebrochen.“ zusätzlich eine Fehlermeldung.

**Lösung:** `if (isCancelled(err)) return;` vor der Fehlermeldung.

## Kleinigkeiten

### 3. Kommentar über der falschen Stelle – ✅ behoben
**Ort:** `src/main/models.js:195–197`

Der Kommentar „Lädt eine Datei, prüft die SHA-256-Prüfsumme…“ steht über `const activeDownloads`
statt über `async function downloadFile`. Editor und Hover ordnen ihn deshalb falsch zu.

### 4. Abbrechen trifft nachfolgende Vektorisierung – ✅ behoben
**Ort:** `src/main/main.js:66–73`, `86–96` (`tracer`)

Kommt das Ergebnis des laufenden Jobs nach `kill()`, aber vor `exit`, wird `running = null`
gesetzt und `next()` schickt einen inzwischen neu eingereihten Job an den sterbenden Prozess.
Der folgende `exit` lehnt diesen gültigen Job mit „cancelled“ ab. Der Durchlauf endet ohne
Ergebnis und ohne Meldung. Das Zeitfenster ist eng.

### 5. KI-Prozess: Abbruch wirkt in zwei Zeitfenstern nicht richtig – ✅ behoben (Rest siehe Nr. 10)
**Ort:** `src/main/models.js:269–270`, `296–300`, `322–326`

- **(a) Abbruch während `checkMemory`:** `run()` wartet bei knappem Speicher bis zu 300 ms in
  `checkMemory`. Kommt der Abbruch in dieser Zeit, wird nur der alte Prozess beendet. Danach
  startet `worker.run()` einen neuen Prozess und rechnet den abgebrochenen Job komplett durch.
  Das kostet CPU und blockiert die Warteschlange für den nächsten echten Durchlauf.
- **(b) Anfrage zwischen `kill()` und `exit`:** Eine `model-run`-Anfrage in diesem Zeitfenster
  landet beim sterbenden Prozess, weil `this.proc` noch gesetzt ist. Sie wird still mit
  „cancelled“ abgelehnt.

### 6. Abbrechen verwirft geladene Modelle unnötig – ✅ behoben
**Ort:** `src/main/models.js:296–300` (`worker.cancel()`)

`worker.cancel()` beendet den KI-Prozess auch dann, wenn er gerade nichts rechnet, etwa beim
Abbruch einer reinen Vektorisierung oder eines Downloads. Dabei gehen alle zwischengespeicherten
ONNX-Sessions verloren, und der nächste KI-Schritt muss die Modelle neu laden.

**Lösung:** Nur beenden, wenn Jobs in `pending` liegen.

### 7. Ergebnis-Info bleibt nach neuem Bild stehen – ✅ behoben
**Ort:** `src/renderer/app.js:635`, `1679–1690` (`renderResultInfo`)

Beim Laden eines neuen Bildes wird nur `state.result = null` gesetzt, `#result-info` aber nicht
ausgeblendet. Wird die neue Umwandlung abgebrochen oder schlägt sie fehl, bleibt die Info
„⤴ Herausziehen: … mm“ des alten Ergebnisses sichtbar, obwohl sich nichts herausziehen lässt.

### 8. Ergebnis-Info zeigt zuerst die Größe ohne Umrisslinie – ✅ behoben
**Ort:** `src/renderer/app.js:1165–1173`

`scheduleDragPrepare()` ruft `renderResultInfo` auf, bevor `totalWmm` und `totalHmm` gesetzt sind.
Die Info zeigt deshalb zuerst die Größe ohne Umrisslinie. Korrigiert wird das erst im Timer nach
250 ms. Scheitert die Vorbereitung dort oder wird vorher neu berechnet, bleibt die falsche Größe
stehen.

**Lösung:** `totalWmm`/`totalHmm` direkt im Objekt-Literal von `state.result` setzen.

### 9. Abbrechen kann einen gerade neu gestarteten Durchlauf treffen – ✅ behoben
**Ort:** `src/renderer/app.js:1706–1716` (`cancelAll`)

`cancelAll` erhöht `state.generation` gleich am Anfang, ruft `Run.stop()`, `hideProgress()` und
`setBusy(false)` aber erst nach dem IPC-Await auf. Startet in dieser Zeit ein neuer Durchlauf,
etwa durch eine geänderte Einstellung, werden seine Busy-Anzeige und sein Fortschritt gelöscht.
Seine `trace`- oder `model-run`-Aufrufe können außerdem noch vom Abbruch im Main-Prozess erfasst
werden. Der Durchlauf liefert dann kein Ergebnis.

## Zweite Prüfung nach Version 1.1.3 (behoben nach 1.4.0)

Zeilennummern beziehen sich auf Commit 37bcfcb.

### 10. Abbrechen zwischen zwei Kacheln wirkt nicht – ❗ wichtig – ✅ behoben
**Ort:** `src/main/models.js:304–305`, Kachel-Schleifen in `src/renderer/ai.js:528` (Vergrößern),
`src/renderer/restore.js:72` (Entrauschen), ebenso Kratzer auffüllen und Gesichter restaurieren

Jede Kachel ist ein eigener `model-run`-Aufruf. Kommt der Abbruch, während der Renderer eine
Kachel vor- oder nachbereitet, ist `pending` leer: Es wird nichts beendet, `epoch++` hat keine
Wirkung, und die nächste Kachel liest bereits den neuen Epoch-Wert.

**So tritt es auf:** Vergrößern mit 30 Kacheln, nach Kachel 5 abbrechen. Die übrigen 25 Kacheln
rechnen unsichtbar unter Volllast weiter. Der nächste Durchlauf wartet in der KI-Warteschlange
dahinter. Der Kommentar am Epoch-Zähler („rechnet danach nicht weiter“) verspricht mehr, als er hält.

**Lösung:** In den Kachel-Schleifen im Renderer vor jeder Kachel die Generation bzw. ein
Abbruch-Signal prüfen und mit `cancelled` aussteigen.

### 11. Fortschrittsleiste kann nach dem Abbrechen wieder auftauchen – Kleinigkeit – ✅ behoben
**Ort:** `src/renderer/app.js:1713–1724` (`cancelAll`), `src/renderer/app.js:1517–1534` (Download-Fortschritt)

Rückschritt durch 37bcfcb: `cancelAll` räumt die Oberfläche jetzt *vor* dem Await auf. Eine
`model-progress`-Meldung, die Main noch vor dem Abbruch abgeschickt hat, kommt erst danach an,
ruft erneut `showProgress("Lade Modell …")` auf und trägt sich wieder in `downloadStarts` ein.
Weder der `finally`-Block von `ensureModel` noch der von `runProcess` blendet sie wieder aus.

**So tritt es auf:** Während ein Durchlauf ein Modell lädt, abbrechen. Gelegentlich (Fortschritt
kommt alle 150 ms) bleibt „Lade Modell …“ stehen; Esc meldet dann wieder „Berechnung abgebrochen.“
Der Knopf „laden“ in der Modellliste ist nicht betroffen.

**Lösung:** Nach dem Await in `cancelAll` erneut aufräumen, oder Fortschrittsmeldungen nach
einem Abbruch bis zum nächsten Start ignorieren.

### 12. Neuer Durchlauf erwischt kurz nach dem Abbruch den abgebrochenen Download – Kleinigkeit – ✅ behoben
**Ort:** `src/main/models.js:188–189`, `206–208`

Der Eintrag in `downloads` wird erst nach `fs.rm(tmp)` und `p.finally` entfernt, also nach der
Antwort auf `cancel-all`. Ein `ensure(id)` in diesem Zeitfenster (Neustart über
`scheduleProcess(0)` oder sofort geänderte Einstellung) bekommt das sterbende Promise und endet
still mit `cancelled`, ohne Ergebnis und ohne Meldung. Das Zeitfenster ist sehr eng.

**Lösung:** Den Eintrag in `cancelAll()` sofort aus `downloads` entfernen.

### 13. Umrisslinie ohne Pfad: Rasterbilder ohne Rand, SVG mit Rand – Kleinigkeit – ✅ behoben
**Ort:** `src/renderer/app.js:1595` (`rasterCanvas`) gegenüber `app.js:1170–1172` und
`src/renderer/encoders.js:150–152`

Liefert Potrace für die Silhouette einen leeren Pfad (`outline = { d: '', pad }`), erweitert das
SVG die viewBox trotzdem um `pad` und `totalWmm` zählt den Rand mit, `rasterCanvas` aber nicht.

**So tritt es auf:** Umrisslinie aktiv, Silhouette leer oder komplett unter `turdSize`.
PNG/JPG/BMP sind dann um 2·pad Pixel kleiner als das SVG; in LightBurn liegen Bild und SVG versetzt.

**Lösung:** Bei leerem Pfad `outline = null` setzen oder in `rasterCanvas` den Rand trotzdem anlegen.

### 14. Ergebnis-Info zeigt kurz Formate eines veralteten Ergebnisses – Kleinigkeit – ✅ behoben
**Ort:** `src/renderer/app.js:1678`

`renderResultInfo(files…)` läuft auch, wenn sich `state.result` während `await dragPrepare`
geändert hat; die Zeile davor prüft das nur für `dragReady`. Werden die Formate umgestellt,
während eine ältere Vorbereitung läuft, stehen kurz die alten Formate beim neuen Ergebnis.

**Lösung:** `renderResultInfo` nur aufrufen, wenn `r === state.result`.

## Prüfung Version 1.4.0 – ✅ behoben

**Main-Prozess / IPC**
- Nur eine Instanz (`requestSingleInstanceLock`); eine zweite holt das Fenster nach vorn.
- Beim Beenden: GPU-Vermerk `gpuInFlight` löschen (kein falscher „GPU-Absturz“ beim nächsten Start),
  Drag-Ordner aufräumen. GPU-Warnung nur einmal.
- `prefs.json`, `meta.json` und Originale atomar schreiben (eindeutige Hilfsdatei + rename).
- Export fragt nach, bevor vorhandene Begleitdateien (z. B. `foo.png`) ersetzt werden.
- `drag-prepare` je Art nacheinander; Endungen nur aus einer Positivliste; `lane` per `hasOwn`.
- KI-Cache: Index-Laden ohne Wettlauf, `.tmp`-Reste aufräumen, `clear()` in der Schreibkette.
- Potrace: Zugriff bei `x === w` las das erste Pixel der nächsten Zeile → Formen außerhalb der viewBox.

**KI-Pipeline**
- Prozess-Ende während GPU-Lauf sperrt die GPU nur noch, wenn der CPU-Neuversuch klappt.
- `gpu-failed` aktualisiert laufende Jobs (Dateiname statt Pfad verglichen).
- Abbrechen verwirft geladene Modelle nicht wegen eines offenen `trim`.
- Speichermangel beim Laden fällt nicht mehr still auf WebAssembly zurück.
- Downloads: Abbruch auch zwischen den Teilen, 60-s-Zeitüberwachung, eindeutige `.part`-Dateien,
  „entfernen“ bricht einen laufenden Download ab.
- Abbrechen wirkt zwischen Kacheln (Vergrößern, Entrauschen, Kratzer, Gesichter, Gesichts-Linien).

**Oberfläche**
- „Hintergrund ausblenden“ hat einen eigenen Worker und bricht die Berechnung nicht mehr ab.
- Veraltete Durchläufe schreiben weder Maske noch Cache des neuen Bildes (Durchlauf-Kontext).
- Cache-Schlüssel über die tatsächlich verwendete Maske; Gesichts-Linien mit „vor/nach Freistellen“.
- Export nur, wenn das Ergebnis zu den Einstellungen passt; Historie speichert die Einstellungen
  des Ergebnisses; Herausziehen erst nach Neuberechnung.
- Zwischenspeicher je Schrittart begrenzt (LRU, 6 Einträge).
- Restaurierungs-Info gehört zum Ergebnis; Vorschau-Schlüssel erst nach Erfolg gesetzt.

**Bildverarbeitung**
- DPI immer aus der tatsächlichen Pixelbreite (Pixelgrenze), mit Hinweis.
- Distanztransformation: keine Endlosschleife bei `maxDist = Infinity`; Breite min. 0,1 mm.
- Transparenter Hintergrund bleibt mit „Invertieren“ weiß (auch in Schriftbereichen).
- Weichzeichnen und Farbmaske ohne helleren Rand.

## Prüfung der Stickdateien (Version 1.17.0)

Prüfung vom 23.11.2026 in drei Teilen: DST/EXP/INF gegen die Formate, PES/PEC gegen die Formate, und der
ganze Export im laufenden Programm (alle 27 Stick-Vorlagen und 6 Sonderfälle, jede Datei mit pyembroidery
zurückgelesen: Stichzahl, jede Stichposition, Farben, Größe und Fadenschnitte stimmen mit dem Stichplan
überein; längster Schritt 12,1 mm bei DST, 12,7 mm bei EXP). INF ist Byte für Byte gleich mit pyembroidery.

### S1. PES: Stichzahl je Stichgruppe läuft über 65.535 – ❗ wichtig – ✅ behoben (1.17.1)
**Ort:** `src/renderer/embroidery.js`, `toPes` (`CSewSeg`-Abschnitte)

Eine Stichgruppe endet nur an einem Sprung oder Farbwechsel; eine große zusammenhängende Füllung (etwa ab
210 × 210 mm) hat mehr als 65.535 Stiche, die Zahl wurde als 16 Bit geschrieben und lief über. Programme,
die den PES-Teil lesen, fanden danach verschobene Daten. Jetzt mehrere Gruppen, jede beginnt am letzten
Punkt der vorigen.

### S2. PEC: Fadenschnitt wirkt auf einen späteren Sprung – Kleinigkeit – ✅ behoben (1.17.1)
Folgte auf „Schnitt, Farbwechsel“ direkt ein Stich (neue Farbe beginnt am selben Punkt), blieb der Schnitt
gemerkt und wurde dem nächsten kurzen Sprung angehängt.

### S3. Ungültige Koordinaten (NaN) – Kleinigkeit – ✅ behoben (1.17.1)
DST/EXP schrieben ab der ersten NaN-Koordinate nichts mehr, PES blieb in der Vorschaugrafik hängen. Aus der
App nicht auszulösen; jetzt bricht jedes Format mit einer Fehlermeldung ab.

### S4. Punkt im eingegebenen Dateinamen schneidet den Namen ab – Kleinigkeit – ✅ behoben (1.17.1)
**Ort:** `src/main/main.js`, `export-files`. Ohne Endung eingegeben (vor allem unter Linux) wurde aus
„Version 1.2 Entwurf“ „Version 1.*“. Jetzt wird nur eine bekannte Endung ersetzt.

### S5. Breite in Farben-Vorlagen meint die Bildbreite – offen
Bei „10 Farben“ (90 mm), „16 Farben“ (100 mm), „Stencil“ (100 mm) und „Logos“ (100 mm) gilt die Breite für
das ganze Bild mit Hintergrund und Rand; das Motiv wird kleiner gestickt (z. B. 54,6 mm statt 90 mm). Die
Ergebnis-Info zeigt die echte Größe.

### Weitere Hinweise (nicht behoben, geringe Bedeutung)
- **DST:** Ein Sprung über 24,2 mm ohne Schnitt wird zu 3 und mehr Sprung-Datensätzen; Maschinen mit
  „Jump Count For Trim“ = 3 schneiden dort. Der Stichplan schneidet vor Sprüngen über der Schnittlänge,
  das tritt nur mit sehr großer Schnittlänge auf.
- **DST-Kopf:** `ST` zählt auch die Sprünge eines Schnitts (pyembroidery nicht); Maschinen werten das Feld
  nicht aus. `+Y`/`-Y` nach Tajima (pyembroidery vertauscht sie).
- **PES:** leeres Muster und mehr als 256 Farbblöcke sind nicht abgefangen (die App lässt beides nicht zu).
- **Export:** Schlägt eine spätere Datei fehl (Platte voll), bleiben die schon geschriebenen liegen. Der
  Speichern-Dialog öffnet immer in „Bilder“ und nennt nur das erste Format.
- **Nicht geprüft:** echte Maschinen, PE-Design, DesignShop 12 (EXP-Schnittcode `80 80 07 00` wie
  pyembroidery) – dafür die Prüfdateien in `test/fixtures/` und die Checkliste.

## Geprüft, kein Problem

- **Verarbeitungs-Worker:** Nach `Pipeline.cancel()` mit `worker = null` erzeugt `call()` ihn
  beim nächsten Durchlauf neu (`app.js:737`).
- **Esc:** Es gibt keinen weiteren Escape-Handler und keine `<dialog>`-Elemente, also keinen Konflikt.
- **Zwischengespeicherte Ergebnisse:** Abgebrochene Aufträge werden im `catch` wieder entfernt und
  bleiben nicht hängen. `isCancelled` erkennt die IPC-Meldung über `/cancelled$/`.
- **Abgebrochener Download:** Die `.part`-Datei wird gelöscht, die `downloads`-Map in `finally`
  aufgeräumt; ein erneuter Download ist möglich.
- **BMP/PNG mit Umrisslinie:** Die Bit-Konvention (1 = schwarz) passt zu `bmp1bit` und `resultCanvas`.
- **Vektorisierung nach Abbruch (seit 37bcfcb):** Der beendete Prozess wird abgekoppelt, neue
  Aufträge gehen an einen neuen Prozess; kein doppeltes Ablehnen, `next()` arbeitet korrekt.
- **KI-Prozess nach Abbruch:** Der beendete Prozess löst über `exit` keine Ablehnungen mehr aus,
  `trim`/`drop` laufen nicht ins Leere.
- **Umrisslinie in PNG/JPG/BMP, Historien-Vorschau, Drag-Symbol:** Lage und Größe stimmen mit dem
  SVG überein (außer im Sonderfall Nr. 13).
