/** Ein Durchlauf der Umwandlung: Schritte planen, rechnen, anzeigen. */

import { AI } from '../ai.js';
import { Encoders } from '../encoders.js';
import { Processing } from '../processing.js';
import { Restore } from '../restore.js';
import { Segmentation } from '../segmentation.js';
import { DEPTH_SEED_MS, contentSource, contourMask, detectFaces, detectText, ensureMask, lineFacesKey, restoredBitmap, updateOriginalView, workingBitmap } from './ai-steps.js';
import { renderColorList } from './color-list.js';
import { $, setBusy, toast } from './dom.js';
import { scheduleOriginalDrag } from './drag.js';
import { embSource } from './emb.js';
import { KEYS, MODEL_NAMES, SAM_IMPL, SEG_MODEL, SEG_SEED_MS, TEXT_SEED_MS, cleanError, faceMaskKey, facesWanted, isSam, isSky, maskKeyFor, maskRefineSig, maskTag, rawMaskKeyFor, restoreAfterCut, restoreKey, restoreSig, textMaskKey, textModelOf, textSig, textUnits, textWanted, upTag } from './keys.js';
import { composeMerged } from './merge.js';
import { refreshPerf } from './models-ui.js';
import { Pipeline, isCancelled, scheduleProcess } from './pipeline.js';
import { Run, Timing } from './progress.js';
import { round1 } from './settings.js';
import { state } from './state.js';
import { applyLimits, refreshSystem } from './system.js';

export const upscaleApplies = (bitmap) => Math.max(bitmap.width, bitmap.height) < 2048;
/** „Glatte Konturen“ vergrößert per KI, wenn das nicht schon „KI-Vergrößerung“ getan hat. */
export const smoothUpscaleApplies = (s, size) => s.mode === 'vector' && s.smoothContours && !s.upscale
  && upscaleApplies({ width: size.w ?? size.width, height: size.h ?? size.height });

/**
 * Plant die Schritte eines Durchlaufs mit geschätzter Dauer.
 * Bereits zwischengespeicherte Ergebnisse entfallen; noch laufende werden mit ihrer Startzeit übernommen.
 */
