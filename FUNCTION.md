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
| **Linien** | Strichzeichnungen | KI-Strichzeichnung (Informative Drawings) oder Kantenerkennung (Canny) → Linien als Vektor |
| **Foto** | Fotogravur | Dithering: Floyd-Steinberg, Atkinson, Jarvis, Stucki, Bayer 8×8 oder Schwellwert |
| **Relief** | 3D-Reliefgravur in Holz | KI-Tiefenkarte (Depth Anything V2) als Graustufenbild – hell = erhaben, dunkel = tief |

## Einstellungen

- **Bildanpassung:** Helligkeit, Kontrast, Gamma, Weichzeichnen, Schärfen, Invertieren.
  Doppelklick auf einen Regler setzt ihn zurück.
- **Vektorisierung:** Schwellwert (inkl. „Auto“/Otsu), Flecken entfernen, Ecken glätten,
  Kurven-Toleranz, Arbeitsauflösung.
- **Linien:** Detailgrad, Linienschwelle, Linien verstärken (KI) bzw. Empfindlichkeit und
  Linienstärke in mm (Canny).
- **Dithering / Relief:** Verfahren, Auflösung in DPI, Tiefen-Detail.
- **Ausgabegröße:** Breite oder Höhe in mm (Seitenverhältnis bleibt erhalten); Weiß optional
  transparent.

## Freistellen (Hintergrund entfernen)

| Methode | Modell | Hinweis |
|---|---|---|
| KI – schnell | U²-Net | mitgeliefert |
| KI – präzise | IS-Net | Download bei Bedarf |
| KI – beste Qualität | BiRefNet lite | Download; braucht ca. 6,7 GB RAM, weicht sonst automatisch auf IS-Net aus |
| KI – Porträt/Haare | MODNet | Download |
| KI – Objekt anklicken | MobileSAM | Linksklick = Motiv (+), Rechtsklick/Alt+Klick = ausschließen (−) |
| Nach Farbe | – | Hintergrund vom Bildrand aus + zusätzliche Klickpunkte, Farbtoleranz |

- **Maskenschwelle** für die KI-Methoden.
- **Klickpunkte** (Plus/Minus) werden immer gut sichtbar angezeigt; ein Klick auf einen Punkt
  entfernt ihn wieder.
- **Vorschau:** Der entfernte Hintergrund wird rot schraffiert mit Schnittlinie markiert, das
  Original bleibt sichtbar. Optional ausblenden (Schachbrett). Reine Anzeige – ohne Einfluss
  auf das Ergebnis.

## Altes Foto restaurieren

Läuft vor allen anderen Schritten (Arbeitsgröße je nach Rechner 1024–1600 px):

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
- Eigene Regler für **Mund, Nase, Kinn und Wangen** (0 = aus). Auf glatter Haut werden Poren
  und Sommersprossen nicht mitverstärkt.

## Schrift & Logos

- **Schrift erkennen und sauber darstellen** (PaddleOCR-Textdetektor): Schriftzüge werden scharf
  und gefüllt dargestellt statt gerastert oder nachgezeichnet; der Hintergrund behält seine
  Darstellung.
- **Logos einbeziehen:** Grafikelemente, die an die Schrift grenzen (z. B. ein Logo-Symbol),
  werden schrittweise mit übernommen.
- **Schriftstärke** (fetter/feiner). Erkannte Bereiche werden im Original blau markiert.

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
- Für LightBurn: kein weißes Hintergrund-Rechteck im SVG, Größe wird beim Import übernommen.

## Historie

- Jede exportierte oder herausgezogene Umwandlung wird mit Original, Einstellungen, SVG, PNG
  und Vorschaubild gespeichert.
- Ein Klick öffnet sie mit allen Einstellungen wieder. Suche, SVG erneut speichern,
  Speicherordner öffnen, einzelne Einträge oder alles löschen.

## Bedienkomfort & Leistung

- **Nicht blockierend:** Bildverarbeitung im Hintergrund-Thread, KI und Vektorisierung in
  eigenen Prozessen – die Oberfläche bleibt jederzeit bedienbar. Neue Einstellungen brechen
  veraltete Berechnungen automatisch ab.
- **Fortschritt mit Restzeit** oben in der Kopfzeile; die Schätzung lernt aus den echten
  Laufzeiten auf dem jeweiligen Rechner. Bei Downloads Restzeit aus der Datenrate.
- **Abbrechen** (Knopf im Fortschrittsfeld oder Esc): stoppt Berechnungen, KI, Vektorisierung
  und Downloads; das letzte Ergebnis bleibt erhalten.
- **Zwischenspeicher:** KI-Ergebnisse werden pro Bild gemerkt – Umschalten geht sofort.

## Anpassung an den Rechner

- Gesamter und **tatsächlich verfügbarer Arbeitsspeicher** wird je System ermittelt (macOS
  `vm_stat`, Linux `MemAvailable`, Windows) und angezeigt.
- **Leistungsstufe** niedrig / mittel / hoch bestimmt Arbeits- und Kachelgrößen, maximale
  Bildgröße, gleichzeitig geladene Modelle und Threads.
- Vor jeder KI-Berechnung wird der freie Speicher mit dem **gemessenen Bedarf des Modells**
  verglichen; bei Bedarf werden andere Modelle freigegeben, sonst gibt es eine verständliche
  Meldung statt eines Absturzes.

## KI-Modelle

| Mitgeliefert | Download bei Bedarf (geprüft per SHA-256) |
|---|---|
| U²-Net, Informative Drawings, Real-ESRGAN, MobileSAM, UltraFace, YuNet, PaddleOCR-Detektor | MODNet, IS-Net, BiRefNet lite, Depth Anything V2 Small, SCUNet, LaMa, RestoreFormer++ |

- Alle Modelle sind für kommerzielle Nutzung lizenziert (MIT, Apache-2.0, BSD-3).
- Im Bereich „KI-Modelle“: Status, Größe, Speicherbedarf; Laden und Entfernen per Klick.

## Plattformen

- Windows (Installer und portable EXE), macOS (Apple Silicon und Intel), Linux.
- Auf Rechnern ohne native KI-Laufzeit (z. B. Intel-Macs) laufen die Modelle automatisch über
  WebAssembly.
