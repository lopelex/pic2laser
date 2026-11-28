/** Systemressourcen und daraus abgeleitete Grenzen. */

import { AI } from '../ai.js';
import { Restore } from '../restore.js';
import { $ } from './dom.js';
import { state } from './state.js';

/** Speicher und Leistungsstufe des Rechners abfragen und die Verarbeitungsgrenzen anwenden. */
export async function refreshSystem() {
  try {
    state.sys = await window.api.system.profile();
  } catch {
    return;
  }
  const l = state.sys.limits;
  Restore.configure({ maxSide: l.restoreMaxSide, denoiseTile: l.denoiseTile });
  AI.configure({ upscaleMaxInput: l.upscaleMaxInput });
  renderSystemInfo();
}

export const fmtGB = (mb) => `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;

export function renderSystemInfo() {
  const sys = state.sys;
  if (!sys) return;
  $('#system-info').textContent =
    `Dieser Rechner: ${fmtGB(sys.totalMB)} RAM (${fmtGB(sys.availMB)} frei) · ${sys.cores} Kerne · Leistungsstufe „${sys.tier}“`;
}

/** Wendet die Grenzen des Rechners auf die Einstellungen eines Durchlaufs an. */
export function applyLimits(s) {
  const l = state.sys?.limits;
  if (!l) return s;
  s.maxMegapixels = l.maxMegapixels;
  s.lineRes = Math.min(Number(s.lineRes), l.lineResMax);
  return s;
}
