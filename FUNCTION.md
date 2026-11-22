# Pic2Laser – Funktionen

Pic2Laser wandelt Bilder in Laser-Vorlagen für LightBurn um: Schwarz-Weiß-SVGs (Vektor) und
optional Rasterbilder (PNG, JPG, BMP) – in der richtigen Größe in mm und mit DPI.
Alle KI-Funktionen laufen lokal und offline.

---

## Bild laden & Vorschau

- **Bild laden:** Drag & Drop ins Fenster, Datei-Dialog („Bild öffnen…“, Strg/Cmd+O) oder
  Einfügen aus der Zwischenablage (Strg/Cmd+V). Formate: PNG, JPG, WebP, BMP, GIF, AVIF, ICO.
- **Vorschau:** Original und Ergebnis nebeneinander oder einzeln, aktualisiert sich bei jeder
  Änderung automatisch.
- **Zoom:** Mausrad zoomt stufenlos (100–1600 %) auf die Mausposition; Trackpad: Pinch zoomt,
  zwei Finger verschieben. Knöpfe + / − / Einpassen.
- **Verschieben:** Im Original mit gedrückter linker Maustaste, im Ergebnis mit der mittleren
  Maustaste. Beide Ansichten laufen synchron.
- **Statuszeile:** Pixelgröße, Endgröße in mm, DPI, SVG-Größe und Rechenzeit.
- **Info im Ergebnisfeld:** welche Dateien beim Herausziehen mitkommen, Größe in mm, DPI.

## Modi

| Modus | Wofür | Ergebnis |
|---|---|---|
| **Fläche** | Logos, Schrift, Silhouetten, Grafiken | Schwellwert + Vektorisierung (Potrace) → gefüllte Vektorpfade |
| **Linien** | Strichzeichnungen | KI-Strichzeichnung (wählbares Modell, s. u.) oder Kantenerkennung (Canny) → Linien als Vektor |
| **Foto** | Fotogravur | Dithering: Floyd-Steinberg, Atkinson, Jarvis, Stucki, Bayer 8×8 oder Schwellwert |
| **Relief** | 3D-Reliefgravur in Holz | KI-Tiefenkarte (Depth Anything V2) als Graustufenbild – hell = erhaben, dunkel = tief |

## Einstellungen

- **Bildanpassung:** Helligkeit, Kontrast, Gamma, Weichzeichnen, Schärfen, Invertieren.
  Doppelklick auf einen Regler setzt ihn zurück.
- **Vektorisierung:** Schwellwert (inkl. „Auto“/Otsu), Flecken entfernen, Ecken glätten,
  Kurven-Toleranz, Arbeitsauflösung.
- **Linien:** Modell, Detailgrad, Linienschwelle, Linien verstärken (KI) bzw. Empfindlichkeit und
  Linienstärke in mm (Canny). Modelle der KI-Strichzeichnung:
  - *Feine Linien* (Informative Drawings, anime – mitgeliefert): viele Details und Schraffur.
  - *Kräftige Konturen* (Informative Drawings, contour): dicke, geschlossene Umrisse.
  - *Zarte Skizze* (Informative Drawings, opensketch): wenige, leichte Bleistiftstriche.
  - *Tusche-Porträt* (U²-Net Portrait): nur für Gesichter, Haare als Fläche; rechnet fest mit
    512 × 512 px, der Detailgrad ist dann ausgeblendet.
  - *Feine Kanten* (TEED): Kantendetektor, zeichnet auch Strukturen wie Holzmaserung mit.

  Mit „Gesichtszüge hervorheben“ wird jedes Gesicht mit dem gewählten Modell neu gezeichnet;
  die vergrößerte Nachzeichnung von Mund, Nase, Kinn und Wangen nutzt nur *Feine Linien* –
  die anderen Modelle malen dort Hautschattierung, die als Flecken erscheinen würde.
- **Dithering / Relief:** Verfahren, Auflösung in DPI, Tiefen-Detail.
- **Ausgabegröße:** Breite oder Höhe in mm (Seitenverhältnis bleibt erhalten); Weiß optional
  transparent.

