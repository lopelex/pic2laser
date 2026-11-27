'use strict';

/* global state, DEFAULTS, BUILTIN_PRESETS, toastLog, withDefaults, outputPrefs, persistSettings, syncControls,
   renderMarkers, renderPresets, updatePresetHint, scheduleProcess, scheduleEmbRefresh, applyPreset, presetUse,
   loadImage, rasterCanvas, resultIsCurrent, handoverFiles, buildRasterFiles, embroideryFiles, embroideryProblem,
   laserFormats, embModeOk, baseName, saveToHistory, refreshHistory, refreshPresets, openHistoryEntry, toast,
   cleanError, processTimer, dragReady:writable, $, $$ */

/**
 * Werkzeuge des MCP-Servers (src/main/mcp.js) – laufen hier im Fenster über dieselben Funktionen
 * wie die Bedienung von Hand, damit der Benutzer jeden Schritt in der App sieht.
 * Jede Antwort: { text, images: [{ data: Uint8Array, mimeType, label }], isError }.
 */
const McpTools = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ---------------- Einstellungen beschreiben und prüfen ---------------- */

  /** Beschriftung eines Reglers ohne den angezeigten Wert. */
  function labelText(el) {
    const lab = el.closest('label');
    if (!lab) return '';
    const c = lab.cloneNode(true);
    for (const x of c.querySelectorAll('output, input, select, button')) x.remove();
    return c.textContent.replace(/\s+/g, ' ').trim();
  }

  /** Bedingungen, unter denen ein Regler sichtbar ist (aus den data-Attributen der Oberfläche). */
  function conditions(el) {
    const out = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const d = n.dataset || {};
      if (d.mode) out.push(`mode ∈ [${d.mode.split(' ').join(', ')}]`);
      if (d.show) out.push(`${d.show} = true`);
      if (d.bg) out.push(`bgRemove ∈ [${d.bg.split(' ').join(', ')}]`);
      if (d.edge) out.push(`edgeMethod = ${d.edge}`);
      if (d.algo) out.push(`ditherAlgo = ${d.algo}`);
      if (d.lineHide) out.push(`lineStyle ∉ [${d.lineHide.split(' ').join(', ')}]`);
      if (d.if) {
        const [k, v] = d.if.split(':');
        out.push(`${k} ∈ [${v.split(' ').join(', ')}]`);
      }
    }
    return out;
  }

  let schemaCache = null;

  function schema() {
    if (schemaCache) return schemaCache;
    const out = {};
    for (const [key, def] of Object.entries(DEFAULTS)) {
      out[key] = { type: Array.isArray(def) ? 'array' : def && typeof def === 'object' ? 'object' : typeof def, default: def };
    }
    out.mode.type = 'string';
    out.mode.options = $$('#mode button').map((b) => ({ value: b.dataset.value, label: b.textContent.trim(), hint: b.dataset.tip || b.title || '' }));
    out.mode.label = 'Modus';
    // Ein Schlüssel kann mehrere Regler haben (z. B. threshold, dpi je Modus) – jeder ist ein „Ort“
    for (const el of $$('#settings [data-key]')) {
      const key = el.dataset.key;
      const e = out[key];
      if (!e) continue;
      if (!e.places) {
        if (el.type === 'range' || el.type === 'number') {
          e.type = 'number';
          e.min = Number(el.min);
          e.max = Number(el.max);
          if (el.step && el.step !== 'any') e.step = Number(el.step);
        } else if (el.tagName === 'SELECT') {
          e.type = 'string'; // die Oberfläche speichert die Auswahl als Text
          e.options = Array.from(el.options).map((o) => ({ value: o.value, label: o.textContent.trim() }));
        } else if (el.type === 'checkbox') e.type = 'boolean';
        e.places = [];
      }
      const place = { label: labelText(el) };
      const hint = el.title || el.closest('label')?.title || '';
      if (hint) place.hint = hint;
      const h3 = el.closest('section.group')?.querySelector('h3');
      if (h3) place.section = h3.firstChild?.textContent.trim() || h3.textContent.trim();
      const cond = conditions(el);
      if (cond.length) place.visibleWhen = cond;
      e.places.push(place);
    }
    for (const [key, e] of Object.entries(out)) {
      if (!e.places) continue;
      const { places, ...rest } = e;
      // nur ein Regler: dessen Angaben direkt am Schlüssel
      out[key] = places.length === 1 ? { ...rest, ...places[0] } : { ...rest, label: places[0].label, places };
    }
    out.bgSeeds.hint = 'Klickpunkte in den Hintergrund für bgRemove color/sky…: [{x,y}] mit x,y von 0 bis 1 relativ zum Original.';
    out.samPoints.hint = 'Punkte für bgRemove sam/sam2: [{x,y,positive}] – positive=true auf das Motiv, false auf Weggelassenes; x,y von 0 bis 1.';
    out.colorEdits.hint = 'Modus Farben: [{from:"#rrggbb", to?:"#rrggbb", off?:true, into?:"#rrggbb"}] – Farbe umfärben, ausblenden oder zusammenführen (from wie in den Kennzahlen unter colors).';
    out.embLayers.hint = 'Stickparameter je Ebene, von Hand gesetzt (wie im Dialog „Je Farbe einstellen…“). Meist leer lassen.';
    schemaCache = out;
    return out;
  }

  const condsOk = (conds, s) => !conds || conds.every((c) => {
    const m = /^(\w+) (∈|∉|=) \[?([^\]]*)\]?$/.exec(c);
    if (!m) return true;
    const [, k, op, vals] = m;
    const list = vals.split(', ');
    const v = String(s[k]);
    if (op === '∈') return list.includes(v);
    if (op === '∉') return !list.includes(v);
    return vals === 'true' ? !!s[k] : v === vals;
  });

  /** Wirkt die Einstellung (mindestens einer ihrer Regler sichtbar)? only: nur Bedingungen auf diese Schlüssel prüfen. */
  const isVisible = (meta, s, only = null) => {
    const places = meta.places || [meta];
    const pick = (conds) => (conds && only ? conds.filter((c) => only.includes(c.split(' ')[0])) : conds);
    return places.some((p) => condsOk(pick(p.visibleWhen), s));
  };

  const validPoint = (p, sam) => p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.y)
    && (!sam || typeof p.positive === 'boolean' || p.positive === undefined);

  /** Wert prüfen und in die Form bringen, die auch die Oberfläche speichern würde. */
  function coerce(key, value, notes) {
    const meta = schema()[key];
    if (!meta) throw new Error(`Unbekannte Einstellung „${key}“ – siehe get_settings_schema.`);
    if (meta.options) {
      const v = String(value);
      if (!meta.options.some((o) => o.value === v)) {
        throw new Error(`${key}: „${value}“ ist nicht erlaubt. Möglich: ${meta.options.map((o) => o.value).join(', ')}`);
      }
      return v;
    }
    switch (meta.type) {
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (value === 'true' || value === 1) return true;
        if (value === 'false' || value === 0) return false;
        throw new Error(`${key}: true oder false erwartet.`);
      case 'number': {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new Error(`${key}: Zahl erwartet.`);
        if (meta.min == null) return n;
        const c = clamp(n, meta.min, meta.max);
        if (c !== n) notes.push(`${key}: ${n} auf ${c} begrenzt (Bereich ${meta.min}–${meta.max}).`);
        return c;
      }
      case 'array': {
        if (!Array.isArray(value)) throw new Error(`${key}: Liste erwartet.`);
        if (key === 'bgSeeds' || key === 'samPoints') {
          if (!value.every((p) => validPoint(p, key === 'samPoints'))) throw new Error(`${key}: Punkte als {x, y} mit Zahlen von 0 bis 1.`);
          return value.map((p) => ({
            x: clamp(Math.round(p.x * 10000) / 10000, 0, 1),
            y: clamp(Math.round(p.y * 10000) / 10000, 0, 1),
            ...(key === 'samPoints' ? { positive: p.positive !== false } : {}),
          }));
        }
        return value;
      }
      case 'object':
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${key}: Objekt erwartet.`);
        return value;
      default:
        return String(value);
    }
  }

  /* ---------------- Warten und Ergebnis beschreiben ---------------- */

  const busy = () => processTimer !== null || state.processing || state.mergePending;

  /** Wartet, bis keine Berechnung mehr läuft oder angesetzt ist. */
  async function waitIdle(maxWaitS) {
    const until = Date.now() + clamp(Number(maxWaitS) || 50, 1, 600) * 1000;
    await sleep(30);
    let calm = 0;
    while (Date.now() < until) {
      // zweimal hintereinander ruhig: zwischen Durchläufen (z. B. Neustart nach Abbruch) kurz nicht „busy“
      calm = busy() ? 0 : calm + 1;
      if (calm >= 2) return true;
      await sleep(calm ? 60 : 150);
    }
    return false;
  }

  function changedSettings(s = state.settings) {
    const out = {};
    for (const [k, v] of Object.entries(s)) {
      if (JSON.stringify(v) !== JSON.stringify(DEFAULTS[k])) out[k] = v;
    }
    return out;
  }

  function inkCoverage(r) {
    const n = r.w * r.h;
    if (!n) return null;
    let sum = 0;
    if (r.rgba8) {
      for (let i = 3; i < r.rgba8.length; i += 4) if (r.rgba8[i] > 127) sum++;
    } else if (r.gray8) {
      for (let i = 0; i < n; i++) {
        const a = r.alpha8 ? r.alpha8[i] / 255 : 1;
        sum += ((255 - r.gray8[i]) / 255) * a;
      }
    } else if (r.bits) {
      for (let i = 0; i < n; i++) sum += r.bits[i];
    } else return null;
    return Math.round((sum / n) * 1000) / 10;
  }

  function subpaths(svg) {
    let count = 0;
    for (const m of svg.matchAll(/\sd="([^"]*)"/g)) count += (m[1].match(/[Mm]/g) || []).length;
    return count;
  }

  const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

  function describe(sinceMs) {
    const r = state.result;
    const s = state.settings;
    const out = {
      image: state.source ? { name: state.source.name, widthPx: state.source.bitmap.width, heightPx: state.source.bitmap.height } : null,
      mode: s.mode,
      preset: state.activePreset ? state.activePreset.key.replace(/^(builtin|user):/, '') : null,
      processing: busy(),
    };
    if (r) {
      out.result = {
        upToDate: resultIsCurrent(r),
        widthPx: r.w,
        heightPx: r.h,
        widthMm: round(r.totalWmm ?? r.widthMm),
        heightMm: round(r.totalHmm ?? r.heightMm),
        dpi: Math.round(r.dpi),
        mmPerPx: round(r.mmPerPx || r.widthMm / r.w, 4),
        svgKB: Math.round(r.svg.length / 1024),
        svgSubpaths: subpaths(r.svg),
        inkCoveragePct: inkCoverage(r),
      };
      if (r.colorLayers) {
        out.result.colors = r.colorLayers.map((l) => ({ hex: l.hex, sharePct: round((l.share || 0) * 100), ...(l.name ? { name: l.name } : {}) }));
      }
      if (r.merge) out.result.mergedWith = r.merge.name || r.merge.id;
    }
    const info = {};
    for (const [k, sel] of [['status', '#status'], ['restore', '#restore-info'], ['faces', '#face-info'], ['text', '#text-info'], ['embroidery', '#emb-info']]) {
      const el = $(sel);
      const t = el && !el.closest('[hidden]') ? el.textContent.trim() : '';
      if (t) info[k] = t;
    }
    if (Object.keys(info).length) out.info = info;
    if (state.lastError) out.error = state.lastError;
    if (sinceMs != null) {
      const msgs = toastLog.filter((t) => t.at >= sinceMs).map((t) => (t.isError ? `Fehler: ${t.msg}` : t.msg));
      if (msgs.length) out.messages = msgs;
    }
    out.changedSettings = changedSettings();
    return out;
  }

  /* ---------------- Bilder ---------------- */

  async function snapshot(src, sw, sh, maxSize, region, mime = 'image/png') {
    let x = 0, y = 0, w = 1, h = 1;
    if (region) {
      x = clamp(Number(region.x) || 0, 0, 1);
      y = clamp(Number(region.y) || 0, 0, 1);
      w = clamp(Number(region.width) || 1, 0.001, 1 - x);
      h = clamp(Number(region.height) || 1, 0.001, 1 - y);
    }
    const cx = x * sw, cy = y * sh, cw = Math.max(1, w * sw), ch = Math.max(1, h * sh);
    // Ausschnitte bis 4× vergrößern (pixelgenau), ganze Bilder nur verkleinern
    const scale = Math.min(maxSize / Math.max(cw, ch), region ? 4 : 1);
    const tw = Math.max(1, Math.round(cw * scale)), th = Math.max(1, Math.round(ch * scale));
    const c = new OffscreenCanvas(tw, th);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, tw, th);
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, cx, cy, cw, ch, 0, 0, tw, th);
    const blob = await c.convertToBlob(mime === 'image/jpeg' ? { type: mime, quality: 0.88 } : { type: mime });
    return { data: new Uint8Array(await blob.arrayBuffer()), mimeType: mime, w: tw, h: th };
  }

  async function resultImage(maxSize, region) {
    const r = state.result;
    if (!r) return null;
    const { canvas, w, h } = rasterCanvas(r, false);
    const img = await snapshot(canvas, w, h, maxSize, region);
    return { ...img, label: `Ergebnis (${img.w} × ${img.h} px${region ? ', Ausschnitt' : ''}; volle Größe ${w} × ${h} px):` };
  }

  async function originalImage(maxSize, region) {
    if (!state.source) return null;
    const img = $('#img-original');
    try { await img.decode(); } catch { /* altes Bild bleibt */ }
    const src = img.naturalWidth ? img : state.source.bitmap;
    const sw = img.naturalWidth || state.source.bitmap.width, sh = img.naturalHeight || state.source.bitmap.height;
    const snap = await snapshot(src, sw, sh, maxSize, region, 'image/jpeg');
    return { ...snap, label: `Original-Ansicht (${snap.w} × ${snap.h} px; entfernter Hintergrund rot markiert bzw. ausgeblendet, Rahmen = erkannte Schrift/Gesichter):` };
  }

  /** Auf das Ergebnis warten und es mit Kennzahlen und Bild(ern) zurückgeben. */
  async function resultReply(args, since, { view = 'result', notes = [] } = {}) {
    if (!state.source) return { text: 'Kein Bild geöffnet – zuerst open_image.', isError: true };
    const done = await waitIdle(args.max_wait_s);
    const text = describe(since);
    if (notes.length) text.notes = notes;
    if (!done) {
      text.stillProcessing = 'Die Berechnung läuft noch (z. B. Modell-Download oder große KI-Berechnung). get_result erneut aufrufen.';
      return { text };
    }
    const maxSize = clamp(Number(args.max_size) || 1024, 256, 2048);
    const images = [];
    if (view === 'original' || view === 'both' || args.include_original) {
      const o = await originalImage(view === 'both' || args.include_original ? Math.min(maxSize, 1024) : maxSize, args.region);
      if (o) images.push(o);
    }
    if (view !== 'original') {
      const r = await resultImage(maxSize, args.region);
      if (r) images.push(r);
    }
    const failed = !!state.lastError && !(state.result && resultIsCurrent(state.result));
    return { text, images, isError: failed };
  }

  /* ---------------- Werkzeuge ---------------- */

  function applySettings(patch, reset) {
    const cur = state.settings;
    let base = cur;
    if (reset) {
      // wie „Einstellungen zurücksetzen“: Exportformate bleiben, Stickeinstellungen nicht
      const keep = outputPrefs(cur);
      for (const k of Object.keys(keep)) if (k.startsWith('emb')) delete keep[k];
      base = { ...DEFAULTS, ...keep, widthMm: cur.widthMm, bgSeeds: [], samPoints: [], colorEdits: [] };
      state.activePreset = null;
      renderPresets();
    }
    state.settings = withDefaults({ ...base, ...patch });
    state.cancelRetries = 0;
    dragReady = false;
    persistSettings();
    syncControls();
    renderMarkers();
    updatePresetHint();
    const keys = Object.keys(patch);
    if (keys.some((k) => k.startsWith('emb') || k === 'fmtPes' || k === 'fmtDst' || k === 'fmtExp')) scheduleEmbRefresh();
    // nur Ausgabe-Einstellungen geändert: kein neues Ergebnis nötig
    if (reset || keys.some((k) => !k.startsWith('fmt') && !k.startsWith('emb'))) scheduleProcess(0);
  }

  function findPreset(name) {
    const n = String(name || '').trim().toLowerCase().replace(/^(builtin|user):/, '');
    const user = state.presets.find((p) => p.name.toLowerCase() === n);
    if (user) return `user:${user.name}`;
    const b = BUILTIN_PRESETS.find((p) => p.name.toLowerCase() === n);
    return b ? `builtin:${b.name}` : null;
  }

  const tools = {
    async get_status() {
      return { text: describe() };
    },

    async get_settings_schema(args) {
      const only = args.only_current_mode !== false;
      const s = state.settings;
      const out = {};
      for (const [k, meta] of Object.entries(schema())) {
        // nur nach Modus filtern – Abhängigkeiten von anderen Schaltern stehen in visibleWhen
        if (only && !isVisible(meta, s, ['mode'])) continue;
        out[k] = { ...meta, current: s[k] };
      }
      return {
        text: {
          note: 'Werte wie in der App. visibleWhen = Bedingungen, unter denen der Regler sichtbar ist bzw. wirkt; places = mehrere Regler für denselben Wert (wirkt, wenn einer davon sichtbar ist). fmt* = Exportformate, emb* = Stickdatei.',
          currentMode: s.mode,
          settings: out,
        },
      };
    },

    async list_presets() {
      await refreshPresets();
      return {
        text: {
          builtin: BUILTIN_PRESETS.map((p) => ({ name: p.name, group: p.group, use: presetUse(p, 'builtin'), mode: p.settings.mode || 'vector', description: p.desc })),
          user: state.presets.map((p) => ({ name: p.name, use: presetUse(p, 'user'), mode: p.settings?.mode })),
          active: state.activePreset ? state.activePreset.key.replace(/^(builtin|user):/, '') : null,
        },
      };
    },

    async open_image(args) {
      const since = Date.now();
      const prev = state.source;
      await loadImage(args.name, new Uint8Array(args.bytes));
      if (state.source === prev) return { text: `„${args.name}“ konnte nicht gelesen werden.`, isError: true };
      return resultReply({ ...args, include_original: args.include_original !== false }, since);
    },

    async apply_preset(args) {
      const key = findPreset(args.name);
      if (!key) return { text: `Preset „${args.name}“ nicht gefunden – siehe list_presets.`, isError: true };
      const since = Date.now();
      applyPreset(key);
      return resultReply(args, since);
    },

    async set_settings(args) {
      const patch = args.settings;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { text: 'settings muss ein Objekt sein.', isError: true };
      const notes = [];
      const clean = {};
      try {
        for (const [k, v] of Object.entries(patch)) clean[k] = coerce(k, v, notes);
      } catch (err) {
        return { text: err.message, isError: true };
      }
      const since = Date.now();
      applySettings(clean, !!args.reset);
      const after = { ...state.settings };
      const hidden = Object.keys(clean).filter((k) => !isVisible(schema()[k], after));
      if (hidden.length) notes.push(`Wirkt in der aktuellen Kombination nicht (Regler ausgeblendet): ${hidden.join(', ')}.`);
      return resultReply(args, since, { notes });
    },

    async get_result(args) {
      return resultReply(args, Date.now() - 60000, { view: args.view || 'result' });
    },

    async export_files(args) {
      const done = await waitIdle(args.max_wait_s || 120);
      const r = state.result;
      if (!r) return { text: 'Noch kein Ergebnis vorhanden.', isError: true };
      if (!done || !resultIsCurrent(r)) return { text: 'Das Ergebnis wird noch berechnet – get_result abwarten und dann erneut exportieren.', isError: true };
      const s = { ...state.settings };
      if (Array.isArray(args.formats) && args.formats.length) {
        for (const f of ['svg', 'png', 'jpg', 'bmp', 'pes', 'dst', 'exp']) s[`fmt${f[0].toUpperCase()}${f.slice(1)}`] = args.formats.includes(f);
      }
      if (!laserFormats(s) && !(embModeOk(s) && (s.fmtPes || s.fmtDst || s.fmtExp))) {
        return { text: 'Kein Exportformat gewählt (bzw. Stickdatei in diesem Modus nicht möglich).', isError: true };
      }
      const problem = embroideryProblem(r, s);
      if (problem && !laserFormats(s)) return { text: problem, isError: true };
      const files = [];
      if (s.fmtSvg) files.push({ ext: 'svg', data: r.svg });
      files.push(...(await buildRasterFiles(r, { png: s.fmtPng, jpg: s.fmtJpg, bmp: s.fmtBmp })));
      files.push(...embroideryFiles(r, s));
      return { files, baseName: baseName(), warning: problem || undefined };
    },

    async after_export() {
      await saveToHistory(true); // wie beim Export von Hand
      toast('Von Claude exportiert');
      return {};
    },

    async send_to_lightburn() {
      await waitIdle(120);
      const r = state.result;
      if (!r) return { text: 'Noch kein Ergebnis vorhanden.', isError: true };
      if (!resultIsCurrent(r)) return { text: 'Das Ergebnis wird noch berechnet – get_result abwarten.', isError: true };
      const files = await handoverFiles(r, state.settings, false, true);
      const res = await window.api.lightburnSend({ baseName: baseName(), files });
      if (!res.ok) return { text: res.message, isError: true };
      await saveToHistory(true);
      const what = files.map((f) => f.ext.toUpperCase()).join(' + ');
      toast(`In LightBurn eingefügt (${what})`);
      return { text: res.confirmed ? `In LightBurn eingefügt (${what}).` : `An LightBurn gesendet (${what}), ohne Bestätigung.` };
    },

    async save_preset(args) {
      const name = String(args.name || '').trim().slice(0, 60);
      if (!name) return { text: 'Name fehlt.', isError: true };
      const settings = { ...state.settings };
      for (const k of ['bgSeeds', 'samPoints', 'colorEdits', 'embLayers']) delete settings[k];
      state.presets = await window.api.presets.save({ name, settings });
      state.activePreset = { key: `user:${name}`, settings };
      renderPresets();
      return { text: `Preset „${name}“ gespeichert.` };
    },

    async list_history(args) {
      await refreshHistory();
      const limit = clamp(Number(args.limit) || 30, 1, 200);
      return {
        text: state.history.slice(0, limit).map((e) => ({
          id: e.id,
          name: e.name,
          original: e.originalName,
          mode: e.settings?.mode,
          updated: e.updated ? new Date(e.updated).toISOString() : undefined,
        })),
      };
    },

    async open_history(args) {
      if (!state.history.some((e) => e.id === args.id)) await refreshHistory();
      if (!state.history.some((e) => e.id === args.id)) return { text: `Kein Historie-Eintrag mit id ${args.id}.`, isError: true };
      const since = Date.now();
      await openHistoryEntry(args.id);
      if (state.historyId !== args.id) return { text: 'Eintrag konnte nicht geladen werden.', isError: true };
      return resultReply(args, since);
    },

    async save_to_history() {
      await waitIdle(120);
      if (!state.result) return { text: 'Noch kein Ergebnis vorhanden.', isError: true };
      await saveToHistory(true);
      return { text: { id: state.historyId, name: state.historyName } };
    },
  };

  /* ---------------- Abschnitt „KI-Assistent (MCP)“ in den Einstellungen ---------------- */

  let info = null;
  let activity = null; // { tool, busy, at }

  function render() {
    const on = !!(info && info.enabled);
    $('#mcp-enabled').checked = on;
    const dot = $('#mcp-dot');
    dot.className = `mcp-dot${on && info.running ? ' on' : ''}${on && !info.running ? ' error' : ''}${activity && activity.busy ? ' busy' : ''}`;
    let status;
    if (!on) status = 'aus';
    else if (!info.running) status = 'Fehler';
    else if (activity && activity.busy) status = `Claude: ${activity.tool} …`;
    else status = `Port ${info.port}`;
    $('#mcp-status').textContent = status;
    $('#mcp-status').title = on && !info.running ? (info.error || 'Server läuft nicht') : '';
    // Dialog
    if (!info) return;
    $('#mcp-dialog-state').textContent = !on
      ? 'Der Server ist ausgeschaltet.'
      : info.running ? `Läuft auf ${info.url} (nur dieser Rechner).` : `Startet nicht: ${info.error || 'unbekannter Fehler'}`;
    $('#mcp-code-cmd').textContent = info.claudeCode;
    $('#mcp-desktop-json').textContent = info.desktopConfig;
    $('#mcp-url').textContent = info.url;
    $('#mcp-token').textContent = info.token;
    $('#mcp-portable-hint').hidden = !info.portable;
  }

  async function refresh() {
    try { info = await window.api.mcp.state(); } catch { info = null; }
    render();
  }

  function bind() {
    window.api.mcp.onCall(async ({ id, tool, args }) => {
      let res;
      try {
        const fn = tools[tool];
        res = fn ? await fn(args || {}) : { text: `Unbekanntes Werkzeug ${tool}`, isError: true };
      } catch (err) {
        console.error('MCP', tool, err);
        res = { text: cleanError(err), isError: true };
      }
      window.api.mcp.reply(id, res);
    });
    window.api.mcp.onActivity((a) => {
      activity = a;
      render();
    });
    $('#mcp-enabled').addEventListener('change', async (e) => {
      try {
        info = await window.api.mcp.set({ enabled: e.target.checked });
      } catch (err) {
        toast(`MCP-Server: ${cleanError(err)}`, true);
      }
      render();
      if (info && info.enabled && info.running) toast('MCP-Server eingeschaltet – unter „Einrichten…“ steht, wie Claude sich verbindet.');
      else if (info && info.enabled) toast(`MCP-Server startet nicht: ${info.error || 'unbekannter Fehler'}`, true);
    });
    $('#btn-mcp-setup').addEventListener('click', async () => {
      await refresh();
      $('#mcp-dialog').showModal();
    });
    for (const btn of $$('[data-copy]')) {
      btn.addEventListener('click', async () => {
        await window.api.copyText($(btn.dataset.copy).textContent);
        toast('In die Zwischenablage kopiert');
      });
    }
    $('#btn-mcp-token').addEventListener('click', async () => {
      if (!confirm('Neuen Schlüssel erzeugen? Bereits eingerichtete Clients (Claude Code u. a.) müssen danach neu eingerichtet werden.')) return;
      info = await window.api.mcp.set({ newToken: true });
      render();
    });
    refresh();
  }

  return { bind, tools };
})();

McpTools.bind();
