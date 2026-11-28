/** KI-Schritte: Freistellen, Text, Gesichter, Tiefe, Restaurierung. */

import { AI } from '../ai.js';
import { Processing } from '../processing.js';
import { Restore } from '../restore.js';
import { Segmentation } from '../segmentation.js';
import { $, toast } from './dom.js';
import { KEYS, MODEL_NAMES, SAM_IMPL, SEG_MODEL, cacheOf, cached, cleanError, isLowMemory, isSam, isSky, maskKeyFor, maskRefineOpts, maskRefineSig, maskTag, rawMaskKeyFor, restoreAfterCut, restoreKey, restoreSig, textModelOf, textOpts, textSig, upTag } from './keys.js';
import { ensureModel } from './models-ui.js';
import { Pipeline, isCancelled, isStaleRun, throwIfStale } from './pipeline.js';
import { smoothUpscaleApplies, upscaleApplies } from './process.js';
import { Run } from './progress.js';
import { state, ui } from './state.js';

/** Bild nach optionaler KI-Vergrößerung. */
export async function workingBitmap(s, mask = null) {
  const bitmap = await restoredBitmap(s, mask);
  if (!s.upscale) return bitmap;
  if (!upscaleApplies(bitmap)) {
    if (!cacheOf(s).has('upscale-skip')) {
      cacheOf(s).set('upscale-skip', Promise.resolve());
      toast('Das Bild ist bereits groß genug – KI-Vergrößerung wird übersprungen.');
    }
    return bitmap;
  }
  const key = `upscale:${restoreKey(s)}`;
  if (!cacheOf(s).has(key)) await ensureModelReady('esrgan');
  return Run.track('upscale', cached(key, () =>
    AI.upscale(bitmap, (done, total) => Run.progress('upscale', done / total)), s));
}

/** Altes Foto restaurieren: Rauschen, Kratzer/Staub, Gesichter (zwischengespeichert). */
export async function restoredBitmap(s, mask = null) {
  const sig = restoreSig(s);
  if (!sig) return state.source.bitmap;
  const key = `restore:${restoreKey(s)}`;
  // nur das Motiv restaurieren (Gesichter und Kratzer im Hintergrund bleiben unberührt)
  const subject = restoreAfterCut(s) ? mask : null;
  if (!cacheOf(s).has(key)) {
    // Modelle vorher laden, damit der Download nicht in die Zeitmessung fällt
    if (s.restoreDenoise) await ensureModelReady('scunet');
    if (s.restoreScratches) await ensureModelReady('lama');
    if (s.restoreFaces || s.restoreScratches) await ensureModelReady('yunet');
    if (s.restoreScratches && s.scratchProtect === 'parse') await ensureModelReady('faceparse');
    if (s.restoreFaces) await ensureModelReady(s.faceRestoreModel === 'codeformer' ? 'codeformer' : 'restoreformer');
  }
  const restored = await cached(key, async () => {
    const canvas = Restore.workingCopy(state.source.bitmap);
    const info = [];
    if (s.restoreDenoise) {
      await Run.track('restore-denoise', Restore.denoise(canvas, (d, t) => Run.progress('restore-denoise', d / t)));
      info.push('Rauschen entfernt');
    }
    let faces = s.restoreFaces || s.restoreScratches ? await Restore.landmarks(canvas) : [];
    const inside = subject ? maskAlpha(subject, canvas.width, canvas.height) : null;
    if (inside) faces = faces.filter((f) => inside[Math.round(f.kps[2][1]) * canvas.width + Math.round(f.kps[2][0])] > 127);
    if (s.restoreScratches) {
      await Run.track('restore-scratch', (async () => {
        const parsed = s.scratchProtect === 'parse' && faces.length ? await AI.faceProtectZones(canvas, faces, Restore.alignFace) : null;
        const { mask, count } = Restore.detectScratches(canvas, s.scratchSensitivity, Restore.protectZones(faces, parsed));
        if (inside) for (let i = 0; i < mask.length; i++) if (inside[i] <= 127) mask[i] = 0;
        if (count) await Restore.inpaint(canvas, mask, (d, t) => Run.progress('restore-scratch', d / t));
        info.push(count ? `${count} Kratzer/Staubstellen aufgefüllt` : 'keine Kratzer gefunden');
      })());
    }
    if (s.restoreFaces) {
      canvas.restoreFaceCount = faces.length;
      await Run.track('restore-faces', Restore.restoreFaces(canvas, faces, s.faceRestoreStrength,
        (d, t) => Run.progress('restore-faces', d / t),
        { model: s.faceRestoreModel === 'codeformer' ? 'codeformer' : 'restoreformer', fidelity: Number(s.faceFidelity) }));
      info.push(faces.length ? `${faces.length} Gesicht${faces.length === 1 ? '' : 'er'} restauriert` : 'kein Gesicht gefunden');
    }
    // Info gehört zum Ergebnis (bei einem Cache-Treffer passt sie so zur angezeigten Restaurierung)
    canvas.restoreInfo = info.join(' · ');
    return canvas;
  }, s);
  if (s.cache === state.cache) {
    state.restoreInfo = restored.restoreInfo || '';
    if (restored.restoreFaceCount != null) state.restoreFaceCount = restored.restoreFaceCount;
  }
  return restored;
}

