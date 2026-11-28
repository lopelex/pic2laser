/** Modus Farben: Farbliste. */

import { $ } from './dom.js';
import { setSetting } from './settings.js';
import { state } from './state.js';

/**
 * Bearbeitung einer Farbe ändern (Schlüssel: from = ursprüngliche Bildfarbe). patch-Werte
 * undefined entfernen den Eintrag; leere Bearbeitungen fallen weg.
 */
export function editColor(from, patch) {
  const edits = (state.settings.colorEdits || []).map((e) => ({ ...e }));
  let e = edits.find((x) => x.from === from);
  if (!e) edits.push((e = { from }));
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') delete e[k];
    else e[k] = v;
  }
  setSetting('colorEdits', edits.filter((x) => Object.keys(x).length > 1));
}

/** Liste der Farbebenen (Reihenfolge = Ebenen im SVG bzw. Stickreihenfolge, von unten nach oben). */
export function renderColorList() {
  const box = $('#color-list');
  const r = state.baseResult;
  const layers = r && r.mode === 'color' ? r.colorLayers || [] : [];
  box.textContent = '';
  $('#btn-color-reset').disabled = !(state.settings.colorEdits || []).length;
  if (!layers.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = r && r.mode === 'color' ? 'Keine Farben gefunden.' : 'Die Farben erscheinen nach der Umwandlung.';
    box.append(p);
    return;
  }
  let n = 0;
  for (const l of layers) {
    const row = document.createElement('div');
    row.className = 'color-row' + (l.off ? ' off' : '');

    const on = document.createElement('input');
    on.type = 'checkbox';
    on.checked = !l.off;
    on.title = l.off ? 'Farbe ausgeben' : 'Farbe weglassen (z. B. Stofffarbe)';
    on.addEventListener('change', () => editColor(l.from, { off: on.checked ? undefined : true }));

    const pick = document.createElement('input');
    pick.type = 'color';
    pick.value = l.hex;
    pick.title = state.settings.colorPalette === 'image' ? 'Farbe ändern' : 'Farbe ändern (rastet auf das nächste Garn ein)';
    pick.addEventListener('change', () => editColor(l.from, { to: pick.value }));

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = `${l.off ? '–' : ++n} · ${l.name}`;
    name.title = `${l.name} ${l.hex}${l.merged.length ? ` – zusammengeführt mit ${l.merged.length} weiteren Farbe(n)` : ''}`;

    const pct = document.createElement('span');
    pct.className = 'pct';
    const share = l.share * 100;
    pct.textContent = share < 0.1 ? '< 0,1 %' : `${share.toFixed(share < 10 ? 1 : 0).replace('.', ',')} %`;

    const into = document.createElement('select');
    into.title = 'Mit einer anderen Farbe zusammenführen';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '⇢';
    into.append(opt0);
    for (const o of layers) {
      if (o === l) continue;
      const opt = document.createElement('option');
      opt.value = o.from;
      opt.textContent = `→ ${o.name}`;
      into.append(opt);
    }
    into.addEventListener('change', () => into.value && editColor(l.from, { into: into.value }));

    const tools = [on, pick, name, pct, into];
    const edited = l.edited || l.merged.length;
    if (edited) {
      const undo = document.createElement('button');
      undo.className = 'btn btn-small icon';
      undo.textContent = '↺';
      undo.title = 'Änderungen an dieser Farbe zurücknehmen (auch Zusammenführen)';
      undo.addEventListener('click', () => {
        const all = [l.from, ...l.merged];
        setSetting('colorEdits', (state.settings.colorEdits || []).filter((e) => !all.includes(e.from)));
      });
      tools.push(undo);
    }
    row.append(...tools);
    box.append(row);
  }
}