## Freistellen (Hintergrund entfernen)

| Methode | Modell | Hinweis |
|---|---|---|
| KI – schnell | U²-Net | mitgeliefert |
| KI – präzise | IS-Net | Download bei Bedarf |
| KI – beste Qualität | BiRefNet lite | Download; braucht ca. 6,7 GB RAM, weicht sonst automatisch auf BEN2, notfalls IS-Net aus |
| KI – gut & sparsam | BEN2 Base (int8) | Download; ca. 3 GB RAM, etwa doppelt so schnell wie BiRefNet; bei sauberen Fotos fast gleich gut, bei alten/verrauschten Fotos deutlich schwächer; weicht bei zu wenig Speicher auf IS-Net aus |
| KI – Porträt/Haare | MODNet | Download |
| KI – Objekt anklicken | MobileSAM | Linksklick = Motiv (+), Rechtsklick/Alt+Klick = ausschließen (−) |
| KI – Objekt anklicken, genau | SAM 2.1 Small (Download ca. 180 MB) | wie MobileSAM, genauere Objektgrenzen; erstes Erkennen je Bild einige Sekunden, ca. 0,9 GB RAM |
| Nach Farbe | – | Hintergrund vom Bildrand aus + zusätzliche Klickpunkte, Farbtoleranz |

- **Maskenschwelle** für die KI-Methoden.
- **Maske verfeinern** (für alle Methoden, auch „Nach Farbe“ und „Objekt anklicken“):
  - *Kante verschieben* (−3…+3 mm): Plus lässt einen Rand um das Motiv stehen, Minus schneidet
    Hintergrundreste und Lichtsäume weg.
  - *Kante glätten* (0…3 mm): rundet Zacken und kleine Ausbuchtungen ab, für ruhigere Vektoren.
  - *Flecken entfernen* (0…5 % der Bildfläche): lose, fälschlich erkannte Motivteile.
  - *Löcher füllen* (0…5 % der Bildfläche): Lücken im Motiv; Hintergrund am Bildrand bleibt weg.
  - *Nur das größte Motiv behalten.*
  - Reihenfolge: Flecken → Löcher → Glätten → Kante verschieben. Die neue Kante wird leicht
    kantengeglättet. Rechnet im Verarbeitungs-Worker (2048 × 2048 px: unter 1 s mit allen Optionen);
    die Rohmaske bleibt zwischengespeichert, beim Verstellen wird nur neu verfeinert.
- **Klickpunkte** (Plus/Minus) werden immer gut sichtbar angezeigt; ein Klick auf einen Punkt
  entfernt ihn wieder.
- **Vorschau:** Der entfernte Hintergrund wird rot schraffiert mit Schnittlinie markiert, das
  Original bleibt sichtbar. Optional ausblenden (Schachbrett). Reine Anzeige – ohne Einfluss
  auf das Ergebnis.

## Altes Foto restaurieren

Eigene Checkbox; die Optionen klappen erst auf, wenn sie aktiv ist. Läuft vor allen anderen
Schritten (Arbeitsgröße je nach Rechner 1024–1600 px) oder mit **Reihenfolge „Nach dem
Freistellen“** erst danach: Dann wird aus dem unbearbeiteten Original freigestellt und nur
Gesichter und Kratzer im Motiv werden bearbeitet.

- **Rauschen & Körnung entfernen** (SCUNet).
- **Kratzer & Staub entfernen:** klassische Erkennung dünner Linien und Flecken, Auffüllen per
  KI (LaMa). Augen mit Brauen, Nase und Mund bleiben geschützt. Regler „Empfindlichkeit“.
- **Gesichter restaurieren** (RestoreFormer++): Gesicht über 5 Gesichtspunkte (YuNet)
  ausgerichtet, restauriert und mit den Tonwerten des Originals zurückgesetzt. Regler „Stärke“.
- Die Originalansicht zeigt das restaurierte Bild; darunter steht, was gemacht wurde.

## KI-Verbesserung

- **KI-Vergrößerung 4×** (Real-ESRGAN) für kleine oder unscharfe Bilder – kachelweise.

