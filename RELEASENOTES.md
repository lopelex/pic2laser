# Release Notes

Alle Änderungen an Pic2Laser, neueste Version zuerst. Ausführliche Beschreibung aller Funktionen:
[FUNCTION.md](FUNCTION.md), bekannte und behobene Fehler: [BUGS.md](BUGS.md).

---

## 1.8.1 – 22.11.2026

### Neu
- **Freistellen: „Himmel entfernen“** – neue Methode ohne KI: Der Himmel (blau, Wolken, Dunst) wird vom
  oberen Bildrand aus entfernt und nicht graviert. Sie folgt dem Farbverlauf bis zum Horizont und stoppt an
  harten Kanten – Landschaft, Fahrzeuge und Gebäude bleiben vollständig erhalten. Mit Farbtoleranz und
  Klickpunkten für Himmel zwischen Ästen oder hinter Scheiben.
- **2 neue Presets:** *Himmel entfernen – Fotogravur* und *Himmel entfernen – Strichzeichnung*
  (Schriftzüge bleiben gefüllt)

## 1.8.0 – 22.11.2026

### Neu
- **Zusätzliche KI-Modelle (nicht kommerziell, Download bei Bedarf)** – die bisherigen Modelle bleiben
  Standard, die neuen sind zusätzlich wählbar und mit „· NC“ bzw. orangem Lizenzhinweis gekennzeichnet:
  - **Relief – Tiefenmodell:** *Fein* (Depth Anything V2 Base) und *Sehr fein* (V2 Large) für plastischere
    Gesichter und feinere Details. Reicht der Arbeitsspeicher nicht, wird das nächstkleinere Modell genommen.
  - **Gesichter restaurieren – CodeFormer** mit Regler „Treue zum Original“.
  - **Face Parsing** findet Augen, Brauen, Nase und Lippen pixelgenau: für „Gesichtszüge hervorheben“
    (*Merkmale finden: Genau*) und als *Gesichtsschutz: Genau* beim Entfernen von Kratzern.
- **10 neue Presets:**
  - *Logos, Schrift & Grafik:* Schild / Piktogramm (exakte Formen), Pixeliges Logo / Icon glätten,
    Stempel (Gummi, invertiert), Fahrzeug / Maschine mit Schriftzug – Linien
  - *Porträts & Personen:* Porträt – Tuschezeichnung, Porträt – Bleistiftskizze
  - *Fotos & Landschaft:* Gebäude – gerade Linien, Ausmalbild / Malvorlage
  - *Schneiden & Relief:* Relief-Motiv freigestellt (PNG, transparent),
    Relief – maximale Details (nicht kommerziell)

### Verbessert
- **Gesichtszüge hervorheben (Fläche/Foto):** Die Verstärkung ist jetzt begrenzt. Bisher wurden
  deutliche Falten und Schatten – vor allem bei älteren Gesichtern – von mehreren Schritten
  (Gesicht, Mund, Nase, Kinn, Wangen) nacheinander verstärkt und zu schwarzen Flecken und Strichen
  um Mund und Kinn. Feine Konturen wie Lippen und Lidfalte werden weiter betont.
- **Preset „Porträt – Schablone (Stencil)“:** stärker weichgezeichnet, Gamma 1,25, Schwellwert 100
  und mehr Fleckenfilter – Gesichter mit Schatten werden nicht mehr halbseitig schwarz.
- **Preset „Porträt – Strichzeichnung“:** Nase nicht mehr extra nachgezeichnet (ergab einen
  schwarzen Fleck unter der Nase), Mund, Kinn und Wangen etwas zurückhaltender.

## 1.7.0 – 22.11.2026

