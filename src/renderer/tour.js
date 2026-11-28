/*
 * Einführungstour: erklärt Funktionen und Arbeitsablauf Schritt für Schritt und hebt dabei das
 * jeweilige Bedienelement hervor. Läuft automatisch beim ersten Start (danach nie wieder) und lässt
 * sich jederzeit über „Tour starten“ im Handbuch (? in der Kopfzeile oder F1) neu starten. Abbrechen: ×, „Tour beenden“ oder Esc.
 *
 * Alle Illustrationen und das Beispielbild sind hier im Code selbst gezeichnet (SVG) – keine fremden
 * Bilder, keine Lizenzfragen. Sie stehen wie der übrige Code unter der Lizenz des Projekts.
 */
export const Tour = (() => {
  const SEEN_KEY = 'pic2laser.tourSeen';

  // Farben der App (styles.css) – SVG-Attribute können keine CSS-Variablen auswerten
  const C = {
    bg: '#16181d', panel: '#1e2128', panel2: '#262a33', border: '#3a404c',
    text: '#e6e8ec', muted: '#9aa1ad', accent: '#ff5a36', accent2: '#ff7a5c',
    wood: '#d9a66b', woodDark: '#b98549', burn: '#3a2314', ok: '#4ade80',
  };

  // Herz als gemeinsames Beispielmotiv (Mittelpunkt 0/0, ca. 40 × 36)
  const HEART = 'M0 -8 C-4 -18 -20 -18 -20 -4 C-20 8 -6 14 0 20 C6 14 20 8 20 -4 C20 -18 4 -18 0 -8Z';

  const svg = (body, h = 150) => `<svg viewBox="0 0 320 ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  const t = (x, y, s, { size = 11, fill = C.muted, anchor = 'middle', weight = 400 } = {}) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}" font-family="system-ui, sans-serif">${s}</text>`;
  const arrow = (x1, y, x2, color = C.accent) =>
    `<path d="M${x1} ${y}H${x2 - 6}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><path d="M${x2 - 9} ${y - 6}L${x2} ${y}L${x2 - 9} ${y + 6}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  const frame = (x, y, w, h, fill = C.panel2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${C.border}"/>`;
  const checker = (id) => `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#2c3039"/><rect width="6" height="6" fill="#353a45"/><rect x="6" y="6" width="6" height="6" fill="#353a45"/></pattern>`;

  const ART = {
    // Foto → Laservorlage → Gravur auf Holz
    welcome: svg(`
      <defs>
        <linearGradient id="tw-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa0e6"/><stop offset="1" stop-color="#bfe0ff"/></linearGradient>
        <linearGradient id="tw-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.wood}"/><stop offset="1" stop-color="${C.woodDark}"/></linearGradient>
      </defs>
      <g transform="translate(14 28)">
        <rect width="86" height="86" rx="8" fill="url(#tw-sky)"/>
        <circle cx="64" cy="24" r="10" fill="#ffd25a"/>
        <path d="M0 70 L26 38 L42 56 L56 42 L86 74 V78 a8 8 0 0 1 -8 8 H8 a8 8 0 0 1 -8 -8Z" fill="#4f8a4a"/>
        <path d="M26 38 L33 47 L28 45 L22 48Z" fill="#fff"/>
      </g>
      ${arrow(108, 71, 128)}
      <g transform="translate(136 28)">
        <rect width="86" height="86" rx="8" fill="#fff"/>
        <circle cx="64" cy="24" r="10" fill="#111"/>
        <path d="M0 70 L26 38 L42 56 L56 42 L86 74 V78 a8 8 0 0 1 -8 8 H8 a8 8 0 0 1 -8 -8Z" fill="#111"/>
      </g>
      ${arrow(230, 71, 250)}
      <g transform="translate(256 34)">
        <rect width="58" height="74" rx="6" fill="url(#tw-wood)"/>
        <path d="M6 12 q20 -4 46 0 M6 30 q24 4 46 0 M6 52 q20 -5 46 0" stroke="${C.woodDark}" stroke-width="1" fill="none" opacity=".7"/>
        <circle cx="43" cy="24" r="7" fill="${C.burn}"/>
        <path d="M4 58 L20 36 L30 48 L39 39 L54 58Z" fill="${C.burn}"/>
      </g>
      <path d="M285 6 V30" stroke="${C.accent}" stroke-width="2"/><rect x="276" y="0" width="18" height="8" rx="2" fill="${C.muted}"/>
      ${t(57, 136, 'Bild')} ${t(179, 136, 'Vorlage (SVG, PNG …)')} ${t(285, 136, 'Gravur')}
    `),

    // Bild ins Fenster ziehen, öffnen oder mit der Kamera aufnehmen
    load: svg(`
      ${frame(10, 10, 210, 130, C.panel)}
      <rect x="26" y="26" width="178" height="98" rx="8" fill="none" stroke="${C.accent}" stroke-width="2" stroke-dasharray="6 5"/>
      ${t(115, 84, '⤓', { size: 26, fill: C.accent })}
      ${t(115, 108, 'Bild hierher ziehen', { fill: C.text })}
      <g transform="translate(150 48) rotate(-8)">
        <rect width="38" height="46" rx="4" fill="#fff"/>
        <path d="M5 38 L15 24 L22 32 L27 27 L34 38Z" fill="#4f8a4a"/><circle cx="27" cy="14" r="5" fill="#ffd25a"/>
      </g>
      <path d="M186 96 l0 18 l5 -5 l4 9 l4 -2 l-4 -9 l7 0Z" fill="${C.text}" stroke="${C.bg}" stroke-width="1"/>
      <g transform="translate(240 34)">
        <rect width="66" height="44" rx="8" fill="${C.panel2}" stroke="${C.border}"/>
        <rect x="10" y="-6" width="18" height="8" rx="2" fill="${C.panel2}" stroke="${C.border}"/>
        <circle cx="33" cy="22" r="13" fill="${C.bg}" stroke="${C.muted}" stroke-width="2"/><circle cx="33" cy="22" r="6" fill="${C.accent}"/>
      </g>
      ${t(273, 98, 'Kamera', { fill: C.text })} ${t(273, 114, 'Strg/Cmd+K')}
      ${t(273, 134, 'Einfügen: Strg/Cmd+V')}
    `),

    // dasselbe Motiv in sechs Modi
    modes: svg(`
      <defs>
        <pattern id="tm-dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.3" fill="#111"/></pattern>
        <pattern id="tm-waves" width="12" height="6" patternUnits="userSpaceOnUse"><path d="M0 3 q3 -3 6 0 t6 0" stroke="#111" stroke-width="1.3" fill="none"/></pattern>
        <linearGradient id="tm-relief" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#333"/></linearGradient>
        <clipPath id="tm-left"><rect x="-30" y="-30" width="30" height="60"/></clipPath>
      </defs>
      ${[['Fläche', `<path d="${HEART}" fill="#111"/>`],
         ['Linien', `<path d="${HEART}" fill="none" stroke="#111" stroke-width="2"/><path d="M-10 -6 q4 -6 9 -2" stroke="#111" stroke-width="1.5" fill="none"/>`],
         ['Foto', `<path d="${HEART}" fill="url(#tm-dots)"/>`],
         ['Wellen', `<path d="${HEART}" fill="url(#tm-waves)"/>`],
         ['Farben', `<path d="${HEART}" fill="#e2483b"/><path d="${HEART}" fill="#f2b33d" clip-path="url(#tm-left)"/>`],
         ['Relief', `<path d="${HEART}" fill="url(#tm-relief)"/>`]]
        .map(([name, art], i) => {
          const x = 8 + (i % 3) * 104, y = i < 3 ? 4 : 78;
          return `<g transform="translate(${x} ${y})"><rect width="96" height="68" rx="8" fill="#fff"/><g transform="translate(48 30) scale(.95)">${art}</g></g>${t(x + 48, y + 64, name, { fill: '#333', size: 10, weight: 600 })}`;
        }).join('')}
    `, 150),

    // Farben: Bild in Farbebenen zerlegt, Ebenenliste
    colors: svg(`
      <defs><clipPath id="tco-l"><rect x="-30" y="-30" width="30" height="60"/></clipPath></defs>
      <g transform="translate(12 22)">
        <rect width="92" height="92" rx="8" fill="#fff"/>
        <circle cx="46" cy="46" r="38" fill="#2f6b8a"/>
        <g transform="translate(46 44) scale(1.3)"><path d="${HEART}" fill="#e2483b"/><path d="${HEART}" fill="#f2b33d" clip-path="url(#tco-l)"/></g>
      </g>
      ${arrow(110, 68, 132)}
      ${[['#2f6b8a', 'circle'], ['#e2483b', 'heart'], ['#f2b33d', 'half']].map(([col, kind], i) => `
        <g transform="translate(${140 + i * 10} ${22 + i * 14}) skewY(-6)">
          <rect width="76" height="64" rx="6" fill="${C.panel2}" stroke="${C.border}" opacity=".97"/>
          <g transform="translate(38 32) scale(${kind === 'circle' ? 1 : .8})">${kind === 'circle'
            ? `<circle r="27" fill="${col}"/>`
            : kind === 'heart' ? `<path d="${HEART}" fill="${col}"/>` : `<path d="${HEART}" fill="${col}" clip-path="url(#tco-l)"/>`}</g>
        </g>`).join('')}
      <g transform="translate(246 30)">
        ${[['#f2b33d', 'oben'], ['#e2483b', ''], ['#2f6b8a', 'unten']].map(([col, label], i) => `
          <g transform="translate(0 ${i * 26})">
            <rect width="66" height="20" rx="4" fill="${C.panel2}" stroke="${C.border}"/>
            <rect x="5" y="5" width="10" height="10" rx="2" fill="${C.accent}"/><path d="M7 10 l2 2 l4 -4" stroke="#fff" stroke-width="1.5" fill="none"/>
            <rect x="20" y="4" width="12" height="12" rx="2" fill="${col}"/>
            ${t(38, 14, label, { anchor: 'start', size: 9 })}
          </g>`).join('')}
        ${t(33, 96, 'Ebenen', { fill: C.text, size: 10.5 })}
      </g>
      ${t(58, 138, 'Bild')} ${t(186, 138, 'je Farbe eine Ebene')}
    `),

    // Sticken: Stickrahmen mit gesticktem Herz, Garnrolle, Stickdateien
    embroidery: svg(`
      <defs>
        <pattern id="te-satin" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#c83a5a"/><path d="M0 0 V4" stroke="#8f2440" stroke-width="1"/></pattern>
        <pattern id="te-fabric" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#ece6da"/><path d="M0 3 H6 M3 0 V6" stroke="#d9d1c2" stroke-width=".8"/></pattern>
      </defs>
      <g transform="translate(86 72)">
        <ellipse rx="66" ry="58" fill="url(#te-fabric)"/>
        <ellipse rx="66" ry="58" fill="none" stroke="${C.wood}" stroke-width="8"/>
        <ellipse rx="72" ry="64" fill="none" stroke="${C.woodDark}" stroke-width="3"/>
        <rect x="-6" y="-72" width="12" height="10" rx="2" fill="${C.muted}"/>
        <g transform="scale(1.8)"><path d="${HEART}" fill="url(#te-satin)" stroke="#8f2440" stroke-width=".8" stroke-dasharray="1.5 1"/></g>
      </g>
      <g transform="translate(176 30)">
        <rect x="0" y="0" width="30" height="6" rx="2" fill="${C.woodDark}"/><rect x="0" y="50" width="30" height="6" rx="2" fill="${C.woodDark}"/>
        <rect x="3" y="6" width="24" height="44" fill="#c83a5a"/>
        ${[12, 20, 28, 36, 44].map((y) => `<path d="M3 ${y} H27" stroke="#8f2440" stroke-width="1"/>`).join('')}
        <path d="M27 40 C40 46 34 70 16 84" stroke="#c83a5a" stroke-width="1.5" fill="none"/>
      </g>
      ${[['PES', '#c06bd6'], ['DST', '#5aa0e6'], ['EXP', '#4ab08a']].map(([ext, col], i) => `
        <g transform="translate(236 ${20 + i * 38})">
          <rect width="70" height="28" rx="6" fill="${C.panel2}" stroke="${C.border}"/>
          <rect x="6" y="6" width="30" height="16" rx="3" fill="${col}"/>${t(21, 18, ext, { size: 10, fill: '#fff', weight: 700 })}
          ${t(54, 18, i === 2 ? '+INF' : '', { size: 9 })}
        </g>`).join('')}
    `),

    // Lasern gegenüber Sticken: Laser brennt ins Holz, Maschine stickt mit Garn
    laserVsEmb: svg(`
      <defs>
        <linearGradient id="tv-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.wood}"/><stop offset="1" stop-color="${C.woodDark}"/></linearGradient>
        <pattern id="tv-dots" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="${C.burn}"/></pattern>
        <pattern id="tv-satin" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#c83a5a"/><path d="M0 0 V4" stroke="#8f2440" stroke-width="1"/></pattern>
        <pattern id="tv-fabric" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#ece6da"/><path d="M0 3 H6 M3 0 V6" stroke="#d9d1c2" stroke-width=".8"/></pattern>
      </defs>
      <g transform="translate(14 30)">
        <rect width="128" height="88" rx="6" fill="url(#tv-wood)"/>
        <path d="M6 22 q58 -6 116 0 M6 64 q58 6 116 0" stroke="${C.woodDark}" stroke-width="1" fill="none" opacity=".7"/>
        <g transform="translate(64 46) scale(1.45)"><path d="${HEART}" fill="url(#tv-dots)"/><path d="${HEART}" fill="none" stroke="${C.burn}" stroke-width="1.2"/></g>
        <rect x="55" y="-28" width="18" height="10" rx="2" fill="${C.muted}"/>
        <path d="M64 -18 V26" stroke="${C.accent}" stroke-width="2"/>
        <circle cx="64" cy="26" r="3" fill="${C.accent2}"/>
      </g>
      ${t(78, 138, 'Lasern', { fill: C.text, weight: 700 })}
      <path d="M160 18 V132" stroke="${C.border}" stroke-dasharray="4 4"/>
      <g transform="translate(240 74)">
        <ellipse rx="64" ry="48" fill="url(#tv-fabric)"/>
        <ellipse rx="64" ry="48" fill="none" stroke="${C.wood}" stroke-width="7"/>
        <ellipse rx="69" ry="53" fill="none" stroke="${C.woodDark}" stroke-width="2.5"/>
        <g transform="scale(1.45)"><path d="${HEART}" fill="url(#tv-satin)" stroke="#8f2440" stroke-width=".8" stroke-dasharray="1.5 1"/></g>
      </g>
      ${t(240, 138, 'Sticken', { fill: C.text, weight: 700 })}
    `),

    // Dialog „Stickparameter je Farbe“ als nummerierte Skizze (Aufbau wie der echte Dialog)
    embDialog: (() => {
      const teal = '#2f6b8a', badge = (x, y, n) => `<circle cx="${x}" cy="${y}" r="7" fill="${C.accent}" stroke="${C.bg}" stroke-width="1.5"/>${t(x, y + 3.5, n, { size: 9, fill: '#fff', weight: 700 })}`;
      const slider = (x, y, w, v, label, val) => `${t(x, y, label, { anchor: 'start', size: 5.5, fill: '#c9cdd5' })}${t(x + w, y, val, { anchor: 'end', size: 5.5, fill: C.text })}
        <rect x="${x}" y="${y + 3}" width="${w}" height="2" rx="1" fill="${C.border}"/><rect x="${x}" y="${y + 3}" width="${w * v}" height="2" rx="1" fill="${C.accent}"/><circle cx="${x + w * v}" cy="${y + 4}" r="2.4" fill="${C.accent2}"/>`;
      const row = (y, col, name, info, sel) => `<rect x="10" y="${y}" width="74" height="19" rx="3" fill="${C.panel2}" stroke="${sel ? C.accent : C.border}" stroke-width="${sel ? 1.2 : .6}"/>
        <rect x="14" y="${y + 4}" width="5" height="5" rx="1" fill="${C.accent}"/><rect x="22" y="${y + 4}" width="5" height="5" rx="1" fill="${col}" stroke="${C.border}" stroke-width=".4"/>
        ${t(30, y + 8.5, name, { anchor: 'start', size: 5.5, fill: C.text })}${t(14, y + 15.5, info, { anchor: 'start', size: 4.6 })}`;
      return svg(`
        <defs>
          ${checker('ted-check')}
          <pattern id="ted-satin" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="3" height="3" fill="${teal}"/><path d="M0 0 V3" stroke="#1f4e5f" stroke-width=".8"/></pattern>
          <clipPath id="ted-view"><rect x="90" y="24" width="138" height="120"/></clipPath>
        </defs>
        <rect x="1" y="1" width="318" height="172" rx="7" fill="${C.panel}" stroke="${C.border}"/>
        ${t(8, 13, 'Stickparameter je Farbe', { anchor: 'start', size: 7.5, fill: C.text, weight: 700 })}
        <path d="M1 20 H319" stroke="${C.border}" stroke-width=".6"/>

        <!-- links: Stoff, Schnitt, Farben -->
        ${t(10, 30, 'Stoff', { anchor: 'start', size: 5.5, fill: '#c9cdd5' })}
        <rect x="10" y="33" width="74" height="10" rx="2" fill="${C.bg}" stroke="${C.border}" stroke-width=".6"/>${t(13, 40, 'Webware', { anchor: 'start', size: 5.2, fill: C.text })}
        ${slider(10, 52, 74, .25, 'Faden schneiden ab', '3,0 mm')}
        ${t(10, 68, 'FARBEN (Stickreihenfolge)', { anchor: 'start', size: 4.8, weight: 700 })}
        ${row(72, '#f3ead8', '1 Weiß', 'Füllstich 45° · 5.586 Stiche', false)}
        ${row(94, teal, '2 Türkis', 'Füllstich 135° · 6.284 Stiche', true)}
        ${row(116, '#f2a93b', '3 Orange', 'Füllstich 45° · 547 Stiche', false)}

        <!-- Mitte: Stichvorschau -->
        <rect x="90" y="24" width="138" height="120" fill="url(#ted-check)"/>
        <g clip-path="url(#ted-view)">
          <circle cx="159" cy="86" r="50" fill="#e9e9e9" opacity=".75"/>
          <circle cx="182" cy="68" r="12" fill="#f2a93b" opacity=".35"/>
          <circle cx="159" cy="86" r="50" fill="none" stroke="url(#ted-satin)" stroke-width="9"/>
          <path d="M115 110 L141 74 L156 92 L170 76 L203 110Z" fill="url(#ted-satin)"/>
          <path d="M116 117 Q159 108 202 117 L198 124 Q159 116 120 124Z" fill="url(#ted-satin)"/>
        </g>
        <rect x="93" y="27" width="62" height="9" rx="2" fill="${C.bg}" opacity=".9"/>
        <rect x="95" y="29" width="5" height="5" rx="1" fill="${C.accent}"/>${t(102, 33.5, 'Andere Farben abblenden', { anchor: 'start', size: 4.6, fill: C.text })}
        ${t(93, 153, '12.417 Stiche · 3 Farben · 80 × 80 mm · Rahmen 100 × 100', { anchor: 'start', size: 4.8, fill: '#c9cdd5' })}

        <!-- rechts: gewählte Farbe -->
        <path d="M231 20 V160 M88 20 V160" stroke="${C.border}" stroke-width=".6"/>
        <rect x="236" y="25" width="6" height="6" rx="1" fill="${teal}"/>${t(245, 30.5, '2 Türkis', { anchor: 'start', size: 6, fill: C.text, weight: 700 })}
        <rect x="236" y="35" width="76" height="20" rx="2" fill="${C.panel2}"/>
        ${t(239, 41.5, 'Automatik:', { anchor: 'start', size: 4.8, weight: 700 })}
        <rect x="239" y="45" width="66" height="2" rx="1" fill="${C.muted}" opacity=".5"/><rect x="239" y="50" width="52" height="2" rx="1" fill="${C.muted}" opacity=".5"/>
        ${t(236, 62, 'Stichart', { anchor: 'start', size: 5.5, fill: '#c9cdd5' })}
        <rect x="236" y="64" width="76" height="9" rx="2" fill="${C.bg}" stroke="${C.border}" stroke-width=".6"/>${t(239, 70.5, 'Füllstich', { anchor: 'start', size: 5.2, fill: C.text })}
        ${slider(236, 81, 76, .75, 'Stichwinkel', '135°')}
        ${slider(236, 94, 76, .18, 'Reihenabstand', '0,22 mm')}
        ${slider(236, 107, 76, .4, 'Stichlänge', '4,0 mm')}
        ${slider(236, 120, 76, .35, 'Zugausgleich', '0,20 mm')}
        ${t(236, 134, 'Unterlage: Normal', { anchor: 'start', size: 5.2, fill: '#c9cdd5' })}
        <rect x="236" y="139" width="44" height="8" rx="2" fill="none" stroke="${C.border}" stroke-width=".6"/>${t(258, 144.5, 'Automatik', { size: 4.6 })}
        <rect x="283" y="139" width="29" height="8" rx="2" fill="none" stroke="${C.border}" stroke-width=".6"/>${t(297.5, 144.5, 'auf alle', { size: 4.6 })}

        <!-- unten -->
        <path d="M1 160 H319" stroke="${C.border}" stroke-width=".6"/>
        <rect x="8" y="163" width="66" height="8" rx="2" fill="${C.panel2}" stroke="${C.border}" stroke-width=".6"/>${t(41, 168.8, 'Alle Farben auf Automatik', { size: 4.6, fill: C.text })}
        <rect x="290" y="163" width="22" height="8" rx="2" fill="${C.accent}"/>${t(301, 168.8, 'Fertig', { size: 4.8, fill: '#fff', weight: 700 })}

        ${badge(80, 68, '1')} ${badge(220, 40, '2')} ${badge(306, 28, '3')} ${badge(82, 160, '4')}
      `, 174);
    })(),

    // Hintergrund entfernen
    cutout: svg(`
      <defs>
        ${checker('tc-check')}
        <pattern id="tc-busy" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#7fb07a"/><path d="M0 10 L10 0" stroke="#5e8f5a" stroke-width="3"/></pattern>
      </defs>
      <g transform="translate(16 15)">
        <rect width="120" height="110" rx="8" fill="url(#tc-busy)"/>
        <g transform="translate(60 52) scale(1.9)"><path d="${HEART}" fill="#c83a5a"/></g>
      </g>
      ${arrow(146, 70, 174)}
      <g transform="translate(184 15)">
        <rect width="120" height="110" rx="8" fill="url(#tc-check)"/>
        <g transform="translate(60 52) scale(1.9)"><path d="${HEART}" fill="#c83a5a" stroke="${C.accent}" stroke-width="1" stroke-dasharray="3 2"/></g>
      </g>
      ${t(76, 142, 'Foto mit Hintergrund')} ${t(244, 142, 'nur das Motiv')}
    `),

    // Regler, Doppelklick, ⓘ
    tune: svg(`
      ${frame(10, 10, 300, 130, C.panel)}
      ${[['Helligkeit', 0.55], ['Kontrast', 0.7], ['Schwellwert', 0.4]].map(([name, v], i) => {
        const y = 34 + i * 38;
        return `${t(26, y, name, { anchor: 'start', fill: C.text })}${t(204, y, `${Math.round(v * 100)}`, { anchor: 'end', fill: C.accent2 })}
          <rect x="26" y="${y + 9}" width="178" height="4" rx="2" fill="${C.border}"/>
          <rect x="26" y="${y + 9}" width="${178 * v}" height="4" rx="2" fill="${C.accent}"/>
          <circle cx="${26 + 178 * v}" cy="${y + 11}" r="7" fill="${C.text}"/>`;
      }).join('')}
      <path d="M${26 + 178 * 0.7 + 4} 92 l0 18 l5 -5 l4 9 l4 -2 l-4 -9 l7 0Z" fill="${C.text}" stroke="${C.bg}" stroke-width="1"/>
      <g transform="translate(222 30)">
        <rect width="76" height="52" rx="8" fill="${C.panel2}" stroke="${C.border}"/>
        ${t(38, 22, 'Doppelklick', { fill: C.text, size: 10.5 })}${t(38, 39, '= Standardwert', { size: 10.5 })}
      </g>
      <g transform="translate(222 94)">
        <circle cx="12" cy="12" r="9" fill="none" stroke="${C.muted}"/>${t(12, 16, 'i', { size: 11, fill: C.text, weight: 700 })}
        ${t(28, 10, 'Erklärungen', { anchor: 'start', size: 10.5, fill: C.text })}${t(28, 24, 'einblenden', { anchor: 'start', size: 10.5 })}
      </g>
    `),

    // Original und Ergebnis nebeneinander, Zoom
    preview: svg(`
      <defs>${checker('tp-check')}</defs>
      ${frame(10, 10, 300, 130, C.panel)}
      <rect x="20" y="20" width="136" height="110" rx="6" fill="#bfe0ff"/>
      <g transform="translate(88 72) scale(2)"><path d="${HEART}" fill="#c83a5a"/></g>
      <rect x="164" y="20" width="136" height="110" rx="6" fill="url(#tp-check)"/>
      <g transform="translate(232 72) scale(2)"><path d="${HEART}" fill="#111"/></g>
      ${t(30, 34, 'Original', { anchor: 'start', size: 10, fill: '#1e2128', weight: 600 })}
      ${t(174, 34, 'Ergebnis', { anchor: 'start', size: 10, fill: C.text, weight: 600 })}
      <g transform="translate(268 96)">
        <circle r="13" fill="${C.bg}" fill-opacity=".85" stroke="${C.accent}" stroke-width="2.5"/>
        <path d="M9 9 L20 20" stroke="${C.accent}" stroke-width="4" stroke-linecap="round"/>
        ${t(0, 4, '+', { size: 14, fill: C.text, weight: 700 })}
      </g>
    `),

    // Ausgabegröße in mm auf dem Werkstück
    size: svg(`
      <defs><linearGradient id="ts-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.wood}"/><stop offset="1" stop-color="${C.woodDark}"/></linearGradient></defs>
      <rect x="40" y="34" width="190" height="100" rx="6" fill="url(#ts-wood)"/>
      <g transform="translate(135 82) scale(2)"><path d="${HEART}" fill="${C.burn}"/></g>
      <path d="M95 22 H175" stroke="${C.text}" stroke-width="1.5"/><path d="M95 16 V28 M175 16 V28" stroke="${C.text}" stroke-width="1.5"/>
      ${t(135, 14, '80 mm', { fill: C.text, weight: 600 })}
      <path d="M242 58 V124" stroke="${C.text}" stroke-width="1.5"/><path d="M236 58 H248 M236 124 H248" stroke="${C.text}" stroke-width="1.5"/>
      ${t(254, 95, '72 mm', { anchor: 'start', fill: C.text, weight: 600 })}
      ${t(254, 112, 'automatisch', { anchor: 'start', size: 10 })}
    `),

    // Export, LightBurn, Ziehen
    export: svg(`
      ${[['SVG', C.accent], ['PNG', '#5aa0e6'], ['PES', '#c06bd6']].map(([ext, col], i) => `
        <g transform="translate(${14 + i * 54} ${24 + (i % 2) * 14})">
          <path d="M0 4 a4 4 0 0 1 4 -4 H30 L42 12 V60 a4 4 0 0 1 -4 4 H4 a4 4 0 0 1 -4 -4Z" fill="${C.panel2}" stroke="${C.border}"/>
          <path d="M30 0 V12 H42" fill="none" stroke="${C.border}"/>
          <rect x="4" y="38" width="34" height="16" rx="3" fill="${col}"/>${t(21, 50, ext, { size: 10, fill: '#fff', weight: 700 })}
        </g>`).join('')}
      ${arrow(184, 66, 212)}
      <g transform="translate(220 28)">
        <rect width="88" height="74" rx="8" fill="${C.panel2}" stroke="${C.border}"/>
        <rect x="8" y="10" width="72" height="44" rx="4" fill="${C.bg}"/>
        <path d="M44 16 V40" stroke="${C.accent}" stroke-width="2.5"/><rect x="36" y="12" width="16" height="8" rx="2" fill="${C.muted}"/>
        <path d="M24 46 H64" stroke="${C.accent2}" stroke-width="3" stroke-linecap="round"/>
        ${t(44, 68, 'LightBurn', { size: 10, fill: C.text })}
      </g>
      ${t(160, 122, 'Exportieren · An LightBurn · Strg/Cmd + Ziehen', { fill: C.text })}
      ${t(160, 140, 'Strg/Cmd+E   ·   Strg/Cmd+L   ·   Historie: Strg/Cmd+S')}
    `),

    // Historie
    history: svg(`
      ${frame(70, 6, 180, 138, C.panel)}
      ${[0, 1, 2].map((i) => `
        <g transform="translate(82 ${18 + i * 42})">
          <rect width="156" height="34" rx="6" fill="${i === 0 ? '#3a2a26' : C.panel2}" stroke="${i === 0 ? C.accent : C.border}"/>
          <rect x="6" y="5" width="24" height="24" rx="4" fill="#fff"/>
          <g transform="translate(18 17) scale(.45)"><path d="${HEART}" fill="#111"/></g>
          <rect x="38" y="9" width="${70 - i * 12}" height="6" rx="3" fill="${C.text}" opacity=".8"/>
          <rect x="38" y="20" width="${50 + i * 8}" height="5" rx="2.5" fill="${C.muted}" opacity=".6"/>
          ${t(144, 21, i === 0 ? '⊕' : '', { fill: C.accent2, size: 13 })}
        </g>`).join('')}
    `),

    // KI lokal und offline
    ai: svg(`
      <g transform="translate(60 26)">
        <rect width="96" height="96" rx="14" fill="${C.panel2}" stroke="${C.border}" stroke-width="2"/>
        ${[18, 38, 58, 78].map((p) => `<path d="M${p} -10 V0 M${p} 96 V106 M-10 ${p} H0 M96 ${p} H106" stroke="${C.muted}" stroke-width="3"/>`).join('')}
        <rect x="22" y="22" width="52" height="52" rx="8" fill="${C.bg}" stroke="${C.accent}" stroke-width="2"/>
        ${t(48, 54, 'KI', { size: 18, fill: C.accent2, weight: 700 })}
      </g>
      <g transform="translate(210 46)">
        <path d="M14 40 a16 16 0 0 1 4 -31 a22 22 0 0 1 42 6 a13 13 0 0 1 2 25Z" fill="none" stroke="${C.muted}" stroke-width="2.5"/>
        <path d="M6 52 L70 -4" stroke="${C.accent}" stroke-width="3" stroke-linecap="round"/>
        ${t(38, 76, 'läuft offline', { fill: C.text })}
      </g>
    `),

    // fertig
    done: svg(`
      <defs><linearGradient id="td-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.wood}"/><stop offset="1" stop-color="${C.woodDark}"/></linearGradient></defs>
      <rect x="90" y="22" width="140" height="106" rx="8" fill="url(#td-wood)"/>
      <path d="M98 44 q60 -6 124 0 M98 80 q64 6 124 0 M98 110 q60 -5 124 0" stroke="${C.woodDark}" stroke-width="1" fill="none" opacity=".7"/>
      <g transform="translate(160 76) scale(1.8)"><path d="${HEART}" fill="${C.burn}"/></g>
      <circle cx="236" cy="28" r="18" fill="${C.ok}"/><path d="M227 28 l6 6 l12 -12" stroke="#10301c" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    `),
  };

  // Beispielbild (selbst gezeichnet): Plakette mit Sonne, Bergen und Tanne – 80 mm breit
  const DEMO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="80mm" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#ffffff"/>
  <circle cx="200" cy="200" r="186" fill="#1f4e5f"/>
  <circle cx="200" cy="200" r="170" fill="#f3ead8"/>
  <circle cx="262" cy="140" r="42" fill="#f2a93b"/>
  <path d="M40 278 L140 150 L190 210 L240 160 L360 278Z" fill="#3f7d6e"/>
  <path d="M140 150 L163 180 L148 174 L132 186 L124 171Z M240 160 L262 188 L247 182 L232 192 L222 182Z" fill="#ffffff"/>
  <path d="M110 300 L140 238 L170 300Z M118 272 L140 222 L162 272Z" fill="#1f4e5f"/>
  <rect x="134" y="300" width="12" height="18" fill="#7a4a2a"/>
  <path d="M36 300 Q200 268 364 300 L340 330 Q200 300 60 330Z" fill="#2f6b8a"/>
  <path d="M90 340 Q200 316 310 340" stroke="#1f4e5f" stroke-width="10" fill="none" stroke-linecap="round"/>
</svg>`;

  const $ = (sel) => document.querySelector(sel);
  const groupByTitle = (title) => [...document.querySelectorAll('.settings .group > h3')]
    .find((h) => h.firstChild && h.firstChild.textContent.trim() === title)?.closest('.group') || null;
  const visible = (el) => !!el && el.getClientRects().length > 0;

  /*
   * Schritte: target = Funktion, die das hervorzuhebende Element (oder eine Liste) liefert;
   * ohne target erscheint die Karte mittig.
   */
  const STEPS = [
    {
      title: 'Willkommen bei Pic2Laser',
      art: ART.welcome,
      html: `<p>Pic2Laser macht aus Bildern Vorlagen für den Laser (LightBurn) und für Stickmaschinen – in der
        richtigen Größe in mm. Die Tour zeigt dir in einer Minute den Ablauf:</p>
        <ol class="tour-flow"><li>Bild laden</li><li>Modus wählen</li><li>Feinschliff</li><li>Größe festlegen</li><li>Exportieren</li></ol>`,
    },
    {
      title: '1 · Bild laden',
      art: ART.load,
      target: () => [$('#btn-open'), $('#btn-camera'), visible($('#dropzone')) ? $('#dropzone .dropzone-inner') : null],
      html: `<p>Ziehe ein Bild einfach ins Fenster, öffne es über <b>Bild öffnen…</b> (Strg/Cmd+O), füge es aus der
        Zwischenablage ein oder nimm es mit der <b>Kamera</b> auf. PNG, JPG, WebP, BMP, GIF, SVG und mehr werden gelesen.</p>`,
    },
    {
      title: 'Lasern oder Sticken?',
      art: ART.laserVsEmb,
      target: () => $('#preset-tab'),
      html: `<p>Pic2Laser kann zwei Dinge – wähle hier, wofür du arbeitest. Der Umschalter zeigt die passenden
        Vorlagen und sperrt Modi, die dafür nicht taugen.</p>
        <table class="tour-compare">
          <thead><tr><th></th><th>Lasern</th><th>Sticken</th></tr></thead>
          <tbody>
            <tr><th>Werkzeug</th><td>Laser brennt ins Material</td><td>Maschine näht mit Garn</td></tr>
            <tr><th>Modi</th><td>alle sechs, auch Foto und Relief</td><td>Fläche, Linien, Wellen, Farben</td></tr>
            <tr><th>Dateien</th><td>SVG, PNG, JPG, BMP für LightBurn</td><td>PES, DST, EXP mit fertigen Stichen</td></tr>
            <tr><th>Details</th><td>sehr fein, Graustufen möglich</td><td>ab ca. 1 mm, keine Graustufen</td></tr>
            <tr><th>Farben</th><td>eine Ebene je Farbe (optional)</td><td>je Farbe ein Garnwechsel – wenige wählen</td></tr>
            <tr><th>Breite</th><td>ganzes Bild</td><td>nur das gestickte Motiv</td></tr>
            <tr><th>Wichtig</th><td>Material und DPI</td><td>Stoff (Dichte, Zugausgleich)</td></tr>
          </tbody>
        </table>`,
    },
    {
      title: 'Presets – der schnelle Start',
      target: () => $('.presets-group'),
      html: `<p>Presets stellen alle Regler für typische Aufgaben auf einmal ein – die Liste zeigt die Vorlagen für
        den gewählten Bereich (<b>Lasern</b> oder <b>Sticken</b>). Die Icon-Knöpfe rechts daneben:
        <b>Preset speichern</b> (Diskette) legt eigene Einstellungen unter einem Namen ab, der <b>Papierkorb</b>
        löscht ein eigenes Preset, <b>Zurücksetzen</b>
        (Pfeil) bringt alles auf den Standard, <b>⇕</b> klappt alle Bereiche auf oder zu.</p>`,
    },
    {
      title: '2 · Modus wählen',
      art: ART.modes,
      target: () => $('#mode'),
      html: `<p>Der Modus bestimmt, was aus dem Bild wird:</p>
        <ul class="tour-list">
          <li><b>Fläche</b> – Logos, Schrift, Silhouetten als gefüllte Vektoren</li>
          <li><b>Linien</b> – Strichzeichnung per KI oder Kantenerkennung</li>
          <li><b>Foto</b> – Fotogravur mit Dithering</li>
          <li><b>Wellen</b> – Porträts als Sinuswellen-Linien</li>
          <li><b>Farben</b> – je Farbe eine Ebene, z. B. für Stickerei</li>
          <li><b>Relief</b> – Tiefenkarte für 3D-Gravur in Holz</li>
        </ul>`,
    },
    {
      title: 'Modus Farben',
      art: ART.colors,
      target: () => (visible(groupByTitle('Farben')) ? groupByTitle('Farben') : $('#mode [data-value="color"]')),
      html: `<p><b>Farben</b> zerlegt das Bild in wenige Farbflächen – je Farbe eine eigene Ebene im SVG, die größte
        Fläche liegt unten. Ideal für farbige Logos, mehrfarbige Gravur und als Vorlage zum Sticken.</p>
        <ul class="tour-list">
          <li><b>Anzahl Farben</b> fest oder <b>Auto</b>, Palette aus dem Bild oder <b>Brother-Garne</b></li>
          <li><b>Kleinste Fläche</b>, <b>Kanten glätten</b> und <b>Überlappung</b> gegen Lücken</li>
          <li><b>Ebenenliste</b>: Häkchen = ausgeben, Farbfeld = Farbe ändern, ⇢ = zusammenführen</li>
        </ul>`,
    },
    {
      title: 'Freistellen',
      art: ART.cutout,
      target: () => groupByTitle('Freistellen'),
      html: `<p>Entfernt den Hintergrund – automatisch per KI, durch Anklicken des Objekts, nach Farbe oder speziell
        den Himmel. Der entfernte Bereich wird in der Vorschau rot schraffiert. Mit <b>Maske verfeinern</b>
        verschiebst und glättest du die Schnittkante.</p>
        <p>Freistellen liegt im Bereich <b>Vorbereitung</b> – zusammen mit Restaurieren, KI-Vergrößerung,
        Bildanpassung und Gesichtern. Eingeklappt zeigt seine Kopfzeile, was davon eingeschaltet ist.</p>`,
    },
    {
      title: '3 · Feinschliff',
      art: ART.tune,
      target: () => $('#settings-scroll'),
      html: `<p>Die Einstellungen stehen in der Reihenfolge, in der das Bild verarbeitet wird: <b>Vorbereitung</b>
        (Restaurieren, Vergrößern, Freistellen, Bildanpassung, Gesichter), die Regler des Modus,
        <b>Vektorisierung</b> und <b>Formen verbessern</b>, dann <b>Schrift &amp; Konturen</b> und <b>Ausgabe</b>.
        Ein Klick auf eine Kopfzeile klappt den Bereich auf oder zu, der Icon-Knopf ⇕ oben rechts klappt
        <b>alle</b> auf oder zu.
        Eingeklappt zeigt die Kopfzeile, was eingestellt ist; ein <b>Punkt</b> markiert Abweichungen vom Standard.
        Jede Änderung wird sofort neu berechnet.</p>
        <p><b>Doppelklick</b> auf einen Regler setzt ihn zurück, das kleine <b>i</b> blendet Erklärungen ein.</p>`,
    },
    {
      title: 'Vorschau',
      art: ART.preview,
      target: () => $('#preview'),
      html: `<p>Links das Original, rechts das Ergebnis – nebeneinander oder einzeln. <b>Mausrad</b> zoomt auf die
        Mausposition, Verschieben mit gedrückter Maustaste. In der Statuszeile stehen Größe in mm, DPI und Rechenzeit.</p>`,
    },
    {
      title: '4 · Größe & Formate',
      art: ART.size,
      target: () => [groupByTitle('Ausgabegröße'), groupByTitle('Exportformate')],
      html: `<p>Gib die <b>Breite oder Höhe in mm</b> an – das Seitenverhältnis bleibt erhalten, die Datei kommt in
        LightBurn sofort in der richtigen Größe an. Darunter wählst du die Formate: SVG, PNG, JPG, BMP und für
        Stickmaschinen PES, DST, EXP.</p>`,
    },
    {
      title: 'Sticken',
      art: ART.embroidery,
      target: () => {
        const group = $('#emb-group');
        stages.reveal(group, true); // liegt im Bereich „Ausgabe“ – ggf. erst aufklappen
        if (visible(group)) return group;
        return ['fmtPes', 'fmtDst', 'fmtExp'].map((k) => $(`[data-key="${k}"]`)?.closest('label'));
      },
      html: `<p>Mit <b>PES</b>, <b>DST</b> oder <b>EXP</b> unter „Exportformate“ entsteht direkt eine Datei für die
        Stickmaschine (Modi Fläche, Linien, Wellen und Farben). Darunter erscheint der Abschnitt <b>Stickdatei</b>:
        Stoff wählen – die Automatik stellt Stichart, Winkel, Dichte, Unterlage und Zugausgleich ein.</p>
        <p><b>Je Farbe einstellen…</b> öffnet die Stichvorschau, in der du jede Farbe von Hand anpassen kannst.
        Passende Vorlagen findest du bei den Presets unter <b>Sticken</b>.</p>`,
    },
    {
      title: 'Dialog „Je Farbe einstellen…“',
      art: ART.embDialog,
      wide: true,
      target: () => $('#btn-emb-dialog'),
      html: `<p>Die Automatik stellt jede Farbe passend zu Stoff und Form ein. Wer selbst eingreifen will, öffnet
        unter „Stickdatei“ den Dialog <b>Stickparameter je Farbe</b>:</p>
        <ol class="tour-num">
          <li><b>Farben in Stickreihenfolge</b> – Häkchen = diese Farbe sticken, darunter Stichart, Winkel und
            Stichzahl. Ein Klick wählt die Farbe zum Bearbeiten. Oben Stoff und „Faden schneiden ab“.</li>
          <li><b>Stichvorschau</b> – die tatsächlich geplanten Stiche. Mausrad = Zoom, Ziehen = Verschieben,
            Doppelklick = Einpassen; „Andere Farben abblenden“ hebt die gewählte hervor, „Auf gewählte Farbe
            zoomen“ springt beim Anklicken einer Farbe zu ihren Stichen. Darunter Stichzahl,
            Fadenschnitte, Größe und passender Stickrahmen.</li>
          <li><b>Gewählte Farbe</b> – warum die Automatik so entschieden hat, dazu alle Werte: Stichart
            (Füllstich, Kontur als Steppstich oder Dreifachstich, nicht sticken), Stichwinkel, Reihenabstand,
            Stichlänge, Zugausgleich, Unterlage und „Schmale Stellen als Kontur“. Doppelklick auf einen Regler =
            Automatik; „Auf alle Farben übertragen“ kopiert die Werte.</li>
          <li><b>Alle Farben auf Automatik</b> verwirft alle Handänderungen, <b>Fertig</b> schließt den Dialog.</li>
        </ol>
        <p class="tour-muted">Handänderungen gelten nur für dieses Bild und bleiben beim Umfärben erhalten.</p>`,
    },
    {
      title: '5 · Exportieren',
      art: ART.export,
      target: () => [$('#btn-save-history'), $('#btn-lightburn'), $('#btn-export')],
      html: `<p><b>Exportieren</b> speichert alle gewählten Formate, <b>An LightBurn</b> fügt das Ergebnis direkt ins
        offene LightBurn-Projekt ein. Oder ziehe das Ergebnisbild einfach mit der Maus in LightBurn oder einen Ordner.</p>`,
    },
    {
      title: 'Historie',
      art: ART.history,
      target: () => (visible($('#history')) ? $('#history') : $('#btn-toggle-history')),
      html: `<p>Exportierte Bilder landen automatisch in der Historie – mit allen Einstellungen. Ein Klick lädt sie
        wieder, mit <b>⊕</b> legst du einen Eintrag über das aktuelle Ergebnis (Vereinigen).
        <b>Historie</b> oben rechts blendet die Liste ein und aus; solange sie leer ist, bleibt sie eingeklappt.</p>`,
    },
    {
      title: 'KI-Modelle',
      art: ART.ai,
      target: () => $('#btn-app-menu'),
      html: `<p>Alle KI-Funktionen rechnen <b>lokal und offline</b> – deine Bilder verlassen den Rechner nicht.
        Größere Modelle (mit ⤓ markiert) werden beim ersten Gebrauch geladen und lassen sich über das
        <b>Zahnrad</b> oben rechts unter <b>KI-Modelle…</b> wieder entfernen; dort findest du auch
        <b>Leistung…</b> (GPU und Cache). Modelle mit <b>NC</b> sind nur für nicht-kommerzielle Zwecke erlaubt.</p>`,
    },
    {
      title: 'Bereit!',
      art: ART.done,
      final: true,
      target: () => $('#btn-help'),
      html: `<p>Das war's. Lade jetzt ein eigenes Bild – oder probiere es mit dem Beispielbild.</p>
        <p class="tour-muted">Hilfe gibt es jederzeit über <b>?</b> oben rechts oder <b>F1</b>: das <b>Handbuch</b> mit
        allen Funktionen, Dialogen und Tastenkürzeln. Dort startest du auch diese Tour neu.</p>`,
    },
  ];

  let dlg = null;
  let index = 0;
  let onDemo = null;
  const stages = { reveal: () => {}, restore: () => {} }; // Bereiche auf-/zuklappen (aus init)
  let raf = 0;

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'tour';
    dlg.setAttribute('aria-labelledby', 'tour-title');
    dlg.innerHTML = `
      <div class="tour-spot" hidden></div>
      <div class="tour-card" role="document">
        <button class="tour-x" type="button" title="Tour beenden (Esc)" aria-label="Tour beenden">×</button>
        <div class="tour-art"></div>
        <div class="tour-body">
          <h2 id="tour-title"></h2>
          <div class="tour-text"></div>
        </div>
        <div class="tour-dots"></div>
        <div class="tour-foot">
          <button class="btn btn-ghost tour-skip" type="button">Tour beenden</button>
          <div class="tour-actions">
            <button class="btn tour-back" type="button">Zurück</button>
            <button class="btn tour-demo" type="button" hidden>Beispielbild laden</button>
            <button class="btn btn-primary tour-next" type="button"></button>
          </div>
        </div>
      </div>`;
    document.body.append(dlg);

    dlg.querySelector('.tour-x').addEventListener('click', () => end());
    dlg.querySelector('.tour-skip').addEventListener('click', () => end());
    dlg.querySelector('.tour-back').addEventListener('click', () => go(index - 1));
    dlg.querySelector('.tour-next').addEventListener('click', () => (index >= STEPS.length - 1 ? end() : go(index + 1)));
    dlg.querySelector('.tour-demo').addEventListener('click', () => { end(); onDemo?.(new TextEncoder().encode(DEMO_SVG)); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); end(); }); // Esc
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); if (index < STEPS.length - 1) go(index + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (index > 0) go(index - 1); }
    });
    window.addEventListener('resize', () => { if (dlg.open) schedulePlace(); });
  }

  function targets(step) {
    if (!step.target) return [];
    const els = [].concat(step.target()).filter(Boolean);
    // Ziele in eingeklappten Bereichen der Seitenleiste (Vorbereitung, Schrift & Konturen, Ausgabe …) aufklappen
    for (const el of els) stages.reveal(el, true);
    return els.filter(visible);
  }

  function go(i) {
    index = Math.max(0, Math.min(STEPS.length - 1, i));
    const step = STEPS[index];
    const card = dlg.querySelector('.tour-card');
    card.classList.remove('tour-in');
    void card.offsetWidth; // Einblend-Animation neu starten
    card.classList.add('tour-in');

    card.classList.toggle('tour-wide', !!step.wide);
    const art = dlg.querySelector('.tour-art');
    art.innerHTML = step.art || '';
    art.hidden = !step.art;
    dlg.querySelector('#tour-title').textContent = step.title;
    dlg.querySelector('.tour-text').innerHTML = step.html;
    dlg.querySelector('.tour-back').hidden = index === 0;
    dlg.querySelector('.tour-skip').hidden = !!step.final;
    dlg.querySelector('.tour-demo').hidden = !step.final;
    const next = dlg.querySelector('.tour-next');
    next.textContent = step.final ? 'Los geht’s' : index === 0 ? 'Tour starten' : 'Weiter';
    dlg.querySelector('.tour-dots').innerHTML = STEPS.map((_, k) =>
      `<span class="${k === index ? 'on' : k < index ? 'done' : ''}"></span>`).join('');
    dlg.querySelector('.tour-dots').setAttribute('aria-label', `Schritt ${index + 1} von ${STEPS.length}`);

    // Ziel in den sichtbaren Bereich holen: in der Einstellungsspalte langsam scrollen (der Hervorhebungsrahmen
    // wandert mit), damit man sieht, wo der Abschnitt liegt; sonst nur, falls nötig, sofort
    const els = targets(step);
    const scroller = els[0]?.closest('#settings-scroll');
    if (scroller && els[0] !== scroller) slowScroll(scroller, els[0]);
    else {
      stopScroll();
      if (els.length) els[0].scrollIntoView({ block: 'nearest' });
      schedulePlace();
    }
    next.focus();
  }

  let scrollRun = 0;

  function stopScroll() {
    scrollRun++;
    dlg?.classList.remove('tour-scrolling');
  }

  /**
   * Scrollt die Einstellungsspalte gemächlich, bis das Ziel bündig oben steht (mehrere Abschnitte
   * untereinander bleiben so ganz sichtbar). Dauer je nach Strecke 0,6–2 s, sanft an- und auslaufend;
   * Spotlight und Karte folgen in jedem Bild. Bei „Bewegung reduzieren“ springt die Ansicht sofort.
   */
  function slowScroll(scroller, el) {
    stopScroll();
    const run = scrollRun;
    const from = scroller.scrollTop;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const offset = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
    const to = Math.max(0, Math.min(max, from + offset));
    const dist = Math.abs(to - from);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (dist < 2 || reduced) {
      scroller.scrollTop = to;
      schedulePlace();
      return;
    }
    const duration = Math.max(600, Math.min(2000, dist * 1.2));
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
    const t0 = performance.now();
    dlg.classList.add('tour-scrolling'); // Rahmen folgt direkt, ohne eigene Übergangsanimation
    const frame = (now) => {
      if (run !== scrollRun || !dlg.open) return;
      const k = Math.min(1, (now - t0) / duration);
      scroller.scrollTop = from + (to - from) * ease(k);
      place();
      if (k < 1) requestAnimationFrame(frame);
      else dlg.classList.remove('tour-scrolling');
    };
    requestAnimationFrame(frame);
  }

  function schedulePlace() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(place);
  }

  /** Spotlight um die Ziele legen und die Karte daneben platzieren (rechts, links, unten, oben oder mittig). */
  function place() {
    const step = STEPS[index];
    const spot = dlg.querySelector('.tour-spot');
    const card = dlg.querySelector('.tour-card');
    const vw = window.innerWidth, vh = window.innerHeight;
    const els = targets(step);
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const M = 12;

    if (!els.length) {
      spot.hidden = true;
      dlg.classList.add('tour-dim');
      card.style.left = `${Math.max(M, (vw - cw) / 2)}px`;
      card.style.top = `${Math.max(M, (vh - ch) / 2)}px`;
      return;
    }
    dlg.classList.remove('tour-dim');
    const rects = els.map((el) => el.getBoundingClientRect());
    const pad = 6;
    const r = {
      left: Math.max(2, Math.min(...rects.map((x) => x.left)) - pad),
      top: Math.max(2, Math.min(...rects.map((x) => x.top)) - pad),
      right: Math.min(vw - 2, Math.max(...rects.map((x) => x.right)) + pad),
      bottom: Math.min(vh - 2, Math.max(...rects.map((x) => x.bottom)) + pad),
    };
    spot.hidden = false;
    Object.assign(spot.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px`,
    });

    const clampX = (x) => Math.max(M, Math.min(vw - cw - M, x));
    const clampY = (y) => Math.max(M, Math.min(vh - ch - M, y));
    let x, y;
    if (vw - r.right - M >= cw + M) { x = r.right + M; y = clampY(r.top); }
    else if (r.left - M >= cw + M) { x = r.left - M - cw; y = clampY(r.top); }
    else if (vh - r.bottom - M >= ch + M) { x = clampX(r.left); y = r.bottom + M; }
    else if (r.top - M >= ch + M) { x = clampX(r.left); y = r.top - M - ch; }
    else { x = clampX((vw - cw) / 2); y = clampY((vh - ch) / 2); }
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  }

  function start() {
    if (!dlg) build();
    if (!dlg.open) dlg.showModal();
    go(0);
  }

  function end() {
    stopScroll();
    markSeen();
    stages.restore(); // von der Tour aufgeklappte Bereiche wieder zuklappen
    if (dlg?.open) dlg.close();
  }

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* dann eben beim nächsten Start noch einmal */ }
  }

  function seen() {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
  }

  /**
   * Beim Programmstart aufrufen. loadDemo(bytes) lädt das Beispielbild; revealInStage(el, temporary) klappt
   * den Bereich eines Elements auf, restoreRevealedStages() klappt die vorübergehend geöffneten wieder zu.
   * Die Tour startet nur, wenn sie noch nie gezeigt wurde, und gilt ab dem Anzeigen als gesehen –
   * auch wenn das Programm mittendrin beendet wird, erscheint sie beim nächsten Start nicht wieder.
   */
  function init({ loadDemo, revealInStage, restoreRevealedStages } = {}) {
    onDemo = loadDemo;
    if (revealInStage) stages.reveal = revealInStage;
    if (restoreRevealedStages) stages.restore = restoreRevealedStages;
    if (seen()) return;
    // kurz warten, bis das Layout steht; nicht über einen bereits offenen Dialog legen
    setTimeout(() => {
      if (document.querySelector('dialog.dialog[open]')) return;
      markSeen();
      start();
    }, 400);
  }

  return { init, start, isOpen: () => !!dlg?.open };
})();
