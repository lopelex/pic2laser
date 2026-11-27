# Pic2Laser – Funktionen

Pic2Laser wandelt Bilder in Laser-Vorlagen für LightBurn um: Schwarz-Weiß-SVGs (Vektor) und
optional Rasterbilder (PNG, JPG, BMP) – in der richtigen Größe in mm und mit DPI. Der Modus
„Farben“ zerlegt Bilder in Farbflächen mit einer SVG-Ebene je Farbe (Stickerei, mehrfarbige Gravur).
Alle KI-Funktionen laufen lokal und offline.

---

## Bild laden & Vorschau

- **Bild laden:** Drag & Drop ins Fenster, Datei-Dialog („Bild öffnen…“, Strg/Cmd+O) oder
  Einfügen aus der Zwischenablage (Strg/Cmd+V). Formate: PNG, JPG, WebP, BMP, GIF, AVIF, ICO, SVG.
  SVG wird im Browser gerendert (ohne Skripte) und auf 3000 px an der längeren Seite gerastert,
  Transparenz bleibt erhalten; steht die Breite in mm, cm oder Zoll in der Datei, wird sie als
  Ausgabebreite übernommen.
- **Kamera:** „Kamera…“ (Strg/Cmd+K) öffnet einen Dialog mit Live-Vorschau der Webcam; „Aufnehmen“
  (oder Leertaste) übernimmt das Bild in voller Kameraauflösung verlustfrei als PNG als Originalbild.
  Bei mehreren Kameras lässt sich die Kamera wählen, die Auswahl bleibt gespeichert.
- **Vorschau:** Original und Ergebnis nebeneinander oder einzeln, aktualisiert sich bei jeder
  Änderung automatisch.
- **Zoom:** Mausrad zoomt stufenlos (100–1600 %) auf die Mausposition; Trackpad: Pinch zoomt,
  zwei Finger verschieben. Knöpfe + / − / Einpassen.
- **Verschieben:** In Original und Ergebnis mit gedrückter linker (oder mittlerer) Maustaste.
  Beide Ansichten laufen synchron.
- **Statuszeile:** Pixelgröße, Endgröße in mm, DPI, SVG-Größe und Rechenzeit.
- **Info im Ergebnisfeld:** welche Dateien beim Herausziehen (Strg/Cmd + Ziehen) mitkommen, Größe in mm, DPI.

## Modi

| Modus | Wofür | Ergebnis |
|---|---|---|
| **Fläche** | Logos, Schrift, Silhouetten, Grafiken | Schwellwert + Vektorisierung (Potrace) → gefüllte Vektorpfade |
| **Linien** | Strichzeichnungen | KI-Strichzeichnung (wählbares Modell, s. u.) oder Kantenerkennung (Canny) → Linien als Vektor |
| **Foto** | Fotogravur | Dithering: Floyd-Steinberg, Atkinson, Jarvis, Stucki, Bayer 8×8 oder Schwellwert |
| **Wellen** | Fotos und Porträts als Linienkunst | Sinuswellen-Schattierung (WebAssembly) → offene Vektorlinien, dunkel = dichte Wellen |
| **Farben** | Farbige Logos, Grafiken, Stickvorlagen | Farbreduktion (k-Means in Lab) → je Farbe eine vektorisierte Ebene, größte Fläche unten |
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
- **Dithering / Relief:** Verfahren, Auflösung in DPI, Tiefen-Detail. Relief: **Tiefenmodell** *Standard*
  (Depth Anything V2 Small, Apache-2.0), *Fein* (Base, ca. 2–3× langsamer) oder *Sehr fein* (Large, ca. 7–9×
  langsamer, 2–3,6 GB RAM); Base und Large stehen unter CC BY-NC 4.0 (nicht kommerziell). Reicht der Speicher
  nicht, wird automatisch das nächstkleinere Modell genommen (`DEPTH_FALLBACK` in app.js). „Weißen Hintergrund transparent“ –
  mit Freistellen gilt die Maske, sonst wird reines Weiß am Bildrand transparent (nur PNG/SVG, JPG/BMP bleiben weiß).
- **Wellen:** Richtung (waagrecht/senkrecht), Linienabstand in mm, Wellenhöhe (in % des Abstands,
  100 % = Nachbarwellen berühren sich), Wellendichte dunkel und hell (Wellen je mm; hell 0 = gerade Linie),
  Strichbreite (Vorschau und Rasterexporte; im SVG zählt in LightBurn der Laserpunkt), Auflösung in DPI.
  „Kontrast automatisch strecken“ nutzt für hellste und dunkelste Stelle die volle Dichte, „Weiße Flächen
  auslassen“ setzt den Laser auch über rein weißen Stellen im Motiv ab; Lücken und Linienstücke unter
  0,8 mm werden dabei ignoriert. Freigestellter Hintergrund bleibt immer leer (Motiv intern höchstens
  Grauwert 253, Hintergrund 255, ausgelassen wird nur ≥ 253,5). Das SVG enthält offene Linien (`fill="none"`) – in
  LightBurn als **Linie** gravieren. Verfahren nach img2laser (Kyle Larsen, MIT), gerechnet in Rust/WebAssembly.