### Neu
- **Formen verbessern** – neuer Abschnitt unter „Vektorisierung“:
  - **Formen begradigen** (Fläche und Linien): Kanten, die innerhalb einer Toleranz in mm gerade
    oder rund sind, werden zu exakten Geraden, Kreisbögen, Kreisen und Ellipsen; Ecken werden scharf.
    „Winkel einrasten“ richtet Kanten exakt auf 0°/45°/90° aus und macht fast rechte Winkel rechtwinklig.
    Feine, unregelmäßige Details bleiben unverändert. Das SVG wird dabei deutlich kleiner.
  - **Glatte Konturen (KI)** (Fläche): kleine Vorlagen werden per Real-ESRGAN vergrößert und die
    Treppenstufen vor dem Schwellwert verwischt – runde, ruhige Umrisse statt Zacken.
  - **Ruhige Linien** (Linien): Striche werden entlang ihrer Mitte geglättet und mit gleichmäßiger
    Breite neu gezeichnet; Krümel und kurze Ausläufer entfallen.
  - Zusammen mit **Schrift & Logos** wählbar, ob die Verbesserungen **vor oder nach der
    Schrift-/Logoerkennung** laufen: danach gelten sie auch für die erkannte Schrift, davor bleibt
    die Schrift so, wie die Schrifterkennung sie zeichnet.

## 1.6.1 – 22.11.2026

### Neu
- **Relief: weißen Hintergrund transparent machen.** Neue Option „Weißen Hintergrund transparent (PNG/SVG)“.
  Mit Freistellen gilt die Freistell-Maske, sonst wird reines Weiß am Bildrand transparent.
  Funktioniert auch beim Vereinigen von Historie-Einträgen. JPG und BMP bleiben weiß.

## 1.6.0 – 22.11.2026

### Neu
- **Historie-Einträge vereinigen:** ⊕ am Historie-Eintrag legt dessen Ergebnis über das aktuelle.
  - Reihenfolge wählbar (Historie-Eintrag oder aktuelles Ergebnis oben)
  - Regler „Überblenden“ für die Deckkraft der oberen Ebene
  - Bei 0 % und 100 % bleibt ein Vektor ein Vektor, dazwischen entsteht ein Punktmuster
    (bzw. Graustufen im Relief-Modus)
  - Die Vereinigung wird im Eintrag gespeichert und beim Öffnen wiederhergestellt

## 1.5.0 – 22.11.2026

### Neu
- **Freistellen mit SAM 2.1:** neue Methode „KI – Objekt anklicken, genau (SAM 2.1)“ neben MobileSAM
  (SAM 2.1 Hiera Small, Download ca. 180 MB).
- **Info-Texte einklappbar:** Lange Erklärungen in der Seitenleiste lassen sich je Abschnitt über ⓘ
  einblenden; Statusmeldungen bleiben immer sichtbar.
- **Dialog „KI-Modelle“:** alle Modelle nach Gruppen mit Größe, Lizenz und RAM-Bedarf; Laden und Entfernen
  an einer Stelle.
- **Dialog „Leistung“:** GPU-Beschleunigung und Festplatten-Cache in einem eigenen Fenster.

### Verbessert
- Esc schließt offene Dialoge, ohne laufende Berechnungen oder Downloads abzubrechen.

## 1.4.1 – 21.11.2026

Stabilitäts-Release nach einer vollständigen Code-Prüfung.

### Behoben
- Die App lässt sich nur noch einmal starten; ein zweiter Start holt das vorhandene Fenster nach vorn.
- Nach normalem Beenden erscheint beim nächsten Start kein falscher „GPU-Absturz“-Hinweis mehr.
- Einstellungen, Historie und Originale werden absturzsicher gespeichert.
- Export fragt nach, bevor vorhandene Begleitdateien (z. B. `foo.png`) ersetzt werden.
- Vektorisierung: In seltenen Fällen lagen Formen außerhalb des sichtbaren SVG-Bereichs.
- Abbrechen wirkt jetzt auch zwischen Kacheln (Vergrößern, Restaurieren, Gesichter).
- Downloads: Abbruch auch zwischen Teilen, Zeitüberwachung (60 s), kein Durcheinander bei parallelen Downloads.
- Zu wenig Speicher beim Laden eines Modells wechselt nicht mehr unbemerkt auf das langsamere WebAssembly.
- „Hintergrund ausblenden“ bricht die laufende Berechnung nicht mehr ab.
- Ein veralteter Durchlauf überschreibt nicht mehr Maske oder Cache eines neu geladenen Bildes.
- Export und Herausziehen nur, wenn das Ergebnis zu den aktuellen Einstellungen passt.
- DPI wird immer aus der tatsächlichen Pixelbreite berechnet; keine Endlosschleife bei 0 mm Breite.
- Transparenter Hintergrund bleibt mit „Invertieren“ weiß; Weichzeichnen ohne hellen Rand.

