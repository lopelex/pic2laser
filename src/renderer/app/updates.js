/** Updates. */

import { $, toast } from './dom.js';
import { cleanError } from './keys.js';
import { fmtMB } from './models-ui.js';

/** Release-Notizen (einfaches Markdown: ###, Listen, **fett**, `code`) sicher als DOM aufbauen. */
export function renderReleaseNotes(md, box) {
  box.replaceChildren();
  let list = null;
  let lastItem = null;
  const inline = (parent, text) => {
    for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**')) {
        const b = document.createElement('strong');
        b.textContent = part.slice(2, -2);
        parent.append(b);
      } else if (part.startsWith('`') && part.endsWith('`')) {
        const c = document.createElement('code');
        c.textContent = part.slice(1, -1);
        parent.append(c);
      } else {
        parent.append(document.createTextNode(part.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')));
      }
    }
  };
  for (const raw of String(md).replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim() || /^\s*([-*_])\1{2,}\s*$/.test(line)) { list = null; lastItem = null; continue; } // Leerzeile, Trennlinie
    const head = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (head) {
      list = null; lastItem = null;
      const h = document.createElement('h4');
      inline(h, head[1]);
      box.append(h);
    } else if (item) {
      if (!list) { list = document.createElement('ul'); box.append(list); }
      lastItem = document.createElement('li');
      inline(lastItem, item[1]);
      list.append(lastItem);
    } else if (lastItem && /^\s/.test(line)) {
      inline(lastItem, ` ${line.trim()}`); // eingerückte Fortsetzung eines Listenpunkts
    } else {
      list = null; lastItem = null;
      const para = document.createElement('p');
      inline(para, line.trim());
      box.append(para);
    }
  }
  if (!box.childNodes.length) {
    const para = document.createElement('p');
    para.textContent = 'Keine Beschreibung vorhanden.';
    box.append(para);
  }
}

