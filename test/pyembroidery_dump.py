"""Liest Stickdateien mit pyembroidery und gibt die Befehle als JSON aus.

Aufruf: python3 test/pyembroidery_dump.py datei1.pes datei2.dst ...
Ausgabe: {"datei": [{"c": "STITCH"|"JUMP"|"TRIM"|"COLOR"|"END"|..., "x": int, "y": int}, ...], ...}
Der Vergleich mit den geplanten Stichen passiert im Node-Test (test/embroidery.test.js).
"""
import json
import sys

import pyembroidery as pe

NAMES = {
    pe.STITCH: 'STITCH',
    pe.JUMP: 'JUMP',
    pe.TRIM: 'TRIM',
    pe.COLOR_CHANGE: 'COLOR',
    pe.STOP: 'COLOR',  # DST/EXP: Farbwechsel wird je nach Leser als Stopp gemeldet
    pe.END: 'END',
}

out = {}
for path in sys.argv[1:]:
    pattern = pe.read(path)
    if pattern is None:
        out[path] = None
        continue
    ops = []
    for x, y, cmd in pattern.stitches:
        c = cmd & pe.COMMAND_MASK
        ops.append({'c': NAMES.get(c, f'CMD{c}'), 'x': round(x), 'y': round(y)})
    out[path] = {'ops': ops, 'threads': len(pattern.threadlist)}
json.dump(out, sys.stdout)
