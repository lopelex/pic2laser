/** Zwischenspeicher und Schlüssel der Zwischenergebnisse. */

import { AI } from '../ai.js';
import { state } from './state.js';

export const SEG_MODEL = { ai: 'u2netp', isnet: 'isnet', birefnet: 'birefnet', ben2: 'ben2', modnet: 'modnet', sam: 'sam_encoder', sam2: 'sam2_encoder' };
/** Freistellen per Klickpunkten (MobileSAM oder SAM 2.1)? */
export const isSam = (method) => method === 'sam' || method === 'sam2';
/** Methoden mit Hintergrund-Klickpunkten (bgSeeds). */
export const usesSeeds = (method) => method === 'color' || isSky(method);
/** Himmel entfernen – ohne bzw. mit KI-Schutz des Motivs (BEN2). */
export const isSky = (method) => method === 'sky' || method === 'skyai';
/** Embedding und Maske je Klick-Modell. */
export const SAM_IMPL = {
  sam: { decoder: 'sam_decoder', embed: (b) => AI.samEmbedding(b), mask: (e, p, w, h) => AI.samMask(e, p, w, h), embMs: 2500, maskMs: 500 },
  sam2: { decoder: 'sam2_decoder', embed: (b) => AI.sam2Embedding(b), mask: (e, p, w, h) => AI.sam2Mask(e, p, w, h), embMs: 3500, maskMs: 400 },
};
export const SEG_SEED_MS = { ai: 1500, isnet: 4000, birefnet: 26000, ben2: 14000, modnet: 2200 };
export const MODEL_NAMES = {
  u2netp: 'Motiv – schnell (U²-Net)', isnet: 'Motiv – präzise (IS-Net)', birefnet: 'Motiv – beste Qualität (BiRefNet)', ben2: 'Motiv – gut & sparsam (BEN2)',
  modnet: 'Motiv – Porträt & Haare (MODNet)', sam_encoder: 'Objekt anklicken – schnell (MobileSAM)', sam_decoder: 'Objekt anklicken – schnell (MobileSAM)',
  sam2_encoder: 'Objekt anklicken – genau (SAM 2.1)', sam2_decoder: 'Objekt anklicken – genau (SAM 2.1)',
  lineart: 'KI-Strichzeichnung', lineart_contour: 'KI-Strichzeichnung (Konturen)', lineart_sketch: 'KI-Strichzeichnung (Skizze)',
  lineart_portrait: 'KI-Strichzeichnung (Tusche-Porträt)', lineart_teed: 'KI-Strichzeichnung (Kanten)', esrgan: 'KI-Vergrößerung', depth: 'Tiefenkarte', faces: 'Gesichtserkennung',
  depth_base: 'Tiefenkarte (fein)', depth_large: 'Tiefenkarte (sehr fein)', codeformer: 'Gesichter restaurieren (CodeFormer)',
  faceparse: 'Gesichtsmerkmale (Face Parsing)',
  scunet: 'Rauschen entfernen', lama: 'Kratzer auffüllen', restoreformer: 'Gesichter restaurieren', yunet: 'Gesichtspunkte',
  text: 'Texterkennung (PP-OCRv4)', text_v5: 'Texterkennung – genauer (PP-OCRv5)', text_v5_server: 'Texterkennung – beste Qualität (PP-OCRv5 Server)',
};

