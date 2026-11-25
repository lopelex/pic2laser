# Pic2Laser – Handbuch

Dieses Handbuch beschreibt alle Funktionen und Dialoge von Pic2Laser aus Sicht der Anwendung – getrennt
nach **Lasern** und **Sticken**. Technische Einzelheiten stehen in [FUNCTION.md](FUNCTION.md), Neuerungen in
den [Release Notes](RELEASENOTES.md).

**Inhalt**

1. [Überblick und Arbeitsablauf](#1-überblick-und-arbeitsablauf)
2. [Die Oberfläche](#2-die-oberfläche)
3. [Bild laden](#3-bild-laden)
4. [Lasern und Sticken umschalten – Presets](#4-lasern-und-sticken-umschalten--presets)
5. [Einstellungen für beide Bereiche](#5-einstellungen-für-beide-bereiche)
6. [Lasern](#6-lasern)
7. [Sticken](#7-sticken)
8. [Ergebnis weitergeben](#8-ergebnis-weitergeben)
9. [Historie und Vereinigen](#9-historie-und-vereinigen)
10. [Dialoge](#10-dialoge)
11. [Tastenkürzel und Maus](#11-tastenkürzel-und-maus)
12. [Tipps und Lösungen](#12-tipps-und-lösungen)

---

## 1. Überblick und Arbeitsablauf

Pic2Laser macht aus Fotos, Logos, Zeichnungen und Scans fertige Vorlagen

- **zum Lasern:** SVG-Vektoren und Rasterbilder (PNG, JPG, BMP) in der richtigen Größe in mm und mit DPI –
  direkt für LightBurn;
- **zum Sticken:** Stickdateien PES (Brother, Babylock, Bernette), DST (Tajima, fast jede Maschine) und
  EXP (Melco) samt Stichplanung, oder SVG-Ebenen für Stickprogramme.

Alle KI-Funktionen laufen **lokal und offline** – Bilder verlassen den Rechner nicht.

### Lasern oder Sticken – der Unterschied

|  | Lasern | Sticken |
|---|---|---|
| **Werkzeug** | Der Laser brennt Linien, Flächen oder Graustufen ins Material. | Die Stickmaschine näht das Motiv mit Garn auf Stoff. |
| **Modi** | alle sechs: Fläche, Linien, Foto, Wellen, Farben, Relief | Fläche, Linien, Wellen, Farben – Foto und Relief sind gesperrt (Graustufen und Punktraster lassen sich nicht sticken) |
| **Ergebnis** | SVG, PNG, JPG, BMP für LightBurn | PES, DST, EXP (+ INF) mit fertig geplanten Stichen, dazu SVG-Ebenen für Stickprogramme |
| **Feinheit** | sehr fein, bis zum Laserpunkt (ca. 0,1 mm); Fotos und Graustufen möglich | Details ab ca. 1 mm; feinere Linien und kleine Schrift gehen verloren |
| **Farben** | optional eine Ebene je Farbe (z. B. andere Leistung je Ebene) | jede Farbe ist ein Garnwechsel – möglichst wenige Farben, am besten auf Brother-Garne gerastet |
| **Größe** | Breite/Höhe gilt für das ganze Bild | Breite gilt nur für das gestickte Motiv ohne Rand und Hintergrund |
| **Wichtigste Einstellung** | Material, DPI, Gravurart in LightBurn | Stoff (Dichte, Stichlänge, Zugausgleich, Unterlage) |
| **Presets** | 51 Vorlagen nach Eingangsbild und Material | 29 Vorlagen nach Stoff, Stil und Farbanzahl |

Umgeschaltet wird oben in der Seitenleiste mit **Lasern | Sticken** (siehe [Abschnitt 4](#4-lasern-und-sticken-umschalten--presets)).

**Der Ablauf in fünf Schritten**

1. **Bild laden** – Drag & Drop, Datei-Dialog, Zwischenablage oder Kamera.
2. **Preset oder Modus wählen** – oben „Lasern“ oder „Sticken“, dann eine passende Vorlage oder direkt
   einen Modus (Fläche, Linien, Foto, Wellen, Farben, Relief).
3. **Feinschliff** – Freistellen, Bildanpassung, Gesichter, Schrift, Formen. Jede Änderung wird sofort
   neu berechnet.
4. **Größe und Formate** – Breite oder Höhe in mm, Exportformate ankreuzen.
5. **Weitergeben** – Exportieren, an LightBurn senden oder das Ergebnis mit der Maus herausziehen.

Beim ersten Start erklärt eine **Einführungstour** diesen Ablauf. Dieses Handbuch öffnet sich in der App über
**?** oben rechts oder mit **F1**; dort startet „Tour starten“ die Einführungstour erneut.

---

## 2. Die Oberfläche

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Pic2Laser v…  [Fortschritt]   Bild öffnen… Kamera… In Historie speichern    │
│                               An LightBurn  Exportieren  Historie  ?        │
├──────────────┬──────────────────────────────────────────┬──────────────────┤
│ Presets      │  Geteilt | Original | Ergebnis   − + Einp. │ Historie         │
│ (fest oben)  │                                           │ Suchen…          │
│──────────────│   Original            Ergebnis            │ Einträge …       │
│ Modus        │                                           │                  │
│ Freistellen  │                                           │                  │
│ …            │                                           │                  │
│ (scrollt)    │  Statuszeile: px, mm, DPI, Größe, Zeit    │                  │
└──────────────┴──────────────────────────────────────────┴──────────────────┘
```

### Kopfzeile

| Element | Funktion |
|---|---|
| **Versionsnummer** | Klick sucht sofort nach Updates. |
| **Update x.y.z** | erscheint, wenn eine neue Version vorliegt – öffnet den Update-Dialog. |
| **Fortschritt** | Balken mit Restzeit während Berechnungen und Downloads, daneben **Abbrechen** (Esc). |
| **Bild öffnen…** | Datei-Dialog (Strg/Cmd+O). |
| **Kamera…** | Kamera-Dialog (Strg/Cmd+K). |
| **In Historie speichern** | legt das aktuelle Ergebnis mit allen Einstellungen in der Historie ab, ohne zu exportieren (Strg/Cmd+S). |
| **An LightBurn** | fügt das Ergebnis ins offene LightBurn-Projekt ein (Strg/Cmd+L). |
| **Exportieren** | speichert alle gewählten Formate (Strg/Cmd+E). |
| **Historie** | blendet die Historie-Spalte ein und aus. |
| **?** | Hilfe: öffnet dieses Handbuch (wie F1); darin „Tour starten“ für die Einführungstour. |

### Seitenleiste (links)

Oben fest der Bereich **Presets**, darunter scrollen alle Einstellungen. Abschnitte, die zum gewählten
Modus nicht passen, sind ausgeblendet. Längere Erklärungen sind eingeklappt – das kleine **i** neben einer
Überschrift blendet sie ein (der Zustand wird gemerkt). **Doppelklick auf einen Regler** setzt ihn auf den
Standardwert zurück. Ein **⤓** hinter einer Auswahl bedeutet: Das KI-Modell wird beim ersten Gebrauch
geladen. **NC** kennzeichnet Modelle, die nur nicht-kommerziell genutzt werden dürfen.

### Vorschau (Mitte)

- **Geteilt | Original | Ergebnis:** beide Bilder nebeneinander oder eines groß.
- **Zoom:** Mausrad zoomt stufenlos (100–1600 %) auf die Mausposition; Trackpad: Pinch zoomt, zwei Finger
  verschieben. Knöpfe **−**, **+** und **Einpassen**.
- **Verschieben:** im Original mit gedrückter linker Maustaste, im Ergebnis mit der mittleren Maustaste.
  Beide Ansichten laufen synchron.
- **Statuszeile:** Pixelgröße, Endgröße in mm, DPI, Dateigröße des SVG und Rechenzeit.
- **Info im Ergebnisfeld:** welche Dateien beim Herausziehen mitkommen, Größe in mm, DPI.
- **Info im Originalfeld:** Größe und Bearbeitungsschritte des aufbereiteten Originals.
- Markierungen im Original: entfernter Hintergrund rot schraffiert mit Schnittlinie, Klickpunkte
  (Plus/Minus), erkannte Schrift blau.

### Historie (rechts)

Alle exportierten oder gespeicherten Umwandlungen – siehe [Abschnitt 9](#9-historie-und-vereinigen).

---

## 3. Bild laden

- **Drag & Drop** einer Bilddatei ins Fenster.
- **Bild öffnen…** bzw. Strg/Cmd+O, oder auf dem Startbildschirm „Datei auswählen“.
- **Einfügen** aus der Zwischenablage mit Strg/Cmd+V.
- **Kamera** (Strg/Cmd+K) – siehe [Kamera-Dialog](#kamera).
- Formate: PNG, JPG, WebP, BMP, GIF, AVIF, ICO, SVG.
- **SVG** wird ohne Skripte gerendert und auf 3000 px an der längeren Seite gerastert; Transparenz bleibt
  erhalten. Steht eine Breite in mm, cm oder Zoll in der Datei, wird sie als Ausgabebreite übernommen.
- Klickpunkte, Farb- und Stickänderungen gehören zum Bild und werden beim Laden eines neuen Bildes
  zurückgesetzt; alle übrigen Einstellungen bleiben.

---

## 4. Lasern und Sticken umschalten – Presets

Über der Preset-Liste wählt der Umschalter **Lasern | Sticken**, für welche Aufgabe die Vorlagen gezeigt
werden. Die App startet immer mit **Lasern**; „Sticken“ gilt bis zum Beenden.

| | Lasern | Sticken |
|---|---|---|
| Modi | alle sechs | Fläche, Linien, Wellen, Farben (Foto und Relief sind ausgegraut – sie liefern keine Stickdatei; steht der Modus auf Foto oder Relief, wechselt er auf Fläche) |
| Vorlagen | 51 Vorlagen, gegliedert nach Eingangsbild | 29 Vorlagen nach Stoff, Stil und Farbanzahl |
| Typische Formate | SVG, PNG, JPG, BMP | PES, DST, EXP (+ INF), SVG-Ebenen |

- **Preset wählen:** Auswahlliste – stellt alle Regler für die Aufgabe ein; jede Vorlage hat eine kurze
  Beschreibung. Die **Exportformate** bleiben dabei erhalten (Ausnahme: Stick-Vorlagen setzen PES).
- **Eigene Presets:** Namen eingeben, **Speichern**. Ein gleichnamiges Preset wird überschrieben.
  **Löschen** entfernt ein eigenes Preset. Eigene Presets erscheinen unter *Sticken*, wenn PES, DST oder EXP
  gewählt ist und der Modus eine Stickdatei liefert, sonst unter *Lasern*.
- **Einstellungen zurücksetzen:** alles auf Standard, die Exportformate bleiben.
- Nach Änderungen an einem gewählten Preset erscheint ein Hinweis darunter.

---

## 5. Einstellungen für beide Bereiche

Diese Abschnitte gelten beim Lasern wie beim Sticken (sofern der Modus sie anbietet).

### Modus

| Modus | Wofür | Ergebnis | Lasern | Sticken |
|---|---|---|---|---|
| **Fläche** | Logos, Schrift, Silhouetten, Grafiken | gefüllte Vektorflächen | ✓ | ✓ Füllstich |
| **Linien** | Strichzeichnungen, Porträts als Zeichnung | Linien als Vektorflächen | ✓ | ✓ Füllstich/Kontur |
| **Foto** | Fotogravur | Dithering-Rasterbild | ✓ | – |
| **Wellen** | Fotos und Porträts als Linienkunst | offene Sinuswellen-Linien | ✓ | ✓ Steppstich |
| **Farben** | farbige Logos, Grafiken, Stickvorlagen | je Farbe eine Ebene | ✓ | ✓ je Farbe ein Garn |
| **Relief** | 3D-Reliefgravur in Holz | Graustufen-Tiefenkarte | ✓ | – |

Unter den Modus-Knöpfen steht ein Hinweis, wofür der Modus gedacht ist und wie er in LightBurn graviert wird.

### Freistellen (Hintergrund entfernen)

**Methode:**

| Methode | Wann | Hinweis |
|---|---|---|
| Aus | Bild ohne störenden Hintergrund | – |
| Motiv – schnell (U²-Net) | einfache Motive vor ruhigem Hintergrund | mitgeliefert, ca. 1 s |
| Motiv – präzise (IS-Net) ⤓ | allgemeine Fotos | Download |
| Motiv – gut & sparsam (BEN2) ⤓ | saubere Fotos, wenig Speicher | ca. 3 GB RAM, schwächer bei alten/verrauschten Fotos |
| Motiv – beste Qualität (BiRefNet) ⤓ | schwierige Kanten | ca. 6,7 GB RAM, weicht sonst auf BEN2 bzw. IS-Net aus |
| Motiv – Porträt & Haare (MODNet) ⤓ | Personen | Download |
| Objekt anklicken – schnell (MobileSAM) | ein bestimmtes Objekt | Linksklick = Motiv, Rechtsklick/Alt+Klick = ausschließen |
| Objekt anklicken – genau (SAM 2.1) ⤓ | feine Grenzen, ähnliche Farben | ca. 180 MB, ca. 0,9 GB RAM |
| Himmel entfernen – schnell | Landschaft, Gebäude, Fahrzeuge | ohne KI, vom oberen Rand bis zum Horizont |
| Himmel entfernen – Motiv geschützt (BEN2) ⤓ | helle/bläuliche Motive vor Himmel | KI schützt das Hauptmotiv |
| Nach Farbe | einfarbiger Hintergrund | ohne KI, vom Rand aus + Klickpunkte |

**Weitere Optionen je nach Methode:**

- **Entfernten Hintergrund ausblenden** – Schachbrett statt roter Schraffur (nur Anzeige).
- **Maskenschwelle** (KI-Methoden) – höher = engere Maske, niedriger = mehr vom Motiv bleibt.
- **Farbtoleranz** (Nach Farbe, Himmel) – erlaubter Farbsprung; **Hintergrund vom Bildrand aus entfernen**.
- **Klickpunkte:** ins Original klicken, um weitere Bereiche zu entfernen (bzw. bei „Objekt anklicken“
  Motiv/Ausschluss zu markieren). Klick auf einen Punkt entfernt ihn. **Punkte zurücksetzen** löscht alle.
- **Maske verfeinern** (alle Methoden):
  - *Kante verschieben* (−3…+3 mm): Plus lässt einen Rand stehen, Minus schneidet Säume weg.
  - *Kante glätten* (0…3 mm): rundet Zacken ab.
  - *Flecken entfernen* (0…5 % der Bildfläche): lose Fehltreffer.
  - *Löcher füllen* (0…5 %): Lücken im Motiv; Hintergrund am Rand bleibt weg.
  - *Nur das größte Motiv behalten.*

### Altes Foto restaurieren

Häkchen **Altes Foto restaurieren**, dann:

- **Rauschen & Körnung entfernen** (SCUNet).
- **Kratzer & Staub entfernen** mit **Empfindlichkeit** und **Gesichtsschutz** *Geschätzt* (5 Gesichtspunkte)
  oder *Genau* (Face Parsing, NC) – Augen, Brauen, Nase und Mund werden nie aufgefüllt.
- **Gesichter restaurieren** – Modell *RestoreFormer++* oder *CodeFormer* (NC, mit Regler **Treue zum
  Original**), Regler **Stärke**.
- **Reihenfolge:** vor dem Freistellen oder danach (dann wird aus dem unbearbeiteten Original freigestellt).
- Darunter steht, was gemacht wurde; das Original zeigt das restaurierte Bild.

### KI-Verbesserung

- **KI-Vergrößerung 4× (Real-ESRGAN)** für kleine oder unscharfe Bilder.

### Bildanpassung

**Helligkeit, Kontrast, Gamma, Weichzeichnen, Schärfen, Invertieren.** Im Modus Farben wirken sie auf die
Farben (je Kanal).

### Linien (Modus Linien)

- **Verfahren:** *KI-Strichzeichnung* oder *Kantenerkennung (Canny)*.
- **Modell** (KI): *Feine Linien* (viele Details, Schraffur), *Kräftige Konturen* (dicke, geschlossene
  Umrisse), *Zarte Skizze* (wenige Bleistiftstriche), *Tusche-Porträt* (nur Gesichter, Haare als Fläche),
  *Feine Kanten* (TEED, zeichnet auch Maserung mit).
- **Detailgrad, Linienschwelle, Linien verstärken** (KI) bzw. **Empfindlichkeit, Linienstärke** in mm (Canny).

### Vektorisierung (Fläche, Linien, Farben)

- **Schwellwert** mit **Auto** (Otsu) – trennt Schwarz von Weiß.
- **Flecken entfernen, Ecken glätten, Kurven-Toleranz, Arbeitsauflösung.**

### Formen verbessern (Fläche, Linien, Farben)

- **Formen begradigen** mit **Toleranz** (mm) – Kanten werden zu exakten Geraden, Kreisbögen, Kreisen,
  Ellipsen; **Winkel einrasten** richtet auf 0°/45°/90° aus und macht rechte Winkel exakt.
- **Glatte Konturen (KI)** (Fläche) – runde, ruhige Umrisse statt Treppenstufen bei kleinen Vorlagen.
- **Ruhige Linien** (Linien) – Linien auf gleichmäßige Breite, **Linien glätten** und **Kurze Striche
  entfernen** (mm).
- **Reihenfolge zu „Schrift & Logos“** – Verbesserungen auch auf erkannte Schrift anwenden oder nicht.

### Schrift & Logos (Fläche, Linien, Foto)

- **Schrift erkennen und sauber darstellen** – Buchstaben scharf und gefüllt statt gerastert.
- **Erkennung** vor oder nach dem Freistellen, **Logos einbeziehen**, **Schriftstärke**.
- Erkannte Bereiche werden im Original blau markiert.

### Gesichter (alle außer Relief)

- **Gesichtszüge hervorheben** – Augen, Brauen und Gesicht kontrastreicher; im Modus Linien wird jedes
  Gesicht zusätzlich fein nachgezeichnet.
- **Reihenfolge** (vor/nach dem Freistellen), **Merkmale finden** *Geschätzt* oder *Genau* (Face Parsing, NC),
  eigene Regler für **Mund, Nase, Kinn, Wangen** (0 = aus).

### Motivkontur (alle außer Relief)

**Dünne Linie zwischen Motiv und Hintergrund** mit **Linienstärke** in mm – hilft, wo Motiv und Hintergrund
ineinander verschwimmen. Im Modus Farben als eigene schwarze Ebene, beim Sticken als Steppstich.

### Umrisslinie

**Randkontur um das Motiv zeichnen** mit **Abstand** (mm), **Lücken schließen** und **Nur Umrisslinie (ohne
Gravur)**. Im SVG als rote Linie (eigene Ebene in LightBurn, z. B. zum Ausschneiden), in Rasterbildern
schwarz, in Stickdateien als schwarzer Steppstich.

### Ausgabegröße

- **Breite (mm)** oder **Höhe (mm)** – das Seitenverhältnis bleibt erhalten.
- **Weiß als transparent (PNG/SVG).**
- Beim Sticken gilt die Breite für das **gestickte Motiv** ohne Rand und Hintergrund (siehe
  [Abschnitt 7](#7-sticken)).

### KI-Modelle und Leistung

Status der Modelle und des Rechners, Knöpfe **Verwalten…** und **Einstellungen…** – siehe
[Dialoge](#10-dialoge).

---

## 6. Lasern

### 6.1 Die Modi im Einzelnen

**Fläche** – Schwellwert und Vektorisierung zu gefüllten Pfaden. Für Logos, Schrift, Silhouetten, Stempel.
In LightBurn als **Füllung (Fill)** gravieren oder – mit Umrisslinie – ausschneiden.

**Linien** – KI-Strichzeichnung oder Kantenerkennung als Vektor. Für Porträts als Zeichnung, Ausmalbilder,
technische Motive. In LightBurn als **Füllung** (die Linien sind schmale Flächen).

**Foto** – Dithering für Fotogravur:

- **Verfahren:** Floyd-Steinberg, Atkinson, Jarvis-Judice-Ninke, Stucki, Ordered (Bayer 8×8), Nur Schwellwert.
- **Auflösung (DPI)** – passend zum Laser und Material wählen (Linienabstand = 25,4 / DPI mm).
- **Schwellwert.**
- Ergebnis ist ein Rasterbild (im SVG eingebettet); in LightBurn als **Bild** mit „Passthrough“ gravieren.

**Wellen** – Sinuswellen-Schattierung: dunkle Stellen = dichte Wellen.

- **Richtung** waagrecht/senkrecht, **Linienabstand** (mm), **Wellenhöhe** (% des Abstands, 100 % =
  Nachbarwellen berühren sich), **Wellendichte dunkel** und **hell** (Wellen je mm; hell 0 = gerade Linie),
  **Strichbreite** (Vorschau und Rasterexporte), **Auflösung (DPI)**.
- **Kontrast automatisch strecken**, **Weiße Flächen auslassen**.
- Das SVG enthält offene Linien – in LightBurn als **Linie (Line)** gravieren.

**Farben** – Farbreduktion, je Farbe eine Ebene:

- **Anzahl Farben** (2–16 oder **Auto**, höchstens 10), **Farbpalette** *Bildfarben* oder *Brother-Garne*,
  **Kanten glätten** (mm), **Kleinste Fläche** (mm²), **Überlappung** (mm), **Hintergrundfarbe weglassen**.
- **Ebenenliste** (unten → oben = Reihenfolge): Häkchen = ausgeben, Farbfeld = Farbe ändern,
  ⇢ = mit einer anderen Farbe zusammenführen, ↺ = Änderungen dieser Farbe zurücknehmen.
  **Farbänderungen zurücksetzen** nimmt alle zurück.
- LightBurn legt beim Import **je Farbe eine Ebene** an – ideal für mehrfarbige Gravur mit
  unterschiedlicher Leistung je Ebene oder für Farblaser/Druck.

**Relief** – KI-Tiefenkarte für 3D-Gravur in Holz (hell = erhaben, dunkel = tief):

- **Tiefenmodell** *Standard* (Small), *Fein* (Base, NC, 2–3× langsamer), *Sehr fein* (Large, NC, 7–9×
  langsamer, 2–3,6 GB RAM) – bei zu wenig Speicher automatisch das nächstkleinere.
- **Tiefen-Detail** Normal / Hoch / Sehr hoch, **Auflösung (DPI)**,
  **Weißen Hintergrund transparent (PNG/SVG)**.
- In LightBurn als **Graustufenbild** (3D-Slice bzw. Graustufen-Modus) gravieren.

### 6.2 Exportformate beim Lasern

| Format | Inhalt |
|---|---|
| **SVG** | Vektor in mm, ohne weißes Hintergrund-Rechteck; Größe wird in LightBurn übernommen. Farben: Ebenen je Farbe. Umrisslinie rot. |
| **PNG** | Rasterbild mit DPI, optional transparent. |
| **JPG** | Rasterbild mit DPI, weißer Hintergrund. |
| **BMP** | 1 Bit (Schwarz-Weiß), 8 Bit Graustufen beim Relief, 24 Bit im Modus Farben. |

Alle Dateien entstehen mit gleichem Namen im gewählten Ordner.

### 6.3 Laser-Presets (Auswahl)

Gegliedert nach Eingangsbild: **Logos, Schrift & Grafik** · **Porträts & Personen** · **Tiere** ·
**Fotos & Landschaft** · **Material** (Holz, Schiefer/Glas/Alu, Leder, Acryl) · **Schneiden & Relief** ·
**Farben**. Beispiele: Schilder/Piktogramme (Formen begradigen), pixelige Logos (Glatte Konturen),
Gummistempel (invertiert), Fahrzeuge mit Schriftzug, Gebäude mit geraden Linien, Ausmalbilder, Porträt als
Tuschezeichnung oder Bleistiftskizze, freigestelltes Relief als transparentes PNG, Himmel entfernen als
Fotogravur oder Strichzeichnung.

---

## 7. Sticken

### 7.1 So entsteht eine Stickdatei

1. Oben im Preset-Bereich auf **Sticken** umschalten.
2. Eine Vorlage wählen – nach **Stoff** (T-Shirt, Polo, Fleece, Handtuch, Jeans/Tasche, Leder-Patch),
   nach **Stil** (Linien/Tusche/Skizze, Fläche & Wellen) oder nach **Farbanzahl** (4–16 Farben). Die
   Vorlagen setzen Modus, Breite, PES und – bei den Stoff-Vorlagen – den Stoff.
3. Oder selbst: Modus **Fläche, Linien, Wellen** oder **Farben** wählen und unter **Exportformate**
   **PES**, **DST** und/oder **EXP** ankreuzen.
4. Im Abschnitt **Stickdatei** den **Stoff** wählen und die Werte prüfen, bei Bedarf **Je Farbe einstellen…**.
5. Mit **Stiche in der Vorschau zeigen** kontrollieren, dann **Exportieren** oder herausziehen.

### 7.2 Was die Modi beim Sticken liefern

| Modus | Stickerei |
|---|---|
| **Fläche** | jede Fläche als Füllstich (Tatami) mit Unterlage; haarfeine Teile als Kontur im Steppstich |
| **Linien** | Linien als schmale Füllstich-Flächen bzw. Kontur – mit „Ruhige Linien“ und „Linien verstärken“ entstehen gleichmäßige ca. 1 mm breite Linien mit wenigen Sprüngen |
| **Wellen** | jede Welle als Steppstich oder Dreifachstich; höchstens etwa 1 Welle/mm, sonst wird sie zum Zickzack |
| **Farben** | je Farbe ein Garn in der Reihenfolge der Ebenenliste (unten zuerst) |

### 7.3 Farben für die Stickerei vorbereiten

- **Farbpalette „Brother-Garne“:** jede Farbe rastet auf das nächste der 61 PES-Standardgarne ein; gleiche
  Garne werden zusammengeführt. Dann stimmt die Farbe in der PES-Datei genau.
- **Kleinste Fläche** 1–4 mm² – kleinere Inseln werden nicht als eigene Farbe gestickt.
- **Überlappung** 0,2–0,4 mm – untere Farben reichen unter die oberen, gegen Lücken durch Stoffverzug.
- **Hintergrundfarbe weglassen** – der Stoff bleibt sichtbar, Weiß im Motiv bleibt erhalten.
- In der **Ebenenliste** Farben abwählen, umfärben oder zusammenführen; die Reihenfolge der Liste ist die
  Stickreihenfolge.

### 7.4 Abschnitt „Stickdatei“

Erscheint, sobald PES, DST oder EXP gewählt ist.

- **Stoff:** Webware (Baumwolle, Twill, Jeans) · Strick/Jersey (T-Shirt) · Piqué (Polo) · Fleece/Sweat ·
  Frottee/Handtuch · Leder/Kunstleder. Bestimmt die Grundwerte der Automatik:

  | Stoff | Reihenabstand | Stichlänge | Zugausgleich | Unterlage |
  |---|---|---|---|---|
  | Webware | 0,22 mm | 4,0 mm | 0,20 mm | normal |
  | Strick/Jersey, Piqué | 0,25 mm | 4,0 mm | 0,35 mm | kräftig |
  | Fleece/Sweat | 0,26 mm | 4,0 mm | 0,40 mm | kräftig |
  | Frottee/Handtuch | 0,20 mm | 4,0 mm | 0,40 mm | kräftig (Topping empfohlen) |
  | Leder/Kunstleder | 0,33 mm | 4,5 mm | 0,10 mm | leicht (spitze Nadel) |

- **Faden schneiden ab** (mm): längere Sprünge werden vernäht und abgeschnitten, kürzere als Sprungstich.
- **Je Farbe einstellen…** öffnet den [Dialog „Stickparameter je Farbe“](#stickparameter-je-farbe); daneben
  steht, wie viele Farben von Hand eingestellt sind.
- **Stiche in der Vorschau zeigen:** das Ergebnisfeld zeigt die geplanten Stiche in Fadenfarbe.
- **Info:** Stichzahl, Farben, Fadenschnitte, Größe und passender Rahmen (100 × 100 oder 130 × 180 mm).

Diese Einstellungen ändern nur die Stickdatei (keine Neuberechnung des Bildes) und bleiben beim Wechsel
der Vorlage erhalten.

### 7.5 Was die Automatik macht

- **Stichwinkel** aus 30/45/60/120/135/150° – mit den wenigsten Sprüngen, möglichst quer zur Fläche darunter.
- **Unterlage** quer zum Deckstich; bei schmalen Flächen weniger (unter 1,5 mm keine).
- **Schmale Stellen** unter 0,35 mm werden als Kontur im Steppstich gestickt.
- **Wege** innerhalb einer Fläche werden unter dem späteren Deckstich mitgestickt; getrennte Flächen werden
  per Sprung erreicht, ab „Faden schneiden ab“ mit Vernähen und Fadenschnitt.
- Je Fläche erst Unterlage, dann Deckstich; Motiv in der Datei zentriert.

### 7.6 Größe beim Sticken

Die **Breite (mm)** gilt für das **gestickte Motiv** ohne Rand und Hintergrund – die Stiche werden genau auf
diese Breite gebracht (der Zugausgleich kann bis ca. 0,6 mm dazugeben). Die Höhe ergibt sich aus dem Motiv
und steht unter „Stickdatei“. SVG und Rasterbilder behalten die Bildbreite. Übliche Maße: Brustlogo
75–100 mm, Mütze ca. 55 mm, Sweatshirt-Front bis etwa 240 mm. Höchstens 400 mm.

### 7.7 Stickformate

| Format | Für | Farben |
|---|---|---|
| **PES** | Brother, Babylock, Bernette; PE-Design | nächstliegendes Brother-Garn je Farbe |
| **DST** | Tajima und fast jede Stickmaschine | keine – Garne an der Maschine in derselben Reihenfolge zuordnen |
| **EXP + INF** | Melco DesignShop (ab V12 mit Farben aus der INF) und Melco-Maschinen | Farben in der INF-Datei (beide im selben Ordner lassen) |
| **SVG** (Modus Farben) | Ink/Stitch, Hatch, Wilcom, Embrilliance StitchArtist | Ebenen je Farbe in Stickreihenfolge – Sticharten dort zuweisen |

**Hinweise:** Melco-Maschinen: für Fadenschnitte in DST „Jump Count For Trim“ auf 3 lassen. Schmale Linien
und kleine Schrift (unter ca. 1 mm) werden als Füllstich gestickt – dafür ist Satinstich im Stickprogramm
besser. Statt einer Datei erscheint ein Hinweis bei Foto/Relief, leerem Ergebnis oder Motiven über 400 mm.

### 7.8 Stick-Presets

- **Nach Stoff:** T-Shirt/Jersey (90 mm), Polo/Piqué (80 mm), Fleece/Sweatshirt (100 mm),
  Handtuch/Frottee (100 mm), Jeans/Canvas/Tasche (100 mm), Leder-Patch (70 mm), Schriftzug/Silhouette einfarbig.
- **Linien, Tusche & Skizze:** Linienzeichnung mit freigestelltem Motiv oder Porträt, Gebäude/Fahrzeug
  (120 mm), Tusche-Porträt, Tusche-/Comiczeichnung als Scan, Bleistiftskizze für Porträt und Tier.
- **Fläche & Wellen:** gefüllte Silhouette, Stencil-Porträt (80 mm, passt hochkant in 130 × 180),
  Schriftzug/Monogramm (55 mm), Wellen für Porträt, Haustier, Landschaft und Logo.
- **Farben:** 4 (Logo/Wappen), 6 (Comic/Clipart), 8 (Illustration), 10 (Foto vereinfacht), 12
  (Foto/Landschaft), 16 (Porträt/Foto) auf Brother-Garne; dazu „Farbiges Logo“ und „Comic / Illustration –
  8 Farben“ als SVG-Ebenen für Stickprogramme.

---

## 8. Ergebnis weitergeben

- **Exportieren** (Strg/Cmd+E): Speichern-Dialog im zuletzt benutzten Ordner; er nennt alle
  Formate, die entstehen (z. B. „SVG + PES + EXP + INF“). Geschrieben wird **alles oder nichts** – schlägt
  eine Datei fehl, bleiben vorhandene Dateien unverändert. Jeder Export landet in der Historie.
- **Herausziehen:** mit gedrückter Strg-Taste (Mac: Cmd) das Ergebnisbild in LightBurn, den Explorer/Finder oder ein Stickprogramm
  ziehen – es kommen alle gewählten Formate mit (auch PES/DST/EXP).
- **An LightBurn** (Strg/Cmd+L): fügt das Ergebnis in der Mitte der Arbeitsfläche des offenen
  LightBurn-Projekts ein (ohne Stickformate). LightBurn muss laufen; Meldungen, wenn es nicht erreichbar
  ist oder gerade ein Dialog offen ist.
- **Optimiertes Original herausziehen:** mit gedrückter Strg-Taste (Mac: Cmd) das Bild im Originalfeld
  ziehen – als PNG so, wie es in die Umwandlung geht (restauriert, vergrößert, freigestellt).
- **In Historie speichern** (Strg/Cmd+S): nur sichern, ohne Datei zu schreiben.

---

## 9. Historie und Vereinigen

- Jeder Eintrag enthält Original, Einstellungen, SVG, PNG und Vorschaubild.
- **Klick** öffnet den Eintrag mit allen Einstellungen; das gespeicherte Ergebnis erscheint sofort.
- **Suchen…** filtert die Liste. Je Eintrag: SVG erneut speichern, Speicherordner öffnen, duplizieren,
  löschen. **Leeren** löscht die ganze Historie.
- **Vereinigen (⊕):** legt einen Eintrag über das aktuelle Ergebnis, z. B. „Linien“ über „Foto“ desselben
  Bildes. Oben in der Seitenleiste erscheint **Vereinigt mit**:
  - **Oben liegt:** Historie-Eintrag oder aktuelles Ergebnis.
  - **Überblenden:** Deckkraft der oberen Ebene (Doppelklick = 100 %).
  - **Aufheben** löst die Vereinigung.
  - Zwei Vektor-Ergebnisse bei 0 % oder 100 % bleiben Vektor (auch als Stickdatei), sonst entsteht ein
    Rasterbild.

---

## 10. Dialoge

### Kamera

Öffnen über **Kamera…** oder Strg/Cmd+K.

- Live-Vorschau der Webcam; bei mehreren Kameras **Kamera auswählen** (die Wahl wird gemerkt).
- **Aufnehmen** (oder Leertaste) übernimmt das Bild in voller Auflösung verlustfrei als Original.
- Meldungen, wenn keine Kamera gefunden wurde, sie von einem anderen Programm belegt ist oder der Zugriff
  verweigert wurde (dann in den Datenschutz-Einstellungen des Systems für Pic2Laser erlauben).

### KI-Modelle

Öffnen über **KI-Modelle → Verwalten…**.

- Alle Modelle nach Gruppen (Freistellen, Linien, Restaurieren, Relief …) mit Größe, Lizenz und
  Speicherbedarf. ✓ = installiert.
- **Laden** bzw. **Entfernen** je Modell; Downloads laufen mit Fortschritt und lassen sich abbrechen.
- Modelle mit **NC** (orange) sind nur für nicht-kommerzielle Zwecke erlaubt.
- Unten: Arbeitsspeicher und Leistungsstufe dieses Rechners. Ein Warnhinweis erscheint, wenn ein Modell
  mehr Speicher braucht als frei ist.

### Leistung

Öffnen über **Leistung → Einstellungen…**.

- **Grafikkarte (GPU) für KI nutzen** – Windows DirectML, Mac CoreML, Linux WebGPU (experimentell,
  standardmäßig aus). Darunter, welche Modelle auf der GPU liefen; Modelle, die auf der GPU scheitern,
  rechnen automatisch auf der CPU.
- **KI-Ergebnisse auf der Festplatte zwischenspeichern** (max. 2 GB) – geöffnete Bilder und
  Historie-Einträge müssen nicht neu berechnet werden; **Cache leeren** löscht ihn.

### Stickparameter je Farbe

Öffnen über **Stickdatei → Je Farbe einstellen…**.

- **Links:** Stoff, Faden schneiden ab und die **Farben in Stickreihenfolge** – Häkchen = sticken,
  Kurzfassung und Stichzahl je Farbe, Markierung „von Hand“.
- **Mitte:** **Stichvorschau** – Mausrad = Zoom, Ziehen = Verschieben, Doppelklick oder **Einpassen** =
  ganzes Motiv; **Andere Farben abblenden** hebt die gewählte Farbe hervor. **Auf gewählte Farbe zoomen**
  zoomt beim Anklicken einer Farbe sanft auf deren Stiche (die Einstellung wird gemerkt) – praktisch bei
  kleinen Flächen wie Augen oder Schrift. Darunter Stichzahl und weitere Kennzahlen.
- **Rechts – gewählte Farbe:** Begründung der Automatik und alle Werte:
  - **Stichart:** Füllstich, Kontur als Steppstich, Kontur als Dreifachstich oder nicht sticken
    (Wellen: Steppstich/Dreifachstich mit **Längster/Kürzester Stich** und **Genauigkeit**),
  - **Stichwinkel, Reihenabstand** (auch als Linien/mm), **Stichlänge, Zugausgleich, Unterlage,
    Schmale Stellen als Kontur.**
  - **Automatik für diese Farbe** nimmt die Handänderungen zurück, **Auf alle Farben übertragen**
    kopiert sie. Doppelklick auf einen Regler = Automatikwert.
- **Unten:** **Alle Farben auf Automatik** und **Fertig**.
- Handänderungen gelten nur für dieses Bild und bleiben beim Umfärben erhalten.

### Update

Erscheint über **Update x.y.z** in der Kopfzeile oder nach Klick auf die Versionsnummer.

- Zeigt die Release-Notizen der neuen Version.
- **Aktualisieren** lädt die passende Datei (geprüft, abbrechbar); danach **Jetzt neu starten** oder
  beim nächsten Beenden installieren lassen. **Später** schließt den Dialog.
- **Download-Seite öffnen**, falls die automatische Installation nicht möglich ist.

### Speichern (Export)

Der Datei-Dialog des Systems. Eine bekannte Endung im Namen wird ersetzt, Punkte im Namen bleiben.

### Handbuch

Öffnen über **?** oben rechts, öffnen und schließen mit **F1**. Links das Inhaltsverzeichnis (der aktuelle Abschnitt ist hervorgehoben,
Klick springt dorthin), rechts der Text. **Im Handbuch suchen** markiert alle Treffer; Enter springt zum
nächsten, Umschalt+Enter zum vorigen, Strg/Cmd+F setzt den Cursor ins Suchfeld. **Tour starten** schließt das
Handbuch und startet die Einführungstour.

### Einführungstour

Läuft beim ersten Start; „Tour starten“ im Handbuch startet sie neu. 16 Schritte, das jeweilige Bedienelement wird
hervorgehoben. **Weiter/Zurück** oder Pfeiltasten, **Tour beenden**, × oder Esc bricht ab. Am Ende lädt
**Beispielbild laden** eine Beispiel-Plakette zum Ausprobieren.

---

## 11. Tastenkürzel und Maus

**Strg** gilt für Windows und Linux, **Cmd** (⌘) für macOS. Die Kürzel wirken im Hauptfenster; ist ein Dialog
offen, gelten dessen eigene Tasten (siehe unten).

### Datei und Weitergabe

| Kürzel | Funktion | Hinweis |
|---|---|---|
| **Strg/Cmd+O** | Bild öffnen | öffnet den Datei-Dialog, wie „Bild öffnen…“ |
| **Strg/Cmd+V** | Bild einfügen | übernimmt ein Bild aus der Zwischenablage (z. B. Bildschirmausschnitt, kopiertes Bild aus dem Browser) |
| **Strg/Cmd+K** | Kamera | öffnet den Kamera-Dialog |
| **Strg/Cmd+E** | Exportieren | speichert alle gewählten Formate; nur, wenn ein Ergebnis vorliegt |
| **Strg/Cmd+S** | In Historie speichern | sichert Ergebnis und Einstellungen in der Historie, ohne eine Datei zu schreiben; nur mit Ergebnis |
| **Strg/Cmd+L** | An LightBurn senden | fügt das Ergebnis ins offene LightBurn-Projekt ein; nur mit Ergebnis |

### Berechnung, Hilfe und Fenster

| Kürzel | Funktion | Hinweis |
|---|---|---|
| **Esc** | Abbrechen | stoppt laufende Berechnungen, KI und Downloads – das letzte Ergebnis bleibt. Ist ein Dialog offen, schließt Esc nur den Dialog; die Berechnung läuft weiter. |
| **F1** | Handbuch | öffnet und schließt dieses Handbuch (nicht, während die Tour oder ein anderer Dialog offen ist) |
| **Cmd+Q**, **Cmd+M**, **Ctrl+Cmd+F** | Beenden, Minimieren, Vollbild | nur macOS (Standardmenü); unter Windows und Linux gelten die Fenstertasten des Systems, z. B. Alt+F4 |

### Vorschau: Zoomen und Verschieben

| Eingabe | Funktion | Hinweis |
|---|---|---|
| **Mausrad** | Zoom | stufenlos 100–1600 %, auf die Mausposition; Original und Ergebnis zoomen gemeinsam |
| **Strg + Mausrad** | Zoom | auch für Mäuse mit fein rastendem Rad |
| **Pinch** (zwei Finger spreizen) | Zoom | Trackpad |
| **Zwei Finger wischen** | Verschieben | Trackpad |
| **Linke Maustaste ziehen** | Verschieben | im Original und im Ergebnis; erst ab einigen Pixeln Bewegung – ein einfacher Klick ins Original setzt weiterhin Klickpunkte |
| **Mittlere Maustaste ziehen** | Verschieben | im Original und im Ergebnis |
| Knöpfe **−**, **+**, **Einpassen** | Zoomstufen | nächste Stufe bzw. zurück auf 100 % |

### Vorschau: Klicken und Herausziehen

| Eingabe | Funktion | Hinweis |
|---|---|---|
| **Klick ins Original** | Klickpunkt setzen | Freistellen „Nach Farbe“ und „Himmel entfernen“: weitere Fläche entfernen; „Objekt anklicken“: Motiv markieren (+) |
| **Rechtsklick** oder **Alt+Klick** ins Original | Bereich ausschließen (−) | nur bei „Objekt anklicken“ (MobileSAM, SAM 2.1) |
| **Klick auf einen Klickpunkt** | Punkt entfernen | der Mauszeiger wird über einem Punkt zur Hand |
| **Strg/Cmd gedrückt halten + Ergebnis ziehen** | Dateien herausziehen | in LightBurn, Explorer/Finder oder ein Stickprogramm – mit allen gewählten Formaten |
| **Strg/Cmd gedrückt halten + Original ziehen** | Original herausziehen | aufbereitetes Original als PNG (restauriert, vergrößert, freigestellt) |

### Seitenleiste

| Eingabe | Funktion | Hinweis |
|---|---|---|
| **Doppelklick auf einen Regler** | Standardwert | setzt den Regler auf den Ausgangswert zurück |
| **Doppelklick auf „Überblenden“** | 100 % | beim Vereinigen mit einem Historie-Eintrag |
| **Enter** im Feld „Aktuelle Einstellungen speichern als…“ | Preset speichern | wie der Knopf „Speichern“ |
| **Klick auf i** neben einer Überschrift | Erklärungen ein-/ausblenden | der Zustand wird gemerkt |

### In Dialogen

| Dialog | Eingabe | Funktion |
|---|---|---|
| alle | **Esc**, **✕** oder Klick neben den Dialog | schließen |
| Kamera | **Leertaste** oder **Enter** | Foto aufnehmen |
| Stickparameter je Farbe | **Mausrad** | Stichvorschau zoomen (auf die Mausposition) |
| Stickparameter je Farbe | **Ziehen** mit der linken Maustaste | Stichvorschau verschieben |
| Stickparameter je Farbe | **Doppelklick** in die Vorschau | ganzes Motiv einpassen |
| Stickparameter je Farbe | **Klick auf eine Farbe** (mit „Auf gewählte Farbe zoomen“) | Vorschau zoomt auf diese Farbe |
| Stickparameter je Farbe | **Doppelklick auf einen Regler** | Wert dieser Farbe zurück auf Automatik |
| Handbuch | **Strg/Cmd+F** | ins Suchfeld springen |
| Handbuch | **Enter** / **Umschalt+Enter** im Suchfeld | nächster / voriger Treffer |
| Handbuch | **F1** | Handbuch schließen |
| Einführungstour | **→** / **←** | nächster / voriger Schritt |
| Einführungstour | **Enter** | „Weiter“ (der Knopf hat den Fokus) |
| Einführungstour | **Esc** | Tour beenden |

---

## 12. Tipps und Lösungen

- **Unsauberer Rand um das Motiv:** Maske verfeinern → *Kante verschieben* ins Minus, *Kante glätten* erhöhen.
- **Zackige Umrisse bei kleinen Logos:** *Glatte Konturen (KI)* oder *KI-Vergrößerung 4×*.
- **Schilder, Piktogramme, Technik:** *Formen begradigen* mit *Winkel einrasten*.
- **Gesicht wirkt flach:** *Gesichtszüge hervorheben*, ggf. *Merkmale finden: Genau*.
- **Zu viele Farben / Flecken beim Sticken:** weniger Farben, *Kleinste Fläche* erhöhen, vorher
  *Weichzeichnen*.
- **Lücken zwischen Stickfarben:** *Überlappung* auf 0,3–0,4 mm, Stoff richtig wählen.
- **Wellen sticken als Zickzack:** Wellendichte auf höchstens etwa 1 Welle/mm senken.
- **Wenig Arbeitsspeicher:** kleinere Modelle wählen; Pic2Laser weicht bei Bedarf selbst aus und sagt es.
- **Berechnung dauert zu lange:** Esc bricht ab, das letzte Ergebnis bleibt erhalten.