export function planSteps(s) {
  const b = state.source.bitmap;
  const up = upTag(s);
  const steps = [];
  const add = (id, label, tkey, units, seed, cacheKey = null) => {
    let started = null;
    if (cacheKey && state.cache.has(cacheKey)) {
      if (!state.inflight.has(cacheKey)) return; // schon fertig
      started = state.inflight.get(cacheKey);
    }
    steps.push({ id, label, tkey, units, est: Timing.est(tkey, units, seed), started, inherited: started != null });
  };

  let work = { w: b.width, h: b.height };
  const sig = restoreSig(s);
  if (sig) {
    const sc = Math.min(1, Restore.MAX_SIDE / Math.max(b.width, b.height));
    work = { w: Math.round(b.width * sc), h: Math.round(b.height * sc) };
    const key = `restore:${restoreKey(s)}`;
    if (s.restoreDenoise) add('restore-denoise', 'Rauschen entfernen', 'restore-denoise', Restore.denoiseTiles(work.w, work.h), 6000, key);
    if (s.restoreScratches) add('restore-scratch', 'Kratzer & Staub entfernen', 'restore-scratch', 1, 6000, key);
    if (s.restoreFaces) {
      const cf = s.faceRestoreModel === 'codeformer';
      add('restore-faces', 'Gesichter restaurieren', cf ? 'restore-faces:codeformer' : 'restore-faces', state.restoreFaceCount ?? 1, cf ? 5500 : 5000, key);
    }
  }
  if (s.upscale && upscaleApplies({ width: work.w, height: work.h })) {
    const sc = Math.min(1, 1024 / Math.max(work.w, work.h));
    const iw = Math.round(work.w * sc), ih = Math.round(work.h * sc);
    add('upscale', 'KI-Vergrößerung', 'upscale', Math.ceil(iw / 192) * Math.ceil(ih / 192), 450, `upscale:${restoreKey(s)}`);
    work = { w: iw * 4, h: ih * 4 };
  }

  const method = s.bgRemove;
  const maskKey = maskKeyFor(s);
  if (maskKey && !(state.mask && state.mask.key === maskKey)) {
    if (state.maskRaw && state.maskRaw.key === rawMaskKeyFor(s)) {
      // Rohmaske liegt schon vor – nur neu verfeinern
    } else if (method === 'color' || isSky(method)) {
      const a = Segmentation.analysisSize({ width: work.w, height: work.h });
      if (method === 'skyai') add('seg', MODEL_NAMES[SEG_MODEL.ben2], 'seg:ben2', 1, SEG_SEED_MS.ben2, KEYS.seg('ben2', maskTag(s)));
      add('colormask', isSky(method) ? 'Himmel entfernen' : 'Freistellen nach Farbe', 'colormask', (a.w * a.h) / 1e6, 250);
    } else if (isSam(method)) {
      const impl = SAM_IMPL[method];
      add('sam-emb', 'Objekt erkennen', method === 'sam' ? 'sam-emb' : `sam-emb:${method}`, 1, impl.embMs, KEYS.samEmb(maskTag(s), method));
      add('sam-mask', 'Objekt auswählen', method === 'sam' ? 'sam-mask' : `sam-mask:${method}`, 1, impl.maskMs, KEYS.samMask(maskTag(s), s.samPoints, method));
    } else {
      add('seg', MODEL_NAMES[SEG_MODEL[method]], `seg:${method}`, 1, SEG_SEED_MS[method], KEYS.seg(method, maskTag(s)));
    }
    if (maskRefineSig(s)) {
      const a = Segmentation.analysisSize({ width: work.w, height: work.h });
      add('maskrefine', 'Maske verfeinern', 'maskrefine', (a.w * a.h) / 1e6, 300);
    }
  }

  if (facesWanted(s)) {
    add('faces', 'Gesichtserkennung', 'faces', 1, 300, KEYS.faces(up, faceMaskKey(s)));
    if (s.faceLocate === 'parse' && (state.faceCount ?? 1) > 0) {
      add('face-parse', 'Gesichtsmerkmale finden', 'face-parse', state.faceCount ?? 1, 300, KEYS.faceParts(up, faceMaskKey(s)));
    }
  }
  if (textWanted(s)) {
    const model = textModelOf(s);
    add('text', MODEL_NAMES[model], model === 'text' ? 'text' : `text:${model}`, textUnits(s), TEXT_SEED_MS[model], KEYS.text(up, textMaskKey(s), textSig(s)));
  }

  let src = work;
  if (smoothUpscaleApplies(s, work)) {
    const sc = Math.min(1, 1024 / Math.max(work.w, work.h));
    const iw = Math.round(work.w * sc), ih = Math.round(work.h * sc);
    add('upscale-smooth', 'KI-Vergrößerung (glatte Konturen)', 'upscale', Math.ceil(iw / 192) * Math.ceil(ih / 192), 450, KEYS.smooth(up));
    src = { w: iw * 4, h: ih * 4 };
  }
  if (s.mode === 'edges' && s.edgeMethod === 'ai') {
    const sc = Number(s.lineRes) / Math.max(work.w, work.h);
    src = { w: Math.round(work.w * sc), h: Math.round(work.h * sc) };
    const lineKey = KEYS.lineart(up, s.lineRes, maskKey || 'none', s.lineStyle);
    const lineModel = AI.lineModel(s.lineStyle);
    add('lineart', MODEL_NAMES[lineModel], lineModel, (src.w * src.h) / 1e6, 6000, lineKey);
    if (s.faceBoost) {
      const n = state.faceCount ?? 1;
      if (n > 0) add('lineart-faces', 'Gesichtsdetails zeichnen', 'lineart-face', n, 2500, lineFacesKey(lineKey, s, maskKey));
    }
  } else if (s.mode === 'relief') {
    const sc = Number(s.depthRes) / Math.max(work.w, work.h);
    const model = AI.depthModel(s.depthModel);
    add('depth', MODEL_NAMES[model], model, (work.w * sc * work.h * sc) / 1e6, DEPTH_SEED_MS[model], KEYS.depth(up, s.depthRes, model));
  }
  if (s.subjectLine && !maskKey && s.mode !== 'relief') {
    add('contour', 'Motivkontur', `seg:ai`, 1, SEG_SEED_MS.ai, KEYS.seg('ai', up));
  }

  const out = Processing.targetSize(src.w, src.h, s);
  const mp = (out.w * out.h) / 1e6;
  const variant = s.mode === 'edges' ? `:${s.edgeMethod}` : s.mode === 'dither' ? `:${s.ditherAlgo}` : '';
  const renderSeed = { vector: 250, edges: s.edgeMethod === 'ai' ? 300 : 700, dither: 700, relief: 250, sine: 400, color: 900 }[s.mode] + (s.outline ? 1500 : 0);
  add('render', 'Bildverarbeitung', `render:${s.mode}${variant}${s.outline ? '+outline' : ''}`, mp, renderSeed);
  if (!(s.outline && s.outlineOnly) && (s.mode === 'vector' || s.mode === 'edges' || s.mode === 'color')) {
    add('trace', 'Vektorisierung', `trace:${s.mode}${variant}`, mp, 1000);
  }
  if (s.outline) add('trace-outline', 'Umrisslinie', 'trace-outline', mp, 300);
  return steps;
}