## Gesichter

- **Gesichtszüge hervorheben:** Gesichtserkennung (UltraFace), dann lokaler Kontrast für Augen,
  Brauen und Gesamtgesicht. Im Modus Linien wird jedes Gesicht zusätzlich in hoher Auflösung
  nachgezeichnet.
- **Reihenfolge:** vor dem Freistellen (ganzes Bild) oder danach (nur Gesichter im Motiv).
- Eigene Regler für **Mund, Nase, Kinn und Wangen** (0 = aus). Auf glatter Haut werden Poren
  und Sommersprossen nicht mitverstärkt.

## Schrift & Logos

- **Schrift erkennen und sauber darstellen** (PaddleOCR-Textdetektor): Schriftzüge werden scharf
  und gefüllt dargestellt statt gerastert oder nachgezeichnet; der Hintergrund behält seine
  Darstellung.
- **Logos einbeziehen:** Grafikelemente, die an die Schrift grenzen (z. B. ein Logo-Symbol),
  werden schrittweise mit übernommen.
- **Schriftstärke** (fetter/feiner). Erkannte Bereiche werden im Original blau markiert.
- **Erkennung** vor dem Freistellen (ganzes Bild) oder danach (Schrift im Hintergrund wird ignoriert).

## Konturen

- **Motivkontur:** dünne Linie innen entlang der Grenze zwischen Motiv und Hintergrund – dort,
  wo beide ineinander verschwimmen (z. B. helle Haut vor hellem Hintergrund). Linienstärke in mm.
- **Umrisslinie (Randkontur):** Kontur um das ganze Motiv mit Abstand in mm, „Lücken
  schließen“, optional nur die Umrisslinie ohne Gravur.
  - im SVG als **rote Linie** (eigene Ebene in LightBurn, z. B. zum Ausschneiden)
  - in PNG/JPG/BMP als **schwarze Linie** – mit gleicher Größe und Lage wie das SVG

## Presets

- **29 Vorlagen**, gegliedert nach Eingangsbild: Logos, Schrift & Grafik · Porträts & Personen ·
  Tiere · Fotos & Landschaft · Material (Holz, Schiefer/Glas/Alu, Leder, Acryl) ·
  Schneiden & Relief. Jede Vorlage hat eine kurze Beschreibung.
- **Eigene Presets** speichern, überschreiben und löschen. Der Preset-Bereich bleibt oben immer
  sichtbar; nach Änderungen erscheint ein Hinweis.

## Export & Weitergabe

- **Exportieren** (Strg/Cmd+S): SVG (Maße in mm) und optional PNG, JPG, BMP (mit DPI; 1-Bit-BMP
  bzw. 8-Bit-Graustufen beim Relief) – alle Dateien mit gleichem Namen in einem Ordner.
- **Drag & Drop:** Ergebnisbild mit der Maus herausziehen – direkt in LightBurn, Finder oder
  Explorer. Mitgezogen werden die gewählten Exportformate.
- **Optimiertes Original herausziehen:** Mit gedrückter Strg-Taste (Mac: Cmd) das Bild im
  Originalfeld herausziehen – als PNG so, wie es in die Umwandlung geht: restauriert,
  KI-vergrößert und freigestellt (Hintergrund transparent), ohne Schraffur und Markierungen.
  Eine kleine Info unten im Originalfeld zeigt Größe und Bearbeitungsschritte.
- Für LightBurn: kein weißes Hintergrund-Rechteck im SVG, Größe wird beim Import übernommen.

## Historie

- Jede exportierte oder herausgezogene Umwandlung wird mit Original, Einstellungen, SVG, PNG
  und Vorschaubild gespeichert.
- Ein Klick öffnet sie mit allen Einstellungen wieder. Suche, SVG erneut speichern,
  Speicherordner öffnen, Eintrag duplizieren, einzelne Einträge oder alles löschen.