- **Farben:** *Anzahl Farben* (2–16 oder **Auto**: erhöht die Anzahl, bis fast jedes Pixel durch eine Farbe
  oder eine Mischung zweier Farben erklärt ist – höchstens 10), *Farbpalette* (Bildfarben oder
  **Brother-Garne**: jede Farbe rastet auf das nächste der 61 PES-Standardgarne ein, gleiche Garne werden
  zusammengeführt; Farbwerte auf dem Bildschirm nur Näherung), *Kanten glätten* (Mehrheitsfilter, mm),
  *Kleinste Fläche* (mm² – kleinere Flächen gehen in der Nachbarfarbe auf, auch kleine Lücken),
  *Überlappung* (mm – untere Ebenen reichen unter die oberen, gegen Lücken durch Stoffverzug; Stickerei
  0,2–0,4 mm) und *Hintergrundfarbe weglassen* (die Farbe, die am Bildrand überwiegt, wird nur dort
  entfernt, wo sie mit dem Rand verbunden ist – weiße Schrift im Logo bleibt). Gerechnet wird mit den
  Farben nach der Bildanpassung (Weichzeichnen, Schärfen, Helligkeit, Kontrast, Gamma je Kanal);
  transparente und freigestellte Bereiche bleiben leer.
  - Kantenglättung und JPEG-Farbsäume erzeugen Mischfarben; schmale Säume, die zwischen zwei anderen
    Farben liegen (Gerade in RGB oder Lab), werden aufgelöst und nicht als eigene Farbe ausgegeben.
  - **Ebenenliste** (unten → oben = Reihenfolge im SVG bzw. Stickreihenfolge): Häkchen = Farbe ausgeben,
    Farbfeld = Farbe ändern (bei Garnpalette rastet sie auf das nächste Garn ein), ⇢ = mit einer
    anderen Farbe zusammenführen, ↺ = Änderungen dieser Farbe zurücknehmen. Die Änderungen gelten nur
    für das Bild (`colorEdits`, nicht in Presets) und hängen an der ursprünglichen Bildfarbe – sie
    bleiben beim Verstellen der Regler erhalten, solange die Farbe ähnlich bleibt (ΔE < 12).
  - Vektorisierung je Farbe mit Potrace (Regler unter „Vektorisierung“, auch „Formen begradigen“),
    alle Ebenen in einem Auftrag. Rasterexporte zeigen genau die vektorisierten Flächen (BMP 24 Bit).
  - „Vereinigen“ mit einem Farb-Ergebnis (als aktuelles Ergebnis oder als Historie-Eintrag): siehe Historie.
  - Schrift & Logos: Je Textblock bekommen die Buchstaben (samt einbezogener Logo-Elemente) eine
    einheitliche Farbe (Mittel der Hälfte ihrer Pixel, die sich am stärksten vom Grund abheben – der
    Kern der Striche), der schmale Saum die mittlere Farbe des Grundes; diese Pixel behalten beim
    Glätten und beim Entfernen von Kleinstflächen ihre Farbe. Bei automatischer Farbanzahl bekommt
    jede Schriftfarbe eine eigene Farbe (ΔE > 10 zu allen anderen), und eine Farbe, die überwiegend
    aus Schrift besteht, gilt nie als Kantenmischung.
  - Gesichtszüge hervorheben wirkt auf die Helligkeit (Änderung gleich auf R, G, B – Farbton bleibt).
  - Motivkontur: eigene schwarze Ebene „Motivkontur“ ganz oben; die Farbflächen sparen den Ring aus.
- **Formen verbessern** (Abschnitt unter „Vektorisierung“). Mit „Schrift & Logos“ wählbar:
  *Reihenfolge* nach der Schrift-/Logoerkennung (Standard: die Verbesserungen gelten auch für die
  erkannte Schrift – sie wird aus dem KI-vergrößerten Bild gerechnet, mitbegradigt bzw. bei „Ruhige
  Linien“ mitgeglättet) oder davor (die Schriftbereiche samt einbezogener Logo-Elemente bleiben so,
  wie die Schrifterkennung sie zeichnet).
  - *Formen begradigen* (Fläche und Linien): Kanten, die innerhalb der Toleranz (mm) gerade bzw.
    rund sind, werden zu exakten Geraden, Kreisbögen, Kreisen und Ellipsen, Ecken werden scharf.
    „Winkel einrasten“ richtet fast waagrechte/senkrechte/diagonale Kanten exakt aus (0°/45°/90°)
    und macht fast rechte Winkel zwischen Nachbarkanten exakt rechtwinklig. Was zu keiner
    Grundform passt (feine, unregelmäßige Details), bleibt die Potrace-Kurve. Rasterexporte und
    Vereinigen zeigen dieselben Formen wie das SVG.
  - *Glatte Konturen (KI)* (Fläche): vergrößert Bilder unter 2048 px per Real-ESRGAN (mitgeliefert,
    nur für die Fläche, ohne „KI-Vergrößerung“ einschalten zu müssen) und verwischt die
    Treppenstufen vor dem Schwellwert – runde, ruhige Umrisse statt Zacken bei kleinen Vorlagen.
  - *Ruhige Linien* (Linien): jede Linie wird auf ihre Mittellinie reduziert, Ausläufer und
    kurze Striche entfallen („Kurze Striche entfernen“ in mm), die Mittellinie wird geglättet
    („Linien glätten“ in mm) und mit gleichmäßiger Breite (Median je Strich) neu gezeichnet –
    vor „Linien verstärken“ bzw. der Linienstärke.
- **Ausgabegröße:** Breite oder Höhe in mm (Seitenverhältnis bleibt erhalten); Weiß optional
  transparent. Für die **Stickdateien** (PES, DST, EXP) gilt die Breite für das gestickte Motiv ohne Rand
  und Hintergrund – die Stiche werden auf genau diese Breite gebracht (Zugausgleich kann bis ca. 0,6 mm
  dazugeben); SVG und Rasterbilder behalten die Bildbreite. Die Größe der Stickdatei steht unter
  „Stickdatei“, die Höhe ergibt sich aus dem Motiv.

## Freistellen (Hintergrund entfernen)

