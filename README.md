# Pic2Laser

Electron-App, die Bilder in Schwarz-Weiß-SVGs (und optional PNG/JPG/BMP) für die Lasergravur mit LightBurn umwandelt.

## Starten

```bash
npm install
npm start
```

Falls npm das Installationsskript von Electron blockiert (`install-scripts`-Warnung):
`npm install-scripts approve electron` und danach erneut `npm install` ausführen.

Installer bauen (Windows/macOS/Linux): `npm run dist`

Windows-EXE (Installer + portable Version) bauen: `npm run dist:win` → `dist/`.
Unter Linux wird dafür Wine benötigt (`sudo apt install wine wine64`).

macOS-Apps (Apple Silicon + Intel) bauen: `npm run dist:mac` → `dist/*.zip`.
Unter Linux danach ad-hoc signieren: `build/sign-mac-adhoc.sh` (benötigt `rcodesign` und `zip`),
sonst meldet macOS „App ist beschädigt“. Ein DMG lässt sich nur auf einem Mac bauen.
Auf Intel-Macs (und überall, wo onnxruntime-node fehlt) läuft das KI-Freistellen über
onnxruntime-web (WebAssembly) – etwas langsamer, aber ohne native Abhängigkeiten.

## Funktionen

- **Drag & Drop**, Datei-Dialog (Strg+O) oder Einfügen aus der Zwischenablage (Strg+V)
- **Live-Vorschau** Original/Ergebnis nebeneinander, synchrones Scrollen.
  Mausrad bzw. Strg+Mausrad/Pinch zoomt auf die Mausposition, Verschieben durch Ziehen
  (im Ergebnis mit der mittleren Maustaste)
- **Presets**: mitgelieferte Vorlagen (Logo, Foto, Porträt-Strichzeichnung, Sticker mit Schnittkontur,
  Holz-Relief …) und eigene Presets speichern/überschreiben/löschen (`<userData>/presets.json`)
- **Vier Modi**
  - *Fläche*: Schwellwert + Potrace → echte Vektorpfade (Logos, Schrift, Silhouetten)
  - *Linien*: KI-Strichzeichnung oder klassische Kantenerkennung (Canny) → Strichzeichnung als Vektor
  - *Foto*: Dithering mit Floyd-Steinberg, Atkinson, Jarvis, Stucki, Bayer, Schwellwert
  - *Relief*: KI-Tiefenkarte als Graustufenbild für 3D-Reliefgravur
- **Freistellen**: KI schnell / präzise / beste Qualität / Porträt, Objekt per Klick auswählen (MobileSAM)
  oder nach Farbe (Hintergrund vom Rand + Klickpunkte). Bei MobileSAM schließen Rechtsklick oder Alt+Klick
  Bereiche aus; ein Klick auf einen vorhandenen Punkt entfernt ihn. Entfernter Hintergrund wird in der
  Vorschau rot schraffiert oder wahlweise ausgeblendet.
- **Altes Foto restaurieren**: Rauschen/Körnung entfernen, Kratzer & Staub finden und per KI auffüllen
  (Augen, Nase und Mund geschützt), Gesichter per KI restaurieren (ausgerichtet über 5 Gesichtspunkte,
  Tonwerte vom Original)
- **KI-Vergrößerung 4×** für kleine oder unscharfe Bilder
- **Gesichtszüge hervorheben**: erkennt Gesichter und betont Augen, Brauen, Nase und Mund
  (Linien: Gesicht zusätzlich hochaufgelöst nachgezeichnet; Fläche/Foto: lokaler Kontrast)
- **Motivkontur**: dünne Linie dort, wo Motiv und Hintergrund ineinander verschwimmen
- **Schrift & Logos**: erkennt Schriftzüge und angrenzende Logo-Elemente und stellt sie scharf und gefüllt dar,
  statt sie zu rastern oder nachzuzeichnen (Bereiche werden im Original blau markiert)
- **Umrisslinie**: Randkontur um das Motiv mit Abstand in mm (rote Linie → eigene LightBurn-Ebene,
  z. B. zum Ausschneiden), optional nur die Umrisslinie ohne Gravur
- **Einstellungen**: Helligkeit, Kontrast, Gamma, Weichzeichnen, Schärfen, Invertieren,
  Schwellwert (inkl. Auto/Otsu), Fleckenfilter, Ecken glätten, Kurventoleranz, Auflösung/DPI.
  Doppelklick auf einen Regler setzt ihn zurück.
- **Ausgabegröße in mm**: SVGs enthalten `width/height` in mm, Rasterbilder die DPI –
  LightBurn importiert alles direkt in der richtigen Größe.
- **Export** als SVG, PNG, JPG und/oder 1-Bit-BMP (Strg+S oder Strg+E)
- **Herausziehen**: Das Ergebnis lässt sich per Drag & Drop direkt in LightBurn, Explorer oder Finder ziehen
  (in den gewählten Exportformaten). Eine Info im Ergebnisfeld zeigt Formate, Größe in mm und DPI.
- **Abbrechen**: Knopf neben dem Fortschrittsbalken oder Esc stoppt laufende Berechnungen,
  KI-Prozess, Vektorisierung und Modell-Downloads; das letzte fertige Ergebnis bleibt stehen.
- **Historie**: Jede exportierte Umwandlung wird mit Original, Einstellungen, SVG und PNG gespeichert
  (`<userData>/history`); zusätzlich über „In Historie speichern“ ohne Export. Ein Klick öffnet sie wieder
  mit allen Einstellungen, die Liste ist durchsuchbar.