export async function runProcess() {
  if (!state.source) return;
  const gen = ++state.generation;
  AI.beginRun();
  const settingsSnap = { ...state.settings }; // Einstellungen, zu denen das Ergebnis gehört (Export/Historie)
  // Durchlauf-Kontext: eigener Cache-Verweis und Generation (siehe cached / isStaleRun)
  const s = { ...state.settings, gen, maskKey: null };
  // nicht aufzählbar: wird weder an Worker geschickt (Promises sind nicht kopierbar) noch gespeichert
  Object.defineProperty(s, 'cache', { value: state.cache, enumerable: false });
  Object.defineProperty(s, 'source', { value: state.source, enumerable: false }); // Bild dieses Durchlaufs
  setBusy(true);
  state.processing = true;

  // UI erst neu zeichnen lassen, bevor gerechnet wird
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  if (gen !== state.generation) return;

  try {
    const t0 = performance.now();
    const stale = () => gen !== state.generation;
    // Grenzen hängen nur von der Leistungsstufe ab: einmal abwarten, danach nur im
    // Hintergrund aktualisieren (Anzeige des freien Speichers), statt jeden Durchlauf zu bremsen
    if (state.sys) refreshSystem();
    else await refreshSystem();
    if (stale()) return;
    applyLimits(s);
    Run.start(planSteps(s));

    // Restaurierung nach dem Freistellen: Maske zuerst aus dem unbearbeiteten Original
    const restoreAfter = restoreAfterCut(s);
    const preMask = restoreAfter ? await ensureMask(s, state.source.bitmap) : null;
    if (stale()) return;

    // 1. Optional Restaurierung und KI-Vergrößerung
    const work = await workingBitmap(s, preMask);
    if (stale()) return;
    const viewBase = restoreSig(s) ? await restoredBitmap(s, preMask) : state.source.bitmap;
    $('#restore-info').textContent = restoreSig(s) ? (viewBase.restoreInfo || '') : '';

    // Schrift & Logos erkennen – je nach Einstellung vor oder nach dem Freistellen
    // (immer vor der Vorschau, damit die Bereiche dort markiert werden)
    const textAfterCut = s.textOrder === 'after';
    s.textBlocks = textWanted(s) && !textAfterCut ? await detectText(s, work) : [];
    if (stale()) return;

    // 2. Freistellen
    const mask = restoreAfter ? preMask : await ensureMask(s, work);
    if (stale()) return;
    if (textWanted(s) && textAfterCut) {
      s.textBlocks = await detectText(s, work, mask);
      if (stale()) return;
    }
    state.lastTextBlocks = s.textBlocks;

    // Gesichter erkennen (für „Gesichtszüge hervorheben“) – vor der Vorschau, damit sie dort markiert werden
    s.faces = facesWanted(s) ? await detectFaces(s, work, s.faceOrder === 'after' ? mask : null) : [];
    if (stale()) return;

    state.lastViewBase = viewBase;
    // genau diese Ansicht merken: „Hintergrund ausblenden“ zeichnet sie neu (nicht state.mask/state.settings,
    // die zu einem anderen Stand gehören können)
    state.lastView = { s: { ...s, textBlocks: s.textBlocks, faces: s.faces }, mask, base: viewBase };
    await updateOriginalView(s, mask, viewBase);
    if (stale()) return;
    scheduleOriginalDrag(s, work, mask);

    // 3. KI-Quelle je nach Modus (Strichzeichnung, Tiefenkarte) oder das Bild selbst
    const source = await contentSource(s, work, mask);
    if (stale()) return;

    // Motivkontur ohne Freistellen: Grenze per schneller KI ermitteln, Hintergrund bleibt erhalten
    let lineMask = null;
    if (s.subjectLine && !mask && s.mode !== 'relief') {
      lineMask = await contourMask(s, work);
      if (stale()) return;
    }

    // 4. Rasterverarbeitung im Worker (blockiert die Oberfläche nicht)
    let { w, h, bits, gray8, alpha8, trace, imagePng, imageB64, sil, strokePath, colorLayers, colorMasks, colorContour, contourBits } =
      await Run.track('render', Pipeline.render(source, mask, s, lineMask, textSourceFor(s, source, work)));
    if (stale()) return;
    const widthMm = Math.max(0.1, s.widthMm);
    const heightMm = (widthMm * h) / w;
    const mmPerPx = widthMm / w;
    // Immer die tatsächliche Auflösung: wurde das Bild wegen der Pixelgrenze verkleinert, stimmt s.dpi
    // nicht mehr – Rasterdateien wären in LightBurn sonst kleiner als das SVG
    const dpi = w / (widthMm / 25.4);
    const dpiWarn = (s.mode === 'dither' || s.mode === 'relief' || s.mode === 'sine') && dpi < s.dpi * 0.98 ? `${Math.round(dpi)}/${s.dpi}` : null;
    if (dpiWarn && state.dpiWarn !== dpiWarn) {
      toast(`Auflösung auf ${Math.round(dpi)} DPI begrenzt (Arbeitsspeicher). Die Größe in mm bleibt korrekt.`);
    }
    state.dpiWarn = dpiWarn;

    // 5. Vektorisierung (Potrace im eigenen Prozess) – Füllung und Umrisslinie parallel
    // Modus Farben: alle Farbebenen in einem Auftrag (ein Pfad je Ebene)
    const fillJob = colorMasks && colorMasks.length
      ? Run.track('trace', window.api.trace({ layers: colorMasks, w, h }, traceParams(s, mmPerPx, w, h, s.textBlocks), 'fill'))
      : trace
        ? Run.track('trace', window.api.trace({ bits, w, h }, traceParams(s, mmPerPx, w, h, s.textBlocks), 'fill'))
        : contourBits && !(s.outline && s.outlineOnly)
          // Wellen mit Motivkontur: der Ring als gefüllte Fläche (die Wellen sind schon Vektorpfade)
          ? Run.track('trace', window.api.trace({ bits: contourBits, w, h }, { turdSize: 2, alphaMax: 1, optTolerance: 0.2 }, 'fill'))
          : null;
    const outlineJob = sil
      ? Run.track('trace-outline', window.api.trace({ bits: sil.bits, w: sil.w, h: sil.h }, {
        turdSize: Math.round(sil.w * sil.h * 0.0005), // Kleinteile ignorieren
        alphaMax: 1.2,
        optTolerance: 0.5,
      }, 'outline'))
      : null;
    // beide abwarten, auch wenn einer scheitert (sonst bliebe eine Ablehnung unbehandelt)
    const [fillRes, outlineRes] = await Promise.allSettled([fillJob, outlineJob]);
    if (stale()) return;
    if (fillRes.status === 'rejected') throw fillRes.reason;
    if (outlineRes.status === 'rejected') throw outlineRes.reason;
    const colors = colorLayers ? colorSvgLayers(colorLayers, fillRes.value || [], colorContour) : null;
    const fillPath = colors ? null : fillRes.value;
    // Farben: Rasterexporte, Vorschaubild und Herausziehen zeigen genau die vektorisierten Flächen
    const rgba8 = colors ? rasterizeColors(colors, w, h) : null;
    if (colorLayers && !colors.some((c) => c.d) && !(s.outline && s.outlineOnly)) {
      toast(colorLayers.length ? 'Alle Farben sind ausgeblendet – das Ergebnis ist leer.' : 'Keine Farben gefunden – das Bild ist leer oder vollständig freigestellt.', true);
    }
    // Formen begradigt: Rasterexporte (PNG/JPG/BMP) und Vereinigen sollen dieselben Formen zeigen wie das SVG
    if (s.shapeFit && fillPath && bits && !strokePath) bits = rasterizePath(fillPath, w, h);
    // leere Silhouette (alles unter der Mindestgröße): keine Umrisslinie – sonst hätte das SVG einen Rand, die Rasterbilder nicht
    const outline = sil && String(outlineRes.value || '').trim() ? { d: outlineRes.value, pad: sil.pad } : null;
    if (sil && !outline && s.outlineOnly) toast('Kein Motiv für die Umrisslinie gefunden – das Ergebnis ist leer.', true);

    const stroke = strokePath != null ? { d: strokePath, width: s.sineStrokeMm / mmPerPx } : null;
    if (stroke && !stroke.d) toast('Keine Wellen – das Bild ist vollständig weiß.', true);
    const doc = { w, h, widthMm, fillPath, imageB64, stroke, colors, outline };
    const svg = Encoders.svgDocument(doc);
    const previewSvg = Encoders.svgDocument({ ...doc, preview: true });

    const pad = outline ? outline.pad : 0;
    const totalW = (w + 2 * pad) * mmPerPx, totalH = (h + 2 * pad) * mmPerPx;
    state.baseResult = {
      w, h, bits, gray8, alpha8, rgba8, svg, widthMm, heightMm, dpi, mode: s.mode,
      colorLayers: colorLayers || null, // Modus Farben: Ebenen für die Farbliste
      emb: embSource({ mode: s.mode, colors, fillPath, stroke, outline, outlineOnly: !!(s.outline && s.outlineOnly), mmPerPx }),
      // Relief: eigene Option „Weißen Hintergrund transparent“ (gilt für PNG/SVG)
      transparent: s.mode === 'relief' ? !!alpha8 : s.transparent,
      mmPerPx, outline, outlineOnly: !!(s.outline && s.outlineOnly), // für Rasterexporte mit Umrisslinie
      textBlocks: s.textBlocks, // für „Formen verbessern vor Schrift & Logos“ beim Vereinigen
      totalWmm: totalW, totalHmm: totalH, // inkl. Umrisslinie (SVG-Gesamtgröße)
      settings: settingsSnap,
      // Rasterergebnisse ohne Umriss als PNG anzeigen (schärfer), sonst das SVG
      preview: imagePng && !outline
        ? { blob: new Blob([imagePng], { type: 'image/png' }), pixelated: s.mode === 'dither' }
        : { blob: new Blob([previewSvg], { type: 'image/svg+xml' }), pixelated: false },
    };
    state.cancelRetries = 0;
    renderColorList();
    await composeMerged(true); // mit Historie-Eintrag vereinigen (falls gewählt) und anzeigen
    if (stale()) return;

    const ms = Math.round(performance.now() - t0);
    const kb = ((state.result || state.baseResult).svg.length / 1024).toFixed(0);
    $('#status').textContent =
      `${w} × ${h} px · ${round1(totalW)} × ${round1(totalH)} mm · ${Math.round(dpi)} DPI · SVG ${kb} KB · ${ms} ms`;
  } catch (err) {
    if (gen !== state.generation) return;
    if (isCancelled(err)) {
      // Aktueller Durchlauf wurde nicht vom Benutzer abgebrochen, hat aber ein abgebrochenes
      // Zwischenergebnis eines früheren Durchlaufs geerbt (gemeinsamer Cache) → einmal neu starten
      if (state.cancelRetries < 2) {
        state.cancelRetries++;
        scheduleProcess(0);
      } else {
        toast('Die Berechnung wurde mehrfach unterbrochen – bitte eine Einstellung ändern oder neu laden.', true);
      }
      return;
    }
    console.error(err);
    toast(`Umwandlung fehlgeschlagen: ${cleanError(err)}`, true);
  } finally {
    if (gen === state.generation) {
      setBusy(false);
      state.processing = false;
      Run.stop();
      refreshPerf(); // GPU/CPU je Modell und Cache-Größe aktualisieren
    }
  }
}