| Methode | Modell | Hinweis |
|---|---|---|
| Motiv – schnell | U²-Net | mitgeliefert |
| Motiv – präzise | IS-Net | Download bei Bedarf |
| Motiv – gut & sparsam | BEN2 Base (int8) | Download; ca. 3 GB RAM, etwa doppelt so schnell wie BiRefNet; bei sauberen Fotos fast gleich gut, bei alten/verrauschten Fotos deutlich schwächer; weicht bei zu wenig Speicher auf IS-Net aus |
| Motiv – beste Qualität | BiRefNet lite | Download; braucht ca. 6,7 GB RAM, weicht sonst automatisch auf BEN2, notfalls IS-Net aus |
| Motiv – Porträt & Haare | MODNet | Download |
| Objekt anklicken – schnell | MobileSAM | Linksklick = Motiv (+), Rechtsklick/Alt+Klick = ausschließen (−) |
| Objekt anklicken – genau | SAM 2.1 Small (Download ca. 180 MB) | wie MobileSAM, genauere Objektgrenzen; erstes Erkennen je Bild einige Sekunden, ca. 0,9 GB RAM |
| Himmel entfernen – schnell | – | Himmel (blau, Wolken, Dunst) vom oberen Bildrand aus, folgt dem Farbverlauf bis zum Horizont und stoppt an harten Kanten; Landschaft, Fahrzeuge und Gebäude bleiben. Toleranz = erlaubter Farbsprung je Pixel, Klickpunkte für Himmel zwischen Ästen oder hinter Scheiben |
| Himmel entfernen – Motiv geschützt | BEN2 Base (int8), Download | wie „Himmel entfernen – schnell“, zusätzlich schützt BEN2 das Hauptmotiv: helle, weiße oder bläuliche Teile von Fahrzeugen, Gebäuden oder Personen werden nie als Himmel entfernt. Ist BEN2 nicht nutzbar, wird der Himmel ohne Schutz entfernt (mit Hinweis) |
| Nach Farbe | – | Hintergrund vom Bildrand aus + zusätzliche Klickpunkte, Farbtoleranz |

- **Maskenschwelle** für die KI-Methoden.
- **Maske verfeinern** (für alle Methoden, auch „Nach Farbe“, „Objekt anklicken“ und „Himmel entfernen“):
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
  **Gesichtsschutz:** *Geschätzt* (Ellipsen aus den 5 Gesichtspunkten) oder *Genau* (Face Parsing,
  nicht kommerziell): die Zonen liegen dann genau auf Augen/Brauen, Nase und Mund; nicht gefundene
  Merkmale fallen auf die Schätzung zurück.
- **Gesichter restaurieren:** Gesicht über 5 Gesichtspunkte (YuNet) ausgerichtet, restauriert und
  mit den Tonwerten des Originals zurückgesetzt. Regler „Stärke“. **Modell:** *RestoreFormer++*
  (Apache-2.0) oder *CodeFormer* (S-Lab License, nicht kommerziell) mit Regler **„Treue zum
  Original“** (niedrig = stärker restauriert, hoch = Person bleibt besser erkennbar; Standard 70 %).
- Die Originalansicht zeigt das restaurierte Bild; darunter steht, was gemacht wurde.

## KI-Verbesserung

- **KI-Vergrößerung 4×** (Real-ESRGAN) für kleine oder unscharfe Bilder – kachelweise.

## Gesichter

- **Gesichtszüge hervorheben:** Gesichtserkennung (UltraFace), dann lokaler Kontrast für Augen,
  Brauen und Gesamtgesicht. Im Modus Linien wird jedes Gesicht zusätzlich in hoher Auflösung
  nachgezeichnet. Die Verstärkung ist begrenzt: Schwache Konturen (Lippen, Lidfalte) werden
  deutlich betont, ohnehin dunkle Falten und Schatten nur wenig – so entstehen bei faltiger Haut
  keine schwarzen Flecken.
- Erkannte Gesichter werden im Original-Fenster orange gestrichelt umrahmt (wie die Schriftbereiche
  in Blau) – nur in der Vorschau, nie im Ergebnis oder Export.
- **Reihenfolge:** vor dem Freistellen (ganzes Bild) oder danach (nur Gesichter im Motiv).
- **Merkmale finden:** *Geschätzt* (feste Anteile des Gesichtsrahmens) oder *Genau* (Face Parsing,
  BiSeNet, nicht kommerziell): jedes Gesicht wird in Haut, Augen, Brauen, Nase und Lippen zerlegt;
  Mund, Nase, Kinn und Wangen werden genau dort verstärkt bzw. nachgezeichnet.
- Eigene Regler für **Mund, Nase, Kinn und Wangen** (0 = aus). Auf glatter Haut werden Poren
  und Sommersprossen nicht mitverstärkt.

## Schrift & Logos

- **Schrift erkennen und sauber darstellen** (PaddleOCR-Textdetektor): Schriftzüge werden scharf
  und gefüllt dargestellt statt gerastert oder nachgezeichnet. Ersetzt werden nur die Buchstaben
  selbst (Flächen, die ganz im Schriftbereich liegen); der Hintergrund behält seine Darstellung,
  es entsteht kein Kasten. Farbige Schrift mit ähnlicher Helligkeit wie der Grund (z. B. gelb vor
  Wolken) wird über ihre Farbe abgegrenzt und schwarz gezeichnet; deutlich hellere Schrift auf
  dunklem Grund wird hell gezeichnet. Die Farbe gewinnt auch, wenn sie die über die Helligkeit
  gefundenen Buchstaben fast ganz enthält und deutlich weiter entlang der Zeile reicht (farbige
  Schrift vor einem Verlauf, bei der die Helligkeit nur einen Teil der Buchstaben trennt).
- Bereiche auf erkannten Gesichtern (häufiger Fehltreffer des Textdetektors) und riesige Schrift
  (Zeile über ein Viertel der Bildhöhe – bleibt auch ohne Sonderbehandlung sauber) werden ignoriert.
- **Logos einbeziehen:** Grafikelemente, die an dunkle Schrift grenzen (z. B. ein Logo-Symbol),
  werden schrittweise mit übernommen.
- **Schriftstärke** (fetter/feiner). Erkannte Bereiche werden im Original blau markiert.
- **Erkennung** vor dem Freistellen (ganzes Bild) oder danach (Schrift im Hintergrund wird ignoriert).

## Konturen

- **Motivkontur:** dünne Linie innen entlang der Grenze zwischen Motiv und Hintergrund – dort,
  wo beide ineinander verschwimmen (z. B. helle Haut vor hellem Hintergrund). Linienstärke in mm.
  Auch in Wellen (Ring als gefüllte Fläche im SVG, Steppstich in der Stickdatei) und Farben
  (eigene schwarze Ebene).