/** Deckkraft der Maske (0..255) je Pixel in der Größe w × h. */
export function maskAlpha(mask, w, h) {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(mask, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return a;
}

export async function ensureModelReady(id) {
  const info = state.models.find((m) => m.id === id);
  if (info && info.available) return;
  await ensureModel(id);
}

/**
 * Sparsamere Ausweichmodelle, falls der Speicher nicht reicht: BiRefNet (ca. 6,7 GB) → BEN2
 * (ca. 3 GB, bei sauberen Fotos fast gleich gut) → IS-Net (ca. 0,75 GB).
 */
export const SEG_FALLBACK = { birefnet: 'ben2', ben2: 'isnet' };
export const SEG_LABEL = { birefnet: '„Motiv – beste Qualität“ (BiRefNet)', ben2: '„Motiv – gut & sparsam“ (BEN2)', isnet: '„Motiv – präzise“ (IS-Net)' };

/**
 * Rohe KI-Maske. Der Hauptprozess hat bei LOW_MEMORY schon alle anderen Modelle freigegeben und
 * den KI-Prozess neu gestartet – reicht es dann immer noch nicht, das nächstsparsamere Modell nehmen.
 */
export async function segmentWithFallback(method, bitmap, up, s) {
  let current = method;
  for (;;) {
    try {
      const run = cached(KEYS.seg(current, up), () => AI.segment(current, bitmap), s);
      const raw = await (current === method ? Run.track('seg', run) : run);
      if (current !== method) {
        toast(`Auch nach dem Freigeben aller anderen KI-Modelle reicht der Arbeitsspeicher nicht für ${SEG_LABEL[method]} – es wurde ${SEG_LABEL[current]} verwendet. Andere Programme schließen und erneut versuchen.`);
      }
      return raw;
    } catch (err) {
      const next = SEG_FALLBACK[current];
      if (!next || !isLowMemory(err)) throw err;
      current = next;
      await ensureModelReady(SEG_MODEL[current]);
    }
  }
}

/**
 * Motivmaske für „Himmel entfernen (KI-geschützt)“: BEN2 (bei Speichermangel IS-Net). Steht keine KI
 * zur Verfügung, wird der Himmel ohne Schutz entfernt statt abzubrechen.
 */
export async function skyProtectMask(s, bitmap, up) {
  try {
    await ensureModelReady(SEG_MODEL.ben2);
    const raw = await segmentWithFallback('ben2', bitmap, up, s);
    return Segmentation.aiMask(raw, bitmap, 0.5);
  } catch (err) {
    if (isCancelled(err)) throw err;
    console.error(err);
    toast(`KI-Schutz des Motivs nicht möglich (${cleanError(err)}) – Himmel wurde ohne Schutz entfernt.`, true);
    return null;
  }
}

/** Liefert die Freistellmaske (zwischengespeichert) oder null. */
export async function ensureMask(s, bitmap) {
  const method = s.bgRemove;
  const key = maskKeyFor(s);
  if (!key) return null;
  if (state.mask && state.mask.key === key) {
    s.maskKey = key;
    return state.mask.canvas;
  }
  const up = maskTag(s);
  const rawKey = rawMaskKeyFor(s);

  let canvas;
  try {
    if (state.maskRaw && state.maskRaw.key === rawKey) {
      canvas = state.maskRaw.canvas; // nur die Verfeinerung hat sich geändert
    } else if (method === 'color') {
      throwIfStale(s);
      canvas = await Run.track('colormask', Pipeline.colorMask(bitmap, s.bgTolerance, s.bgBorder, s.bgSeeds));
    } else if (isSky(method)) {
      throwIfStale(s);
      const protect = method === 'skyai' ? await skyProtectMask(s, bitmap, up) : null;
      throwIfStale(s);
      canvas = await Run.track('colormask', Pipeline.skyMask(bitmap, s.bgTolerance, s.bgSeeds, protect));
    } else {
      await ensureModelReady(SEG_MODEL[method]);
      let raw;
      if (isSam(method)) {
        const impl = SAM_IMPL[method];
        await ensureModelReady(impl.decoder);
        const emb = await Run.track('sam-emb', cached(KEYS.samEmb(up, method), () => impl.embed(bitmap), s));
        const { w, h } = Segmentation.analysisSize(bitmap);
        raw = await Run.track('sam-mask', cached(KEYS.samMask(up, s.samPoints, method), () => impl.mask(emb, s.samPoints, w, h), s));
      } else {
        raw = await segmentWithFallback(method, bitmap, up, s);
      }
      canvas = Segmentation.aiMask(raw, bitmap, s.maskThreshold);
    }
    // Ein veralteter Durchlauf (z. B. nach Bildwechsel) darf die gemeinsame Maske nicht überschreiben
    if (!isStaleRun(s)) state.maskRaw = { key: rawKey, canvas };
    if (maskRefineSig(s)) {
      throwIfStale(s); // ein veralteter Durchlauf darf die Worker-Spur des aktuellen nicht abbrechen
      canvas = await Run.track('maskrefine', Pipeline.refineMask(canvas, maskRefineOpts(s, canvas.width)));
    }
  } catch (err) {
    if (isCancelled(err)) throw err;
    console.error(err);
    toast(`Freistellen fehlgeschlagen: ${cleanError(err)}`, true);
    return null;
  }
  if (!isStaleRun(s)) state.mask = { key, canvas };
  s.maskKey = key; // Schlüssel der Maske, die dieser Durchlauf tatsächlich verwendet
  return canvas;
}

/** Erkennt Schrift im (ggf. vergrößerten) Bild und zeigt die Anzahl der Bereiche an. */
export async function detectText(s, bitmap, mask = null) {
  try {
    const maskKey = mask ? s.maskKey : null;
    const key = KEYS.text(upTag(s), maskKey, textSig(s));
    if (!cacheOf(s).has(key)) await ensureModelReady(textModelOf(s));
    const blocks = await Run.track('text', cached(key, () => AI.detectText(mask ? maskedBitmap(bitmap, mask) : bitmap, textOpts(s)), s));
    $('#text-info').textContent = blocks.length
      ? `${blocks.length} Schriftbereich${blocks.length === 1 ? '' : 'e'} erkannt (im Original blau markiert).`
      : 'Keine Schrift erkannt.';
    return blocks;
  } catch (err) {
    if (isCancelled(err)) throw err;
    console.error(err);
    toast(`Texterkennung fehlgeschlagen: ${cleanError(err)}`, true);
    return [];
  }
}

/** Bild mit ausgeblendetem Hintergrund (transparent → bei der Erkennung weiß). */
export function maskedBitmap(bitmap, mask) {
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0, c.width, c.height);
  return c;
}

