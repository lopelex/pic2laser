# Bekannte Fehler

> **Status:** Alle neun Punkte sind in Version 1.1.3 behoben und getestet (Download abbrechen,
> Esc im Ruhezustand, erneuter Download, Abbrechen ohne laufende KI, neues Bild, Umrisslinie,
> Abbrechen während KI-Berechnung).

Ergebnis einer Code-Prüfung vom 20.11.2026 (Stand: Version 1.1.2 plus noch nicht committete
Abbrechen-Funktion und Ergebnis-Info). Zeilennummern beziehen sich auf diesen Stand.

## Wichtig

### 1. Fortschrittsleiste bleibt nach abgebrochenem Download hängen – ✅ behoben
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

### 5. KI-Prozess: Abbruch wirkt in zwei Zeitfenstern nicht richtig – ✅ behoben
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

## Geprüft, kein Problem

- **Verarbeitungs-Worker:** Nach `Pipeline.cancel()` mit `worker = null` erzeugt `call()` ihn
  beim nächsten Durchlauf neu (`app.js:737`).
- **Esc:** Es gibt keinen weiteren Escape-Handler und keine `<dialog>`-Elemente, also keinen Konflikt.
- **Zwischengespeicherte Ergebnisse:** Abgebrochene Aufträge werden im `catch` wieder entfernt und
  bleiben nicht hängen. `isCancelled` erkennt die IPC-Meldung über `/cancelled$/`.
- **Abgebrochener Download:** Die `.part`-Datei wird gelöscht, die `downloads`-Map in `finally`
  aufgeräumt; ein erneuter Download ist möglich.
- **BMP/PNG mit Umrisslinie:** Die Bit-Konvention (1 = schwarz) passt zu `bmp1bit` und `resultCanvas`.