/** Kennung der Restaurierungs-Einstellungen ('' = keine Restaurierung). */
export function restoreSig(s) {
  if (!s.restoreOn || (!s.restoreDenoise && !s.restoreScratches && !s.restoreFaces)) return '';
  const scratch = s.restoreScratches ? `S${s.scratchSensitivity}${s.scratchProtect === 'parse' ? 'p' : ''}` : '';
  const faces = s.restoreFaces ? `F${s.faceRestoreStrength}${s.faceRestoreModel === 'codeformer' ? `c${s.faceFidelity}` : ''}` : '';
  return `r${s.restoreDenoise ? 'D' : ''}${scratch}${faces}`;
}
// Alle KI-Zwischenergebnisse hängen am Eingangsbild: Restaurierung + Vergrößerung
// Restaurierung nach dem Freistellen: Maske kommt vom unbearbeiteten Original, Restaurierung hängt an der Maske
export const restoreAfterCut = (s) => s.restoreOrder === 'after' && !!restoreSig(s) && s.bgRemove !== 'none';
export const upTag = (s) => {
  const sig = restoreSig(s);
  if (!sig) return s.upscale ? 'up' : 'orig';
  return `${s.upscale ? 'up' : 'orig'}|${sig}${restoreAfterCut(s) ? `@${maskKeyFor(s)}` : ''}`;
};
/** Kennung des Bildes, aus dem die Maske berechnet wird. */
export const maskTag = (s) => (restoreAfterCut(s) ? 'src' : upTag(s));
/** Kennung der Restaurierung (inkl. Maske, wenn erst freigestellt wird). */
export const restoreKey = (s) => `${restoreSig(s)}${restoreAfterCut(s) ? `@${maskKeyFor(s)}` : ''}`;
export const KEYS = {
  seg: (method, up) => `seg:${method}:${up}`,
  samEmb: (up, method = 'sam') => `sam-emb:${method === 'sam' ? '' : `${method}:`}${up}`,
  samMask: (up, points, method = 'sam') => `sam-mask:${method === 'sam' ? '' : `${method}:`}${up}:${JSON.stringify(points)}`,
  lineart: (up, res, maskKey, style = 'fine') => `lineart${style === 'fine' ? '' : `-${style}`}:${up}:${res}:${maskKey}`,
  depth: (up, res, model = 'depth') => `depth${model === 'depth' ? '' : `-${model}`}:${up}:${res}`,
  faces: (up, maskKey = null) => (maskKey ? `faces:${up}:cut:${maskKey}` : `faces:${up}`),
  faceParts: (up, maskKey = null) => `${KEYS.faces(up, maskKey)}:parse`,
  text: (up, maskKey = null, sig = '') => `text:${up}${maskKey ? `:cut:${maskKey}` : ''}${sig ? `:${sig}` : ''}`,
  smooth: (up) => `upscale:smooth:${up}`, // „Glatte Konturen“: Vergrößerung nur für die Fläche
};

export const textWanted = (s) => s.textClean && s.mode !== 'relief' && s.mode !== 'sine';

export const TEXT_MODELS = new Set(['text', 'text_v5', 'text_v5_server']);
/** Modell der Texterkennung (unbekannte Werte aus alten Presets → PP-OCRv4). */
export const textModelOf = (s) => (TEXT_MODELS.has(s.textModel) ? s.textModel : 'text');

/** Einstellungen der Texterkennung für AI.detectText (Regler → Modellparameter). */
export function textOpts(s) {
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const sens = Math.max(0, Math.min(100, num(s.textSens, 50)));
  return {
    model: textModelOf(s),
    limit: Math.max(320, Math.min(2560, num(s.textRes, 1280))),
    thresh: 0.3 - (sens - 50) * 0.004, // 0,5 … 0,1
    boxScore: 0.55 - (sens - 50) * 0.006, // 0,85 … 0,25
    unclip: num(s.textUnclip, 1.5),
    merge: num(s.textMerge, 0.6),
    minLine: num(s.textMinPct, 0) / 100,
    maxLine: num(s.textMaxPct, 25) / 100,
    faces: s.textFaces !== false,
    multi: !!s.textMulti,
  };
}
/** Kennung der Erkennungs-Einstellungen für den Zwischenspeicher ('' = Voreinstellung). */
export function textSig(s) {
  const o = textOpts(s), d = AI.TEXT_DEFAULTS;
  const parts = ['model', 'limit', 'thresh', 'boxScore', 'unclip', 'merge', 'minLine', 'maxLine', 'faces', 'multi'];
  return parts.every((k) => o[k] === d[k]) ? '' : parts.map((k) => `${o[k]}`).join(',');
}
/** Aufwand der Texterkennung relativ zu einem Durchlauf mit 1280 px (für die Restzeit). */
export function textUnits(s) {
  const o = textOpts(s);
  const one = (o.limit / 1280) ** 2;
  return o.multi ? one * 5 : one; // zweiter Durchlauf in doppelter Auflösung ≈ 4× so viele Pixel
}
export const TEXT_SEED_MS = { text: 900, text_v5: 1000, text_v5_server: 7000 };

/** Maske, auf die sich die Texterkennung bezieht (null = ganzes Bild). */
export const textMaskKey = (s) => (s.textOrder === 'after' ? maskKeyFor(s) : null);

export const facesWanted = (s) => s.faceBoost && s.mode !== 'relief';
export const faceMaskKey = (s) => (s.faceOrder === 'after' ? maskKeyFor(s) : null);

/** Schlüssel der Freistellmaske für die aktuellen Einstellungen (null = keine Maske). */
export function maskKeyFor(s) {
  const base = rawMaskKeyFor(s);
  if (!base) return null;
  const r = maskRefineSig(s);
  return r ? `${base}|${r}` : base;
}