/**
 * Vorlage für die Schriftbereiche: Ist die Bildquelle eine KI-Strichzeichnung, wird die Schrift
 * aus dem Arbeitsbild gerechnet. Bei „Glatte Konturen“ ist die Quelle dasselbe Bild, nur per KI
 * vergrößert – nach der Schrifterkennung bekommt auch die Schrift die Vergrößerung, davor bleibt
 * sie wie ohne „Glatte Konturen“.
 */
export function textSourceFor(s, source, work) {
  if (!s.textBlocks.length || source === work) return null;
  if (smoothUpscaleApplies(s, work) && s.shapeOrder !== 'before') return null;
  return work;
}

/**
 * Parameter für Potrace (inkl. „Formen begradigen“, Toleranz in Pixeln des Arbeitsbildes).
 * Begradigen vor „Schrift & Logos“: Die Bereiche der Schrift (samt einbezogener Logo-Elemente)
 * gehen in Pixeln mit; Konturen darin bleiben, wie die Schrifterkennung sie zeichnet.
 */
export function traceParams(s, mmPerPx, w = 0, h = 0, textBlocks = null) {
  const skip = s.shapeFit && s.shapeOrder === 'before' && s.textClean && textBlocks?.length && w && h
    ? textBlocks.map((b) => {
      // wie in cleanText: Schrift + „Logos einbeziehen“ (Vielfaches der Zeilenhöhe), mind. eine halbe Zeile
      const m = Math.max(2, (b.lineH || 0) * h * Math.max(0.5, Number(s.textPad ?? 1)));
      return [b.x1 * w - m, b.y1 * h - m, b.x2 * w + m, b.y2 * h + m];
    })
    : null;
  return {
    shapeSkip: skip,
    turdSize: s.turdSize,
    alphaMax: s.alphaMax,
    optTolerance: s.optTolerance,
    shapes: !!s.shapeFit,
    shapeTol: Math.max(0.5, (Number(s.shapeTolMm) || 0.1) / mmPerPx),
    shapeSnap: s.shapeSnap !== false,
  };
}