/** Erkennt Gesichter im (ggf. vergrößerten) Bild und zeigt die Anzahl an. */
export async function detectFaces(s, bitmap, mask = null) {
  try {
    const maskKey = mask ? s.maskKey : null;
    let faces = await Run.track('faces', cached(KEYS.faces(upTag(s), maskKey), () => AI.detectFaces(mask ? maskedBitmap(bitmap, mask) : bitmap), s));
    state.faceCount = faces.length;
    if (s.faceLocate === 'parse' && faces.length) {
      const key = KEYS.faceParts(upTag(s), maskKey);
      if (!cacheOf(s).has(key)) await ensureModelReady('faceparse');
      const found = faces;
      faces = await Run.track('face-parse', cached(key, () => AI.faceParts(bitmap, found), s));
    }
    $('#face-info').textContent = faces.length
      ? `${faces.length} Gesicht${faces.length === 1 ? '' : 'er'} erkannt (im Original orange markiert).`
      : 'Kein Gesicht erkannt – die Option wirkt nur auf Gesichter.';
    return faces;
  } catch (err) {
    if (isCancelled(err)) throw err;
    console.error(err);
    toast(`Gesichtserkennung fehlgeschlagen: ${cleanError(err)}`, true);
    return [];
  }
}

/** Maske nur für die Motivkontur (schnelle KI), wenn nicht freigestellt wird. */
export async function contourMask(s, bitmap) {
  const up = upTag(s);
  try {
    await ensureModelReady('u2netp');
    const raw = await Run.track('contour', cached(KEYS.seg('ai', up), () => AI.segment('ai', bitmap), s));
    return await cached(`contour-mask:${up}`, async () => Segmentation.aiMask(raw, bitmap, 0.5), s);
  } catch (err) {
    if (isCancelled(err)) throw err;
    console.error(err);
    toast(`Motivkontur fehlgeschlagen: ${cleanError(err)}`, true);
    return null;
  }
}