- **Vereinigen (⊕):** legt das gespeicherte Ergebnis eines Eintrags über das aktuelle Ergebnis,
  z. B. „Linien“ über „Foto“ desselben Bildes. Oben in der Seitenleiste erscheint dann der Bereich
  „Vereinigt mit“:
  - **Oben liegt:** Historie-Eintrag oder aktuelles Ergebnis.
  - **Überblenden:** Deckkraft der oberen Ebene – 0 % = nur die untere Ebene, 100 % = beide voll.
    Weiß ist durchsichtig, Schwarz addiert sich (Doppelklick = 100 %).
  - Zwei Vektor-Ergebnisse (Fläche/Linien) bei 0 % oder 100 % ergeben wieder einen Vektor;
    Zwischenwerte und Foto-Ergebnisse werden als Punktmuster gerastert (Bild im SVG), mit Relief
    entsteht ein Graustufenbild.
  - Ändert man Einstellungen, wird das eigene Ergebnis neu berechnet und wieder vereinigt.
    Gleiches Seitenverhältnis → deckungsgleich, sonst mittig eingepasst. Die Umrisslinie kommt
    vom aktuellen Ergebnis, die des Eintrags entfällt (außer bei „nur Umrisslinie“).
  - Beim Speichern merkt sich der Eintrag die Vereinigung (`merge` in `meta.json`); beim Öffnen
    wird sie wiederhergestellt, solange der andere Eintrag noch existiert. „Aufheben“ löst sie.

## Bedienkomfort & Leistung

- **Nicht blockierend:** Bildverarbeitung im Hintergrund-Thread, KI und Vektorisierung in
  eigenen Prozessen – die Oberfläche bleibt jederzeit bedienbar. Neue Einstellungen brechen
  veraltete Berechnungen automatisch ab.
- **Fortschritt mit Restzeit** oben in der Kopfzeile; die Schätzung lernt aus den echten
  Laufzeiten auf dem jeweiligen Rechner. Bei Downloads Restzeit aus der Datenrate.
- **Abbrechen** (Knopf im Fortschrittsfeld oder Esc): stoppt Berechnungen, KI, Vektorisierung
  und Downloads; das letzte Ergebnis bleibt erhalten.
- **Übersichtliche Seitenleiste:** Längere Erklärungen sind eingeklappt und lassen sich je Abschnitt
  über das ⓘ in der Überschrift einblenden (Zustand wird gemerkt). Statusmeldungen bleiben sichtbar.
- **KI-Modelle verwalten** (Bereich „KI-Modelle“ → „Verwalten…“): Dialog mit allen Modellen nach
  Gruppen, Größe, Lizenz und RAM-Bedarf; Modelle laden oder entfernen.
- **Zwischenspeicher:** KI-Ergebnisse werden pro Bild gemerkt – Umschalten geht sofort.
- **Festplatten-Cache** (Bereich „Leistung“ → „Einstellungen…“, abschaltbar): jedes KI-Ergebnis wird mit einem
  Fingerabdruck der Eingabe gespeichert (max. 2 GB, älteste Einträge fliegen zuerst raus).
  Ein erneut geöffnetes Bild oder ein Historie-Eintrag muss nicht neu berechnet werden, auch
  nach einem Neustart. „Cache leeren“ löscht ihn.
- **GPU-Beschleunigung** (Bereich „Leistung“ → „Einstellungen…“, Standard an außer unter Linux): Windows → DirectML, Mac mit
  Apple-Chip → CoreML. Scheitert ein Modell auf der GPU, rechnet es automatisch auf der CPU
  weiter und wird dafür dauerhaft vorgemerkt (Einschalten der GPU setzt das zurück).
  **Absturzschutz:** Stürzt der KI-Prozess während einer GPU-Berechnung ab, wird sie sofort auf
  der CPU wiederholt. Reißt ein Absturz die ganze App mit, steht das Modell noch als
  `gpuInFlight` in `prefs.json`; beim nächsten Start wird es auf die CPU verlegt und ein
  Hinweis angezeigt. Die
  Anzeige nennt, welche Modelle auf der GPU liefen. Linux: WebGPU über Vulkan, experimentell
  und standardmäßig aus (auf schwachen integrierten Grafikkarten nicht schneller als die CPU).
  Intel-Macs: nur CPU.
