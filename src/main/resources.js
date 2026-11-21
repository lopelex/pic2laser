'use strict';

/**
 * Systemressourcen: Arbeitsspeicher und CPU des Rechners ermitteln und daraus
 * Grenzen für die Verarbeitung ableiten (Leistungsstufe).
 */
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

const MB = 1048576;

// Nur zum Testen: kleineren Rechner simulieren, z. B. PIC2LASER_SIMULATE_RAM_MB=8192
const SIMULATED = Number(process.env.PIC2LASER_SIMULATE_RAM_MB) || 0;

/** Gesamter Arbeitsspeicher in MB. */
function totalMB() {
  return SIMULATED || Math.round(os.totalmem() / MB);
}

/**
 * Tatsächlich verfügbarer Arbeitsspeicher in MB.
 * os.freemem() zählt auf macOS und Linux freigebbaren Cache nicht mit und meldet
 * dort viel zu wenig – deshalb plattformspezifisch:
 *  - Linux:   MemAvailable aus /proc/meminfo
 *  - macOS:   vm_stat, gerechnet wie die Aktivitätsanzeige (siehe macAvailableMB)
 *  - Windows: os.freemem() (entspricht dort dem verfügbaren Speicher)
 */
async function availableMB() {
  const real = await availableMBReal();
  return SIMULATED ? Math.min(real, Math.round(SIMULATED * 0.45)) : real;
}

/**
 * Verfügbarer Speicher auf macOS aus der Ausgabe von vm_stat.
 * macOS hält absichtlich wenig Seiten „frei“ und füllt den Rest mit Datei-Cache, der aber
 * auch in den „aktiven“ Seiten steckt. Frei + inaktiv unterschätzt den verfügbaren Speicher
 * deshalb stark (auf einem 24-GB-Mac oft nur 2–4 GB) und löste unnötige Speicherwarnungen aus.
 * Stattdessen wie die Aktivitätsanzeige: belegt = Programmspeicher (anonym − löschbar)
 * + fest belegt (wired) + Komprimiert; verfügbar = gesamt − belegt. Datei-Cache und
 * löschbare Seiten gibt macOS bei Bedarf sofort frei.
 */
function macAvailableMB(out, totalBytes) {
  const page = Number((out.match(/page size of (\d+) bytes/) || [])[1]) || 16384;
  const pages = (k) => {
    const m = out.match(new RegExp(`${k}:\\s+(\\d+)`));
    return m ? Number(m[1]) : null;
  };
  const anon = pages('Anonymous pages');
  const wired = pages('Pages wired down');
  const compressed = pages('Pages occupied by compressor');
  const purgeable = pages('Pages purgeable') || 0;
  // klassische Rechnung als Untergrenze bzw. Ersatz für sehr alte macOS-Versionen
  const classic = ((pages('Pages free') || 0) + (pages('Pages inactive') || 0) + (pages('Pages speculative') || 0)) * page;
  if (anon == null || wired == null || compressed == null) return Math.round(classic / MB);
  const used = (Math.max(0, anon - purgeable) + wired + compressed) * page;
  return Math.round(Math.max(classic, totalBytes - used) / MB);
}

function availableMBReal() {
  return new Promise((resolve) => {
    const fallback = () => resolve(Math.round(os.freemem() / MB));
    try {
      if (process.platform === 'linux') {
        const m = fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)\s*kB/);
        return m ? resolve(Math.round(Number(m[1]) / 1024)) : fallback();
      }
      if (process.platform === 'darwin') {
        return execFile('vm_stat', { timeout: 2000 }, (err, out) => {
          if (err) return fallback();
          resolve(macAvailableMB(out, os.totalmem()));
        });
      }
    } catch { /* unten Fallback */ }
    fallback();
  });
}

// Kurz zwischenspeichern – bei der KI-Vergrößerung kommen viele Aufrufe in Folge
let availCache = { t: 0, v: 0 };
async function availableMBCached(maxAgeMs = 1500) {
  const now = Date.now();
  if (now - availCache.t > maxAgeMs) availCache = { t: now, v: await availableMB() };
  return availCache.v;
}

/** Leistungsstufe nach Gesamtspeicher. */
function tierFor(total) {
  if (total < 7000) return 'niedrig';
  if (total < 14000) return 'mittel';
  return 'hoch';
}

/** Verarbeitungsgrenzen je Leistungsstufe. */
const LIMITS = {
  niedrig: {
    modelBudgetMB: 600, // gleichzeitig geladene Modelle (Dateigröße)
    restoreMaxSide: 1024, // Arbeitsgröße „Altes Foto restaurieren“
    denoiseTile: 256, // SCUNet-Kachel (Speicher wächst quadratisch)
    upscaleMaxInput: 768, // KI-Vergrößerung: max. Eingangsgröße
    maxMegapixels: 16, // max. Arbeitsbild der Umwandlung
    lineResMax: 768, // KI-Strichzeichnung: max. Detailgrad
    threads: 2,
  },
  mittel: {
    modelBudgetMB: 1500,
    restoreMaxSide: 1280,
    denoiseTile: 320,
    upscaleMaxInput: 1024,
    maxMegapixels: 36,
    lineResMax: 1024,
    threads: 4,
  },
  hoch: {
    modelBudgetMB: 3000,
    restoreMaxSide: 1600,
    denoiseTile: 384,
    upscaleMaxInput: 1280,
    maxMegapixels: 50,
    lineResMax: 1280,
    threads: 0, // 0 = automatisch (alle Kerne)
  },
};

/**
 * Gemessener Spitzenbedarf je Modell in MB (Laden + Rechnen, onnxruntime ohne
 * Speicher-Arena, typische Eingabegröße der App). SCUNet hängt von der Kachel ab.
 */
const MODEL_PEAK_MB = {
  u2netp: 300,
  faces: 60,
  yunet: 60,
  text: 250,
  esrgan: 150,
  lineart: 800,
  lineart_contour: 800,
  lineart_sketch: 800,
  lineart_portrait: 600, // feste Eingabe 512×512
  lineart_teed: 250,
  sam_encoder: 350,
  sam_decoder: 150,
  modnet: 250,
  depth: 450,
  isnet: 750,
  birefnet: 6700,
  ben2: 3000,
  lama: 850,
  restoreformer: 1250,
};

/** Spitzenbedarf eines Aufrufs; skaliert bei bildgrößenabhängigen Modellen mit der Eingabe. */
function peakMB(id, feeds) {
  if (id === 'scunet') {
    const dims = Object.values(feeds || {})[0]?.dims || [1, 3, 384, 384];
    return Math.round(2000 * ((dims[2] * dims[3]) / (384 * 384)) + 120);
  }
  if (id === 'lineart' || id === 'lineart_contour' || id === 'lineart_sketch') {
    const dims = Object.values(feeds || {})[0]?.dims || [1, 3, 1024, 768];
    return Math.round(800 * ((dims[2] * dims[3]) / (1024 * 768)) + 70);
  }
  return MODEL_PEAK_MB[id] || 400;
}

async function profile() {
  const total = totalMB();
  const tier = tierFor(total);
  return {
    totalMB: total,
    availMB: await availableMB(),
    cores: os.cpus().length,
    platform: process.platform,
    arch: process.arch,
    tier,
    limits: LIMITS[tier],
    modelPeakMB: MODEL_PEAK_MB,
  };
}

module.exports = { macAvailableMB, profile, availableMB, availableMBCached, totalMB, tierFor, LIMITS, peakMB };