/** Schlüssel der hochaufgelöst nachgezeichneten Gesichter; enthält auch, wo die Gesichter gesucht wurden (vor/nach dem Freistellen). */
export function lineFacesKey(lineKey, s, maskKey) {
  const where = s.faceOrder === 'after' && maskKey ? `cut:${maskKey}` : 'all';
  return `${lineKey}:faces:${where}:${s.faceLocate === 'parse' ? 'parse:' : ''}${s.faceStrength}:${s.mouthStrength}:${s.noseStrength}:${s.chinStrength}:${s.cheekStrength}`;
}

// Erste Schätzung der Rechendauer je Tiefenmodell in ms pro Megapixel (aus Messungen hochgerechnet, wird gelernt)
export const DEPTH_SEED_MS = { depth: 6000, depth_base: 15000, depth_large: 35000 };
// Reicht der Speicher nicht: nächstkleineres Tiefenmodell
export const DEPTH_FALLBACK = { depth_large: 'depth_base', depth_base: 'depth' };

/**
 * KI-Tiefenkarte mit dem gewählten Modell. Reicht der Arbeitsspeicher auch nach dem Freigeben aller
 * anderen Modelle nicht (LOW_MEMORY), wird das nächstkleinere Modell genommen.
 */
export async function depthWithFallback(s, bitmap, up) {
  const wanted = AI.depthModel(s.depthModel);
  let model = wanted;
  for (;;) {
    const key = KEYS.depth(up, s.depthRes, model);
    try {
      if (!cacheOf(s).has(key)) await ensureModelReady(model);
      const run = cached(key, () => AI.depthMap(bitmap, Number(s.depthRes), model), s);
      const map = await (model === wanted ? Run.track('depth', run) : run);
      if (model !== wanted) {
        toast(`Zu wenig Arbeitsspeicher für „${MODEL_NAMES[wanted]}“ – es wurde „${MODEL_NAMES[model]}“ verwendet. Andere Programme schließen oder ein geringeres Tiefen-Detail wählen.`);
      }
      return map;
    } catch (err) {
      const next = DEPTH_FALLBACK[model];
      if (!next || !isLowMemory(err)) throw err;
      model = next;
    }
  }
}