## Tastenkürzel

| Kürzel | Aktion |
|---|---|
| Strg/⌘+O | Bild öffnen |
| Strg/⌘+V | Bild aus der Zwischenablage einfügen |
| Strg/⌘+S, Strg/⌘+E | Exportieren |
| Esc | Laufende Berechnung abbrechen |
| Doppelklick auf Regler | Regler zurücksetzen |

## Speicher & Leistung

Beim Start wird der Arbeitsspeicher ermittelt und eine Leistungsstufe gewählt
(`src/main/resources.js`). Sie begrenzt u. a. gleichzeitig geladene Modelle, Arbeitsgröße
beim Restaurieren, Kachelgröße fürs Entrauschen, Eingangsgröße der KI-Vergrößerung und Threads:

| Stufe | Gesamt-RAM | Modell-Budget | max. Arbeitsbild | Threads |
|---|---|---|---|---|
| niedrig | < 7 GB | 600 MB | 16 MP | 2 |
| mittel | < 14 GB | 1500 MB | 36 MP | 4 |
| hoch | ab 14 GB | 3000 MB | 50 MP | alle Kerne |

Zum Testen lässt sich ein kleinerer Rechner simulieren:
`PIC2LASER_SIMULATE_RAM_MB=8192 npm start`

## KI-Modelle

Alle Modelle laufen lokal und offline über onnxruntime (nativ, mit WebAssembly-Fallback).

| Modell | Zweck | Lizenz | Herkunft |
|---|---|---|---|
| U²-Net (u2netp) | Freistellen – schnell | Apache-2.0 | mitgeliefert |
| Informative Drawings | KI-Strichzeichnung | MIT | mitgeliefert |
| Real-ESRGAN general x4v3 | KI-Vergrößerung | BSD-3-Clause | mitgeliefert (aus den offiziellen Gewichten nach ONNX konvertiert) |
| MobileSAM | Objekt anklicken | Apache-2.0 | mitgeliefert |
| YuNet (OpenCV Zoo) | Gesichtspunkte für die Gesichtsrestaurierung | MIT | mitgeliefert |
| SCUNet (color real PSNR, ONNX von Heliosoph) | Rauschen & Körnung entfernen | Apache-2.0 | Download bei Bedarf (77 MB); identisch mit eigener Konvertierung der offiziellen Gewichte |
| LaMa (ONNX von Carve) | Kratzer & Staub auffüllen | Apache-2.0 | Download bei Bedarf (208 MB) |
| RestoreFormer++ (FP16-Gewichte, Saimon8420) | Gesichter restaurieren | Apache-2.0 | Download bei Bedarf (148 MB); ≙ eigener Konvertierung der offiziellen Gewichte |
| PaddleOCR PP-OCRv4 (Detektor, via RapidOCR) | Texterkennung („Schrift & Logos“) | Apache-2.0 | mitgeliefert |
| UltraFace RFB-320 | Gesichtserkennung („Gesichtszüge hervorheben“) | MIT | mitgeliefert (ungenutzte Graph-Eingänge entfernt) |
| MODNet | Freistellen – Porträt | Apache-2.0 | Download bei Bedarf (26 MB) |
| IS-Net | Freistellen – präzise | Apache-2.0 | Download bei Bedarf (179 MB) |
| BiRefNet lite | Freistellen – beste Qualität | MIT | Download bei Bedarf (224 MB) |
| Depth Anything V2 Small | Tiefenkarte (Relief) | Apache-2.0 | Download bei Bedarf (99 MB) |

Downloads sind auf feste Versionen gepinnt und werden per SHA-256 geprüft; sie landen in
`<userData>/models` und lassen sich in der App wieder entfernen.

## Aufbau

- `src/main/main.js` – Fenster, Steuerung der Vektorisierung, Dateidialoge, Drag & Drop, Historie, Presets, Abbrechen
- `src/main/trace-worker.js` – Potrace-Vektorisierung als Utility-Prozess (blockiert das Fenster nicht)
- `src/main/models.js` – KI-Modelle: Registry, Download mit Prüfsumme (abbrechbar), Steuerung des KI-Prozesses
- `src/main/model-worker.js` – KI-Inferenz als Utility-Prozess (onnxruntime-node, Fallback onnxruntime-web)
- `src/main/resources.js` – Arbeitsspeicher/CPU ermitteln, Leistungsstufen und Grenzen
- `src/main/preload.js` – sichere IPC-Brücke (`window.api`)
- `src/renderer/pipeline-worker.js` – Web Worker für die rechenintensive Bildverarbeitung
- `src/renderer/processing.js` – Bildverarbeitung (Anpassungen, Schwellwert, Dithering, Kanten, Umriss)
- `src/renderer/ai.js` – Vor-/Nachverarbeitung für alle KI-Modelle
- `src/renderer/segmentation.js` – Freistellen (Masken, Farbmaske, Klickpunkte)
- `src/renderer/restore.js` – Altes Foto restaurieren (Entrauschen, Kratzer, Gesichter)
- `src/renderer/encoders.js` – SVG-, PNG-, JPG- und BMP-Ausgabe mit DPI-Angaben
- `src/renderer/app.js` – Oberfläche, Presets, Vorschau, Zoom, Export, Historie
- `src/renderer/index.html`, `styles.css` – Oberfläche
- `models/` – mitgelieferte ONNX-Modelle
- `build/` – Icon, macOS-Intel-Konfiguration, Ad-hoc-Signierskript