- **Umrisslinie (Randkontur):** Kontur um das ganze Motiv mit Abstand in mm, „Lücken
  schließen“, optional nur die Umrisslinie ohne Gravur.
  - im SVG als **rote Linie** (eigene Ebene in LightBurn, z. B. zum Ausschneiden)
  - in PNG/JPG/BMP als **schwarze Linie** – mit gleicher Größe und Lage wie das SVG

## Presets

- **78 Vorlagen**, getrennt nach **Lasern** und **Sticken** (Umschalter über der Preset-Liste; die App
  startet immer mit *Lasern*). Jede Vorlage hat eine kurze Beschreibung.
  - *Lasern* (51), gegliedert nach Eingangsbild: Logos, Schrift & Grafik · Porträts & Personen · Tiere ·
    Fotos & Landschaft · Material (Holz, Schiefer/Glas/Alu, Leder, Acryl) · Schneiden & Relief · Farben.
  - *Sticken* (29): nach Stoff · Linien, Tusche & Skizze · Fläche & Wellen · Farben (4–16) – der Vorsatz
    „Stickerei – “ entfällt in dieser Liste. Dazu am Ende die beiden Farben-Vorlagen „Farbiges Logo“ und
    „Comic / Illustration – 8 Farben“ als SVG-Ebenen für Stickprogramme (stehen in beiden Listen).
  - Ähnliche Vorlagen gibt es bewusst in beiden Varianten (z. B. Porträt als Tuschezeichnung zum Lasern
    und als Tusche-Porträt mit PES zum Sticken).
  - Unter *Sticken* sind die Modi Foto und Relief ausgegraut (sie liefern keine Stickdatei); steht der
    Modus beim Umschalten auf Foto oder Relief, wechselt er auf Fläche. Wird ein solcher Modus z. B. aus
    der Historie geladen, springt die Liste zurück auf *Lasern*.
  - Eigene Presets erscheinen unter *Sticken*, wenn PES, DST oder EXP gewählt ist und der Modus eine Stickdatei
    liefert, sonst unter *Lasern*.
- **Stickerei-Vorlagen** (Farbflächen auf Brother-Garne, PES-Export, Stoff und Motivbreite):
  T-Shirt/Jersey (90 mm, Überlappung 0,4 mm), Polo/Piqué (80 mm, kleinste Fläche 3 mm²),
  Fleece/Sweatshirt (100 mm), Handtuch/Frottee (100 mm, kleinste Fläche 4 mm², stärker geglättet),
  Jeans/Canvas/Tasche – Webware (100 mm), Leder/Kunstleder-Patch (70 mm, Überlappung 0,2 mm) und
  Schriftzug/Silhouette einfarbig (Modus Fläche). Breiten nach üblichen Platzierungsmaßen
  (Brustlogo 75–100 mm, Sweatshirt-Front bis etwa 240 mm). Anders als die übrigen Vorlagen setzen sie
  Breite, Exportformat PES und Stoff; die übrigen Exportformate bleiben.
- **Stickerei-Vorlagen nach Stil** (setzen Breite und PES, der gewählte Stoff bleibt):
  - *Linien, Tusche & Skizze:* Linienzeichnung mit freigestelltem Motiv bzw. Porträt (Kräftige Konturen,
    ruhige Linien, kurze Striche unter 3 mm entfernt, 0,3 mm verstärkt → ca. 0,9 mm breite Linien, wenige
    Sprünge), Gebäude/Fahrzeug mit Formen begradigen (120 mm), Tusche-Porträt (U²-Net), Tusche-/Comiczeichnung
    als Scan (Modus Fläche, haarfeine Striche automatisch als Kontur), Bleistiftskizze für Porträt und Tier.
  - *Fläche & Wellen:* gefüllte Silhouette (BEN2, 90 mm), Stencil-Porträt, kleiner Schriftzug/Monogramm
    (55 mm, z. B. Mütze), Wellen für Porträt (120 mm), Haustier (110 mm), Landschaft (1,8 mm Abstand) und
    Logo/Silhouette – höchstens etwa 1 Welle/mm, damit der Steppstich der Welle folgt.
  - *Farben (4–16):* 4 Farben (Logo/Wappen, 90 mm), 6 (Comic/Clipart), 8 (Illustration), 10 (Foto vereinfacht,
    freigestellt), 12 (Foto/Landschaft, 110 mm) und 16 (Porträt/Foto, freigestellt) auf Brother-Garne; mehr
    Farben werden stärker geglättet (kleinste Fläche 2–4 mm²). Gleiche Garne werden zusammengelegt.
- Darunter Vorlagen für Schilder/Piktogramme (Formen begradigen), pixelige Logos (Glatte Konturen),
  Gummistempel (invertiert), Fahrzeuge mit Schriftzug, Gebäude mit geraden Linien, Ausmalbilder,
  Porträt als Tuschezeichnung oder Bleistiftskizze, freigestelltes Relief als transparentes PNG
  und Relief mit maximalen Details (Depth Anything V2 Large, nicht kommerziell),
  Himmel entfernen als Fotogravur oder Strichzeichnung.
- **Eigene Presets** speichern, überschreiben und löschen. Der Preset-Bereich bleibt oben immer
  sichtbar; nach Änderungen erscheint ein Hinweis.

## Export & Weitergabe

- **Exportieren** (Strg/Cmd+E): SVG (Maße in mm) und optional PNG, JPG, BMP (mit DPI; 1-Bit-BMP
  bzw. 8-Bit-Graustufen beim Relief, 24 Bit im Modus Farben) – alle Dateien mit gleichem Namen in einem Ordner.
  Nur eine bekannte Endung im eingegebenen Namen wird ersetzt, Punkte im Namen bleiben („Version 1.2“).
  Der Dialog öffnet im zuletzt benutzten Ordner und nennt alle Formate (z. B. „SVG + PES + EXP + INF“).
  Geschrieben wird alles oder nichts: schlägt eine Datei fehl (Platte voll, Datei in einem anderen Programm
  geöffnet), bleiben vorhandene Dateien unverändert und es entsteht keine halbe Gruppe.
