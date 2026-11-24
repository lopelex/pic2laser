# Pic2Laser

Electron-App, die Bilder in Schwarz-Weiß-SVGs (und optional PNG/JPG/BMP) für die Lasergravur mit LightBurn umwandelt.

Aktuelle Version: **1.19.0**. Bedienung Schritt für Schritt (Lasern und Sticken): [HANDBUCH.md](HANDBUCH.md). Ausführliche Beschreibung aller Funktionen: [FUNCTION.md](FUNCTION.md),
bekannte und behobene Fehler: [BUGS.md](BUGS.md).

## Starten

```bash
npm install
npm start
```

Falls npm das Installationsskript von Electron blockiert (`install-scripts`-Warnung):
`npm install-scripts approve electron` und danach erneut `npm install` ausführen.

**Alle Plattformen bauen:** `npm run dist:all` → `dist/` (Windows-Installer + portabel, macOS Apple Silicon + Intel
ad-hoc signiert, Linux-AppImage).

**Release veröffentlichen:** `npm run release` – lädt die GitHub-Release `vX.Y.Z` (Version aus `package.json`,
Notizen aus dem Abschnitt in `RELEASENOTES.md`) mit **allen** Plattformen hoch und bricht ab, wenn eine Datei
fehlt oder die Mac-ZIPs nicht signiert neu gepackt sind. Gibt es die Release schon, werden nur die Dateien
(nach)geladen. Die App sucht ihre Updates in der neuesten Release (nicht als Vorabversion markiert) und erkennt
die Dateien an ihren Namen (`Pic2Laser-Setup-…exe`, `Pic2Laser-Portable-…exe`, `Pic2Laser-…-mac-arm64.zip`/`-mac-x64.zip`,
`Pic2Laser-…-linux-x64.AppImage`) – fehlt die Datei für ein System, öffnet das Update dort nur die Download-Seite.

Windows-EXE (Installer + portable Version) bauen: `npm run dist:win` → `dist/`.
Unter Linux wird dafür Wine benötigt (`sudo apt install wine wine64`).

macOS-Apps (Apple Silicon + Intel) bauen: `npm run dist:mac` → `dist/*.zip`.
Unter Linux danach ad-hoc signieren: `build/sign-mac-adhoc.sh` (benötigt `rcodesign` und `zip`),
sonst meldet macOS „App ist beschädigt“. Ein DMG lässt sich nur auf einem Mac bauen.
Auf Intel-Macs (und überall, wo onnxruntime-node fehlt) läuft das KI-Freistellen über
onnxruntime-web (WebAssembly) – etwas langsamer, aber ohne native Abhängigkeiten.

Linux-AppImage bauen: `npm run dist:linux` → `dist/Pic2Laser-…-linux-x64.AppImage`.

## Funktionen

- **Drag & Drop**, Datei-Dialog (Strg+O), Einfügen aus der Zwischenablage (Strg+V) oder Aufnahme mit der Webcam (Strg+K)
- **Live-Vorschau** Original/Ergebnis nebeneinander, synchrones Scrollen.
  Mausrad bzw. Strg+Mausrad/Pinch zoomt auf die Mausposition, Verschieben durch Ziehen
  (im Ergebnis mit der mittleren Maustaste)
- **Presets**: mitgelieferte Vorlagen (Logo, Foto, Porträt-Strichzeichnung, Sticker mit Schnittkontur,
  Holz-Relief, Stickerei auf T-Shirt, Polo, Fleece, Handtuch, Jeans und Leder …) und eigene Presets speichern/überschreiben/löschen (`<userData>/presets.json`)