- **Kacheln überlappend:** Bei KI-Vergrößerung und Entrauschen wird die nächste Kachel schon
  angefragt, während die vorige ausgewertet wird.
- **Schnelle Vektorisierung:** Das Binärbild geht direkt an Potrace (kein PNG-Umweg), die
  Pfadsuche ist beschleunigt, Füllung und Umrisslinie laufen parallel in eigenen Prozessen.
  Vektorisierungs- und KI-Prozess werden beim Start vorgestartet.

## Anpassung an den Rechner

- Gesamter und **tatsächlich verfügbarer Arbeitsspeicher** wird je System ermittelt (macOS
  `vm_stat`, Linux `MemAvailable`, Windows) und angezeigt.
- **Leistungsstufe** niedrig / mittel / hoch bestimmt Arbeits- und Kachelgrößen, maximale
  Bildgröße, gleichzeitig geladene Modelle und Threads.
- Vor jeder KI-Berechnung wird der freie Speicher mit dem **gemessenen Bedarf des Modells**
  verglichen. Reicht er nicht, wird stufenweise Speicher freigemacht: zuerst alle anderen
  geladenen Modelle freigeben, dann den KI-Prozess neu starten (gibt wirklich allen Speicher
  an das System zurück). Erst wenn auch das nicht reicht, gibt es eine verständliche Meldung
  statt eines Absturzes.
- Geht beim Rechnen doch der Speicher aus oder beendet das System den KI-Prozess, wird er
  frisch gestartet und die Berechnung einmal wiederholt.
- „Freistellen – beste Qualität“ (BiRefNet, ca. 6,7 GB) weicht nur dann auf „gut & sparsam“
  (BEN2, ca. 3 GB) aus, wenn trotz aller Freigaben nicht genug Speicher frei wird; reicht auch
  das nicht, auf „präzise“ (IS-Net, ca. 0,75 GB). Ein Hinweis nennt das tatsächlich verwendete
  Modell. Die Kette steht in `SEG_FALLBACK` (src/renderer/app.js).

## KI-Modelle

| Mitgeliefert | Download bei Bedarf (geprüft per SHA-256) |
|---|---|
| U²-Net, Informative Drawings (anime), Real-ESRGAN, MobileSAM, UltraFace, YuNet, PaddleOCR-Detektor | Informative Drawings (contour, opensketch), U²-Net Portrait, TEED, MODNet, IS-Net, BiRefNet lite, BEN2 Base, SAM 2.1 Small, Depth Anything V2 Small, SCUNet, LaMa, RestoreFormer++ |

- Alle Modelle sind für kommerzielle Nutzung lizenziert (MIT, Apache-2.0, BSD-3).
- Im Bereich „KI-Modelle“: Status, Größe, Speicherbedarf; Laden und Entfernen per Klick.

## Plattformen

- Windows (Installer und portable EXE), macOS (Apple Silicon und Intel), Linux.
- Auf Rechnern ohne native KI-Laufzeit (z. B. Intel-Macs) laufen die Modelle automatisch über
  WebAssembly.

---

# Für Entwickler: direkt weitermachen

Dieser Teil erklärt, wie die App aufgebaut ist und wo man was ändert. Einstieg, Build und
Modell-Lizenzen stehen in der [README](README.md), offene und behobene Fehler in [BUGS.md](BUGS.md).

## Schnellstart

```bash
npm install
npm start                      # App starten (Electron)
PIC2LASER_SIMULATE_RAM_MB=8192 npm start   # kleineren Rechner simulieren
PIC2LASER_GPU_EP=webgpu npm start          # anderen GPU-Beschleuniger erzwingen (Test, z. B. unter Linux)
npm run dist:win | dist:mac | dist         # Installer bauen → dist/
```

Es gibt keinen Build-Schritt für den eigenen Code (kein Bundler, kein TypeScript) und keine
automatischen Tests: Änderungen werden durch Starten der App geprüft. Unter Windows/Linux ist
das Anwendungsmenü ausgeblendet (`Menu.setApplicationMenu(null)` in main.js); für DevTools dort
vorübergehend `mainWindow.webContents.openDevTools()` einfügen.

