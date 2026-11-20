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
- **Live-Vorschau** Original/Ergebnis nebeneinander, Zoom (Strg+Mausrad), synchrones Scrollen
- **Presets**: mitgelieferte Vorlagen (Logo, Foto, Porträt-Strichzeichnung, Sticker mit Schnittkontur,
  Holz-Relief …) und eigene Presets speichern/überschreiben/löschen (`<userData>/presets.json`)
- **Vier Modi**
  - *Fläche*: Schwellwert + Potrace → echte Vektorpfade (Logos, Schrift, Silhouetten)
  - *Linien*: KI-Strichzeichnung oder klassische Kantenerkennung (Canny) → Strichzeichnung als Vektor
  - *Foto*: Dithering mit Floyd-Steinberg, Atkinson, Jarvis, Stucki, Bayer, Schwellwert
  - *Relief*: KI-Tiefenkarte als Graustufenbild für 3D-Reliefgravur
- **Freistellen**: KI schnell / präzise / beste Qualität / Porträt, Objekt per Klick auswählen (MobileSAM)
  oder nach Farbe (Hintergrund vom Rand + Klickpunkte)
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
- **Export** als SVG, PNG, JPG und/oder 1-Bit-BMP (Strg+S)
- **Historie**: Jede exportierte Umwandlung wird mit Original, Einstellungen, SVG und PNG gespeichert
  (`<userData>/history`). Ein Klick öffnet sie wieder mit allen Einstellungen.

## KI-Modelle

Alle Modelle laufen lokal und offline über onnxruntime (nativ, mit WebAssembly-Fallback).

| Modell | Zweck | Lizenz | Herkunft |
|---|---|---|---|
| U²-Net (u2netp) | Freistellen – schnell | Apache-2.0 | mitgeliefert |
| Informative Drawings | KI-Strichzeichnung | MIT | mitgeliefert |
| Real-ESRGAN general x4v3 | KI-Vergrößerung | BSD-3-Clause | mitgeliefert (aus den offiziellen Gewichten nach ONNX konvertiert) |
| MobileSAM | Objekt anklicken | Apache-2.0 | mitgeliefert |
| PaddleOCR PP-OCRv4 (Detektor, via RapidOCR) | Texterkennung („Schrift & Logos“) | Apache-2.0 | mitgeliefert |
| UltraFace RFB-320 | Gesichtserkennung („Gesichtszüge hervorheben“) | MIT | mitgeliefert (ungenutzte Graph-Eingänge entfernt) |
| MODNet | Freistellen – Porträt | Apache-2.0 | Download bei Bedarf (26 MB) |
| IS-Net | Freistellen – präzise | Apache-2.0 | Download bei Bedarf (179 MB) |
| BiRefNet lite | Freistellen – beste Qualität | MIT | Download bei Bedarf (224 MB) |
| Depth Anything V2 Small | Tiefenkarte (Relief) | Apache-2.0 | Download bei Bedarf (99 MB) |

Downloads sind auf feste Versionen gepinnt und werden per SHA-256 geprüft; sie landen in
`<userData>/models` und lassen sich in der App wieder entfernen.

## Aufbau

- `src/main/main.js` – Fenster, Potrace-Vektorisierung, Dateidialoge, Historie, Presets
- `src/main/models.js` – KI-Modelle: Registry, Download mit Prüfsumme, Inferenz
- `src/main/preload.js` – sichere IPC-Brücke (`window.api`)
- `src/renderer/processing.js` – Bildverarbeitung (Anpassungen, Schwellwert, Dithering, Kanten, Umriss)
- `src/renderer/ai.js` – Vor-/Nachverarbeitung für alle KI-Modelle
- `src/renderer/segmentation.js` – Freistellen (Masken, Farbmaske, Klickpunkte)
- `src/renderer/encoders.js` – SVG-, PNG-, JPG- und BMP-Ausgabe mit DPI-Angaben
- `src/renderer/app.js` – Oberfläche, Vorschau, Export, Historie
