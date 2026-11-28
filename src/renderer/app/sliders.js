/** Regler mit −/+-Knöpfen. */

/** Ein Schritt nach oben (+1) oder unten (-1) für einen Regler – wie ein Ziehen von Hand. */
export function stepSlider(input, dir) {
  if (input.disabled) return false;
  const before = input.value;
  if (dir > 0) input.stepUp(); else input.stepDown();
  if (input.value === before) return false;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Vor und hinter jeden Regler einen kleinen −/+-Knopf setzen (gedrückt halten wiederholt). */
export function addSliderSteppers(root = document) {
  const inputs = root.matches?.('input[type=range]') ? [root] : root.querySelectorAll('input[type=range]');
  for (const input of inputs) {
    if (input.parentElement?.classList.contains('slider-row')) continue;
    const row = document.createElement('span');
    row.className = 'slider-row';
    input.before(row);
    const mk = (dir) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'step-btn';
      b.textContent = dir > 0 ? '+' : '−';
      b.title = dir > 0 ? 'Einen Schritt erhöhen' : 'Einen Schritt verringern';
      b.tabIndex = -1;
      let delay = null, repeat = null;
      const stop = () => { clearTimeout(delay); clearInterval(repeat); delay = repeat = null; };
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        stop();
        if (!stepSlider(input, dir)) return;
        delay = setTimeout(() => { repeat = setInterval(() => { if (!stepSlider(input, dir)) stop(); }, 60); }, 400);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
      // Klicks nicht an das Label weiterreichen, Doppelklick setzt den Regler nicht zurück
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); });
      return b;
    };
    // Regler steht im DOM zuerst, damit das Label weiterhin ihn meint; die Reihenfolge macht CSS
    row.append(input, mk(-1), mk(1));
    const sync = () => { for (const b of row.querySelectorAll('.step-btn')) b.disabled = input.disabled; };
    sync();
    new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['disabled'] });
  }
}

addSliderSteppers();
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) addSliderSteppers(n);
}).observe(document.body, { childList: true, subtree: true });