## Prozesse und Dateien

```
Main-Prozess (src/main/main.js)
 ├─ Utility-Prozess trace-worker.js   Potrace-Vektorisierung
 ├─ Utility-Prozess model-worker.js   KI-Inferenz (onnxruntime-node mit DirectML/CoreML oder CPU,
 │                                    sonst onnxruntime-web/WASM)
 ├─ models.js                         Modell-Registry, Downloads, Steuerung des KI-Prozesses
 ├─ result-cache.js                   Festplatten-Cache der KI-Ergebnisse (SHA-256 der Eingabe)
 ├─ prefs.js                          App-Vorlieben: GPU, Cache, auf der GPU gescheiterte Modelle
 ├─ resources.js                      RAM/CPU → Leistungsstufe und Grenzen
 └─ preload.js                        window.api (contextIsolation + sandbox)
Renderer (src/renderer/index.html, klassische <script>-Tags, globale Module)
 ├─ app.js            Oberfläche, Zustand, Ablauf eines Durchlaufs, Export, Historie
 ├─ processing.js     Bildverarbeitung (Anpassungen, Schwellwert, Dithering, Kanten, Umriss)
 ├─ segmentation.js   Masken, Freistellen nach Farbe, Klickpunkte
 ├─ ai.js             Vor-/Nachbereitung aller KI-Modelle, ruft window.api.models.run
 ├─ restore.js        Altes Foto restaurieren
 ├─ encoders.js       SVG/PNG/JPG/BMP mit mm/DPI
 └─ pipeline-worker.js  Web Worker: führt processing/encoders/segmentation im Hintergrund aus
```

Die Renderer-Module sind IIFEs, die ein globales Objekt anlegen (`Processing`, `AI`,
`Segmentation`, `Restore`, `Encoders`). `processing.js`, `encoders.js` und `segmentation.js`
werden sowohl im Fenster als auch im Web Worker geladen (`importScripts`) – dort also kein DOM
verwenden, nur `OffscreenCanvas`. Die Content-Security-Policy erlaubt nur lokale Skripte.

## Ablauf eines Durchlaufs (`runProcess` in app.js)

Jede Einstellungsänderung ruft `setSetting` → `scheduleProcess` (120 ms entprellt) → `runProcess`.

1. `state.generation` wird erhöht; jeder Schritt prüft danach `stale()` und bricht ab, wenn
   inzwischen ein neuerer Durchlauf begonnen hat.
2. `refreshSystem` + `applyLimits`: Grenzen der Leistungsstufe anwenden.
3. `planSteps` plant die Schritte mit geschätzter Dauer für Fortschritt und Restzeit (`Run`, `Timing`).
4. `workingBitmap`: Restaurieren (`restore.js`) und KI-Vergrößerung.
5. Texterkennung → Freistellen (`ensureMask`) → Originalansicht → Gesichtserkennung.
6. `contentSource`: je nach Modus KI-Strichzeichnung, Tiefenkarte oder das Bild selbst.
7. `Pipeline.render` im Web Worker: Rasterergebnis, PNG für Potrace, Silhouette für die Umrisslinie.
8. `window.api.trace` (Potrace im Utility-Prozess) für Fläche/Linien und die Umrisslinie.
9. `Encoders.svgDocument` baut das SVG; das Ergebnis landet in `state.baseResult`.
10. `composeMerged`: ist ein Historie-Eintrag zum Vereinigen gewählt (`state.merge`), legt der
    Web Worker (`merge` in pipeline-worker.js) beide Ebenen übereinander, ggf. folgt Potrace.
    Das angezeigte Ergebnis steht in `state.result`; Vorschau und Statuszeile werden
    aktualisiert, Drag-Dateien vorbereitet (`scheduleDragPrepare`). Reihenfolge und Deckkraft
    rufen nur `scheduleMerge` → `composeMerged` auf, ohne neue Umwandlung.

