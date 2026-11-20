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
- **Drei Modi**
  - *Fläche*: Schwellwert + Potrace → echte Vektorpfade (Logos, Schrift, Silhouetten)
  - *Linien*: Kanten/Randkonturen nachzeichnen (Canny) → Strichzeichnung als Vektor, Linienstärke in mm
  - *Foto*: Dithering mit Floyd-Steinberg, Atkinson, Jarvis, Stucki, Bayer, Schwellwert
- **Freistellen**
  - *KI (Auto)*: U²-Net (`models/u2netp.onnx`, Apache-2.0) läuft lokal und offline über onnxruntime
  - *Nach Farbe*: Hintergrund vom Bildrand aus entfernen, weitere Bereiche per Klick ins Original
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

## Aufbau

- `src/main/main.js` – Fenster, Potrace-Vektorisierung, KI-Freistellen, Dateidialoge, Historie
- `src/main/preload.js` – sichere IPC-Brücke (`window.api`)
- `src/renderer/processing.js` – Bildverarbeitung (Anpassungen, Schwellwert, Dithering, Kanten, Umriss)
- `src/renderer/segmentation.js` – Freistellen (KI-Maske, Farbmaske)
- `src/renderer/encoders.js` – SVG-, PNG-, JPG- und BMP-Ausgabe mit DPI-Angaben
- `src/renderer/app.js` – Oberfläche, Vorschau, Export, Historie