export function bindUpdates() {
  const dlg = $('#update-dialog');
  const btn = $('#btn-update');
  const action = $('#update-action');
  let upd = { phase: 'idle' };
  let notesFor = null; // Notizen nur bei neuer Version neu aufbauen (nicht bei jedem Fortschritt)

  const FILE_HINT = {
    win32: 'Die neue portable Version liegt im Download-Ordner. Pic2Laser schließen, die neue Datei starten und die alte löschen.',
    darwin: 'Die neue Version liegt im Download-Ordner. Pic2Laser beenden, die ZIP-Datei entpacken und die App in den Programme-Ordner ziehen (alte ersetzen).',
    linux: 'Die neue AppImage liegt im Download-Ordner. Pic2Laser beenden, die Datei ausführbar machen und starten.',
  };

  function render() {
    const s = upd;
    const l = s.latest;
    btn.hidden = !s.newer;
    if (s.phase === 'downloading' && s.progress?.total) {
      btn.textContent = `Update ${Math.round((s.progress.received / s.progress.total) * 100)} %`;
    } else if (s.phase === 'ready') {
      btn.textContent = 'Update bereit';
    } else if (l) {
      btn.textContent = `Update ${l.version}`;
    }
    if (!l) return;

    const auto = l.installKind === 'auto';
    $('#update-title').textContent = s.phase === 'ready' ? (auto ? 'Update bereit' : 'Neue Version geladen')
      : s.phase === 'downloading' && auto ? 'Update wird geladen' : 'Neue Version verfügbar';
    $('#update-sub').textContent = `Pic2Laser ${l.version} · installiert: ${s.current}${l.asset ? ` · ${fmtMB(l.asset.size)}` : ''}`;
    if (notesFor !== l.version) {
      notesFor = l.version;
      renderReleaseNotes(l.notes, $('#update-notes'));
    }

    const prog = $('#update-progress');
    prog.hidden = s.phase !== 'downloading';
    if (s.phase === 'downloading' && s.progress) {
      const f = s.progress.total ? s.progress.received / s.progress.total : 0;
      $('#update-progress-fill').style.width = `${Math.round(f * 100)}%`;
      $('#update-progress-label').textContent = `${fmtMB(s.progress.received)} / ${fmtMB(s.progress.total || 0)}`;
    }

    const msg = $('#update-msg');
    msg.style.color = '';
    if (s.phase === 'error' && s.error) {
      msg.textContent = s.error;
      msg.style.color = 'var(--danger)';
    } else if (s.phase === 'ready' && auto) {
      msg.textContent = 'Wird beim Beenden von Pic2Laser automatisch installiert. „Jetzt neu starten“ installiert sofort – '
        + 'nicht gespeicherte Ergebnisse vorher exportieren oder in der Historie speichern.';
    } else if (s.phase === 'downloading' && auto) {
      msg.textContent = 'Die neue Version wird im Hintergrund geladen – du kannst normal weiterarbeiten.';
    } else if (s.phase === 'ready') {
      msg.textContent = l.installKind === 'installer'
        ? 'Pic2Laser wird zum Installieren beendet – nicht gespeicherte Ergebnisse vorher exportieren oder in der Historie speichern.'
        : (FILE_HINT[s.platform] || FILE_HINT.linux);
    } else if (s.phase === 'available' && auto) {
      msg.textContent = '„Aktualisieren“ lädt die neue Version und installiert sie – beim nächsten Beenden oder sofort per Neustart.';
    } else if (!l.asset) {
      msg.textContent = 'Für dieses System liegt keine Datei bei – die neue Version gibt es auf der Download-Seite.';
    } else {
      msg.textContent = '';
    }

    $('#update-page').hidden = !l.asset; // ohne Datei ist der Hauptknopf schon die Download-Seite
    $('#update-cancel').hidden = s.phase !== 'downloading';
    $('#update-later').hidden = s.phase === 'downloading' && !auto;
    $('#update-later').textContent = s.phase === 'downloading' ? 'Schließen' : 'Später';
    action.hidden = s.phase === 'downloading';
    action.disabled = false;
    if (s.phase === 'ready') {
      action.textContent = auto ? 'Jetzt neu starten' : l.installKind === 'installer' ? 'Installieren & beenden' : 'Im Ordner zeigen';
    } else if (!l.asset) {
      action.textContent = 'Download-Seite öffnen';
    } else {
      action.textContent = s.phase === 'error' ? 'Erneut versuchen' : auto ? 'Aktualisieren' : 'Herunterladen';
    }
  }

  function apply(next) {
    const prev = upd;
    upd = next;
    render();
    if (prev.phase === next.phase) return;
    const auto = next.latest?.installKind === 'auto';
    if (next.phase === 'ready' && auto) {
      // fertig geladen: Hinweis mit Sofort-Neustart (sonst beim Beenden)
      if (!dlg.open) toast(`Update ${next.latest.version} ist bereit – wird beim Beenden installiert.`, false, { label: 'Jetzt neu starten', action: () => restartForUpdate() });
    } else if (next.phase === 'available' && !prev.newer && !dlg.open) {
      toast(`Neue Version ${next.latest.version} verfügbar`, false, { label: 'Details', action: () => dlg.showModal() });
    } else if (next.phase === 'ready' && !dlg.open) {
      toast(`Version ${next.latest.version} ist geladen.`, false, { label: 'Installieren', action: () => dlg.showModal() });
    } else if (next.phase === 'error' && prev.phase === 'downloading' && !dlg.open) {
      toast(`Update-Download fehlgeschlagen: ${next.error}`, true);
    }
  }

  async function restartForUpdate() {
    try {
      await window.api.update.install();
    } catch (err) {
      toast(`Update fehlgeschlagen: ${cleanError(err)}`, true);
    }
  }

  window.api.update.onState(apply);
  window.api.update.state().then(apply).catch(() => {});

  btn.addEventListener('click', () => { render(); dlg.showModal(); });
  $('#appVersion').addEventListener('click', () => {
    if (upd.newer && upd.latest) { render(); dlg.showModal(); return; }
    toast('Suche nach Updates …');
    window.api.update.check().then((s) => {
      if (s.newer) { render(); dlg.showModal(); }
      else if (s.phase === 'error') toast(`Update-Prüfung fehlgeschlagen: ${s.error}`, true);
      else toast(`Pic2Laser ist auf dem neuesten Stand (v${s.current}).`);
    }).catch((err) => toast(`Update-Prüfung fehlgeschlagen: ${cleanError(err)}`, true));
  });
  $('#update-page').addEventListener('click', () => window.api.update.openPage());
  $('#update-cancel').addEventListener('click', () => window.api.update.cancel());
  action.addEventListener('click', async () => {
    const l = upd.latest;
    if (!l) return;
    try {
      if (upd.phase === 'ready') {
        action.disabled = true;
        const r = await window.api.update.install();
        if (!r?.quitting) dlg.close();
      } else if (!l.asset) {
        window.api.update.openPage();
      } else {
        await window.api.update.download();
      }
    } catch (err) {
      toast(`Update fehlgeschlagen: ${cleanError(err)}`, true);
      action.disabled = false;
    }
  });
}