/** SVG-Pfad (gerade/gerade-ungerade gefüllt) als Binärbild w × h (1 = schwarz). */
export function rasterizePath(d, w, h) {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fill(new Path2D(d), 'evenodd');
  const data = ctx.getImageData(0, 0, w, h).data;
  const bits = new Uint8Array(w * h);
  for (let p = 0, i = 3; p < bits.length; p++, i += 4) bits[p] = data[i] >= 128 ? 1 : 0;
  return bits;
}

/**
 * Modus Farben: Ebenen fürs SVG (Pfad, Farbe, Name) – Reihenfolge von unten nach oben,
 * nur sichtbare Farben (paths gehört zu den sichtbaren Ebenen in dieser Reihenfolge).
 */
export function colorSvgLayers(layers, paths, contour = false) {
  const vis = layers.filter((l) => !l.off);
  const out = vis.map((l, i) => ({
    d: String(paths[i] || '').trim(), hex: l.hex, label: `${i + 1} ${l.name} (${l.hex})`,
    name: l.name, key: `c${l.from}`, // Schlüssel für die Stickparameter: ursprüngliche Bildfarbe
  }));
  // Motivkontur: letzte Maske, eigene schwarze Ebene ganz oben
  if (contour) {
    out.push({
      d: String(paths[vis.length] || '').trim(), hex: '#000000', label: `${vis.length + 1} Motivkontur (#000000)`,
      name: 'Motivkontur', key: 'contour',
    });
  }
  return out;
}

/** Farbebenen (SVG-Pfade) als RGBA-Bild w × h, leere Stellen transparent. */
export function rasterizeColors(colors, w, h) {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  for (const c of colors) {
    if (!c.d) continue;
    ctx.fillStyle = c.hex;
    ctx.fill(new Path2D(c.d), 'evenodd');
  }
  return ctx.getImageData(0, 0, w, h).data;
}

export function showResult(blob, pixelated) {
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = URL.createObjectURL(blob);
  const img = $('#img-result');
  img.classList.toggle('pixelated', pixelated);
  img.src = state.resultUrl;
}