- **Sechs Modi**
  - *Fläche*: Schwellwert + Potrace → echte Vektorpfade (Logos, Schrift, Silhouetten)
  - *Linien*: KI-Strichzeichnung (Modelle: Feine Linien, Kräftige Konturen, Zarte Skizze, Tusche-Porträt,
    Feine Kanten) oder klassische Kantenerkennung (Canny) → Strichzeichnung als Vektor
  - *Foto*: Dithering mit Floyd-Steinberg, Atkinson, Jarvis, Stucki, Bayer, Schwellwert
  - *Wellen*: Sinuswellen-Schattierung (nach [img2laser](https://github.com/0not/img2laser)) – dunkle Stellen als
    dichte Wellen, als offene Vektorlinien; waagrecht oder senkrecht, weiße Flächen optional ausgespart.
    Gerechnet in WebAssembly (Rust, `wasm/sine`)
  - *Farben*: Bild in wenige Farbflächen zerlegt (Auto oder 2–16 Farben, Bildfarben oder Brother-Garne),
    je Farbe eine SVG-Ebene – für mehrfarbige Gravur und als Vorlage für Stickprogramme (Ink/Stitch, Hatch …);
    Farben ausblenden, umfärben, zusammenführen
  - *Relief*: KI-Tiefenkarte (Depth Anything V2 Small, wahlweise Base/Large) als Graustufenbild für 3D-Reliefgravur, optional mit transparentem
    weißem/freigestelltem Hintergrund (PNG/SVG)
- **Freistellen**: Motiv automatisch per KI (schnell / präzise / gut & sparsam / beste Qualität / Porträt & Haare),
  Objekt anklicken (schnell mit MobileSAM, genau mit SAM 2.1), Himmel entfernen (schnell ohne KI oder mit
  KI-geschütztem Motiv per BEN2) oder nach Farbe (Hintergrund vom Rand + Klickpunkte). Beim Objekt-Anklicken schließen Rechtsklick oder Alt+Klick
  Bereiche aus; ein Klick auf einen vorhandenen Punkt entfernt ihn. Entfernter Hintergrund wird in der
  Vorschau rot schraffiert oder wahlweise ausgeblendet.
- **Altes Foto restaurieren**: Rauschen/Körnung entfernen, Kratzer & Staub finden und per KI auffüllen
  (Augen, Nase und Mund geschützt – geschätzt oder genau per Face Parsing), Gesichter per KI restaurieren
  (RestoreFormer++ oder CodeFormer mit Regler „Treue zum Original“; ausgerichtet über 5 Gesichtspunkte,
  Tonwerte vom Original)
- **KI-Vergrößerung 4×** für kleine oder unscharfe Bilder
- **Gesichtszüge hervorheben**: erkennt Gesichter und betont Augen, Brauen, Nase und Mund
  (Linien: Gesicht zusätzlich hochaufgelöst nachgezeichnet; Fläche/Foto/Wellen: lokaler Kontrast; Farben: auf der Helligkeit).
  Mund, Nase, Kinn und Wangen werden aus dem Gesichtsrahmen geschätzt oder genau per Face Parsing gefunden
- **Motivkontur**: dünne Linie dort, wo Motiv und Hintergrund ineinander verschwimmen (auch in Wellen und Farben – dort als eigene schwarze Ebene)
- **Schrift & Logos**: erkennt Schriftzüge und angrenzende Logo-Elemente und stellt sie scharf und gefüllt dar,
  statt sie zu rastern oder nachzuzeichnen (Bereiche werden im Original blau markiert)
- **Umrisslinie**: Randkontur um das Motiv mit Abstand in mm (rote Linie → eigene LightBurn-Ebene,
  z. B. zum Ausschneiden), optional nur die Umrisslinie ohne Gravur. In PNG/JPG/BMP, Historien-Vorschau
  und Drag-Symbol erscheint sie schwarz, in gleicher Größe und Lage wie im SVG.
- **Formen verbessern**: *Formen begradigen* (exakte Geraden, Kreise, Ellipsen und rechte Winkel für Logos
  und Schilder, Toleranz in mm), *Glatte Konturen (KI)* im Modus Fläche (KI-Vergrößerung + Glätten der
  Treppenstufen) und *Ruhige Linien* im Modus Linien (Mittellinie geglättet, gleichmäßige Strichbreite,
  ohne Krümel und kurze Ausläufer)
- **Einstellungen**: Helligkeit, Kontrast, Gamma, Weichzeichnen, Schärfen, Invertieren,
  Schwellwert (inkl. Auto/Otsu), Fleckenfilter, Ecken glätten, Kurventoleranz, Auflösung/DPI.
  Doppelklick auf einen Regler setzt ihn zurück.
- **Ausgabegröße in mm**: SVGs enthalten `width/height` in mm, Rasterbilder die DPI –
  LightBurn importiert alles direkt in der richtigen Größe.
- **Export** als SVG, PNG, JPG und/oder 1-Bit-BMP (Strg+E)
- **Stickdateien** PES (Brother), DST (Tajima) und EXP (Melco, z. B. für Melco DesignShop, mit INF-Datei für die Farben) direkt für die Stickmaschine: Flächen als Füllstich mit
  Unterlage und Zugausgleich, Umrisslinie als Steppstich, Wege innerhalb der Flächen statt Fadenschnitten;
  Stickparameter je Farbe automatisch aus Stoff und Form (Winkel, Unterlage, schmale Stellen als Kontur),
  im Dialog „Je Farbe einstellen…“ mit Stichvorschau von Hand anpassbar; Stichzahl und passender Stickrahmen
- **Herausziehen**: Das Ergebnis lässt sich per Drag & Drop direkt in LightBurn, Explorer oder Finder ziehen
  (in den gewählten Exportformaten). Eine Info im Ergebnisfeld zeigt Formate, Größe in mm und DPI.
- **An LightBurn senden** (Strg/⌘+L): fügt das Ergebnis direkt ins offene LightBurn-Projekt ein
  (über die UDP-Schnittstelle von LightBurn, in den gewählten Exportformaten) – ohne Export und Herausziehen.
- **Abbrechen**: Knopf neben dem Fortschrittsbalken oder Esc stoppt laufende Berechnungen,
  KI-Prozess, Vektorisierung und Modell-Downloads; das letzte fertige Ergebnis bleibt stehen.
- **Historie**: Jede exportierte Umwandlung wird mit Original, Einstellungen, SVG und PNG gespeichert
  (`<userData>/history`); zusätzlich über „In Historie speichern“ ohne Export. Ein Klick öffnet sie wieder
  mit allen Einstellungen, die Liste ist durchsuchbar.
- **Updates**: Beim Start und danach alle 24 Stunden fragt Pic2Laser bei den GitHub-Releases nach einer
  neuen Version. Gibt es eine, erscheinen ein Hinweis und „Update x.y.z“ in der Kopfzeile; der Dialog zeigt die
  Neuerungen. Nach einem Klick auf „Aktualisieren“ lädt Pic2Laser die neue Version selbst (Prüfsumme geprüft)
  und installiert sie – sofort per „Jetzt neu starten“ oder beim nächsten Beenden. Das klappt für den
  Windows-Installer (still, ggf. mit Administrator-Abfrage), die portable EXE, macOS und Linux-AppImage.
  Ein Klick auf die Versionsnummer sucht sofort nach Updates.
- **Vereinigen**: ⊕ an einem Historie-Eintrag legt dessen Ergebnis über das aktuelle (z. B. Linien über
  ein Foto). Reihenfolge wählbar, Regler „Überblenden“ für die Deckkraft der oberen Ebene.

## Tastenkürzel

| Kürzel | Aktion |
|---|---|
| Strg/⌘+O | Bild öffnen |
| Strg/⌘+V | Bild aus der Zwischenablage einfügen |
| Strg/⌘+E | Exportieren |
| Strg/⌘+S | In Historie speichern |
| Strg/⌘+L | An LightBurn senden |
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
| U²-Net (u2netp) | Freistellen: Motiv – schnell | Apache-2.0 | mitgeliefert |
| Informative Drawings (anime) | KI-Strichzeichnung „Feine Linien“ | MIT | mitgeliefert |
| Informative Drawings (contour, opensketch; fp16, ipsilondev) | KI-Strichzeichnung „Kräftige Konturen“, „Zarte Skizze“ | MIT | Download bei Bedarf (je 9 MB); offizielle Gewichte, gegen PyTorch geprüft |
| U²-Net Portrait (ONNX von mlboydaisuke) | KI-Strichzeichnung „Tusche-Porträt“ | Apache-2.0 | Download bei Bedarf (176 MB) |
| TEED (ONNX von Shaboomi) | KI-Strichzeichnung „Feine Kanten“ | MIT | Download bei Bedarf (0,3 MB) |
| Real-ESRGAN general x4v3 | KI-Vergrößerung | BSD-3-Clause | mitgeliefert (aus den offiziellen Gewichten nach ONNX konvertiert) |
| MobileSAM | Objekt anklicken – schnell | Apache-2.0 | mitgeliefert |
| SAM 2.1 Hiera Small (ONNX von onnx-community) | Objekt anklicken – genau | Apache-2.0 | Download bei Bedarf (180 MB) |
| YuNet (OpenCV Zoo) | Gesichtspunkte für die Gesichtsrestaurierung | MIT | mitgeliefert |
| SCUNet (color real PSNR, ONNX von Heliosoph) | Rauschen & Körnung entfernen | Apache-2.0 | Download bei Bedarf (77 MB); identisch mit eigener Konvertierung der offiziellen Gewichte |
| LaMa (ONNX von Carve) | Kratzer & Staub auffüllen | Apache-2.0 | Download bei Bedarf (208 MB) |
| RestoreFormer++ (FP16-Gewichte, Saimon8420) | Gesichter restaurieren | Apache-2.0 | Download bei Bedarf (148 MB); ≙ eigener Konvertierung der offiziellen Gewichte |
| PaddleOCR PP-OCRv4 (Detektor, via RapidOCR) | Texterkennung („Schrift & Logos“) | Apache-2.0 | mitgeliefert |
| UltraFace RFB-320 | Gesichtserkennung („Gesichtszüge hervorheben“) | MIT | mitgeliefert (ungenutzte Graph-Eingänge entfernt) |
| MODNet | Freistellen: Motiv – Porträt & Haare | Apache-2.0 | Download bei Bedarf (26 MB) |
| IS-Net | Freistellen: Motiv – präzise | Apache-2.0 | Download bei Bedarf (179 MB) |
| BiRefNet lite | Freistellen: Motiv – beste Qualität | MIT | Download bei Bedarf (224 MB) |
| BEN2 Base (int8-Gewichte von moonbox-dev) | Freistellen: Motiv – gut & sparsam, Himmel entfernen – Motiv geschützt | MIT | Download bei Bedarf (131 MB) |
| Depth Anything V2 Small | Tiefenkarte (Relief) | Apache-2.0 | Download bei Bedarf (99 MB) |
| Depth Anything V2 Base (ONNX von onnx-community) | Tiefenkarte „fein“ (Relief) | **CC BY-NC 4.0** (nicht kommerziell) | Download bei Bedarf (389 MB) |
| Depth Anything V2 Large (ONNX von onnx-community) | Tiefenkarte „sehr fein“ (Relief) | **CC BY-NC 4.0** (nicht kommerziell) | Download bei Bedarf (1,3 GB); fp32, da fp16 auf der CPU langsamer ist und mehr Speicher braucht |
| CodeFormer (ONNX von FaceFusion) | Gesichter restaurieren, mit Regler „Treue zum Original“ | **S-Lab License 1.0** (nicht kommerziell) | Download bei Bedarf (377 MB) |
| BiSeNet Face Parsing (ResNet-34, ONNX von FaceFusion) | Gesichtsmerkmale genau finden („Gesichtszüge hervorheben“, Gesichtsschutz bei Kratzern) | **CelebAMask-HQ** (nicht kommerziell) | Download bei Bedarf (94 MB) |

Downloads sind auf feste Versionen gepinnt und werden per SHA-256 geprüft; sie landen in
`<userData>/models` und lassen sich in der App wieder entfernen.

### Lizenzen der Modelle

Pic2Laser selbst ist Open Source (GPL-2.0-or-later, siehe [Lizenz](#lizenz)). Für die Modelle gilt:

- **Mitgelieferte Modelle** (im Ordner `models/` bzw. im Installer) müssen eine freie Lizenz haben,
  die die Weitergabe erlaubt (z. B. MIT, Apache-2.0, BSD).
- **Modelle zum Download bei Bedarf** dürfen auch Lizenzen ohne kommerzielle Nutzung haben
  (z. B. CC BY-NC). Pic2Laser verbreitet diese Modelle nicht und verdient nichts an ihnen: Die App
  lädt sie erst auf Wunsch des Nutzers direkt von der Originalquelle herunter. Die Lizenz gilt dann
  im Verhältnis zwischen Nutzer und Rechteinhaber.
- Solche Modelle werden in der Tabelle oben und in der App mit ihrer Lizenz gekennzeichnet. Wer die
  Ergebnisse gewerblich nutzt (z. B. Gravuren verkauft), sollte die Lizenz des jeweiligen Modells
  prüfen bzw. auf ein Modell mit freier Lizenz ausweichen.

## Aufbau

- `src/main/main.js` – Fenster, Steuerung der Vektorisierung, Dateidialoge, Drag & Drop, Historie, Presets, Abbrechen
- `src/main/trace-worker.js` – Potrace-Vektorisierung als Utility-Prozess (blockiert das Fenster nicht)
- `src/main/models.js` – KI-Modelle: Registry, Download mit Prüfsumme (abbrechbar), Steuerung des KI-Prozesses
- `src/main/model-worker.js` – KI-Inferenz als Utility-Prozess (onnxruntime-node, Fallback onnxruntime-web)
- `src/main/resources.js` – Arbeitsspeicher/CPU ermitteln, Leistungsstufen und Grenzen
- `src/main/updater.js` – Update-Prüfung über GitHub-Releases (Start + alle 24 h), Download mit Prüfsumme, Installation je System
- `src/main/preload.js` – sichere IPC-Brücke (`window.api`)
- `src/renderer/pipeline-worker.js` – Web Worker für die rechenintensive Bildverarbeitung
- `src/renderer/processing.js` – Bildverarbeitung (Anpassungen, Schwellwert, Dithering, Kanten, Umriss)
- `src/renderer/ai.js` – Vor-/Nachverarbeitung für alle KI-Modelle
- `src/renderer/segmentation.js` – Freistellen (Masken, Farbmaske, Klickpunkte)
- `src/renderer/restore.js` – Altes Foto restaurieren (Entrauschen, Kratzer, Gesichter)
- `src/renderer/sine.js` – Modus Wellen: lädt das WebAssembly-Modul und rechnet Einstellungen in Pixel um
- `wasm/sine/` – Rust-Quelltext der Sinuswellen (→ `src/renderer/wasm/sine-wasm.js`, eingebettet als Base64)
- `src/renderer/encoders.js` – SVG-, PNG-, JPG- und BMP-Ausgabe mit DPI-Angaben
- `src/renderer/embroidery.js` – Stickdateien: Füll- und Steppstich aus den Vektorpfaden, PES-, DST- und EXP-Ausgabe
- `src/renderer/app.js` – Oberfläche, Presets, Vorschau, Zoom, Export, Historie
- `src/renderer/index.html`, `styles.css` – Oberfläche
- `models/` – mitgelieferte ONNX-Modelle
- `test/` – Tests der Stickdateien (`npm test`), Referenzdateien und Checkliste in `test/fixtures/`
- `build/` – Icon, macOS-Intel-Konfiguration, Ad-hoc-Signierskript, Release-Skript (`release.sh`), WASM-Build (`build-wasm.js`)

Das erzeugte `src/renderer/wasm/sine-wasm.js` liegt im Repository – `npm start` und Releases brauchen kein
Rust. Nach Änderungen in `wasm/sine` neu bauen mit `npm run build:wasm` (braucht `cargo` und das Ziel
`wasm32-unknown-unknown`, z. B. `rustup target add wasm32-unknown-unknown`).

## Tests

`npm test` prüft die Stickdateien PES, DST und EXP an drei Prüfmotiven: Die Dateien werden mit eigenen,
vom Schreiber unabhängigen Lesern zurückgelesen und mit den geplanten Stichen verglichen. Geprüft werden
auch die Dateiköpfe, die Grenzwerte der Formate (lange Sprünge, große Schritte) und dass die Ausgabe Byte
für Byte den Referenzdateien in `test/fixtures/` entspricht. Ist `pyembroidery` installiert
(`pip install pyembroidery`), liest es die Dateien zusätzlich als zweiter, fremder Leser; mit
`REQUIRE_PYEMBROIDERY=1` schlägt der Test fehl, wenn es fehlt.

Ändern sich Stiche oder Dateiformate gewollt, die Referenzdateien mit `npm run test:fixtures` neu
schreiben und nach [test/fixtures/CHECKLISTE.md](test/fixtures/CHECKLISTE.md) im Stickprogramm und auf
der Maschine prüfen. `build/release.sh` führt `npm test` vor jeder Release aus.

## Lizenz

Pic2Laser ist freie Software unter der **GNU General Public License, Version 2 oder (nach Wahl)
jeder späteren Version** (GPL-2.0-or-later), Volltext in [LICENSE](LICENSE).

Grund ist die Vektorisierung mit [Potrace](https://potrace.sourceforge.net/) über das npm-Paket
[`potrace`](https://github.com/tooolbox/node-potrace) (GPL-2.0); `src/main/trace-worker.js` baut
direkt darauf auf. Wer Pic2Laser (oder eine geänderte Fassung) weitergibt, muss deshalb auch den
Quellcode unter der GPL bereitstellen.

Die übrigen Abhängigkeiten (Electron, onnxruntime u. a.) stehen unter freien, GPL-kompatiblen Lizenzen
(MIT, BSD, ISC, Apache-2.0). Der Modus Wellen ist eine Portierung von
[img2laser](https://github.com/0not/img2laser) (© 2023 Kyle Larsen, MIT, Lizenztext in
`wasm/sine/LICENSE-img2laser`). Die KI-Modelle haben eigene Lizenzen, siehe
[Lizenzen der Modelle](#lizenzen-der-modelle). Mit Pic2Laser erzeugte Bilder und SVGs fallen nicht
unter die GPL – sie gehören dir.