/** Schlüssel der Maske vor dem Verfeinern. */
export function rawMaskKeyFor(s) {
  const method = s.bgRemove;
  if (method === 'none' || (isSam(method) && !s.samPoints.length)) return null;
  const up = maskTag(s);
  if (method === 'color') return `color:${up}:${s.bgTolerance}:${s.bgBorder}:${JSON.stringify(s.bgSeeds)}`;
  if (isSky(method)) return `${method}:${up}:${s.bgTolerance}:${JSON.stringify(s.bgSeeds)}`;
  if (isSam(method)) return `${method}:${up}:${s.maskThreshold}:${JSON.stringify(s.samPoints)}`;
  return `${method}:${up}:${s.maskThreshold}`;
}

/** Kennung der Maskenverfeinerung ('' = keine). Angaben in mm hängen von der Ausgabebreite ab. */
export function maskRefineSig(s) {
  const mm = Number(s.maskShiftMm) || 0, smooth = Number(s.maskSmoothMm) || 0;
  const speck = Number(s.maskSpeckPct) || 0, hole = Number(s.maskHolePct) || 0;
  if (!mm && !smooth && !speck && !hole && !s.maskLargest) return '';
  return `r${mm}:${smooth}:${speck}:${hole}:${s.maskLargest ? 1 : 0}${mm || smooth ? `@${s.widthMm}` : ''}`;
}

/** Verfeinerungs-Optionen in Pixeln der Maske (die Maske deckt die volle Ausgabebreite ab). */
export function maskRefineOpts(s, maskWidth) {
  const pxPerMm = maskWidth / s.widthMm;
  return {
    shiftPx: (Number(s.maskShiftMm) || 0) * pxPerMm,
    smoothPx: (Number(s.maskSmoothMm) || 0) * pxPerMm,
    speckPct: Number(s.maskSpeckPct) || 0,
    holePct: Number(s.maskHolePct) || 0,
    largestOnly: !!s.maskLargest,
  };
}

/** Zwischenspeicher pro Bild: gleiche Anfrage → gleiches Promise. Laufende Berechnungen werden vermerkt. */
/**
 * Zwischenspeicher eines Durchlaufs. runProcess hält den Cache des Bildes fest (s.cache), mit dem
 * er gestartet ist: Ein veralteter Durchlauf schreibt nach einem Bildwechsel so nie in den Cache
 * des neuen Bildes.
 */
export const cacheOf = (s) => (s && s.cache) || state.cache;

// Höchstens so viele fertige Ergebnisse je Schrittart (z. B. „restore“, „lineart“) im Speicher.
// Beim Ziehen eines Reglers entsteht je Zwischenwert ein Eintrag – ohne Grenze wüchse der Speicher
// (Restaurierung und 4×-Vergrößerung belegen je Eintrag Dutzende MB).
export const CACHE_PER_KIND = 6;
// große Bilder (Restaurierung, 4×-Vergrößerung): nur die letzten zwei behalten
export const CACHE_LIMIT = { restore: 2, upscale: 2 };
export const settledKeys = new WeakMap(); // cache -> Set fertiger Schlüssel

export function trimCache(cache, kind) {
  const done = settledKeys.get(cache);
  if (!done) return;
  const keys = [...cache.keys()].filter((k) => k.split(':')[0] === kind && done.has(k));
  for (const k of keys.slice(0, Math.max(0, keys.length - (CACHE_LIMIT[kind] ?? CACHE_PER_KIND)))) {
    cache.delete(k);
    done.delete(k);
  }
}

export function cached(key, fn, s = null) {
  const cache = cacheOf(s);
  if (cache.has(key)) {
    // zuletzt benutzt → ans Ende (Map hält die Einfügereihenfolge)
    const p = cache.get(key);
    cache.delete(key);
    cache.set(key, p);
    return p;
  }
  const p = fn();
  cache.set(key, p);
  const inflight = cache === state.cache ? state.inflight : null;
  if (inflight) inflight.set(key, performance.now());
  p.then(() => {
    if (!settledKeys.has(cache)) settledKeys.set(cache, new Set());
    settledKeys.get(cache).add(key);
    trimCache(cache, key.split(':')[0]);
  }, () => cache.delete(key)).finally(() => { if (inflight) inflight.delete(key); });
  return p;
}

export function cleanError(err) {
  return String(err?.message || err)
    .replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    .replace(/^LOW_MEMORY: /, '');
}

export const isLowMemory = (err) => /LOW_MEMORY|bad_alloc|Arbeitsspeicher/.test(String(err?.message || err));
