'use strict';

/**
 * App-weite Vorlieben (nicht bildbezogen): GPU-Nutzung, Festplatten-Cache und Modelle,
 * die auf der GPU gescheitert sind und deshalb dauerhaft auf der CPU laufen.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const FILE = () => path.join(app.getPath('userData'), 'prefs.json');
// GPU unter Linux (WebGPU, experimentell) nur auf Wunsch, sonst standardmäßig an
const DEFAULTS = { gpu: process.platform !== 'linux', diskCache: true, gpuBlocked: [] };

let prefs = null;

function get() {
  if (!prefs) {
    try {
      prefs = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE(), 'utf8')) };
    } catch {
      prefs = { ...DEFAULTS };
    }
  }
  return prefs;
}

function set(patch) {
  prefs = { ...get(), ...patch };
  try {
    // atomar: erst in eine Hilfsdatei, dann umbenennen (kein halbes prefs.json nach einem Absturz)
    const tmp = `${FILE()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(prefs, null, 2));
    fs.renameSync(tmp, FILE());
  } catch (err) {
    console.warn('Einstellungen konnten nicht gespeichert werden:', err.message);
  }
  return prefs;
}

module.exports = { get, set };
