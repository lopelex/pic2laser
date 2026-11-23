'use strict';

/* global SINE_WASM_B64 */

/**
 * Modus „Wellen“: Sinuswellen-Schattierung (nach img2laser von Kyle Larsen, MIT).
 * Die Rechnung läuft in WebAssembly (Rust, Quelltext in wasm/sine); diese Datei lädt das
 * Modul (eingebettet in wasm/sine-wasm.js) und rechnet Einstellungen in Pixel um.
 */
const Sine = (() => {
  let inst = null;

  function wasm() {
    if (inst) return inst;
    const bin = atob(SINE_WASM_B64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    inst = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports;
    return inst;
  }

  /**
   * SVG-Pfaddaten der Wellen im Pixelraum (w × h).
   * gray8: Helligkeit 0…255 (Freigestelltes ist schon weiß), s: Einstellungen, mmPerPx: Maßstab.
   */
  function paths(gray8, w, h, s, mmPerPx) {
    const ex = wasm();
    const n = w * h;
    const ptr = ex.alloc(n);
    try {
      new Uint8Array(ex.memory.buffer, ptr, n).set(gray8);
      const radPerPx = (wavesPerMm) => 2 * Math.PI * Math.max(0, wavesPerMm) * mmPerPx;
      const spacingPx = Math.max(0.5, Number(s.sineSpacingMm) / mmPerPx);
      const flags = (s.sineDirection === 'v' ? 1 : 0) | (s.sineSkipWhite ? 2 : 0) | (s.sineNormalize ? 4 : 0);
      const len = ex.sine_paths(
        ptr, w, h, spacingPx, Number(s.sineAmplitude),
        radPerPx(s.sineMinDensity), radPerPx(Math.max(s.sineMinDensity, s.sineDensity)),
        0.02 / mmPerPx, // Ausdünnen: höchstens 0,02 mm Abweichung
        0.8 / mmPerPx, // Weiße Flächen auslassen: Lücken und Linienstücke unter 0,8 mm ignorieren
        flags,
      );
      // Speicher erst nach dem Auslesen anfassen: alloc kann ihn wachsen lassen (neuer Puffer)
      const d = new TextDecoder().decode(new Uint8Array(ex.memory.buffer, ex.result_ptr(), len));
      ex.result_free();
      return d;
    } finally {
      ex.dealloc(ptr, n);
    }
  }

  /** Wellen als Binärbild (1 = schwarz) mit Strichbreite in Pixeln – für Rasterexporte und Vereinigen. */
  function rasterize(d, w, h, strokePx) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    if (d) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = Math.max(1, strokePx);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke(new Path2D(d));
    }
    const px = ctx.getImageData(0, 0, w, h).data;
    const bits = new Uint8Array(w * h);
    for (let p = 0, i = 0; p < bits.length; p++, i += 4) bits[p] = px[i] < 128 ? 1 : 0;
    return bits;
  }

  return { paths, rasterize };
})();