/** Bild, das tatsächlich umgewandelt wird: Original, KI-Strichzeichnung oder KI-Tiefenkarte. */
export async function contentSource(s, bitmap, mask) {
  const up = upTag(s);
  if (s.mode === 'edges' && s.edgeMethod === 'ai') {
    const key = KEYS.lineart(up, s.lineRes, mask ? s.maskKey : 'none', s.lineStyle);
    if (!cacheOf(s).has(key)) await ensureModelReady(AI.lineModel(s.lineStyle));
    // Freigestellten Hintergrund vorher entfernen, damit dort keine Linien entstehen
    const lineInput = () => {
      if (!mask) return bitmap;
      const c = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0, bitmap.width, bitmap.height);
      return c;
    };
    const base = await Run.track('lineart', cached(key, () => AI.lineArt(lineInput(), Number(s.lineRes), s.lineStyle), s));
    if (!s.faceBoost || !s.faces.length) return base;
    // Gesichter zusätzlich in hoher Auflösung nachzeichnen
    const facesKey = lineFacesKey(key, s, s.maskKey);
    return Run.track('lineart-faces', cached(facesKey, () =>
      AI.enhanceFacesLineArt(lineInput(), base, s.faces, s.faceStrength, Processing.faceFeatureLevels(s), s.lineStyle), s));
  }
  if (smoothUpscaleApplies(s, bitmap)) {
    const key = KEYS.smooth(up);
    if (!cacheOf(s).has(key)) await ensureModelReady('esrgan');
    return Run.track('upscale-smooth', cached(key, () =>
      AI.upscale(bitmap, (done, total) => Run.progress('upscale-smooth', done / total)), s));
  }
  if (s.mode === 'relief') return depthWithFallback(s, bitmap, up);
  return bitmap;
}

/** Zeigt im Original-Fenster das freigestellte Bild bzw. das unveränderte Original. */
export async function updateOriginalView(s, mask, base = state.source.bitmap) {
  const markers = []; // Klickpunkte zeichnet die Marker-Ebene (renderMarkers) – immer gleich groß
  const boxes = s.textBlocks || [];
  // erkannte Gesichter: nur als Hinweis in der Vorschau (nur der Rahmen, keine weiteren Daten)
  const faceBoxes = (s.faces || []).map((f) => ({ x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2 }));
  const hideBg = ui.hideBackground;
  const key = `${mask ? s.maskKey : 'plain'}|${JSON.stringify(markers)}|${JSON.stringify(boxes)}|${JSON.stringify(faceBoxes)}|${restoreKey(s)}|${hideBg}`;
  if (state.originalViewKey === key) {
    state.originalViewPending = null; // eine noch laufende, andere Ansicht ist überholt
    return;
  }
  const img = $('#img-original');
  const source = state.source;
  if (!mask && !markers.length && !boxes.length && !faceBoxes.length && base === source.bitmap) {
    state.originalViewPending = null;
    state.originalViewKey = key;
    if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
    state.originalUrl = null;
    img.src = source.url;
    $('#pane-original').classList.remove('checker');
    return;
  }
  // Ansicht ist nur eine Vorschau: Fehler hier dürfen die Umwandlung nicht scheitern lassen.
  // Der Schlüssel wird erst nach Erfolg gesetzt – sonst würde ein abgebrochener Aufbau nie wiederholt.
  state.originalViewPending = key;
  let png;
  try {
    png = await Pipeline.cutout(base, mask, markers, boxes, hideBg, faceBoxes);
  } catch (err) {
    if (!isCancelled(err)) console.error('Vorschau des Originals fehlgeschlagen:', err);
    return;
  }
  // inzwischen neues Bild oder neuere Ansicht angefordert → dieses Ergebnis verwerfen
  if (state.source !== source || state.originalViewPending !== key) return;
  if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  state.originalUrl = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
  state.originalViewKey = key;
  img.src = state.originalUrl;
  $('#pane-original').classList.toggle('checker', !!mask && hideBg);
}
