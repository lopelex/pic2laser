/** Mitgelieferte Presets. */

// Mitgelieferte Vorlagen, gegliedert nach Art des Eingangsbilds
// (nur die Abweichungen von den Standardwerten; Ausgabegröße und Exportformate bleiben erhalten)
/** Gemeinsame Einstellungen der Stickerei-Vorlagen: Farbflächen auf Brother-Garne, PES-Export. */
export const EMB_LOGO = { mode: 'color', colorCount: 0, colorPalette: 'brother', colorSmoothMm: 0.3, colorSkipBg: true, workRes: 2000, alphaMax: 1.1, fmtPes: true };

export const BUILTIN_PRESETS = [
  // ---- Logos, Schrift & Grafik ----
  {
    group: 'Logos, Schrift & Grafik', name: 'Logo / Schrift (sauber)',
    desc: 'Für saubere Logos, Schriftzüge und Vektorgrafiken mit klaren Kanten.',
    settings: { mode: 'vector', threshold: 128, turdSize: 4, alphaMax: 1, optTolerance: 0.2, workRes: 2000 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Logo aus kleinem Bild / Screenshot',
    desc: 'Für kleine, verpixelte oder unscharfe Logos (z. B. aus dem Internet): KI-Vergrößerung glättet die Kanten.',
    settings: { mode: 'vector', upscale: true, blur: 0.5, threshold: 128, turdSize: 8, alphaMax: 1.1, optTolerance: 0.3, workRes: 2400 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Strichzeichnung mit Logo / Schrift',
    desc: 'Für Fotos mit Logo oder Schriftzug (z. B. Fahrzeuge, Schilder, Werbung): Motiv als Strichzeichnung, Schrift und Logos sauber gefüllt.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineRes: 1024, threshold: 150, textClean: true, textPad: 1.5, textBold: 0 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Fotogravur mit Logo / Schrift',
    desc: 'Für Fotos mit Logo oder Schriftzug: Motiv gerastert, Schrift und Logos scharf und gefüllt statt gepunktet.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 15, sharpen: 0.6, textClean: true, textPad: 1.5, textBold: 0 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Clipart / Comic',
    desc: 'Für Comics, Cliparts und Malvorlagen mit schwarzen Konturen – feine Linien bleiben erhalten.',
    settings: { mode: 'vector', threshold: 140, turdSize: 3, alphaMax: 0.9, optTolerance: 0.15, workRes: 2400 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Handschrift / Unterschrift (Scan)',
    desc: 'Für eingescannte oder fotografierte Handschrift auf Papier: hebt den Kontrast und entfernt Papierflecken.',
    settings: { mode: 'vector', contrast: 35, brightness: 10, blur: 0.5, threshold: 135, turdSize: 12, alphaMax: 1.2, optTolerance: 0.3, workRes: 2500 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Bleistift- / Tuschezeichnung (Scan)',
    desc: 'Für gescannte Zeichnungen und Skizzen: helle Striche werden kräftiger, Papierstruktur verschwindet.',
    settings: { mode: 'vector', contrast: 45, brightness: 15, gamma: 0.8, sharpen: 0.4, threshold: 160, turdSize: 6, workRes: 2500 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Schild / Piktogramm (exakte Formen)',
    desc: 'Für Schilder, Piktogramme und technische Grafiken: Kanten werden zu exakten Geraden, Kreisen und rechten Winkeln.',
    settings: { mode: 'vector', threshold: 128, turdSize: 8, alphaMax: 1, optTolerance: 0.2, workRes: 2400, shapeFit: true, shapeTolMm: 0.15, shapeSnap: true },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Pixeliges Logo / Icon glätten',
    desc: 'Für winzige Logos, Icons und Favicons mit sichtbaren Pixelstufen: KI vergrößert und rundet die Umrisse.',
    settings: { mode: 'vector', smoothContours: true, threshold: 128, turdSize: 8, alphaMax: 1.2, optTolerance: 0.3, workRes: 2400 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Stempel (Gummi, invertiert)',
    desc: 'Für Gummistempel: Der Hintergrund wird graviert, das Motiv bleibt erhaben. In LightBurn spiegeln!',
    settings: { mode: 'vector', invert: true, threshold: 128, turdSize: 10, alphaMax: 1, optTolerance: 0.2, workRes: 2400 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Fahrzeug / Maschine mit Schriftzug – Linien',
    desc: 'Für Autos, Traktoren und Maschinen: kräftige, ruhige Umrisse, Schriftzüge und Logos bleiben gefüllt.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'contour', lineRes: 1024, threshold: 150, lineClean: true, lineSmoothMm: 0.3, lineMinMm: 1.5, textClean: true, textPad: 1.5, shapeOrder: 'before' },
  },

  // ---- Porträts & Personen ----
  {
    group: 'Porträts & Personen', name: 'Porträt – Fotogravur',
    desc: 'Für Porträtfotos: Person freigestellt, Dithering mit feiner Kontur zwischen Person und Hintergrund.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 15, sharpen: 0.6, bgRemove: 'modnet', subjectLine: true, subjectLineMm: 0.25, faceBoost: true, faceStrength: 1, mouthStrength: 0.8, noseStrength: 0.5, chinStrength: 0.5, cheekStrength: 0.3 },
  },
  {
    group: 'Porträts & Personen', name: 'Porträt – Schablone (Stencil)',
    desc: 'Für Porträts als flächige Schwarz-Weiß-Grafik im Stencil-Stil, z. B. für Holzschilder.',
    settings: { mode: 'vector', bgRemove: 'modnet', contrast: 25, blur: 2, gamma: 1.25, threshold: 100, turdSize: 40, alphaMax: 1.2, optTolerance: 0.4, subjectLine: true, subjectLineMm: 0.4, faceBoost: true, faceStrength: 1, mouthStrength: 1, noseStrength: 0.6, chinStrength: 0.6, cheekStrength: 0.3 },
  },
  {
    group: 'Porträts & Personen', name: 'Porträt – Strichzeichnung',
    desc: 'Für Porträtfotos: KI zeichnet das Gesicht wie von Hand nach.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineRes: 832, threshold: 150, bgRemove: 'modnet', faceBoost: true, faceStrength: 1, mouthStrength: 0.8, noseStrength: 0, chinStrength: 0.4, cheekStrength: 0.3 },
  },
  {
    group: 'Porträts & Personen', name: 'Porträt – Tuschezeichnung',
    desc: 'Für Porträts mit großem, mittigem Gesicht: wie mit Tusche gezeichnet, Haare als dunkle Fläche.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'portrait', threshold: 150, bgRemove: 'modnet' },
  },
  {
    group: 'Porträts & Personen', name: 'Porträt – Bleistiftskizze',
    desc: 'Für Porträts als lockere, zarte Skizze mit wenigen Strichen.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'sketch', lineRes: 896, threshold: 170, bgRemove: 'modnet', faceBoost: true, faceStrength: 0.8, mouthStrength: 1, noseStrength: 0.6, chinStrength: 0.4, cheekStrength: 0 },
  },
  {
    group: 'Porträts & Personen', name: 'Altes Porträtfoto restaurieren',
    desc: 'Für alte, verrauschte oder zerkratzte Porträts: Rauschen und Kratzer entfernen, Gesichter per KI restaurieren, dann Fotogravur.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 15, sharpen: 0.3, restoreDenoise: true, restoreScratches: true, scratchSensitivity: 50, restoreFaces: true, faceRestoreStrength: 1, faceBoost: true, faceStrength: 0.8, mouthStrength: 0.8, noseStrength: 0.4, chinStrength: 0.4, cheekStrength: 0.2 },
  },
  {
    group: 'Porträts & Personen', name: 'Gruppenfoto / Person im Alltag',
    desc: 'Für Fotos mit mehreren Personen oder unruhigem Hintergrund: präzises Freistellen, Dithering.',
    settings: { mode: 'dither', ditherAlgo: 'floyd', dpi: 254, contrast: 15, sharpen: 0.5, bgRemove: 'isnet', subjectLine: true, subjectLineMm: 0.25, faceBoost: true, faceStrength: 1, mouthStrength: 0.8, noseStrength: 0.4, chinStrength: 0.4, cheekStrength: 0.2 },
  },

  // ---- Tiere ----
  {
    group: 'Tiere', name: 'Haustier – Fotogravur',
    desc: 'Für Hunde, Katzen & Co.: Fell bleibt detailreich, Hintergrund wird entfernt.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 20, sharpen: 0.8, bgRemove: 'birefnet', subjectLine: true, subjectLineMm: 0.25 },
  },
  {
    group: 'Tiere', name: 'Haustier – Schablone',
    desc: 'Für Haustierfotos als kontrastreiche Schwarz-Weiß-Grafik.',
    settings: { mode: 'vector', bgRemove: 'birefnet', contrast: 25, blur: 1, threshold: 105, turdSize: 20, alphaMax: 1.2, optTolerance: 0.4, subjectLine: true, subjectLineMm: 0.4 },
  },
  {
    group: 'Tiere', name: 'Haustier – Strichzeichnung',
    desc: 'Für Haustierfotos als Linienzeichnung, z. B. für Gedenktafeln.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineRes: 896, threshold: 145, bgRemove: 'birefnet' },
  },
  {
    group: 'Tiere', name: 'Silhouette (gefüllt)',
    desc: 'Für jedes Motiv: komplett schwarz gefüllte Silhouette ohne Innendetails.',
    settings: { mode: 'vector', bgRemove: 'birefnet', brightness: -100, threshold: 254, turdSize: 30, alphaMax: 1.2, optTolerance: 0.4 },
  },

  // ---- Fotos & Landschaft ----
  {
    group: 'Fotos & Landschaft', name: 'Foto allgemein – Dithering',
    desc: 'Für normale Fotos ohne Freistellen.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 15, sharpen: 0.6 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Landschaft / Architektur',
    desc: 'Für Landschafts- und Gebäudefotos mit vielen feinen Details.',
    settings: { mode: 'dither', ditherAlgo: 'stucki', dpi: 300, contrast: 20, sharpen: 0.9 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Landschaft als Linienzeichnung',
    desc: 'Für Landschaften, Gebäude und Skylines als feine Strichzeichnung.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineRes: 1024, threshold: 150 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Himmel entfernen – Fotogravur',
    desc: 'Für Fahrzeuge, Gebäude und Landschaften: Der Himmel wird nicht graviert, alles darunter bleibt vollständig erhalten. Das Motiv wird per KI (BEN2) geschützt.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, contrast: 15, sharpen: 0.6, bgRemove: 'skyai', bgTolerance: 20, maskSpeckPct: 0.2, subjectLine: true, subjectLineMm: 0.25 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Himmel entfernen – Strichzeichnung',
    desc: 'Für Fahrzeuge, Gebäude und Landschaften als Strichzeichnung ohne Himmel; Schriftzüge bleiben gefüllt.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineRes: 1024, threshold: 150, bgRemove: 'skyai', bgTolerance: 20, maskSpeckPct: 0.2, subjectLine: true, subjectLineMm: 0.3, textClean: true, textPad: 1.5 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Gebäude – gerade Linien',
    desc: 'Für Häuser, Kirchen und Brücken: ruhige Umrisse, Kanten werden zu exakten Geraden und Bögen.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'contour', lineRes: 1024, threshold: 150, lineClean: true, lineSmoothMm: 0.2, lineMinMm: 1.5, shapeFit: true, shapeTolMm: 0.2, shapeSnap: true },
  },
  {
    group: 'Fotos & Landschaft', name: 'Ausmalbild / Malvorlage',
    desc: 'Für Kinder-Ausmalbilder aus Fotos: Motiv freigestellt, wenige, geschlossene und gleichmäßig dicke Umrisse ohne Krümel.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'contour', lineRes: 640, threshold: 150, bgRemove: 'ben2', subjectLine: true, subjectLineMm: 0.4, lineClean: true, lineSmoothMm: 0.6, lineMinMm: 4, lineBoldMm: 0.2 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Dunkles / kontrastarmes Foto',
    desc: 'Für unterbelichtete, flaue oder alte Fotos: hellt auf und verstärkt den Kontrast.',
    settings: { mode: 'dither', ditherAlgo: 'floyd', dpi: 254, brightness: 15, contrast: 35, gamma: 1.3, sharpen: 0.5 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Altes / kleines Foto restaurieren',
    desc: 'Für alte Fotos ohne Personen im Vordergrund: Rauschen und Kratzer entfernen, KI-Vergrößerung, dann Dithering.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 254, upscale: true, contrast: 20, sharpen: 0.4, restoreDenoise: true, restoreScratches: true, scratchSensitivity: 50 },
  },

  // ---- Material ----
  {
    group: 'Material', name: 'Holz – Fotogravur',
    desc: 'Für Fotos auf Holz: Atkinson-Dithering wirkt auf Holz heller und sauberer.',
    settings: { mode: 'dither', ditherAlgo: 'atkinson', dpi: 254, contrast: 20, sharpen: 0.6, gamma: 1.1 },
  },
  {
    group: 'Material', name: 'Schiefer / Glas / eloxiertes Alu (invertiert)',
    desc: 'Für Materialien, auf denen die Gravur hell erscheint: Bild wird invertiert.',
    settings: { mode: 'dither', ditherAlgo: 'jarvis', dpi: 300, invert: true, contrast: 20, sharpen: 0.6 },
  },
  {
    group: 'Material', name: 'Leder – Gravur',
    desc: 'Für Leder: gröbere Auflösung und mehr Kontrast, damit nichts verbrennt.',
    settings: { mode: 'dither', ditherAlgo: 'floyd', dpi: 200, contrast: 25, gamma: 1.2, sharpen: 0.4 },
  },
  {
    group: 'Material', name: 'Acryl – Flächengravur',
    desc: 'Für Grafiken auf Acryl: klare Flächen als Vektor. Für Rückseitengravur in LightBurn spiegeln.',
    settings: { mode: 'vector', threshold: 128, turdSize: 6, alphaMax: 1, optTolerance: 0.2, workRes: 2000 },
  },

  // ---- Schneiden & Relief ----
  {
    group: 'Schneiden & Relief', name: 'Sticker mit Schnittkontur',
    desc: 'Motiv freigestellt plus rote Schnittlinie mit 3 mm Abstand.',
    settings: { mode: 'vector', bgRemove: 'ai', outline: true, outlineOffsetMm: 3, outlineCloseMm: 3 },
  },
  {
    group: 'Schneiden & Relief', name: 'Holzaufsteller / Figur ausschneiden',
    desc: 'Für Figuren aus Holz: Gravur plus Schnittlinie mit 5 mm Rand und geschlossenen Lücken.',
    settings: { mode: 'dither', ditherAlgo: 'atkinson', dpi: 254, contrast: 20, sharpen: 0.6, bgRemove: 'birefnet', subjectLine: true, subjectLineMm: 0.3, outline: true, outlineOffsetMm: 5, outlineCloseMm: 6 },
  },
  {
    group: 'Schneiden & Relief', name: 'Nur Schnittkontur',
    desc: 'Nur die Außenkontur des Motivs als Schnittlinie, ohne Gravur.',
    settings: { mode: 'vector', bgRemove: 'ai', outline: true, outlineOnly: true, outlineOffsetMm: 2, outlineCloseMm: 4 },
  },
  {
    group: 'Schneiden & Relief', name: 'Holz-Relief (3D)',
    desc: 'Für Objekte und Landschaften: Tiefenkarte für 3D-Reliefgravur.',
    settings: { mode: 'relief', depthRes: '770', dpi: 254, blur: 1, contrast: 10 },
  },
  {
    group: 'Schneiden & Relief', name: 'Porträt-Relief (3D)',
    desc: 'Für Porträts: Person freigestellt, glatte Tiefenkarte für Reliefgravur.',
    settings: { mode: 'relief', depthRes: '770', dpi: 254, blur: 1.5, contrast: 15, bgRemove: 'modnet' },
  },
  {
    group: 'Schneiden & Relief', name: 'Relief-Motiv freigestellt (PNG, transparent)',
    desc: 'Für Objekte und Figuren: nur das Motiv als Tiefenkarte, Hintergrund transparent – als PNG direkt in LightBurn.',
    settings: { mode: 'relief', depthRes: '770', dpi: 254, blur: 1, contrast: 10, bgRemove: 'ben2', reliefTransparent: true, fmtPng: true },
  },
  {
    group: 'Schneiden & Relief', name: 'Relief – maximale Details (nicht kommerziell)',
    desc: 'Plastischste Tiefe mit Depth Anything V2 Large und höchster Auflösung. Download ca. 1,3 GB, braucht ca. 3,5 GB RAM, ca. 30 s. Lizenz CC BY-NC 4.0 – nicht für verkaufte Gravuren.',
    settings: { mode: 'relief', depthModel: 'large', depthRes: '1022', dpi: 254, blur: 0.5, contrast: 10 },
  },
  // ---- Wellen (Sinuswellen-Linienkunst) ----
  // Getestet mit Porträt, Katze, Pavian, S/W-Foto, Kaffeetasse, Bergpanorama, Eiffelturm und Pferde-Silhouette.
  // Gamma > 1 hellt die Mitteltöne auf – sonst wirken sie fast so dicht wie Schwarz (jede Welle deckt Fläche).
  // Mit „Weiße Flächen auslassen“ senkt eine leicht negative Helligkeit die Lichter unter Reinweiß, damit nur der
  // freigestellte Hintergrund (immer 255) leer bleibt und keine Löcher im Motiv entstehen.
  {
    group: 'Porträts & Personen', name: 'Porträt – Wellenlinien',
    desc: 'Porträt als waagrechte Sinuswellen (Linienkunst): Person freigestellt, Hintergrund bleibt leer. Ab ca. 100 mm Breite, in LightBurn als Linie gravieren.',
    settings: { mode: 'sine', bgRemove: 'modnet', maskLargest: true, sineSkipWhite: true, sineSpacingMm: 1, sineAmplitude: 0.45, sineDensity: 2, brightness: -6, contrast: 10, gamma: 1.3, blur: 0.5, faceBoost: true, faceStrength: 0.8, mouthStrength: 0.5, noseStrength: 0.3, chinStrength: 0.3 },
  },
  {
    group: 'Porträts & Personen', name: 'Porträt – Wellen senkrecht (fein)',
    desc: 'Feinere, senkrechte Wellen – mehr Gesichtsdetails, aber längere Gravur. Am besten ab ca. 150 mm Breite.',
    settings: { mode: 'sine', bgRemove: 'modnet', maskLargest: true, sineSkipWhite: true, sineDirection: 'v', sineSpacingMm: 0.8, sineAmplitude: 0.5, sineDensity: 2.5, sineStrokeMm: 0.12, brightness: -8, contrast: 15, gamma: 1.4, blur: 0.4, faceBoost: true, faceStrength: 0.8, mouthStrength: 0.5, noseStrength: 0.3, chinStrength: 0.3 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Foto – Wellenlinien',
    desc: 'Ganzes Foto als waagrechte Sinuswellen – helle Flächen (Himmel) werden ruhige, fast gerade Linien. Liniengravur statt Punktraster.',
    settings: { mode: 'sine', sineSpacingMm: 1, sineAmplitude: 0.45, sineDensity: 1.6, contrast: 20, gamma: 1.8, blur: 0.5 },
  },
  {
    group: 'Fotos & Landschaft', name: 'Landschaft – Wellen, Himmel frei',
    desc: 'Für Berge, Gebäude und Landschaften: Himmel entfernt (Motiv per BEN2 geschützt, Download ca. 131 MB, ca. 3 GB RAM), das Motiv in ruhigen, breiten Wellen. Schnee und helle Flächen bleiben erhalten.',
    settings: { mode: 'sine', bgRemove: 'skyai', bgTolerance: 20, sineSkipWhite: true, sineSpacingMm: 1.4, sineAmplitude: 0.45, sineDensity: 1.4, brightness: -8, contrast: 10, gamma: 1.3, blur: 0.8 },
  },
  {
    group: 'Tiere', name: 'Haustier – Wellenlinien',
    desc: 'Tier freigestellt (BEN2, Download ca. 131 MB, ca. 3 GB RAM) in feinen Wellen – Augen, Nase und Fellzeichnung treten hervor, der Hintergrund bleibt leer.',
    settings: { mode: 'sine', bgRemove: 'ben2', maskLargest: true, sineSkipWhite: true, sineSpacingMm: 1, sineAmplitude: 0.42, sineDensity: 2, brightness: -10, contrast: 15, gamma: 2, sharpen: 0.4 },
  },
  {
    group: 'Logos, Schrift & Grafik', name: 'Silhouette / Logo – mit Wellen gefüllt',
    desc: 'Dunkle Flächen einer Grafik werden mit gleichmäßigen Wellen gefüllt, Weiß bleibt leer – Wellen-Effekt für Logos und Schattenrisse.',
    settings: { mode: 'sine', sineSkipWhite: true, sineSpacingMm: 1.2, sineAmplitude: 0.45, sineDensity: 1.2, contrast: 40, blur: 0.3 },
  },
  // ---- Farben (Farbflächen je Ebene) ----
  {
    group: 'Farben', use: 'both', name: 'Farbiges Logo – Farbflächen',
    desc: 'Erkennt die Farben eines Logos automatisch, je Farbe eine Ebene im SVG; weißer Hintergrund entfällt. Für LightBurn mit mehreren Ebenen oder als Vorlage fürs Sticken.',
    settings: { mode: 'color', colorCount: 0, workRes: 2000 },
  },
  {
    group: 'Farben', use: 'both', name: 'Comic / Illustration – 8 Farben',
    desc: 'Grafiken mit vielen Farben auf 8 Farbflächen reduziert, Rauschen leicht geglättet.',
    settings: { mode: 'color', colorCount: 8, blur: 0.4, colorSmoothMm: 0.25, colorMinAreaMm2: 1.5, workRes: 2000 },
  },
  {
    group: 'Farben', name: 'Foto als Farbposter – 6 Farben',
    desc: 'Foto stark vereinfacht zu 6 ruhigen Farbflächen (Poster-Effekt). Mit Freistellen bleibt nur das Motiv.',
    settings: { mode: 'color', colorCount: 6, colorSkipBg: false, blur: 1.5, colorSmoothMm: 0.5, colorMinAreaMm2: 4, turdSize: 10, alphaMax: 1.2, optTolerance: 0.4 },
  },
  // ---- Stickerei: Stickdatei (PES) mit Stoff, Motivbreite und Brother-Garnen ----
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Logo auf T-Shirt (Jersey)',
    desc: 'Brustlogo 90 mm breit für Strick/Jersey: lockerere Füllung, 0,35 mm Zugausgleich, kräftige Unterlage mit Kantenlauf, 0,4 mm Überlappung gegen Lücken durch Verziehen. Brother-Garne, PES-Export. Mit weichem Schnittvlies (Cut-away) sticken.',
    settings: { ...EMB_LOGO, embFabric: 'knit', widthMm: 90, colorOverlapMm: 0.4, colorMinAreaMm2: 2 },
  },
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Brustlogo auf Polo-Shirt (Piqué)',
    desc: 'Brustlogo 80 mm breit für Piqué: wie Jersey, kleinste Flächen 3 mm² (feine Details versinken in der Waffelstruktur). Brother-Garne, PES-Export.',
    settings: { ...EMB_LOGO, embFabric: 'pique', widthMm: 80, colorOverlapMm: 0.4, colorMinAreaMm2: 3 },
  },
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Logo auf Fleece / Sweatshirt',
    desc: 'Logo 100 mm breit für Fleece und Sweat (große Motive auf der Vorderseite bis etwa 240 mm): 0,40 mm Zugausgleich, kräftige Unterlage, kleinste Flächen 3 mm². Brother-Garne, PES-Export.',
    settings: { ...EMB_LOGO, embFabric: 'fleece', widthMm: 100, colorOverlapMm: 0.4, colorMinAreaMm2: 3 },
  },
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Handtuch (Frottee)',
    desc: 'Motiv 100 mm breit für Frottee: dichtere Füllung, kräftige Unterlage, kleinste Flächen 4 mm² und stärker geglättet – feine Details versinken in den Schlaufen. Wasserlösliche Folie obenauf legen. Brother-Garne, PES-Export.',
    settings: { ...EMB_LOGO, embFabric: 'pile', widthMm: 100, colorOverlapMm: 0.4, colorMinAreaMm2: 4, colorSmoothMm: 0.4 },
  },
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Jeans, Canvas, Tasche (Webware)',
    desc: 'Logo 100 mm breit für feste Webware (Baumwolle, Twill, Jeans, Canvas): Standarddichte 4,5 Linien/mm, 0,20 mm Zugausgleich, 0,3 mm Überlappung. Brother-Garne, PES-Export.',
    settings: { ...EMB_LOGO, embFabric: 'woven', widthMm: 100, colorOverlapMm: 0.3, colorMinAreaMm2: 2 },
  },
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Leder / Kunstleder (Patch)',
    desc: 'Motiv 70 mm breit für Leder: lockere Füllung und wenig Unterlage gegen Perforation, kleinste Flächen 3 mm², wenig Überlappung (Leder verzieht kaum). Spitze Nadel (70) verwenden. Brother-Garne, PES-Export.',
    settings: { ...EMB_LOGO, embFabric: 'leather', widthMm: 70, colorOverlapMm: 0.2, colorMinAreaMm2: 3 },
  },
  {
    group: 'Stickerei – nach Stoff', name: 'Stickerei – Schriftzug / Silhouette einfarbig',
    desc: 'Schwarze Fläche aus Logo, Schrift oder Schattenriss als einfarbige Stickdatei, 100 mm breit, für Webware. Die Garnfarbe wählt man an der Maschine; schmale Linien unter 1 mm werden als Kontur gestickt.',
    settings: { mode: 'vector', alphaMax: 1.1, turdSize: 10, widthMm: 100, fmtPes: true, embFabric: 'woven' },
  },

  // ---- Stickerei nach Stil: Linien, Tusche, Skizze, Fläche, Wellen, Farben ----
  // Setzen Breite und PES, lassen den gewählten Stoff stehen. Getestet mit Porträt, Ente, Landschaft und
  // Vereinslogo: Linien mit „Ruhige Linien“ und etwas verstärkt (0,6–0,9 mm breit, ruhiger Füllstich statt
  // Krümeln, wenige Sprünge), Wellen höchstens etwa 1 Welle/mm mit 1,4–1,8 mm Abstand (Steppstich folgt
  // der Welle noch), Farben auf Brother-Garne (gleiche Garne werden zusammengelegt – 16 ergibt oft 10–12).
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Linienzeichnung (Motiv freigestellt)',
    desc: 'Motiv aus einem Foto freigestellt (BEN2, Download ca. 131 MB) als ruhige, kräftige Umrisslinien, 100 mm breit – ca. 6.000–10.000 Stiche. Kurze Striche und Krümel werden entfernt, damit wenig Sprünge entstehen. PES-Export, Stoff bleibt.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'contour', lineRes: 768, threshold: 150, bgRemove: 'ben2', maskLargest: true, lineClean: true, lineSmoothMm: 0.4, lineMinMm: 3, lineBoldMm: 0.3, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Porträt als Linienzeichnung',
    desc: 'Porträt freigestellt als klare Umrisslinien wie gezeichnet, 100 mm breit, Gesichtszüge verstärkt. Wenige, ca. 0,9 mm breite Linien – gut für Kissen, Taschen und Shirts.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'contour', lineRes: 768, threshold: 150, bgRemove: 'modnet', maskLargest: true, lineClean: true, lineSmoothMm: 0.4, lineMinMm: 3, lineBoldMm: 0.3, faceBoost: true, faceStrength: 1, mouthStrength: 0.8, noseStrength: 0.4, chinStrength: 0.4, cheekStrength: 0, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Gebäude / Fahrzeug (gerade Linien)',
    desc: 'Häuser, Kirchen, Autos und Maschinen als Linienstickerei, 120 mm breit: Kanten werden zu exakten Geraden und Bögen, Schriftzüge bleiben gefüllt.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'contour', lineRes: 1024, threshold: 150, lineClean: true, lineSmoothMm: 0.3, lineMinMm: 4, lineBoldMm: 0.3, shapeFit: true, shapeTolMm: 0.2, shapeSnap: true, textClean: true, textPad: 1.5, shapeOrder: 'before', widthMm: 120, fmtPes: true },
  },
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Tusche-Porträt',
    desc: 'Porträt wie mit Tusche gezeichnet (U²-Net, Download 176 MB), Haare und dunkle Kleidung als gefüllte Fläche, 100 mm breit. Kräftiger Stil, ca. 20.000–25.000 Stiche – auf Webware oder mit Vlies sticken.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'portrait', threshold: 150, bgRemove: 'modnet', maskLargest: true, lineClean: true, lineSmoothMm: 0.4, lineMinMm: 2, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Tuschezeichnung / Comic (Scan)',
    desc: 'Gescannte oder fotografierte Tusche- und Comiczeichnung, 100 mm breit: Striche werden geschlossen und geglättet, Papierstruktur verschwindet. Haarfeine Striche (unter 0,35 mm) werden automatisch als Kontur gestickt.',
    settings: { mode: 'vector', contrast: 45, brightness: 15, gamma: 0.8, sharpen: 0.3, blur: 0.4, threshold: 150, turdSize: 12, alphaMax: 1.1, optTolerance: 0.3, workRes: 2400, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Bleistiftskizze Porträt',
    desc: 'Porträt als lockere, zarte Skizze mit wenigen Strichen, 100 mm breit – ca. 8.000 Stiche. Striche leicht verstärkt, damit der Faden deckt.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'sketch', lineRes: 768, threshold: 170, bgRemove: 'modnet', maskLargest: true, lineClean: true, lineSmoothMm: 0.3, lineMinMm: 2, lineBoldMm: 0.2, faceBoost: true, faceStrength: 0.8, mouthStrength: 1, noseStrength: 0.6, chinStrength: 0.4, cheekStrength: 0, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Linien, Tusche & Skizze', name: 'Stickerei – Skizze Tier / Motiv',
    desc: 'Haustier oder Gegenstand freigestellt (BEN2, Download ca. 131 MB) als leichte Bleistiftskizze, 100 mm breit.',
    settings: { mode: 'edges', edgeMethod: 'ai', lineStyle: 'sketch', lineRes: 832, threshold: 165, bgRemove: 'ben2', maskLargest: true, lineClean: true, lineSmoothMm: 0.3, lineMinMm: 2, lineBoldMm: 0.2, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Silhouette aus Foto (gefüllt)',
    desc: 'Motiv freigestellt (BEN2, Download ca. 131 MB) als komplett gefüllter Schattenriss ohne Innendetails, 90 mm breit – eine ruhige Füllstichfläche mit kaum Sprüngen, ideal für Tiere und Personen.',
    settings: { mode: 'vector', bgRemove: 'ben2', maskLargest: true, brightness: -100, threshold: 254, turdSize: 30, alphaMax: 1.2, optTolerance: 0.4, widthMm: 90, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Porträt als Schablone (Stencil)',
    desc: 'Porträt als flächige Schwarz-Weiß-Grafik (Stencil), 80 mm breit (passt hochkant in den 130 × 180-mm-Rahmen): große, zusammenhängende Flächen, kleine Inseln entfernt – einfarbig gestickt.',
    settings: { mode: 'vector', bgRemove: 'modnet', maskLargest: true, contrast: 25, blur: 2, gamma: 1.25, threshold: 100, turdSize: 60, alphaMax: 1.2, optTolerance: 0.4, faceBoost: true, faceStrength: 1, mouthStrength: 1, noseStrength: 0.6, chinStrength: 0.6, cheekStrength: 0.3, widthMm: 80, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Kleiner Schriftzug / Monogramm (Cap)',
    desc: 'Schrift, Initialen oder kleines Logo einfarbig, 55 mm breit – z. B. für Mützen, Ärmel und Handtuch-Monogramme. Kleine Flächen werden geglättet, haarfeine Stellen als Kontur gestickt.',
    settings: { mode: 'vector', threshold: 128, blur: 0.3, turdSize: 8, alphaMax: 1.1, optTolerance: 0.2, workRes: 2400, widthMm: 55, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Porträt in Wellen',
    desc: 'Porträt freigestellt als waagrechte Wellenlinien im Steppstich, 120 mm breit (Rahmen ab 130 × 180 mm), ca. 15.000–20.000 Stiche. Für kräftigere Linien unter „Je Farbe einstellen…“ den Dreifachstich wählen.',
    settings: { mode: 'sine', bgRemove: 'modnet', maskLargest: true, sineSkipWhite: true, sineSpacingMm: 1.4, sineAmplitude: 0.45, sineDensity: 1.2, brightness: -6, contrast: 15, gamma: 1.4, blur: 0.6, faceBoost: true, faceStrength: 0.8, mouthStrength: 0.5, noseStrength: 0.3, chinStrength: 0.3, widthMm: 120, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Haustier in Wellen',
    desc: 'Tier freigestellt (BEN2, Download ca. 131 MB) in Wellen mit 1,4 mm Abstand, 110 mm breit – Augen und Fellzeichnung bleiben erkennbar, der Hintergrund bleibt leer.',
    settings: { mode: 'sine', bgRemove: 'ben2', maskLargest: true, sineSkipWhite: true, sineSpacingMm: 1.4, sineAmplitude: 0.45, sineDensity: 1.2, brightness: -10, contrast: 15, gamma: 1.8, sharpen: 0.4, blur: 0.4, widthMm: 110, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Landschaft / Foto in Wellen',
    desc: 'Ganzes Foto als ruhige, breite Wellen mit 1,8 mm Abstand, 120 mm breit – wenige Stiche (ca. 5.000–8.000), helle Flächen werden fast gerade Linien.',
    settings: { mode: 'sine', sineSpacingMm: 1.8, sineAmplitude: 0.45, sineDensity: 1, contrast: 20, gamma: 1.6, blur: 1, widthMm: 120, fmtPes: true },
  },
  {
    group: 'Stickerei – Fläche & Wellen', name: 'Stickerei – Silhouette / Logo mit Wellen gefüllt',
    desc: 'Dunkle Flächen einer Grafik oder eines Schattenrisses werden mit gleichmäßigen Wellen gefüllt, Weiß bleibt leer, 100 mm breit – leichter Stickeffekt statt schwerer Füllung.',
    settings: { mode: 'sine', sineSkipWhite: true, sineSpacingMm: 1.5, sineAmplitude: 0.45, sineDensity: 1, contrast: 40, blur: 0.3, widthMm: 100, fmtPes: true },
  },
  {
    group: 'Stickerei – Farben (4–16)', name: 'Stickerei – 4 Farben (Logo / Wappen)',
    desc: 'Logo, Wappen oder Vereinsemblem auf höchstens 4 Brother-Garne reduziert, 90 mm breit – wenige Farbwechsel, kräftige Flächen. Weißer Hintergrund entfällt.',
    settings: { ...EMB_LOGO, colorCount: 4, blur: 0.4, colorMinAreaMm2: 2, colorOverlapMm: 0.3, widthMm: 90 },
  },
  {
    group: 'Stickerei – Farben (4–16)', name: 'Stickerei – 6 Farben (Comic / Clipart)',
    desc: 'Comic, Clipart oder Sticker-Motiv mit bis zu 6 Brother-Garnen, 100 mm breit. Leicht geglättet, Flächen unter 2 mm² gehen in der Nachbarfarbe auf.',
    settings: { ...EMB_LOGO, colorCount: 6, blur: 0.4, colorMinAreaMm2: 2, colorOverlapMm: 0.3, widthMm: 100 },
  },
  {
    group: 'Stickerei – Farben (4–16)', name: 'Stickerei – 8 Farben (Illustration)',
    desc: 'Illustration oder farbiges Motiv mit bis zu 8 Brother-Garnen, 100 mm breit, kleinste Flächen 3 mm² – guter Kompromiss aus Farbtreue und Farbwechseln.',
    settings: { ...EMB_LOGO, colorCount: 8, blur: 0.8, colorSmoothMm: 0.4, colorMinAreaMm2: 3, colorOverlapMm: 0.3, widthMm: 100 },
  },
  {
    group: 'Stickerei – Farben (4–16)', name: 'Stickerei – 10 Farben (Foto vereinfacht)',
    desc: 'Foto als Farbposter mit bis zu 10 Brother-Garnen, 90 mm breit, kräftig geglättet. Motiv freigestellt (BEN2, Download ca. 131 MB) – der Hintergrund wird nicht gestickt.',
    settings: { ...EMB_LOGO, colorCount: 10, colorSkipBg: false, bgRemove: 'ben2', maskLargest: true, blur: 1.2, colorSmoothMm: 0.5, colorMinAreaMm2: 4, colorOverlapMm: 0.3, turdSize: 10, alphaMax: 1.2, optTolerance: 0.4, widthMm: 90 },
  },
  {
    group: 'Stickerei – Farben (4–16)', name: 'Stickerei – 12 Farben (Foto / Landschaft)',
    desc: 'Foto oder Landschaft mit bis zu 12 Brother-Garnen, 110 mm breit – mehr Farbabstufungen, ca. 30.000–40.000 Stiche. Ähnliche Garne werden zusammengelegt, oft bleiben 8–10 Farben.',
    settings: { ...EMB_LOGO, colorCount: 12, colorSkipBg: false, blur: 1.2, colorSmoothMm: 0.5, colorMinAreaMm2: 4, colorOverlapMm: 0.3, turdSize: 10, alphaMax: 1.2, optTolerance: 0.4, widthMm: 110 },
  },
  {
    group: 'Stickerei – Farben (4–16)', name: 'Stickerei – 16 Farben (Porträt / Foto, maximal)',
    desc: 'Größte Farbtreue mit bis zu 16 Brother-Garnen für Porträts und Fotos, Motiv freigestellt (BEN2, Download ca. 131 MB), 100 mm breit. Ähnliche Garne werden zusammengelegt (oft 10–12 Farben); viele Farbwechsel und ca. 40.000–50.000 Stiche.',
    settings: { ...EMB_LOGO, colorCount: 16, colorSkipBg: false, bgRemove: 'ben2', maskLargest: true, blur: 1.5, colorSmoothMm: 0.5, colorMinAreaMm2: 4, colorOverlapMm: 0.3, turdSize: 10, alphaMax: 1.2, optTolerance: 0.4, widthMm: 100 },
  },
];