## 1.4.0 – 21.11.2026

### Neu
- **Strichzeichnungs-Modelle wählbar** (Modus Linien → KI-Strichzeichnung):
  - Feine Linien (mitgeliefert, wie bisher)
  - Kräftige Konturen und Zarte Skizze (je 9 MB)
  - Tusche-Porträt (U²-Net Portrait, 176 MB)
  - Feine Kanten (TEED, 0,3 MB)
- **Freistellen „gut & sparsam“** mit BEN2 (131 MB, ca. 3 GB RAM).
- **Maske verfeinern** für alle Freistell-Methoden: Kante verschieben, glätten, Flecken entfernen,
  Löcher füllen, nur größtes Motiv behalten.

### Verbessert
- „Gesichtszüge hervorheben“ zeichnet Gesichter mit dem gewählten Modell neu.
- Bei Speichermangel weicht „beste Qualität“ (BiRefNet) erst auf BEN2, dann auf IS-Net aus.
- Modell-Downloads auf feste Versionen festgelegt und per SHA-256 geprüft.

## 1.3.1 – 21.11.2026

### Verbessert
- Bei knappem Arbeitsspeicher werden vor einer KI-Berechnung erst alle anderen Modelle freigegeben und der
  KI-Prozess neu gestartet – erst danach erscheint „Zu wenig Arbeitsspeicher“.
- Speicherfehler oder vom System beendeter KI-Prozess: Die Berechnung wird einmal mit frischem Prozess wiederholt.
- „Beste Qualität“ weicht nur noch auf IS-Net aus, wenn trotz aller Freigaben nicht genug Speicher frei wird.

## 1.3.0 – 21.11.2026

### Neu
- **KI auf der Grafikkarte:** Windows (DirectML), Mac mit Apple-Chip (CoreML), Linux (WebGPU, experimentell,
  standardmäßig aus). Bei Fehlern automatisch zurück auf die CPU.
- **Absturzschutz:** Stürzt die GPU ab, wird auf der CPU wiederholt und das Modell künftig dort gerechnet.
- **KI-Cache auf der Festplatte** (max. 2 GB): Erneut geöffnete Bilder und Historie-Einträge erscheinen ohne
  Neuberechnung, auch nach einem Neustart.
- **Bereich „Leistung“:** GPU und Cache schalten, Cache leeren, GPU/CPU je Modell wählen.
- **Optimiertes Original herausziehen:** Strg/Cmd + Ziehen im Original liefert das restaurierte, vergrößerte
  bzw. freigestellte Bild als PNG.

### Verbessert
- KI-Vergrößerung und Entrauschen mit überlappenden Kacheln (keine sichtbaren Nähte).

## 1.2.0 – 21.11.2026

### Neu
- **Altes Foto restaurieren:** Hauptschalter und Reihenfolge wählbar – ganzes Bild oder erst freistellen,
  dann nur Gesichter und Kratzer im Motiv.
- Schrift- und Gesichtserkennung wahlweise nur im freigestellten Motiv.
- Historie-Einträge duplizieren.
- Versionsnummer in der Kopfzeile.

### Verbessert
- Vorschau: Entfernter Hintergrund wird abgeschwächt statt voll deckend dargestellt.
- macOS: Verfügbarer Speicher wird wie in der Aktivitätsanzeige berechnet – keine unnötigen Speicherwarnungen mehr.

## 1.1.4 – 20.11.2026

### Verbessert
- Deutlich schnellere Vektorisierung, Kantenerkennung und Dithering (Ergebnisse unverändert).
- Füllung und Umrisslinie werden parallel vektorisiert.
- Vektorisierungs- und KI-Prozess werden vorgestartet, auch nach einem Abbruch.
- KI-Vergrößerung (Real-ESRGAN) schneller pro Kachel.

## 1.1.3 – 20.11.2026

### Neu
- **Abbrechen-Knopf** im Fortschrittsfeld (und Esc): stoppt Bildverarbeitung, KI, Vektorisierung und
  Modell-Downloads; das letzte Ergebnis bleibt erhalten.
- **Umrisslinie auch in PNG/JPG/BMP** (schwarz, gleiche Größe und Lage wie im SVG), ebenso in der
  Historien-Vorschau und im Drag-Symbol.
