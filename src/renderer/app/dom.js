/** Kleine DOM-Hilfen: Selektoren, Dialoge, Busy-Anzeige, Toast. */

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/** Gemeinsames Verhalten aller Dialoge: [data-close] und Klick auf den abgedunkelten Hintergrund schließen. */
export function bindDialogs() {
  for (const dlg of $$('dialog.dialog')) {
    for (const btn of dlg.querySelectorAll('[data-close]')) btn.addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
}

export function setBusy(on) {
  $('#busy').classList.toggle('on', on);
}

export let toastTimer = null;
export function toast(msg, isError = false, action = null) {
  const el = $('#toast');
  el.replaceChildren(document.createTextNode(msg));
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn btn-small';
    b.textContent = action.label;
    b.addEventListener('click', action.action);
    el.append(b);
  }
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  // 8 s, mit Knopf 11 s – genug Zeit, auch längere Meldungen zu lesen
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 11000 : 8000);
}