KI-Zwischenergebnisse liegen pro Bild in `state.cache` (Promise je Schlüssel, siehe `KEYS` und
`cached()`); sie werden beim Laden eines neuen Bildes geleert. Abbrüche werden als Fehler mit
der Meldung `cancelled` weitergereicht und von `isCancelled()` still ignoriert.

**Abbrechen** (`cancelAll`): erhöht `state.generation`, beendet den Web Worker
(`Pipeline.cancel`) und ruft `window.api.cancelAll` → Main bricht Vektorisierung,
laufende KI-Jobs (nur wenn der Prozess rechnet) und Downloads ab.

## Zustand und Einstellungen

- `DEFAULTS` (Anfang von app.js) enthält alle Einstellungen mit Standardwerten. Sie werden in
  `localStorage` (`pic2laser.settings`) gespeichert, UI-Zustand unter `pic2laser.ui`.
- Bedienelemente in `index.html` mit `data-key="<einstellung>"` werden von `bindControls`
  automatisch angebunden (Checkbox → bool, Range/Number → Zahl, sonst Text).
  Anzeige-Formatierung der Regler in `FORMATTERS`.
- `state` hält Bild, Ergebnis, Cache, Modelle, Systemprofil, Presets und Historie.
- Klickpunkte (`bgSeeds`, `samPoints`) gehören zum Bild, nicht zum Preset (`PER_IMAGE_KEYS`).

## Daten auf der Platte (`<userData>`)

| Pfad | Inhalt |
|---|---|
| `presets.json` | eigene Presets |
| `history/<uuid>/` | `meta.json` (inkl. `merge`), `original.<ext>`, `result.svg`, `result.png`, `thumb.png` |
| `models/` | heruntergeladene Modelle (`.part` während des Downloads) |
| `ai-cache/` | Festplatten-Cache der KI-Ergebnisse (`<sha256>.bin`) |
| `prefs.json` | GPU an/aus, Cache an/aus, Modelle, die nur auf der CPU laufen |
| `<temp>/pic2laser-drag/` | vorbereitete Dateien für Drag & Drop |

## Typische Erweiterungen

**Neue Einstellung**
1. Standardwert in `DEFAULTS` (app.js).
2. Bedienelement mit `data-key` in `index.html`, ggf. Formatierung in `FORMATTERS`.
3. Auswerten in `processing.js` (Worker) oder im passenden Schritt von `runProcess`.
4. Ändert sie ein KI-Ergebnis, muss sie in den Cache-Schlüssel (`KEYS`) und in `planSteps`.

**Neues Preset:** Eintrag in `BUILTIN_PRESETS` (app.js) mit `group`, `name`, `desc` und
`settings` (nur die vom Standard abweichenden Werte).

**Neues KI-Modell**
1. Eintrag in `MODELS` (src/main/models.js): `label`, `file`, `license`; für Downloads zusätzlich
   `url` (auf einen festen Commit gepinnt), `size`, `sha256`, ggf. `extra` für externe Gewichte.
   Mitgelieferte Modelle liegen in `models/`.
2. Vor-/Nachbereitung als Funktion in `ai.js`, Aufruf über `AI.run(id, feeds, outputs)`.
3. Im Ablauf (`runProcess`/`planSteps`) mit eigenem Cache-Schlüssel einbinden.
4. Lizenz muss kommerzielle Nutzung erlauben; README-Tabelle ergänzen.

**Neuer IPC-Aufruf:** `ipcMain.handle` in main.js bzw. `register()` in models.js, dazu eine
Funktion in `preload.js` unter `window.api`.

## Konventionen

- Oberfläche, Kommentare und Commit-Meldungen auf Deutsch.
- Schwere Arbeit nie im Main- oder Fenster-Thread: Bildverarbeitung in den Web Worker,
  KI und Potrace in die Utility-Prozesse.
- Maße intern in Pixeln, ausgegeben in mm; SVG mit `width/height` in mm, Rasterbilder mit DPI.
- Bit-Konvention der Schwarz-Weiß-Ergebnisse: 1 = schwarz (wird gelasert).
- Version in `package.json` hochzählen und im Commit nennen („Version 1.1.3: …“); README,
  FUNCTION.md und BUGS.md mitpflegen.