- **Ergebnis-Info:** Formate beim Herausziehen, Größe in mm, DPI.

### Behoben
- Fortschrittsleiste blieb nach abgebrochenem Download hängen.
- Unnötige Meldung „Download fehlgeschlagen: cancelled“ nach dem Abbrechen.
- Abbrechen konnte eine direkt danach gestartete Berechnung oder Vektorisierung treffen.
- Abbrechen verwarf geladene KI-Modelle unnötig.
- Ergebnis-Info blieb nach dem Laden eines neuen Bildes stehen bzw. zeigte zuerst die Größe ohne Umrisslinie.

## 1.1.2 – 20.11.2026

### Neu
- **Ergebnis per Drag & Drop herausziehen** – z. B. direkt in LightBurn, Finder oder Explorer – als echte Dateien
  in den gewählten Exportformaten. Wird wie ein Export in der Historie gespeichert.
- **Zoom mit dem Mausrad** (100–1600 %) auf die Mausposition, beide Ansichten synchron; Trackpad: Pinch zoomt,
  zwei Finger verschieben. Verschieben durch Ziehen (im Ergebnis mit der mittleren Maustaste).

### Verbessert
- Klickpunkte beim Freistellen sind immer gleich groß und sofort sichtbar, unabhängig von Bildgröße und Zoom.

## 1.1.1 – 20.11.2026

### Neu
- **Anpassung an den Rechner:** Arbeitsspeicher wird je Plattform richtig ermittelt; Bildgröße, Kacheln,
  Modell-Budget und Threads passen sich automatisch an.
- **Freistell-Vorschau:** Entfernter Hintergrund rot schraffiert mit Schnittlinie, optional ausgeblendet.
- Klick auf einen vorhandenen Plus-/Minus-Punkt entfernt ihn wieder.

### Verbessert
- Vor jeder KI-Berechnung wird der freie Speicher geprüft – verständliche Meldung statt Absturz;
  BiRefNet weicht bei Speichermangel automatisch auf IS-Net aus.

## 1.1.0 – 20.11.2026

### Neu
- **KI-Funktionen:**
  - Freistellen mit IS-Net, BiRefNet, MODNet und Objekt anklicken (MobileSAM)
  - Modus Linien: KI-Strichzeichnung
  - Neuer Modus **Relief**: KI-Tiefenkarte als Graustufenbild für 3D-Reliefgravur
  - KI-Vergrößerung 4×
- **Altes Foto restaurieren:** Rauschen entfernen, Kratzer & Staub auffüllen, Gesichter restaurieren.
- **Gesichtszüge hervorheben:** Augen, Brauen, Nase, Mund, Kinn und Wangen gezielt betonen.
- **Schrift & Logos:** Schriftzüge und Logo-Elemente werden erkannt und scharf und gefüllt dargestellt.
- **Motivkontur:** dünne Linie zwischen Motiv und Hintergrund.
- **Presets:** mitgelieferte Vorlagen nach Motiv gruppiert und beschrieben, eigene Presets speichern und löschen.

### Verbessert
- Bildverarbeitung, Vektorisierung und KI laufen in eigenen Prozessen – die Oberfläche bleibt bedienbar.
- Fortschrittsanzeige mit Restzeit-Schätzung in der Kopfzeile.

## 1.0.0 – 20.11.2026

Erste Version.

- Bilder per Drag & Drop, Datei-Dialog oder Zwischenablage laden; Live-Vorschau mit Zoom
- Modi **Fläche** (Vektor), **Linien** (Kantenerkennung) und **Foto** (Dithering)
- Helligkeit, Kontrast, Gamma, Schwellwert (inkl. Auto/Otsu) und Vektorisierungs-Einstellungen
- Freistellen per KI (U²-Net) oder nach Farbe mit Klickpunkten
- Umrisslinie um das Motiv mit Abstand in mm (eigene LightBurn-Ebene)
- Export als SVG (mit mm-Maßen) sowie PNG/JPG/BMP mit DPI
- Historie der Umwandlungen mit Wiederherstellen der Einstellungen
- Installer für Windows (NSIS + portable) und macOS (Apple Silicon + Intel)