- **SVG im Modus Farben:** je Farbe eine Gruppe als Inkscape-Ebene (`inkscape:groupmode="layer"`,
  Name „Nr. Farbname (#rrggbb)“) mit gefülltem Pfad in der Farbe, Reihenfolge von unten nach oben.
  LightBurn legt je Farbe eine Ebene an; Stickprogramme (Ink/Stitch, Hatch, Wilcom, Embrilliance
  StitchArtist) übernehmen Farben und Reihenfolge – dort werden die Sticharten zugewiesen.
- **Stickdateien PES, DST und EXP** (Exportformate „PES (Sticken)“, „DST (Sticken)“, „EXP (Sticken, Melco)“; Modi Fläche, Linien,
  Wellen und Farben, auch mit Umrisslinie und beim Vereinigen zweier Vektor-Ergebnisse; in den Modi Foto
  und Relief sind PES/DST/EXP ausgegraut und werden nicht exportiert):
  - Flächen als **Füllstich (Tatami)**: Reihen im Stichwinkel, Einstiche je Reihe um ¼ der Stichlänge
    versetzt, Reihenenden um den Zugausgleich verlängert. Darunter eine **Unterlage** quer zur
    Stichrichtung (Reihenabstand 4 × Deckstich, mind. 1,2 mm; 0,4 mm vom Rand eingezogen).
    Die Fläche wird in Blöcke zerlegt, die sich in einem Zug hin und her sticken lassen; je
    zusammenhängender Fläche erst die Unterlage, dann der Deckstich, Blöcke nach kürzestem Weg.
  - **Wege** zwischen Blöcken werden innerhalb der Fläche mitgestickt (Wegsuche A* auf einem Raster der
    Stichreihen, schon gestickte Stellen werden gemieden – die Wege liegen unter dem späteren Deckstich).
    Gibt es keinen Weg (getrennte Flächen) oder wäre er ein großer Umweg: Sprung, ab „Faden schneiden ab“
    mit Vernähen (je zwei kurze Rückstiche) und Fadenschnitt.
  - **Wellen** (offene Linien) als Steppstich oder Dreifachstich: Einstieg am näheren Ende jeder Linie,
    Stiche folgen der Welle mit höchstens ±0,1 mm Abweichung, 0,5–2 mm lang (kürzere Stücke werden
    zusammengefasst; einstellbar im Dialog als „Längster/Kürzester Stich“ und „Genauigkeit“). Dichte Wellen
    (über ca. 1 Welle/mm) werden dadurch zum Zickzack – für runde Wellen die Wellendichte senken.
  - Umrisslinie als **Steppstich** (2,5 mm) in Schwarz, nach den Flächen. Gleiche Farbe hintereinander
    (schwarze Fläche + Umrisslinie) ohne Farbwechsel.
  - Reihenfolge der Farben wie in der Ebenenliste; Motiv in der Datei zentriert, Einheit 0,1 mm.
  - **PES** Version 1 mit PES-Teil (Stichgruppen und Farbnummern für PE-Design u. a.) und PEC-Teil für die
    Maschine (Brother-Farbnummern 1–64, Stiche, Sprünge mit Schnitt-Kennung, Vorschaubilder 48 × 38).
    Jede Farbe bekommt das nächstliegende noch freie Brother-Garn (Farbabstand „redmean“).
  - **DST** (Tajima): ohne Farben (Farbwechsel als Stopp), Fadenschnitt als drei Sprünge ohne Bewegung.
  - **EXP** (Melco): ohne Farben, ohne Kopf; Sprung, Farbwechsel und Fadenschnitt als Melco-Steuerbefehle.
    Für **Melco DesignShop** (Datei → Öffnen, kommt als Stichdatei ohne bearbeitbare Objekte an) und
    Melco-Maschinen; ein Hinweis im Abschnitt „Stickdatei“ verweist darauf. Das eigene DesignShop-Format
    OFM ist nicht offengelegt und wird nicht geschrieben.
  - **INF** (immer zusammen mit EXP, gleicher Dateiname): Farbliste je Farbblock mit genauer Farbe (RGB),
    Name (ASCII, Umlaute umschrieben), Nadel 1, 2, … und Garnkarte „RGB“. Melco DesignShop ab Version 12
    liest sie zu EXP und DST mit gleichem Namen und zeigt die Farben statt Standardfarben.
  - Abschnitt „Stickdatei“ (nur mit PES/DST/EXP): **Stoff**, Faden schneiden ab, „Je Farbe einstellen…“;
    Anzeige von Stichzahl, Farben, Fadenschnitten, Größe und passendem Rahmen (100 × 100 / 130 × 180 mm).
    „Stiche in der Vorschau zeigen“ zeichnet die geplanten Stiche in Fadenfarbe. Diese Einstellungen
    ändern nur die Stickdatei (keine Neuberechnung) und bleiben wie die Exportformate beim Anwenden einer
    Vorlage erhalten.
  - **Stickparameter je Farbe (Automatik):** Der Stoff liefert die Grundwerte (Reihenabstand /
    Stichlänge / Zugausgleich, Unterlage): Webware 0,22/4,0/0,20 mm normal, Strick/Jersey und Piqué
    0,25/4,0/0,35 mm kräftig, Fleece/Sweat 0,26/4,0/0,40 mm kräftig, Frottee/Handtuch 0,20/4,0/0,40 mm
    kräftig (Hinweis auf Topping), Leder/Kunstleder 0,33/4,5/0,10 mm leicht (Hinweis auf spitze Nadel).
    - Reihenabstand = tatsächlicher Abstand benachbarter Reihen wie in Ink/Stitch (Vorgabe 0,25 mm) und
      PE-Design (Vorgabe 4,5 Linien/mm = 0,22 mm); im Dialog zusätzlich als Linien/mm. Wilcom/Hatch messen
      zwischen zwei Hinreihen – deren übliche 0,38–0,45 mm entsprechen etwa 0,2 mm hier. Ergebnis:
      rund 1.000–1.500 Stiche je Quadratzoll Füllfläche, wie die gängigen Faustregeln.
    - Abgeglichen mit der Wilcom-Dokumentation (Tatami 4 mm Stichlänge, Versatz ¼; Zugausgleich
      Baumwolle 0,20, T-Shirt 0,35, Fleece 0,40 mm), den Ink/Stitch-Vorgaben (Stichlänge 4 mm,
      4 Versätze, Unterlage +90° mit der Stichlänge des Deckstichs, Wege 2,5 mm innerhalb der Fläche)
      und Fachartikeln (Strick/Polo/Fleece lockerer, Frottee 10–15 % dichter, Leder etwa 50 % lockerer
      mit 4–5 mm Stichlänge und wenig Unterlage). Schnitt ab 3 mm (Wilcom: kürzere Verbindungen sind
      meist unsichtbar).
    - Stichwinkel aus 30/45/60/120/135/150°: die wenigsten Blöcke (= Wege und Sprünge), Diagonalen
      bevorzugt, mindestens 45° Unterschied zur Fläche darunter, möglichst 90° (gleiche Winkel
      benachbarter Flächen verzahnen und öffnen Lücken).
    - Teilflächen schmaler als 0,35 mm werden als Kontur im Steppstich gestickt (zwei Linien am Rand
      decken nur, solange die Fläche kaum breiter als der Faden ist; breitere deckt der Füllstich); besteht eine Farbe fast
      nur aus solchen Linien, wird die ganze Farbe Kontur.
    - Unterlage je Teilfläche höchstens: unter 1,5 mm aus, unter 3 mm leicht, unter 5 mm normal.
      Leicht = Reihen alle max(2 mm, 8 × Abstand), normal = max(1 mm, 5 × Abstand), kräftig =
      max(0,8 mm, 3,5 × Abstand) plus Steppstich entlang der Kanten (Ink/Stitch: 3 × Abstand).
  - **Dialog „Stickparameter je Farbe“:** links Stoff, Schnittlänge und die Farben in Stickreihenfolge
    (Häkchen = sticken, Kurzfassung und Stichzahl je Farbe, „von Hand“-Markierung), Mitte die
    Stichvorschau (Mausrad = Zoom, Ziehen = Verschieben, Doppelklick = Einpassen, andere Farben
    abblenden, „Auf gewählte Farbe zoomen“: beim Auswählen sanfter Zoom auf die Stiche der Farbe, mindestens
    15 mm Ausschnitt, nie kleiner als das ganze Motiv, Einstellung in `pic2laser.ui` gemerkt), rechts die gewählte Farbe: Begründung der Automatik, Stichart (Füllstich, Kontur als
    Steppstich oder Dreifachstich, nicht sticken), Stichwinkel, Reihenabstand, Stichlänge, Zugausgleich,
    Unterlage, „Schmale Stellen als Kontur“. Geänderte Werte gelten nur für dieses Bild (`embLayers`,
    Schlüssel = ursprüngliche Bildfarbe, bleiben beim Umfärben erhalten); Doppelklick auf einen Regler,
    „Automatik für diese Farbe“ bzw. „Alle Farben auf Automatik“ nehmen sie zurück, „Auf alle Farben
    übertragen“ kopiert sie.
  - Nicht möglich (Hinweis statt Datei): andere Modi, leeres Ergebnis, Motiv größer als 400 mm.
  - Grenzen: schmale Linien und kleine Schrift (unter ca. 1 mm) werden ebenfalls als Füllstich gestickt –
    dafür ist Satinstich im Stickprogramm besser.
- **Drag & Drop:** Ergebnisbild mit gedrückter Strg-Taste (Mac: Cmd) herausziehen – direkt in LightBurn, Finder oder
  Explorer. Mitgezogen werden die gewählten Exportformate (auch PES/DST/EXP).
- **An LightBurn senden** (Strg/Cmd+L): fügt das Ergebnis direkt ins offene LightBurn-Projekt ein
  (Mitte der Arbeitsfläche) – über die UDP-Schnittstelle von LightBurn (`PING`, dann `IMPORT:<pfad>`
  an `127.0.0.1:19840`, Antwort auf Port 19841). Gesendet werden die gewählten Exportformate wie beim
  Herausziehen (ohne PES/DST/EXP); der Dateiname enthält nur ASCII-Zeichen. Meldungen, wenn LightBurn nicht läuft, gerade
  ein Dialog offen ist oder der Import fehlschlägt. Ist Port 19841 von einem anderen Programm belegt,
  wird ohne Bestätigung gesendet. Wird wie der Export in der Historie festgehalten.
- **Optimiertes Original herausziehen:** Mit gedrückter Strg-Taste (Mac: Cmd) das Bild im
  Originalfeld herausziehen – als PNG so, wie es in die Umwandlung geht: restauriert,
  KI-vergrößert und freigestellt (Hintergrund transparent), ohne Schraffur und Markierungen.
  Eine kleine Info unten im Originalfeld zeigt Größe und Bearbeitungsschritte.
- Für LightBurn: kein weißes Hintergrund-Rechteck im SVG, Größe wird beim Import übernommen.

## Historie

- Jede exportierte oder herausgezogene Umwandlung wird mit Original, Einstellungen, SVG, PNG
  und Vorschaubild gespeichert.
- **In Historie speichern** (Knopf oder Strg/Cmd+S): sichert das aktuelle Ergebnis ohne Export.
- Ein Klick öffnet sie mit allen Einstellungen wieder. Das gespeicherte Ergebnis wird sofort
  angezeigt, während im Hintergrund neu gerechnet wird (KI-Schritte kommen aus dem
  Festplatten-Cache); Export und Herausziehen stehen bereit, sobald die Berechnung fertig ist. Suche, SVG erneut speichern,
  Speicherordner öffnen, Eintrag duplizieren, einzelne Einträge oder alles löschen.
- **Umbenennen:** ✎ oder Doppelklick auf den Namen; Enter oder Klick daneben übernimmt, Esc bricht ab.
  Nur der Name in `meta.json` ändert sich (Datum bleibt); beim erneuten Speichern bleibt er erhalten.
  Dateiname aller Ausgaben (`baseName`): Name des geöffneten Eintrags (`state.historyName`, gesetzt beim
  Öffnen, Speichern und Umbenennen), sonst der Name der Bilddatei – Export, Herausziehen, An LightBurn
  senden, Name in PES/DST.
- **Sortieren:** neueste oder älteste zuerst (zuletzt gespeichert) bzw. Name A–Z / Z–A (natürliche
  Reihenfolge, „Bild 2“ vor „Bild 10“). Die Wahl wird gemerkt.
- **Vereinigen (⊕):** legt das gespeicherte Ergebnis eines Eintrags über das aktuelle Ergebnis,
  z. B. „Linien“ über „Foto“ desselben Bildes. Oben in der Seitenleiste erscheint dann der Bereich
  „Vereinigt mit“:
  - **Oben liegt:** Historie-Eintrag oder aktuelles Ergebnis.
  - **Überblenden:** Deckkraft der oberen Ebene – 0 % = nur die untere Ebene, 100 % = beide voll.
    Weiß ist durchsichtig, Schwarz addiert sich (Doppelklick = 100 %).
  - **SVG mit Ebenen** (wie im Modus Farben): je Bild eine eigene Inkscape-Ebene, von unten nach oben
    in der gewählten Reihenfolge – „Aktuelles Ergebnis“ und der Historie-Eintrag unter seinem Namen; ein
    Farb-Ergebnis mit allen Farbebenen (Historie-Eintrag mit „Name: “ davor). Anzeige, SVG-Export und
    PNG/JPG/BMP zeigen die Originalfarben (Schwarz-Weiß-Ergebnisse schwarz). Rasterbilder (Foto/Relief)
    bleiben Bilder in ihrer Ebene. Bei 0 % entfällt die obere Seite; bei Zwischenwerten wird eine obere
    Schwarz-Weiß-Seite abgeschwächt gerastert (Relief: Graustufen), Farbebenen bleiben voll. Wo sich
    Ebenen überdecken, wird zweimal graviert. Ein vereinigter Eintrag lässt sich erneut vereinigen
    (Schwarz-Weiß: alle Ebenen als eine; „Farben + …“ behält seine Ebenen).
  - **An LightBurn senden:** eigenes SVG (`lightBurnSvg`), in dem jede Ebene eine eigene LightBurn-
    Ebenenfarbe (Palette 00–29) bekommt – LightBurn ordnet importierte Farben der nächstliegenden
    Ebenenfarbe zu, ähnliche Farben landeten sonst in einer Ebene. Schwarz-Weiß-Ebenen: schwarz, dann
    blau usw. (neben Farben blau); Farbebenen: die nächstliegende freie Farbe. Gilt auch im Modus
    Farben ohne Vereinigung. Herausziehen und Export liefern das SVG in Originalfarben.
  - **Stickdatei:** je Ebene ein eigener Farbblock (`own`: Farbwechsel auch bei gleicher Garnfarbe),
    Schwarz-Weiß-Ebenen mit schwarzem Faden, Flächen als Füllstich, Linien als Steppstich. Rasterbild-
    Ebenen (Foto, abgeschwächte Ebene) entfallen – die Stickinfo nennt sie.
  - Ohne Farben zeigen PNG/JPG/BMP das zusammengerechnete Bild: Zwei Vektor-Ergebnisse
    (Fläche/Linien) bei 0 % oder 100 % ergeben wieder einen Vektor; Zwischenwerte und Foto-Ergebnisse
    werden als Punktmuster gerastert, mit Relief entsteht ein Graustufenbild.
  - Ändert man Einstellungen, wird das eigene Ergebnis neu berechnet und wieder vereinigt.
    Gleiches Seitenverhältnis → deckungsgleich, sonst mittig eingepasst. Die Umrisslinie kommt
    vom aktuellen Ergebnis, die des Eintrags entfällt (außer bei „nur Umrisslinie“).
  - Beim Speichern merkt sich der Eintrag die Vereinigung (`merge` in `meta.json`); beim Öffnen
    wird sie wiederhergestellt, solange der andere Eintrag noch existiert. „Aufheben“ löst sie.

## Einführungstour

- Läuft beim **ersten Start** automatisch und erklärt in 16 Schritten Funktionen und Ablauf
  (Bild laden → Modus → Feinschliff → Größe & Formate → Exportieren, dazu Lasern oder Sticken (Vergleich), Presets, Modus Farben,
  Freistellen, Vorschau, Sticken, Dialog „Je Farbe einstellen…“ als nummerierte Skizze mit Erklärung je Bereich, Historie und KI-Modelle). Das jeweilige Bedienelement wird hervorgehoben.
  Liegt es weiter unten in der Einstellungsspalte, scrollt die Spalte langsam dorthin (0,6–2 s, sanft an- und
  auslaufend), der Rahmen wandert mit; bei „Bewegung reduzieren“ im System springt die Ansicht sofort.
- **Abbrechen** jederzeit über ×, „Tour beenden“ oder Esc; Pfeiltasten blättern.
- **Neu starten** über „Tour starten“ im Handbuch (? oben rechts oder F1). Bei späteren Starts erscheint sie nicht mehr
  (gilt ab dem Anzeigen als gesehen, auch bei Abbruch).
- Am Ende lädt „Beispielbild laden“ eine Beispiel-Plakette (SVG, 80 mm breit) zum Ausprobieren.
- Alle Illustrationen und das Beispielbild sind im Code selbst gezeichnet (`tour.js`) – keine
  fremden Bilder, keine Lizenzfragen.

## Handbuch (F1)

- **?** oben rechts öffnet das Handbuch, **F1** öffnet und schließt es ([HANDBUCH.md](HANDBUCH.md), wird mit der App ausgeliefert) als
  Dialog: links Inhaltsverzeichnis (folgt beim Scrollen), rechts der Text; Abschnittslinks springen im Dialog.
- **Suche** mit Markierung aller Treffer, Enter/Umschalt+Enter = nächster/voriger, Strg/Cmd+F = Suchfeld.
- „Tour starten“ startet die Einführungstour. Eigener kleiner Markdown-Renderer (`manual.js`), keine
  zusätzliche Abhängigkeit.

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
- **Updates:** Beim Start (nach 5 s) und danach alle 24 Stunden fragt Pic2Laser die neueste
  GitHub-Release ab. Ist sie neuer, erscheinen ein Hinweis und „Update x.y.z“ in der Kopfzeile; der
  Dialog zeigt die Release-Notizen. Geladen wird erst nach „Aktualisieren“ – dann aber ohne weiteres
  Zutun: Die passende Datei (Windows-Installer bzw. portable EXE, Mac-ZIP für Apple Silicon/Intel,
  Linux-AppImage; SHA-256 aus der GitHub-API geprüft, abbrechbar) landet in `<userData>/updates` und wird
  per „Jetzt neu starten“ sofort oder beim nächsten Beenden installiert:
  Windows-Installer still (`/S --updated`, bei Installation für alle Benutzer mit UAC-Abfrage),
  portable EXE wird ersetzt (alte als `.old`, beim nächsten Start gelöscht), macOS tauscht das
  `.app`-Paket nach dem Beenden aus, AppImage wird ersetzt. Geht das nicht (Entwicklung, App direkt aus
  „Downloads“ gestartet, kein Schreibrecht), lädt der Dialog die Datei in den Download-Ordner und
  zeigt sie bzw. startet den Windows-Installer. Fehlt eine passende Datei, öffnet sich die
  Download-Seite. Klick auf die Versionsnummer = sofort prüfen.
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
- „Motiv – beste Qualität“ (BiRefNet, ca. 6,7 GB) weicht nur dann auf „Motiv – gut & sparsam“
  (BEN2, ca. 3 GB) aus, wenn trotz aller Freigaben nicht genug Speicher frei wird; reicht auch
  das nicht, auf „Motiv – präzise“ (IS-Net, ca. 0,75 GB). Ein Hinweis nennt das tatsächlich verwendete
  Modell. Die Kette steht in `SEG_FALLBACK` (src/renderer/app.js).

## KI-Modelle

| Mitgeliefert | Download bei Bedarf (geprüft per SHA-256) |
|---|---|
| U²-Net, Informative Drawings (anime), Real-ESRGAN, MobileSAM, UltraFace, YuNet, PaddleOCR-Detektor | Informative Drawings (contour, opensketch), U²-Net Portrait, TEED, MODNet, IS-Net, BiRefNet lite, BEN2 Base, SAM 2.1 Small, Depth Anything V2 Small, SCUNet, LaMa, RestoreFormer++; **nicht kommerziell:** Depth Anything V2 Base/Large, CodeFormer, BiSeNet Face Parsing |

- Mitgelieferte Modelle und die Standard-Auswahl sind für kommerzielle Nutzung lizenziert (MIT, Apache-2.0, BSD-3).
- Modelle mit nicht-kommerzieller Lizenz sind nur zusätzlich wählbar (nie Standard), werden nicht mitgeliefert,
  sondern bei Bedarf von der Quelle geladen, und sind in der Auswahl („· NC“ mit orangem Hinweis) und im
  Modell-Dialog (orange Lizenz) gekennzeichnet. In der Registry (`src/main/models.js`) tragen sie `nc: true`.
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
 │   └─ shape-fit.js                  „Formen begradigen“: Geraden/Bögen/Kreise/Ellipsen anpassen
 ├─ Utility-Prozess model-worker.js   KI-Inferenz (onnxruntime-node mit DirectML/CoreML oder CPU,
 │                                    sonst onnxruntime-web/WASM)
 ├─ models.js                         Modell-Registry, Downloads, Steuerung des KI-Prozesses
 ├─ result-cache.js                   Festplatten-Cache der KI-Ergebnisse (SHA-256 der Eingabe)
 ├─ prefs.js                          App-Vorlieben: GPU, Cache, auf der GPU gescheiterte Modelle
 ├─ resources.js                      RAM/CPU → Leistungsstufe und Grenzen
 ├─ updater.js                        Update-Prüfung (GitHub-Releases), Download, Installation je System
 └─ preload.js                        window.api (contextIsolation + sandbox)
Renderer (src/renderer/index.html, klassische <script>-Tags, globale Module)
 ├─ app.js            Oberfläche, Zustand, Ablauf eines Durchlaufs, Export, Historie
 ├─ processing.js     Bildverarbeitung (Anpassungen, Schwellwert, Dithering, Kanten, Umriss)
 ├─ segmentation.js   Masken, Freistellen nach Farbe, Himmel entfernen, Klickpunkte
 ├─ colors.js         Modus Farben: Farbreduktion, Garnpalette, Aufräumen, Ebenenmasken (nur im Worker)
 ├─ ai.js             Vor-/Nachbereitung aller KI-Modelle, ruft window.api.models.run
 ├─ restore.js        Altes Foto restaurieren
 ├─ encoders.js       SVG/PNG/JPG/BMP mit mm/DPI
 ├─ embroidery.js     Stickdateien: SVG-Pfade → Füllstich/Steppstich, PES-, DST- und EXP-Ausgabe, Stichvorschau
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
  `localStorage` (`pic2laser.settings`) gespeichert, UI-Zustand unter `pic2laser.ui`, ob die
  Einführungstour schon lief unter `pic2laser.tourSeen` (`tour.js`).
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
| `updates/` | geladenes Update bis zur Installation (beim nächsten Start gelöscht) |
| `prefs.json` | GPU an/aus, Cache an/aus, Modelle, die nur auf der CPU laufen, Zeit der letzten Update-Prüfung |
| `<temp>/pic2laser-drag/` | vorbereitete Dateien für Drag & Drop |
| `<temp>/pic2laser-lightburn/` | zuletzt an LightBurn gesendete Dateien (beim nächsten Senden und beim Beenden gelöscht) |

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
