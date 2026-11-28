/**
 * Stickdateien aus den Vektorflächen (Modi Fläche, Linien und Farben).
 *
 * Flächen werden mit Füllstich (Tatami) gestickt: parallele Stichreihen im gewählten Winkel,
 * versetzte Einstichpunkte, darunter eine lockere Unterlage quer zur Stichrichtung und an den
 * Reihenenden ein Zugausgleich gegen das Zusammenziehen des Stoffes. Die Umrisslinie wird als
 * Steppstich gestickt. Reihenfolge je Farbe: Fläche für Fläche, jeweils Unterlage, dann Deckstich.
 * Wege zwischen den Teilflächen innerhalb der Fläche werden mitgestickt (liegen unter dem
 * späteren Deckstich oder in derselben Farbe darauf), sonst gesprungen; längere Sprünge mit
 * Fadenschnitt und Vernähen.
 *
 * Ausgabe:
 *  - PES (Brother, Version 1): PES-Teil für PE-Design u. a., PEC-Teil für die Stickmaschine
 *  - DST (Tajima): Industriestandard, ohne Farbinformation (Farben an der Maschine zuordnen)
 *  - EXP (Melco): Stichformat von Melco (DesignShop, Melco-Maschinen), ebenfalls ohne Farben
 *  - INF: Farben zu EXP/DST (gleicher Dateiname), liest z. B. Melco DesignShop ab Version 12
 * Koordinaten in den Dateien: 0,1 mm, Mitte des Motivs = Nullpunkt.
 */
export const Embroidery = (() => {
  const STITCH = 0, JUMP = 1, TRIM = 2, COLOR = 3, END = 4;
  const MAX_UNCUT_MM = 24; // längster Sprung ohne Schnitt: in DST 2 Sprünge à 12,1 mm

  /* ---------------- SVG-Pfad → Polygone ---------------- */

  const TOKENS = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

  /**
   * Zerlegt einen SVG-Pfad in geschlossene Polygone [[x0, y0, x1, y1, …], …].
   * Kurven und Bögen werden in Stücke von höchstens seg (Pfadeinheiten) zerlegt.
   */
  function pathToRings(d, seg, open = false) {
    const tok = String(d || '').match(TOKENS) || [];
    const rings = [];
    let ring = null, i = 0, cmd = '';
    let x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lqx = 0, lqy = 0, last = '';
    const isNum = () => i < tok.length && !/^[A-Za-z]$/.test(tok[i]);
    const num = () => Number(tok[i++]);
    const close = () => {
      if (ring && ring.length >= (open ? 4 : 6)) rings.push(ring);
      ring = null;
    };
    const lineTo = (nx, ny) => {
      if (!ring) ring = [x, y];
      ring.push(nx, ny);
      x = nx;
      y = ny;
    };
    const cubic = (x1, y1, x2, y2, x3, y3) => {
      const len = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
      const n = Math.min(100, Math.max(1, Math.ceil(len / seg)));
      const x0 = x, y0 = y;
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
        lineTo(a * x0 + b * x1 + c * x2 + e * x3, a * y0 + b * y1 + c * y2 + e * y3);
      }
      x = x3;
      y = y3;
    };
    const arc = (rx, ry, rot, large, sweep, x2, y2) => {
      rx = Math.abs(rx);
      ry = Math.abs(ry);
      if (!rx || !ry || (x === x2 && y === y2)) { lineTo(x2, y2); return; }
      // Endpunkt- in Mittelpunktdarstellung (SVG 1.1, Anhang F.6.5)
      const phi = (rot * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
      const dx = (x - x2) / 2, dy = (y - y2) / 2;
      const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
      const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
      if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
      let co = den ? Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den)) : 0;
      if (!!large === !!sweep) co = -co;
      const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
      const cx = cp * cxp - sp * cyp + (x + x2) / 2, cy = sp * cxp + cp * cyp + (y + y2) / 2;
      const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
      let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
      if (!sweep && dt > 0) dt -= 2 * Math.PI;
      else if (sweep && dt < 0) dt += 2 * Math.PI;
      const n = Math.min(200, Math.max(1, Math.ceil((Math.abs(dt) * Math.max(rx, ry)) / seg)));
      for (let k = 1; k < n; k++) {
        const t = t1 + (dt * k) / n, ct = Math.cos(t), st = Math.sin(t);
        lineTo(cx + rx * ct * cp - ry * st * sp, cy + rx * ct * sp + ry * st * cp);
      }
      lineTo(x2, y2);
    };

    while (i < tok.length) {
      if (!isNum()) cmd = tok[i++];
      const rel = cmd === cmd.toLowerCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      switch (cmd.toUpperCase()) {
        case 'M': {
          close();
          x = num() + ox;
          y = num() + oy;
          sx = x;
          sy = y;
          cmd = rel ? 'l' : 'L'; // weitere Koordinatenpaare sind Linien
          break;
        }
        case 'L': lineTo(num() + ox, num() + oy); break;
        case 'H': lineTo(num() + ox, y); break;
        case 'V': lineTo(x, num() + oy); break;
        case 'C': {
          const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy;
          lcx = x2; lcy = y2;
          cubic(x1, y1, x2, y2, num() + ox, num() + oy);
          break;
        }
        case 'S': {
          const x1 = last === 'C' ? 2 * x - lcx : x, y1 = last === 'C' ? 2 * y - lcy : y;
          const x2 = num() + ox, y2 = num() + oy;
          lcx = x2; lcy = y2;
          cubic(x1, y1, x2, y2, num() + ox, num() + oy);
          break;
        }
        case 'Q':
        case 'T': {
          let qx, qy;
          if (cmd.toUpperCase() === 'Q') { qx = num() + ox; qy = num() + oy; }
          else { qx = last === 'Q' ? 2 * x - lqx : x; qy = last === 'Q' ? 2 * y - lqy : y; }
          const ex = num() + ox, ey = num() + oy;
          lqx = qx; lqy = qy;
          cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey);
          break;
        }
        case 'A': {
          const rx = num(), ry = num(), rot = num(), large = num(), sweep = num();
          arc(rx, ry, rot, large, sweep, num() + ox, num() + oy);
          break;
        }
        case 'Z':
          if (open && ring) ring.push(sx, sy); // offene Linien: geschlossenen Teilpfad bis zum Start führen
          close();
          x = sx;
          y = sy;
          break;
        default:
          i++; // unbekanntes Zeichen überspringen
      }
      last = cmd.toUpperCase() === 'S' ? 'C' : cmd.toUpperCase() === 'T' ? 'Q' : cmd.toUpperCase();
      if (!Number.isFinite(x) || !Number.isFinite(y)) return rings; // kaputter Pfad
    }
    close();
    return rings;
  }

  /** Polygone (Pfadeinheiten) → mm: x * scale + dx. */
  function scaleRings(rings, scale, dx = 0, dy = 0) {
    return rings.map((r) => {
      const o = new Float64Array(r.length);
      for (let k = 0; k < r.length; k += 2) {
        o[k] = r[k] * scale + dx;
        o[k + 1] = r[k + 1] * scale + dy;
      }
      return o;
    });
  }

  /* ---------------- Füllstich: Reihen und Blöcke ---------------- */

  /**
   * Schneidet die Fläche (gerade-ungerade gefüllt) mit Reihen im Abstand spacing quer zur
   * Stichrichtung angle. Gedrehte Koordinaten: u entlang der Reihe, v quer dazu.
   */
  function scanRows(rings, angle, spacing) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    let vmin = Infinity, vmax = -Infinity;
    const edges = [];
    for (const r of rings) {
      const n = r.length / 2;
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        const x1 = r[2 * k], y1 = r[2 * k + 1], x2 = r[2 * j], y2 = r[2 * j + 1];
        const v1 = -x1 * sa + y1 * ca, v2 = -x2 * sa + y2 * ca;
        if (v1 === v2) continue;
        edges.push(x1 * ca + y1 * sa, v1, x2 * ca + y2 * sa, v2);
        if (v1 < vmin) vmin = v1;
        if (v1 > vmax) vmax = v1;
      }
    }
    if (!edges.length) return null;
    const span = vmax - vmin;
    const n = Math.max(1, Math.round(span / spacing));
    const v0 = vmin + (span - (n - 1) * spacing) / 2; // Reihen mittig, auch schmale Flächen bekommen eine
    const xs = Array.from({ length: n }, () => []);
    for (let e = 0; e < edges.length; e += 4) {
      const u1 = edges[e], v1 = edges[e + 1], u2 = edges[e + 2], v2 = edges[e + 3];
      const lo = Math.min(v1, v2), hi = Math.max(v1, v2);
      const k0 = Math.max(0, Math.ceil((lo - v0) / spacing));
      const k1 = Math.min(n - 1, Math.floor((hi - v0) / spacing));
      for (let k = k0; k <= k1; k++) {
        const v = v0 + k * spacing;
        if (v < lo || v >= hi) continue; // halboffen: Ecken zählen genau einmal
        xs[k].push(u1 + ((v - v1) * (u2 - u1)) / (v2 - v1));
      }
    }
    const rows = xs.map((a, k) => {
      a.sort((p, q) => p - q);
      const segs = [];
      for (let j = 0; j + 1 < a.length; j += 2) if (a[j + 1] - a[j] > 1e-6) segs.push({ k, a: a[j], b: a[j + 1], blk: null });
      return segs;
    });
    return { ca, sa, v0, spacing, rows };
  }

  /**
   * Zerlegt die Reihen in Blöcke, die sich in einem Zug hin und her sticken lassen
   * (je Reihe genau ein Abschnitt, Abschnitte benachbarter Reihen überlappen).
   * Zusammenhängende Blöcke bekommen dieselbe Flächennummer (region).
   */
  function buildBlocks(sc) {
    const blocks = [];
    let open = [];
    for (const segs of sc.rows) {
      const cnt = new Map();
      for (const bl of open) {
        const l = bl.rows[bl.rows.length - 1];
        bl.cand = segs.filter((s) => s.a < l.b && l.a < s.b);
        for (const s of bl.cand) cnt.set(s, (cnt.get(s) || 0) + 1);
      }
      const next = [];
      for (const bl of open) {
        const s = bl.cand.length === 1 && cnt.get(bl.cand[0]) === 1 ? bl.cand[0] : null;
        if (s) {
          bl.rows.push(s);
          s.blk = bl;
          next.push(bl);
        }
        bl.cand = null;
      }
      for (const s of segs) {
        if (s.blk) continue;
        const bl = { rows: [s], id: blocks.length };
        blocks.push(bl);
        s.blk = bl;
        next.push(bl);
      }
      open = next;
    }
    // Flächen: Blöcke, deren Abschnitte in benachbarten Reihen überlappen, hängen zusammen
    const parent = blocks.map((_, k) => k);
    const find = (k) => { while (parent[k] !== k) k = parent[k] = parent[parent[k]]; return k; };
    for (let k = 1; k < sc.rows.length; k++) {
      const prev = sc.rows[k - 1], cur = sc.rows[k];
      let j = 0;
      for (const s of cur) {
        while (j < prev.length && prev[j].b <= s.a) j++;
        for (let m = j; m < prev.length && prev[m].a < s.b; m++) {
          const a = find(s.blk.id), b = find(prev[m].blk.id);
          if (a !== b) parent[a] = b;
        }
      }
    }
    for (const bl of blocks) bl.region = find(bl.id);
    return blocks;
  }

  /**
   * Wege innerhalb der Fläche (für Verbindungsstiche statt Sprung und Schnitt).
   * Raster aus den Reihen des Deckstichs (Zeilen = Reihen, Spalten alle cu mm); Suche per A*,
   * bereits gestickte Zellen kosten mehr – Verbindungen laufen bevorzugt unter dem späteren Deckstich.
   */
  function makeRouter(sc, o) {
    const cu = 0.5, margin = 0.15;
    let umin = Infinity, umax = -Infinity;
    for (const row of sc.rows) for (const s of row) { if (s.a < umin) umin = s.a; if (s.b > umax) umax = s.b; }
    const n = sc.rows.length, m = Math.max(1, Math.ceil((umax - umin) / cu));
    const N = n * m;
    if (!Number.isFinite(umin) || N > 4e6) return null;
    const cell = new Uint8Array(N); // 0 = außen, 1 = frei, 2 = schon gestickt
    const colOf = (u) => Math.floor((u - umin) / cu);
    sc.rows.forEach((row, k) => {
      for (const s of row) {
        const j0 = Math.max(0, Math.ceil((s.a + margin - umin) / cu - 0.5)), j1 = Math.min(m - 1, Math.floor((s.b - margin - umin) / cu - 0.5));
        for (let j = j0; j <= j1; j++) cell[k * m + j] = 1;
      }
    });
    const toUV = (x, y) => [x * sc.ca + y * sc.sa, -x * sc.sa + y * sc.ca];
    const toXY = (u, v) => [u * sc.ca - v * sc.sa, u * sc.sa + v * sc.ca];
    const rowOf = (v) => Math.round((v - sc.v0) / sc.spacing);
    const inside = (x, y) => {
      const [u, v] = toUV(x, y);
      const row = sc.rows[rowOf(v)];
      if (!row) return false;
      for (const s of row) if (u >= s.a - 0.15 && u <= s.b + 0.15) return true;
      return false;
    };
    const covered = (x, y) => {
      const [u, v] = toUV(x, y);
      const k = rowOf(v), j = colOf(u);
      return k >= 0 && k < n && j >= 0 && j < m && cell[k * m + j] === 2;
    };
    // nächste freie Zelle zu einem Punkt (Blockenden liegen am Rand, knapp außerhalb des Rasters)
    const near = (x, y) => {
      const [u, v] = toUV(x, y);
      const k0 = rowOf(v), j0 = colOf(u);
      let best = -1, bd = Infinity;
      for (let dk = -2; dk <= 2; dk++) {
        const k = k0 + dk;
        if (k < 0 || k >= n) continue;
        for (let dj = -3; dj <= 3; dj++) {
          const j = j0 + dj;
          if (j < 0 || j >= m || !cell[k * m + j]) continue;
          const d = (dk * sc.spacing) ** 2 + (dj * cu) ** 2;
          if (d < bd) { bd = d; best = k * m + j; }
        }
      }
      return best;
    };
    // A* mit wiederverwendeten Feldern (Stempel statt Neuanlage je Suche)
    const g = new Float64Array(N), from = new Int32Array(N), stamp = new Uint32Array(N), shut = new Uint32Array(N);
    let run = 0;
    const heapK = [], heapV = [];
    const hpush = (key, v) => {
      let i = heapK.length;
      heapK.push(key); heapV.push(v);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heapK[p] <= key) break;
        heapK[i] = heapK[p]; heapV[i] = heapV[p];
        i = p;
      }
      heapK[i] = key; heapV[i] = v;
    };
    const hpop = () => {
      const top = heapV[0], k = heapK.pop(), v = heapV.pop();
      if (heapK.length) {
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let c = i, ck = k;
          if (l < heapK.length && heapK[l] < ck) { c = l; ck = heapK[l]; }
          if (r < heapK.length && heapK[r] < ck) { c = r; ck = heapK[r]; }
          if (c === i) break;
          heapK[i] = heapK[c]; heapV[i] = heapV[c];
          i = c;
        }
        heapK[i] = k; heapV[i] = v;
      }
      return top;
    };
    const sp = sc.spacing, dg = Math.hypot(sp, cu);
    const NB = [[0, 1, cu], [0, -1, cu], [1, 0, sp], [-1, 0, sp], [1, 1, dg], [1, -1, dg], [-1, 1, dg], [-1, -1, dg]];
    const search = (a, b, limit) => {
      run++;
      heapK.length = 0; heapV.length = 0;
      const bk = (b / m) | 0, bj = b % m;
      const hfun = (c) => Math.hypot((((c / m) | 0) - bk) * sp, ((c % m) - bj) * cu);
      g[a] = 0; stamp[a] = run; from[a] = -1;
      hpush(hfun(a), a);
      let steps = 0;
      while (heapK.length) {
        const c = hpop();
        if (shut[c] === run) continue;
        shut[c] = run;
        if (c === b) break;
        if (++steps > limit) return null;
        const ck = (c / m) | 0, cj = c % m;
        for (const [dk, dj, len] of NB) {
          const k = ck + dk, j = cj + dj;
          if (k < 0 || k >= n || j < 0 || j >= m) continue;
          const q = k * m + j, t = cell[q];
          if (!t || shut[q] === run) continue;
          // diagonal nur, wenn beide Nachbarn frei sind (nicht über eine Ecke nach außen)
          if (dk && dj && (!cell[ck * m + j] || !cell[k * m + cj])) continue;
          // über Gesticktem: entlang der Reihen fast unsichtbar (liegt in der Stichstruktur), quer dazu teuer
          const ng = g[c] + len * (t === 2 ? (dk ? 6 : 1.5) : 1);
          if (stamp[q] === run && ng >= g[q]) continue;
          stamp[q] = run; g[q] = ng; from[q] = c;
          hpush(ng + hfun(q), q);
        }
      }
      if (shut[b] !== run) return null;
      const path = [];
      for (let c = b; c >= 0; c = from[c]) path.push(c);
      return path.reverse();
    };
    return {
      inside,
      /** Gestickte Reihen eines Blocks als belegt markieren. */
      cover(bl) {
        for (const s of bl.rows) {
          const j0 = Math.max(0, colOf(s.a)), j1 = Math.min(m - 1, colOf(s.b));
          for (let j = j0; j <= j1; j++) if (cell[s.k * m + j]) cell[s.k * m + j] = 2;
        }
      },
      /** Weg von (x1, y1) nach (x2, y2) als Punktliste [x, y, …] ohne Startpunkt, oder null. */
      route(x1, y1, x2, y2) {
        const d = Math.hypot(x2 - x1, y2 - y1);
        // kurze gerade Strecke in der Fläche, die nicht über Gesticktes läuft: direkt
        let straight = insideLine(inside, x1, y1, x2, y2);
        if (straight && d > 1.5) {
          const k = Math.ceil(d / 0.5);
          for (let i = 1; i < k && straight; i++) if (covered(x1 + ((x2 - x1) * i) / k, y1 + ((y2 - y1) * i) / k)) straight = false;
        }
        if (straight) return [x2, y2];
        const a = near(x1, y1), b = near(x2, y2);
        if (a < 0 || b < 0) return null;
        const cells = search(a, b, 400000);
        if (!cells) return null;
        const pts = [x1, y1];
        for (const c of cells) {
          const k = (c / m) | 0, j = c % m;
          pts.push(...toXY(umin + (j + 0.5) * cu, sc.v0 + k * sp));
        }
        pts.push(x2, y2);
        // Länge des Wegs und Anteil über schon Gesticktem (läge sichtbar obenauf)
        let len = 0, over = 0;
        for (let i = 1; i < cells.length; i++) {
          const a0 = cells[i - 1], b0 = cells[i];
          const l = Math.hypot((((b0 / m) | 0) - ((a0 / m) | 0)) * sp, ((b0 % m) - (a0 % m)) * cu);
          len += l;
          if (cell[b0] === 2) over += l;
        }
        if (len > Math.max(3 * d, d + 20) || over > o.overMax) return null; // großer Umweg: springen
        const simple = simplifyLine(pts, 0.25);
        return simple.slice(2);
      },
    };
  }

  /** Douglas-Peucker für eine offene Linie [x, y, …]. */
  function simplifyLine(p, tol) {
    const n = p.length / 2;
    if (n < 3) return p;
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]], t2 = tol * tol;
    while (stack.length) {
      const [a, b] = stack.pop();
      const ax = p[2 * a], ay = p[2 * a + 1], dx = p[2 * b] - ax, dy = p[2 * b + 1] - ay, l2 = dx * dx + dy * dy;
      let mi = -1, md = t2;
      for (let k = a + 1; k < b; k++) {
        const px = p[2 * k] - ax, py = p[2 * k + 1] - ay;
        const d = l2 ? (px * dy - py * dx) ** 2 / l2 : px * px + py * py;
        if (d > md) { md = d; mi = k; }
      }
      if (mi >= 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    const out = [];
    for (let k = 0; k < n; k++) if (keep[k]) out.push(p[2 * k], p[2 * k + 1]);
    return out;
  }

  /**
   * Einstiegsmöglichkeiten eines Blocks: erste oder letzte Reihe, linkes oder rechtes Ende.
   * ext: Verlängerung der Reihenenden (Zugausgleich, negativ = Einzug für die Unterlage).
   */
  function blockEntries(bl, sc, ext) {
    const f = bl.rows[0], l = bl.rows[bl.rows.length - 1];
    const vf = sc.v0 + f.k * sc.spacing, vl = sc.v0 + l.k * sc.spacing;
    return [
      [f.a - ext, vf, true, true], [f.b + ext, vf, true, false],
      [l.a - ext, vl, false, true], [l.b + ext, vl, false, false],
    ].map(([u, v, top, left]) => ({ x: u * sc.ca - v * sc.sa, y: u * sc.sa + v * sc.ca, top, left }));
  }

  /**
   * Stichpunkte (mm) eines Blocks: Reihen hin und her, Einstiche auf einem versetzten Raster
   * (Tatami: je Reihe um 1/stagger der Stichlänge verschoben), Reihenenden um ext verlängert.
   */
  function stitchBlock(bl, sc, entry, o) {
    const rows = entry.top ? bl.rows : bl.rows.slice().reverse();
    const L = o.len, minGap = Math.min(0.5, L / 3);
    const pts = [];
    let ltr = entry.left;
    for (const s of rows) {
      const a = s.a - o.ext, b = s.b + o.ext;
      if (b - a < o.minRow) continue; // Unterlage: zu schmal nach dem Einzug
      const v = sc.v0 + s.k * sc.spacing;
      const ph = o.stagger ? (((s.k * 3) % o.stagger) / o.stagger) * L : 0;
      const us = [];
      const j0 = Math.ceil((a + minGap - ph) / L), j1 = Math.floor((b - minGap - ph) / L);
      for (let j = j0; j <= j1; j++) us.push(ph + j * L);
      if (!ltr) us.reverse();
      us.unshift(ltr ? a : b);
      us.push(ltr ? b : a);
      for (const u of us) pts.push(u * sc.ca - v * sc.sa, u * sc.sa + v * sc.ca);
      ltr = !ltr;
    }
    return pts;
  }

  /* ---------------- Reihenfolge: nächster Nachbar ---------------- */

  /**
   * Gitterindex für die Suche nach dem nächsten Einstieg. items: [{ entries: [{x, y}] }];
   * entfernte Einträge (item.used) werden übergangen.
   */
  function makeIndex(items, cell) {
    const map = new Map();
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    for (const it of items) {
      for (const e of it.entries) {
        const gx = Math.floor(e.x / cell), gy = Math.floor(e.y / cell), key = `${gx},${gy}`;
        let list = map.get(key);
        if (!list) map.set(key, (list = []));
        list.push({ it, e });
        if (gx < gx0) gx0 = gx;
        if (gx > gx1) gx1 = gx;
        if (gy < gy0) gy0 = gy;
        if (gy > gy1) gy1 = gy;
      }
    }
    let left = items.filter((it) => it.entries.length).length;
    for (const it of items) if (!it.entries.length) it.used = true;
    return {
      get left() { return left; },
      take(it) { if (!it.used) { it.used = true; left--; } },
      nearest(x, y) {
        if (!left) return null;
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
        const maxR = Math.max(Math.abs(cx - gx0), Math.abs(cx - gx1), Math.abs(cy - gy0), Math.abs(cy - gy1));
        let best = null, bd = Infinity;
        const visit = (gx, gy) => {
          const list = map.get(`${gx},${gy}`);
          if (!list) return;
          for (const c of list) {
            if (c.it.used) continue;
            const d = (c.e.x - x) ** 2 + (c.e.y - y) ** 2;
            if (d < bd) { bd = d; best = c; }
          }
        };
        for (let r = 0; r <= maxR; r++) {
          if (best && (r - 1) * cell > Math.sqrt(bd)) break;
          if (!r) { visit(cx, cy); continue; }
          for (let gx = cx - r; gx <= cx + r; gx++) { visit(gx, cy - r); visit(gx, cy + r); }
          for (let gy = cy - r + 1; gy < cy + r; gy++) { visit(cx - r, gy); visit(cx + r, gy); }
        }
        return best;
      },
    };
  }

  /* ---------------- Stichfolge (Nadelweg) ---------------- */

  /** Sammelt Stiche, Sprünge, Schnitte und Farbwechsel (mm, absolut). */
  function makePen(o) {
    const ops = [];
    let px = null, py = null, tie = true, lastDx = 0, lastDy = 0, stitched = false, layer = 0;
    const push = (x, y, c) => {
      ops.push({ x, y, c, l: layer });
      if (c === STITCH) {
        if (px !== null && (x !== px || y !== py)) { lastDx = x - px; lastDy = y - py; }
        stitched = true;
      }
      px = x;
      py = y;
    };
    // Vernähen am Ende (vor Schnitt/Farbwechsel): kurz zurück und wieder vor
    const tieOff = () => {
      if (!stitched || px === null) return;
      const l = Math.hypot(lastDx, lastDy);
      if (!l) return;
      const ux = lastDx / l, uy = lastDy / l, t = o.tieLen;
      const ex = px, ey = py;
      push(ex - ux * t, ey - uy * t, STITCH);
      push(ex, ey, STITCH);
      push(ex - ux * t, ey - uy * t, STITCH);
      push(ex, ey, STITCH);
    };
    /** Stich zum Punkt; lange Strecken werden in Stiche von höchstens maxLen geteilt. */
    const lineTo = (x, y, maxLen = o.maxLen) => {
      if (px === null) { push(x, y, JUMP); tie = true; }
      const dx = x - px, dy = y - py, d = Math.hypot(dx, dy);
      if (tie) {
        // Vernähen am Anfang: am Einstich vor und zurück (liegt unter den folgenden Stichen)
        tie = false;
        const ax = px, ay = py;
        push(ax, ay, STITCH);
        if (d > 0) {
          const t = Math.min(o.tieLen, d / 2), ux = dx / d, uy = dy / d;
          push(ax + ux * t, ay + uy * t, STITCH);
          push(ax, ay, STITCH);
          push(ax + ux * t, ay + uy * t, STITCH);
          push(ax, ay, STITCH);
        }
      }
      if (d < 1e-9) return;
      const n = Math.max(1, Math.ceil(d / maxLen - 1e-9));
      const sx = px, sy = py;
      for (let k = 1; k <= n; k++) push(sx + (dx * k) / n, sy + (dy * k) / n, STITCH);
    };
    return {
      ops,
      get pos() { return px === null ? null : { x: px, y: py }; },
      lineTo,
      /** Zum Anfang des nächsten Abschnitts: innerhalb der Fläche mitsticken, sonst springen. */
      moveTo(x, y, router) {
        if (px === null) { push(x, y, JUMP); tie = true; return; }
        const d = Math.hypot(x - px, y - py);
        if (d < 1e-9) return;
        const path = !tie && router ? router.route(px, py, x, y) : null;
        if (path) {
          for (let k = 0; k < path.length; k += 2) lineTo(path[k], path[k + 1], o.travelLen);
          return;
        }
        tieOff();
        // längere Sprünge immer schneiden: DST braucht dafür 3+ Sprünge, das werten Maschinen als Schnitt
        if (stitched && d >= Math.min(o.trimMm, MAX_UNCUT_MM)) ops.push({ x: px, y: py, c: TRIM, l: layer });
        push(x, y, JUMP);
        tie = true;
      },
      /** Zustand merken/zurücksetzen (Farbe ohne Stiche wieder entfernen) */
      save() { return { n: ops.length, px, py, tie, lastDx, lastDy, stitched }; },
      restore(s) { ops.length = s.n; ({ px, py, tie, lastDx, lastDy, stitched } = s); },
      /** Ebene (Index in der Liste) für die folgenden Stiche – für Vorschau und Statistik */
      set layer(i) { layer = i; },
      colorChange() {
        tieOff();
        ops.push({ x: px, y: py, c: TRIM, l: layer });
        ops.push({ x: px, y: py, c: COLOR, l: layer });
        tie = true;
        stitched = false;
      },
      end() {
        tieOff();
        if (px !== null) {
          ops.push({ x: px, y: py, c: TRIM, l: layer });
          ops.push({ x: px, y: py, c: END, l: layer });
        }
      },
    };
  }

  /** Verläuft die Strecke innerhalb der Fläche? (Stichproben alle 0,25 mm) */
  function insideLine(inside, x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.ceil(d / 0.25));
    for (let k = 0; k <= n; k++) if (!inside(x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n)) return false;
    return true;
  }

  /* ---------------- Flächen und Linien sticken ---------------- */

  /** Füllstich einer Farbe: je zusammenhängender Fläche erst die Unterlage, dann der Deckstich. */
  function fillLayer(pen, rings, o) {
    const ang = (o.angle * Math.PI) / 180;
    const top = scanRows(rings, ang, o.spacing);
    if (!top) return;
    const topBlocks = buildBlocks(top);
    const router = makeRouter(top, o);
    // kräftige Unterlage: zuerst ein Steppstich entlang der Kanten (Wege dazwischen innerhalb der Fläche)
    if (o.edgeRun) runLayer(pen, rings, { runLen: 2.5 }, router);
    const regions = new Map();
    const regionOf = (id) => {
      let r = regions.get(id);
      if (!r) regions.set(id, (r = { top: [], under: [], entries: [] }));
      return r;
    };
    for (const bl of topBlocks) regionOf(bl.region).top.push(bl);

    let under = null;
    if (o.underlay) {
      under = scanRows(rings, ang + Math.PI / 2, o.underSpacing);
      if (under) {
        const inTop = (x, y) => {
          const u = x * top.ca + y * top.sa, v = -x * top.sa + y * top.ca;
          const row = top.rows[Math.round((v - top.v0) / top.spacing)];
          return row && row.find((s) => u >= s.a && u <= s.b);
        };
        for (const bl of buildBlocks(under)) {
          // Fläche über einen Punkt des Blocks bestimmen (Mitte der mittleren Reihe)
          const s = bl.rows[bl.rows.length >> 1];
          const v = under.v0 + s.k * under.spacing, u = (s.a + s.b) / 2;
          const hit = inTop(u * under.ca - v * under.sa, u * under.sa + v * under.ca);
          regionOf(hit ? hit.blk.region : `u${bl.id}`).under.push(bl);
        }
      }
    }
    const topOpt = { len: o.len, ext: o.pull, minRow: 0, stagger: 4 };
    const underOpt = { len: o.underLen, ext: -o.inset, minRow: 0.6, stagger: 0 };
    for (const r of regions.values()) {
      for (const bl of r.under) bl.entries = blockEntries(bl, under, underOpt.ext);
      for (const bl of r.top) bl.entries = blockEntries(bl, top, topOpt.ext);
      r.entries = (r.under.length ? r.under : r.top).flatMap((bl) => bl.entries);
    }
    const regionIdx = makeIndex([...regions.values()], 5);
    // eine Gruppe von Blöcken in der Reihenfolge des jeweils nächsten Einstiegs sticken
    const runBlocks = (blocks, sc, so) => {
      const idx = makeIndex(blocks, 3);
      while (idx.left) {
        const p = pen.pos || { x: 0, y: 0 };
        const c = idx.nearest(p.x, p.y);
        idx.take(c.it);
        const pts = stitchBlock(c.it, sc, c.e, so);
        if (pts.length < 2) continue;
        pen.moveTo(pts[0], pts[1], router);
        for (let k = 2; k < pts.length; k += 2) pen.lineTo(pts[k], pts[k + 1], o.maxLen);
        if (router && sc === top) router.cover(c.it);
      }
    };
    while (regionIdx.left) {
      const p = pen.pos || { x: 0, y: 0 };
      const c = regionIdx.nearest(p.x, p.y);
      regionIdx.take(c.it);
      if (c.it.under.length) runBlocks(c.it.under, under, underOpt);
      if (c.it.top.length) runBlocks(c.it.top, top, topOpt);
    }
  }

  /** Douglas-Peucker für eine geschlossene Linie (flaches Array), tol in mm. */
  function simplifyRing(r, tol) {
    const n = r.length / 2;
    if (n < 4) return r;
    const keep = new Uint8Array(n);
    keep[0] = 1;
    // zweiter Ankerpunkt: der am weitesten vom ersten entfernte
    let far = 0, fd = -1;
    for (let k = 1; k < n; k++) {
      const d = (r[2 * k] - r[0]) ** 2 + (r[2 * k + 1] - r[1]) ** 2;
      if (d > fd) { fd = d; far = k; }
    }
    keep[far] = 1;
    const stack = [[0, far], [far, n]];
    const t2 = tol * tol;
    while (stack.length) {
      const [a, b] = stack.pop();
      if (b - a < 2) continue;
      const ax = r[2 * a], ay = r[2 * a + 1], bx = r[2 * (b % n)], by = r[2 * (b % n) + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let m = -1, md = t2;
      for (let k = a + 1; k < b; k++) {
        const px = r[2 * k] - ax, py = r[2 * k + 1] - ay;
        const d = l2 ? (px * dy - py * dx) ** 2 / l2 : px * px + py * py;
        if (d > md) { md = d; m = k; }
      }
      if (m >= 0) {
        keep[m] = 1;
        stack.push([a, m], [m, b]);
      }
    }
    const out = [];
    for (let k = 0; k < n; k++) if (keep[k]) out.push(r[2 * k], r[2 * k + 1]);
    return out;
  }

  /**
   * Steppstich entlang geschlossener Linien (Umrisslinie, Kontur schmaler Flächen, Kantenunterlage).
   * triple: Dreifachstich (jeder Stich vor, zurück, vor) – kräftigere Linie.
   * router: Wege zwischen den Linien innerhalb einer Fläche mitsticken.
   */
  function runLayer(pen, rings, o, router = null, triple = false) {
    const items = rings.map((r) => {
      const s = simplifyRing(r, 0.05);
      const n = s.length / 2;
      const step = Math.max(1, Math.floor(n / 24)); // Einstieg an bis zu ~24 Stellen der Linie
      const entries = [];
      for (let k = 0; k < n; k += step) entries.push({ x: s[2 * k], y: s[2 * k + 1], k });
      return { s, entries };
    });
    const idx = makeIndex(items, 5);
    while (idx.left) {
      const p = pen.pos || { x: 0, y: 0 };
      const c = idx.nearest(p.x, p.y);
      idx.take(c.it);
      const { s } = c.it, n = s.length / 2;
      if (n < 2) continue;
      pen.moveTo(s[2 * c.e.k], s[2 * c.e.k + 1], router);
      for (let j = 1; j <= n; j++) {
        const k = (c.e.k + j) % n;
        const tx = s[2 * k], ty = s[2 * k + 1];
        if (!triple) { pen.lineTo(tx, ty, o.runLen); continue; }
        const q = pen.pos, d = Math.hypot(tx - q.x, ty - q.y);
        const m = Math.max(1, Math.ceil(d / o.runLen - 1e-9));
        for (let t = 1; t <= m; t++) {
          const ax = q.x + ((tx - q.x) * (t - 1)) / m, ay = q.y + ((ty - q.y) * (t - 1)) / m;
          const bx = q.x + ((tx - q.x) * t) / m, by = q.y + ((ty - q.y) * t) / m;
          pen.lineTo(bx, by, 1e9);
          pen.lineTo(ax, ay, 1e9);
          pen.lineTo(bx, by, 1e9);
        }
      }
    }
  }

  /**
   * Offene Linien (Modus Wellen) im Steppstich bzw. Dreifachstich: Einstieg am näheren Ende jeder Linie,
   * die Stiche folgen der Linie mit höchstens o.tol Abweichung, sind nicht länger als o.runLen und nicht
   * kürzer als o.minLen (zu kurze Stiche reißen den Faden bzw. stechen an derselben Stelle ein).
   */
  function lineLayer(pen, lines, o, triple = false) {
    const items = lines.map((r) => {
      const s = simplifyLine(Array.from(r), o.tol);
      const n = s.length / 2;
      return { s, entries: n < 2 ? [] : [{ x: s[0], y: s[1], rev: false }, { x: s[2 * n - 2], y: s[2 * n - 1], rev: true }] };
    });
    const idx = makeIndex(items, 5);
    while (idx.left) {
      const p = pen.pos || { x: 0, y: 0 };
      const c = idx.nearest(p.x, p.y);
      idx.take(c.it);
      const n = c.it.s.length / 2;
      const at = (k) => (c.e.rev ? n - 1 - k : k);
      const px = (k) => c.it.s[2 * at(k)], py = (k) => c.it.s[2 * at(k) + 1];
      pen.moveTo(px(0), py(0), null);
      let lx = px(0), ly = py(0);
      for (let k = 1; k < n; k++) {
        const x = px(k), y = py(k);
        // zu kurze Stücke zusammenfassen (der letzte Punkt wird immer gestickt)
        if (k < n - 1 && Math.hypot(x - lx, y - ly) < o.minLen) continue;
        if (!triple) pen.lineTo(x, y, o.runLen);
        else {
          const m = Math.max(1, Math.ceil(Math.hypot(x - lx, y - ly) / o.runLen - 1e-9));
          for (let t = 1; t <= m; t++) {
            const ax = lx + ((x - lx) * (t - 1)) / m, ay = ly + ((y - ly) * (t - 1)) / m;
            const bx = lx + ((x - lx) * t) / m, by = ly + ((y - ly) * t) / m;
            pen.lineTo(bx, by, 1e9);
            pen.lineTo(ax, ay, 1e9);
            pen.lineTo(bx, by, 1e9);
          }
        }
        lx = x;
        ly = y;
      }
    }
  }

  /* ---------------- Stickparameter je Farbe ---------------- */

  const clamp = (v, lo, hi, def) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
  };

  /**
   * Unterlage: Reihenabstand = max(min, mult × Deckstich-Abstand), Einzug vom Rand;
   * „kräftig“ zusätzlich mit Steppstich entlang der Kanten.
   */
  const UNDERLAY = {
    none: null,
    light: { mult: 8, min: 2, inset: 0.5, edge: false },
    normal: { mult: 5, min: 1, inset: 0.4, edge: false },
    strong: { mult: 3.5, min: 0.8, inset: 0.4, edge: true },
  };
  const UNDERLAY_ORDER = ['none', 'light', 'normal', 'strong'];

  /**
   * Stoffarten: Grundwerte für die Automatik, abgeglichen mit Hersteller-Dokumentation und Fachartikeln:
   * - Reihenabstand = tatsächlicher Abstand benachbarter Reihen (wie Ink/Stitch, Vorgabe 0,25 mm, und
   *   PE-Design, Vorgabe 4,5 Linien/mm = 0,22 mm). Wilcom & Co. messen zwischen zwei Hinreihen (die
   *   Rückreihe liegt dazwischen) – deren üblichen 0,38–0,45 mm entsprechen hier etwa 0,2–0,22 mm.
   *   Verhältnisse aus der Literatur: Strick/Polo/Fleece etwa 10–25 % lockerer (gegen Verziehen),
   *   Frottee 10–15 % dichter, Leder etwa 50 % lockerer (Perforation)
   * - Stichlänge: Wilcom und Ink/Stitch 4 mm, Leder 4–5 mm
   * - Zugausgleich (Wilcom-Tabelle): Baumwolle/Drill 0,20, T-Shirt 0,35, Fleece 0,40 mm; Polo 0,35–0,40;
   *   Leder geringer
   * - Unterlage: Baumwolle wenig, Strick/Polo/Fleece/Frottee kräftig (Kantenlauf + Fläche), Leder sparsam
   */
  const FABRICS = {
    woven: { name: 'Webware (Baumwolle, Twill, Jeans)', spacing: 0.22, len: 4, pull: 0.2, underlay: 'normal' },
    knit: { name: 'Strick / Jersey (T-Shirt)', spacing: 0.25, len: 4, pull: 0.35, underlay: 'strong' },
    pique: { name: 'Piqué (Polo-Shirt)', spacing: 0.25, len: 4, pull: 0.35, underlay: 'strong' },
    fleece: { name: 'Fleece / Sweat', spacing: 0.26, len: 4, pull: 0.4, underlay: 'strong' },
    pile: {
      name: 'Frottee / Handtuch', spacing: 0.2, len: 4, pull: 0.4, underlay: 'strong',
      note: 'Frottee: wasserlösliche Folie (Topping) obenauf, damit die Schlaufen nicht durchstechen',
    },
    leather: {
      name: 'Leder / Kunstleder', spacing: 0.33, len: 4.5, pull: 0.1, underlay: 'light',
      note: 'Leder: weniger Einstiche gegen Perforation, spitze Nadel (70) verwenden',
    },
  };

  const ANGLES = [45, 135, 30, 60, 120, 150];
    // Teilflächen schmaler als das (im Mittel) als Kontur sticken: zwei Steppstichlinien am Rand decken nur,
  // solange die Fläche kaum breiter als der Faden (ca. 0,4 mm) ist – breitere deckt der Füllstich besser
  // (sonst bliebe innen eine Lücke, z. B. das Weiß in kleinen Augen). Gemessen an einem Comic-Logo:
  // 1 mm → Augenweiß fehlt, 0,5 mm → 1,3 % Lücken (Konturbänder wechselnder Breite), 0,35 mm → 0,4 %
  // (nur Kantenglättung), 0 (alles Füllstich) → ebenso 0,4 %, aber 30 % mehr Stiche und 3× so viele Sprünge.
  const THIN_MM = 0.35;
  const angDiff = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

  /** Punkt in Polygon (gerade-ungerade), Polygon als flaches Array. */
  function inRing(r, x, y) {
    let inside = false;
    const n = r.length / 2;
    for (let k = 0, j = n - 1; k < n; j = k++) {
      const yi = r[2 * k + 1], yj = r[2 * j + 1];
      if ((yi > y) !== (yj > y) && x < ((r[2 * j] - r[2 * k]) * (y - yi)) / (yj - yi) + r[2 * k]) inside = !inside;
    }
    return inside;
  }

  /**
   * Zerlegt die Polygone einer Ebene in zusammenhängende Teilflächen (Außenkontur + Löcher)
   * mit Fläche, Umfang und mittlerer Breite (2 × Fläche / Umfang).
   */
  function components(rings) {
    const info = rings.map((r) => {
      let a = 0, len = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const n = r.length / 2;
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        const xa = r[2 * k], ya = r[2 * k + 1], xb = r[2 * j], yb = r[2 * j + 1];
        a += xa * yb - xb * ya;
        len += Math.hypot(xb - xa, yb - ya);
        if (xa < x0) x0 = xa;
        if (xa > x1) x1 = xa;
        if (ya < y0) y0 = ya;
        if (ya > y1) y1 = ya;
      }
      return { area: Math.abs(a) / 2, len, box: [x0, y0, x1, y1], depth: 0, parent: -1 };
    });
    // Verschachtelungstiefe: von wie vielen anderen Konturen ein Punkt der Kontur umschlossen ist
    const order = info.map((_, k) => k).sort((a, b) => info[b].area - info[a].area);
    for (let ii = 0; ii < order.length; ii++) {
      const k = order[ii], r = rings[k], px = r[0], py = r[1];
      let best = -1;
      for (let jj = 0; jj < ii; jj++) {
        const j = order[jj], b = info[j].box;
        if (px < b[0] || px > b[2] || py < b[1] || py > b[3]) continue;
        if (!inRing(rings[j], px, py)) continue;
        info[k].depth++;
        if (best < 0 || info[j].area < info[best].area) best = j;
      }
      info[k].parent = best;
    }
    const comps = new Map();
    info.forEach((it, k) => {
      const outer = it.depth % 2 === 0 ? k : it.parent;
      if (outer < 0) return;
      let c = comps.get(outer);
      if (!c) comps.set(outer, (c = { rings: [], area: 0, per: 0 }));
      c.rings.push(k);
      c.area += k === outer ? it.area : -it.area;
      c.per += it.len;
    });
    return [...comps.values()].map((c) => ({ ...c, area: Math.max(0, c.area), width: c.per ? (2 * Math.max(0, c.area)) / c.per : 0 }));
  }

  /**
   * Form einer Ebene vermessen: Fläche (mm²), Umfang (mm), Teilflächen mit Breite, Flächenanteil der
   * schmalen Teile (< 0,9 mm) und je Kandidatenwinkel die Zahl der Blöcke (mehr = mehr Wege/Sprünge).
   */
  function analyze(rings) {
    const comps = components(rings);
    let area = 0, per = 0, thinArea = 0;
    for (const c of comps) {
      area += c.area;
      per += c.per;
      if (c.width < THIN_MM) thinArea += c.area;
    }
    const coarse = Math.max(0.6, Math.sqrt(area) / 80);
    const blocks = {};
    for (const a of ANGLES) {
      const sc = scanRows(rings, (a * Math.PI) / 180, coarse);
      blocks[a] = sc ? buildBlocks(sc).length : 0;
    }
    return { area, perimeter: per, width: per ? (2 * area) / per : 0, thinShare: area ? thinArea / area : 0, comps, blocks };
  }

  const mm = (v, d = 1) => `${Number(v).toFixed(d).replace('.', ',')} mm`;

  /**
   * Automatische Stickparameter einer Ebene aus Form und Stoff.
   * prevAngle: Winkel der Fläche darunter (benachbarte Farben sollen sich im Winkel absetzen).
   * Ergebnis: { params: { type, angle, spacing, len, underlay, pull }, why: [Begründungen] }
   */
  function autoParams(an, fabric, prevAngle, kind) {
    const f = FABRICS[fabric] || FABRICS.woven;
    if (kind === 'run') return { params: { type: 'run', len: 2.5 }, why: ['Umrisslinie als Steppstich'] };
    if (kind === 'line') {
      return {
        params: { type: 'run', len: 2, min: 0.5, tol: 0.1 },
        why: [
          'Wellen als Steppstich: die Stiche folgen der Linie mit höchstens 0,1 mm Abweichung',
          'Stiche 0,5–2 mm – kürzere fasst die Maschine schlecht, längere glätten die Wellen',
          'Bei dichten Wellen (über ca. 1 Welle/mm) gehen feine Schwingungen verloren – Wellendichte senken oder Dreifachstich für kräftigere Linien',
        ],
      };
    }
    const why = [];
    if (an && an.area > 0 && an.thinShare > 0.9) {
      why.push(`fast nur schmale Linien (im Mittel ${mm(an.width, 2)}) – Füllstich deckt hier nicht, deshalb Kontur als Steppstich`);
      return { params: { type: 'run', len: 2 }, why };
    }
    const params = { type: 'fill', spacing: f.spacing, len: f.len, pull: f.pull, underlay: f.underlay, thin: THIN_MM };
    // Winkel: wenigste Blöcke, Diagonalen bevorzugt, anders als die Fläche darunter
    let best = 45, bs = Infinity;
    const minB = an ? Math.min(...ANGLES.map((a) => an.blocks[a] || 0)) : 0;
    for (const a of ANGLES) {
      let sc = an ? an.blocks[a] || 0 : 0;
      if (a !== 45 && a !== 135) sc = sc * 1.05 + 0.5;
      // benachbarte Flächen: gleicher Winkel verzahnt und öffnet Lücken, 90° Unterschied hält am besten
      if (prevAngle != null) sc = angDiff(a, prevAngle) < 45 ? sc * 1.25 + 1 : sc * (1 + (0.06 * (90 - angDiff(a, prevAngle))) / 45);
      if (sc < bs - 1e-9) { bs = sc; best = a; }
    }
    params.angle = best;
    const reasons = [];
    if (an && (an.blocks[best] || 0) <= minB) reasons.push('wenigste Wege und Sprünge');
    if (prevAngle != null && angDiff(best, prevAngle) >= 45) reasons.push(`${angDiff(best, prevAngle)}° gegen die Farbe darunter (${prevAngle}°) – setzt sich ab, weniger Lücken`);
    if (!reasons.length) reasons.push('diagonal – bewährte Grundrichtung, kaum Unterschied zwischen den Winkeln');
    why.push(`Füllstich ${best}°${reasons.length ? ` – ${reasons.join(', ')}` : ''}`);
    why.push(`Reihenabstand ${mm(f.spacing, 2)} (${(1 / f.spacing).toFixed(1).replace('.', ',')} Linien/mm), Stichlänge ${mm(f.len)}, Zugausgleich ${mm(f.pull, 2)}, Unterlage ${UNDERLAY_NAMES[f.underlay]} – Werte für ${f.name}`);
    if (f.note) why.push(f.note);
    if (an) {
      const thin = an.comps.filter((c) => c.width < THIN_MM).length;
      const narrow = an.comps.filter((c) => c.width >= THIN_MM && c.width < 5).length;
      if (thin) why.push(`${thin} schmale ${thin === 1 ? 'Stelle' : 'Stellen'} unter ${mm(THIN_MM)} als Kontur (Steppstich)`);
      if (narrow && f.underlay !== 'none') why.push('schmale Teilflächen bekommen weniger Unterlage');
    }
    return { params, why };
  }

  const UNDERLAY_NAMES = { none: 'aus', light: 'leicht', normal: 'normal', strong: 'kräftig' };

  /** Höchste sinnvolle Unterlage für eine Teilfläche dieser Breite (schmal = sie schaute seitlich hervor). */
  const underlayCap = (w) => (w < 1.5 ? 0 : w < 3 ? 1 : w < 5 ? 2 : 3);

  /** Parameter einer Ebene → interne Optionen. */
  function layerOpts(g, p, kind) {
    const type = ['fill', 'run', 'triple', 'off'].includes(p.type) && !(kind === 'line' && p.type === 'fill')
      ? p.type : kind === 'run' || kind === 'line' ? 'run' : 'fill';
    const spacing = clamp(p.spacing, 0.1, 5, 0.22);
    const len = clamp(p.len, 1, 12, type === 'fill' ? 3.5 : 2.5);
    const ul = p.underlay === true ? UNDERLAY.normal : UNDERLAY[p.underlay] || null;
    return {
      ...g,
      type,
      spacing,
      len,
      angle: clamp(p.angle, -360, 360, 45),
      pull: clamp(p.pull, 0, 2, 0.2),
      underlay: !!ul,
      underSpacing: ul ? Math.max(ul.min, spacing * ul.mult) : 0,
      inset: ul ? ul.inset : 0.4,
      edgeRun: !!(ul && ul.edge),
      underlayLevel: ul ? UNDERLAY_ORDER.indexOf(p.underlay === true ? 'normal' : p.underlay) : 0,
      thin: clamp(p.thin, 0, 5, 0),
      underLen: len, // wie Ink/Stitch: Unterlage mit der Stichlänge des Deckstichs
      runLen: Math.min(len, 6),
      maxLen: Math.max(len, 3),
      minLen: clamp(p.min, 0.1, 3, 0.5),
      tol: clamp(p.tol, 0.02, 1, 0.1),
    };
  }

  /**
   * Stichmuster planen.
   * layers: [{ rings (mm), hex, kind: 'fill' | 'run' | 'line' (offene Linien), p?: { type, angle, spacing, len, underlay, pull } }]
   *   – Reihenfolge = Stickreihenfolge; type: 'fill' Füllstich, 'run' Steppstich (Kontur),
   *     'triple' Dreifachstich, 'off' nicht sticken; underlay: 'none' | 'light' | 'normal' | 'strong'
   * opts: Vorgaben für Ebenen ohne p ({ spacing, len, angle, underlay, pull }) und trimMm
   * Ergebnis: { ops: [{x, y, c, l}] in 0,1 mm (Mitte = 0), threads, layers: [{hex, stitches}], stats, bounds }
   */
  function plan(layers, opts = {}) {
    const g = {
      trimMm: clamp(opts.trimMm, 0.5, 50, 3),
      travelLen: 2.5,
      tieLen: 0.5,
      overMax: 40, // Verbindungen über schon Gesticktes: höchstens so lang (mm), sonst Sprung/Schnitt
      maxLen: 3.5,
    };
    const defaults = { spacing: 0.22, len: 4, angle: 45, underlay: 'normal', pull: 0.2, ...opts };
    const pen = makePen(g);
    const threads = [];
    layers.forEach((l, i) => {
      if (!l.rings || !l.rings.length) return;
      const o = layerOpts(g, l.p || defaults, l.kind);
      if (o.type === 'off') return;
      const before = pen.save();
      // gleiche Garnfarbe wie zuvor (z. B. schwarze Fläche + Umrisslinie): ohne Farbwechsel weiter –
      // außer die Ebene verlangt einen eigenen Faden (own, z. B. je Bild einer Vereinigung)
      const same = threads.length && !l.own && threads[threads.length - 1].hex.toLowerCase() === String(l.hex).toLowerCase();
      if (threads.length && !same) pen.colorChange();
      pen.layer = i;
      const mark = pen.ops.length;
      if (l.kind === 'line') lineLayer(pen, l.rings, o, o.type === 'triple');
      else if (o.type === 'fill') fillByWidth(pen, l, o);
      else runLayer(pen, l.rings, o, null, o.type === 'triple');
      if (pen.ops.length === mark) { pen.restore(before); return; } // nichts gestickt
      if (!same) threads.push({ hex: l.hex, rgb: hexRgb(l.hex), name: l.name || '' });
    });
    pen.end();
    const pat = finalize(pen.ops, threads, layers.length);
    pat.layers = layers.map((l, i) => ({ hex: l.hex, rgb: hexRgb(l.hex), stitches: pat.perLayer[i] }));
    return pat;
  }

  /**
   * Füllstich einer Ebene, Teilflächen nach Breite: schmaler als thin als Kontur (Steppstich),
   * die Unterlage je Teilfläche höchstens so kräftig, wie es die Breite zulässt.
   */
  function fillByWidth(pen, l, o) {
    const comps = (l.an && l.an.comps) || components(l.rings);
    const groups = new Map(); // Unterlagen-Stufe → Polygone; -1 = Kontur
    for (const c of comps) {
      const key = o.thin > 0 && c.width < o.thin ? -1 : o.underlay ? Math.min(o.underlayLevel, underlayCap(c.width)) : 0;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      for (const k of c.rings) g.push(l.rings[k]);
    }
    for (const key of [3, 2, 1, 0]) {
      const rings = groups.get(key);
      if (!rings) continue;
      const name = UNDERLAY_ORDER[key];
      const ul = UNDERLAY[name];
      fillLayer(pen, rings, {
        ...o,
        underlay: !!ul,
        underSpacing: ul ? Math.max(ul.min, o.spacing * ul.mult) : 0,
        inset: ul ? ul.inset : 0.4,
        edgeRun: !!(ul && ul.edge),
      });
    }
    if (groups.has(-1)) runLayer(pen, groups.get(-1), { ...o, runLen: 2 });
  }

  /** mm → 0,1 mm (gerundet), Motiv um den Nullpunkt zentriert, doppelte Einstiche entfernt. */
  function finalize(raw, threads, nLayers = 0) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of raw) {
      if (p.c !== STITCH && p.c !== JUMP) continue;
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    const ops = [];
    const perLayer = new Array(nLayers).fill(0);
    if (!threads.length || !Number.isFinite(x0)) return { ops, threads: [], perLayer, stats: { stitches: 0, jumps: 0, trims: 0, colors: 0 }, bounds: [0, 0, 0, 0] };
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let lx = null, ly = null, prev = null;
    const st = { stitches: 0, jumps: 0, trims: 0, colors: threads.length };
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const p of raw) {
      const x = Math.round((p.x - cx) * 10), y = Math.round((p.y - cy) * 10);
      if (p.c === STITCH) {
        if (prev === STITCH && x === lx && y === ly) continue; // gleiche Stelle nach dem Runden
        st.stitches++;
        if (p.l < nLayers) perLayer[p.l]++;
      } else if (p.c === JUMP) {
        if (prev === JUMP) { ops[ops.length - 1].x = x; ops[ops.length - 1].y = y; lx = x; ly = y; continue; }
        st.jumps++;
      } else if (p.c === TRIM) {
        if (prev === TRIM) continue;
        st.trims++;
      }
      ops.push({ x, y, c: p.c, l: p.l });
      if (p.c === STITCH || p.c === JUMP) {
        lx = x;
        ly = y;
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
      prev = p.c;
    }
    return { ops, threads, perLayer, stats: st, bounds: [bx0, by0, bx1, by1] };
  }

  function hexRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    const v = m ? parseInt(m[1], 16) : 0;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  /* ---------------- Dateien schreiben ---------------- */

  /** Einfacher Byte-Puffer (little endian). */
  function makeBuf() {
    let a = new Uint8Array(1 << 16), n = 0;
    const grow = (k) => {
      if (n + k <= a.length) return;
      const b = new Uint8Array(Math.max(a.length * 2, n + k));
      b.set(a);
      a = b;
    };
    const dv = () => new DataView(a.buffer);
    return {
      get pos() { return n; },
      u8(v) { grow(1); a[n++] = v & 255; },
      u16(v) { grow(2); a[n++] = v & 255; a[n++] = (v >> 8) & 255; },
      u24(v) { grow(3); a[n++] = v & 255; a[n++] = (v >> 8) & 255; a[n++] = (v >> 16) & 255; },
      u32(v) { grow(4); dv().setUint32(n, v >>> 0, true); n += 4; },
      f32(v) { grow(4); dv().setFloat32(n, v, true); n += 4; },
      str(s) { for (const ch of s) this.u8(ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : 63); },
      bytes(arr) { grow(arr.length); a.set(arr, n); n += arr.length; },
      put16(at, v) { a[at] = v & 255; a[at + 1] = (v >> 8) & 255; },
      put24(at, v) { a[at] = v & 255; a[at + 1] = (v >> 8) & 255; a[at + 2] = (v >> 16) & 255; },
      put32(at, v) { dv().setUint32(at, v >>> 0, true); },
      done() { return a.slice(0, n); },
    };
  }

  /** Dateiname im Kopf: nur ASCII (Umlaute umschreiben). */
  function asciiName(name, max) {
    const s = String(name || 'pic2laser')
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
      .replace(/[^\x20-\x7e]/g, '_');
    return s.slice(0, max);
  }

  /* ---- DST (Tajima) ---- */

  /** Ein DST-Datensatz (3 Byte): Verschiebung je Achse -121…121 (0,1 mm), y nach oben. */
  function dstRecord(dx, dy, jump) {
    let y = -dy, x = dx, b0 = 0, b1 = 0, b2 = 0x03;
    if (jump) b2 |= 0x80;
    if (x > 40) { b2 |= 0x04; x -= 81; }
    if (x < -40) { b2 |= 0x08; x += 81; }
    if (x > 13) { b1 |= 0x04; x -= 27; }
    if (x < -13) { b1 |= 0x08; x += 27; }
    if (x > 4) { b0 |= 0x04; x -= 9; }
    if (x < -4) { b0 |= 0x08; x += 9; }
    if (x > 1) { b1 |= 0x01; x -= 3; }
    if (x < -1) { b1 |= 0x02; x += 3; }
    if (x > 0) { b0 |= 0x01; x -= 1; }
    if (x < 0) { b0 |= 0x02; x += 1; }
    if (y > 40) { b2 |= 0x20; y -= 81; }
    if (y < -40) { b2 |= 0x10; y += 81; }
    if (y > 13) { b1 |= 0x20; y -= 27; }
    if (y < -13) { b1 |= 0x10; y += 27; }
    if (y > 4) { b0 |= 0x20; y -= 9; }
    if (y < -4) { b0 |= 0x10; y += 9; }
    if (y > 1) { b1 |= 0x80; y -= 3; }
    if (y < -1) { b1 |= 0x40; y += 3; }
    if (y > 0) { b0 |= 0x80; y -= 1; }
    if (y < 0) { b0 |= 0x40; y += 1; }
    if (x || y) throw new Error('DST: Schritt zu groß');
    return [b0, b1, b2];
  }

  /** Strecke in gleich lange Teilschritte von höchstens max je Achse zerlegen. */
  function splitMove(dx, dy, max) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / max));
    const out = [];
    let px = 0, py = 0;
    for (let k = 1; k <= n; k++) {
      const x = Math.round((dx * k) / n), y = Math.round((dy * k) / n);
      out.push([x - px, y - py]);
      px = x;
      py = y;
    }
    return out;
  }

  /** Bricht ab, wenn eine Koordinate keine endliche Zahl ist (sonst entstünde still eine kaputte Datei). */
  function checkPattern(pat) {
    for (const p of pat.ops) {
      if ((p.c === STITCH || p.c === JUMP) && !(Number.isFinite(p.x) && Number.isFinite(p.y))) {
        throw new Error('Stickmuster enthält ungültige Koordinaten');
      }
    }
  }

  function toDst(pat, name) {
    checkPattern(pat);
    const rec = [];
    let x = 0, y = 0, colors = 0;
    for (const p of pat.ops) {
      if (p.c === STITCH || p.c === JUMP) {
        for (const [dx, dy] of splitMove(p.x - x, p.y - y, 121)) rec.push(dstRecord(dx, dy, p.c === JUMP));
        x = p.x;
        y = p.y;
      } else if (p.c === TRIM) {
        // Schnitt: drei Sprünge ohne Nettobewegung (so erkennen Tajima-kompatible Maschinen den Fadenschnitt)
        rec.push(dstRecord(2, 2, true), dstRecord(-4, -4, true), dstRecord(2, 2, true));
      } else if (p.c === COLOR) {
        rec.push([0, 0, 0xc3]);
        colors++;
      }
    }
    rec.push([0, 0, 0xf3]);
    const [bx0, by0, bx1, by1] = pat.bounds;
    const b = makeBuf();
    const pad = (v, w) => String(v).padStart(w, ' ');
    const sign = (v) => (v < 0 ? '-' : '+') + pad(Math.abs(v), 5);
    b.str(`LA:${asciiName(name, 16).padEnd(16, ' ')}\r`);
    b.str(`ST:${pad(rec.length - 1, 7)}\r`);
    b.str(`CO:${pad(colors, 3)}\r`);
    b.str(`+X:${pad(Math.abs(bx1), 5)}\r`);
    b.str(`-X:${pad(Math.abs(bx0), 5)}\r`);
    b.str(`+Y:${pad(Math.abs(by0), 5)}\r`); // DST: y nach oben → oberer Rand = kleinstes y
    b.str(`-Y:${pad(Math.abs(by1), 5)}\r`);
    b.str(`AX:${sign(x)}\r`);
    b.str(`AY:${sign(-y)}\r`);
    b.str(`MX:${sign(0)}\r`);
    b.str(`MY:${sign(0)}\r`);
    b.str('PD:******\r');
    b.u8(0x1a);
    while (b.pos < 512) b.u8(0x20);
    for (const r of rec) b.bytes(r);
    return b.done();
  }

  /* ---- EXP (Melco) ---- */

  /**
   * EXP: ohne Kopf, je Stich 2 Byte Verschiebung (x, y; 0,1 mm, y nach oben, -127…127, Zweierkomplement).
   * Steuerbefehle beginnen mit 0x80: 0x80 0x04 dx dy = Sprung, 0x80 0x01 0 0 = Farbwechsel,
   * 0x80 0x80 0x07 0x00 = Fadenschnitt.
   */
  function toExp(pat) {
    checkPattern(pat);
    const out = [];
    let x = 0, y = 0;
    for (const p of pat.ops) {
      if (p.c === STITCH || p.c === JUMP) {
        for (const [dx, dy] of splitMove(p.x - x, p.y - y, 127)) {
          if (p.c === JUMP) out.push(0x80, 0x04);
          out.push(dx & 0xff, -dy & 0xff);
        }
        x = p.x;
        y = p.y;
      } else if (p.c === TRIM) {
        out.push(0x80, 0x80, 0x07, 0x00);
      } else if (p.c === COLOR) {
        out.push(0x80, 0x01, 0x00, 0x00);
      }
    }
    return new Uint8Array(out).buffer;
  }

  /* ---- INF (Farben zu EXP/DST) ---- */

  /**
   * INF: Farbliste zu einer Stichdatei gleichen Namens (Bernina/Melco). Alle Zahlen big-endian:
   * 1, 8, Länge des Rests (32 Bit), Zahl der Farben (32 Bit), dann je Farbblock: Satzlänge (16 Bit),
   * Nummer ab 0 (16 Bit), R, G, B, Nadel ab 1 (16 Bit), Name und Garnkarte als Text mit 0-Byte am Ende.
   */
  function toInf(pat) {
    const enc = (s) => [...asciiName(s, 60)].map((ch) => ch.charCodeAt(0));
    const recs = pat.threads.map((t, i) => {
      const name = enc(t.name || t.hex), chart = enc('RGB');
      const len = 2 + 2 + 3 + 2 + name.length + 1 + chart.length + 1;
      return [len >> 8, len & 255, i >> 8, i & 255, ...t.rgb, (i + 1) >> 8, (i + 1) & 255, ...name, 0, ...chart, 0];
    });
    const body = recs.flat();
    const u32 = (v) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
    return new Uint8Array([...u32(1), ...u32(8), ...u32(4 + body.length), ...u32(recs.length), ...body]).buffer;
  }

  /* ---- PES / PEC (Brother) ---- */

  // Brother-Standardfarben (PEC-Palette, Index 1–64)
  const PEC_RGB = [
    [14, 31, 124], [10, 85, 163], [0, 135, 119], [75, 107, 175], [237, 23, 31], [209, 92, 0], [145, 54, 151], [228, 154, 203],
    [145, 95, 172], [158, 214, 125], [232, 169, 0], [254, 186, 53], [255, 255, 0], [112, 188, 31], [186, 152, 0], [168, 168, 168],
    [125, 111, 0], [255, 255, 179], [79, 85, 86], [0, 0, 0], [11, 61, 145], [119, 1, 118], [41, 49, 51], [42, 19, 1],
    [246, 74, 138], [178, 118, 36], [252, 187, 197], [254, 55, 15], [240, 240, 240], [106, 28, 138], [168, 221, 196], [37, 132, 187],
    [254, 179, 67], [255, 243, 107], [208, 166, 96], [209, 84, 0], [102, 186, 73], [19, 74, 70], [135, 135, 135], [216, 204, 198],
    [67, 86, 7], [253, 217, 222], [249, 147, 188], [0, 56, 34], [178, 175, 212], [104, 106, 176], [239, 227, 185], [247, 56, 102],
    [181, 75, 100], [19, 43, 26], [199, 1, 86], [254, 158, 50], [168, 222, 235], [0, 103, 62], [78, 41, 144], [47, 126, 32],
    [255, 204, 204], [255, 217, 17], [9, 91, 166], [240, 249, 112], [227, 243, 91], [255, 153, 0], [255, 240, 141], [255, 200, 200],
  ];

  /** Farbabstand „redmean“ (wie in gängigen Stickprogrammen für die Garnzuordnung). */
  function redmean(a, b) {
    const rm = Math.round((a[0] + b[0]) / 2), r = a[0] - b[0], g = a[1] - b[1], bl = a[2] - b[2];
    return (((512 + rm) * r * r) >> 8) + 4 * g * g + (((767 - rm) * bl * bl) >> 8);
  }

  /**
   * PEC-Farbnummer (1–64) je Farbblock: jede verschiedene Farbe bekommt das nächste noch freie
   * Brother-Garn, gleiche Farben dasselbe.
   */
  function pecIndices(threads) {
    const free = PEC_RGB.map((_, k) => k + 1);
    const byHex = new Map();
    return threads.map((t) => {
      const key = t.rgb.join(',');
      if (byHex.has(key)) return byHex.get(key);
      let best = free[0], bd = Infinity;
      for (const k of free.length ? free : PEC_RGB.map((_, j) => j + 1)) {
        const d = redmean(t.rgb, PEC_RGB[k - 1]);
        if (d < bd) { bd = d; best = k; }
      }
      const at = free.indexOf(best);
      if (at >= 0) free.splice(at, 1);
      byHex.set(key, best);
      return best;
    });
  }

  /** Vorschaubild 48 × 38 (1 Bit) mit Rahmen; lines: Stichfolgen [[x, y, …], …] */
  function pecIcon(lines, bounds, margin) {
    const W = 48, H = 38, g = new Uint8Array(6 * H);
    const set = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      g[y * 6 + (x >> 3)] |= 1 << (x & 7);
    };
    // Rahmen mit abgerundeten Ecken
    for (let x = 4; x < 44; x++) { set(x, 1); set(x, 36); }
    for (let y = 4; y < 34; y++) { set(1, y); set(46, y); }
    set(3, 2); set(2, 3); set(44, 2); set(45, 3); set(3, 35); set(2, 34); set(44, 35); set(45, 34);
    const [x0, y0, x1, y1] = bounds;
    const s = Math.min((W - margin) / Math.max(1, x1 - x0), (H - margin) / Math.max(1, y1 - y0));
    const tx = W / 2 - ((x0 + x1) / 2) * s, ty = H / 2 - ((y0 + y1) / 2) * s;
    for (const l of lines) {
      for (let k = 0; k + 3 < l.length; k += 2) {
        let ax = Math.floor(l[k] * s + tx), ay = Math.floor(l[k + 1] * s + ty);
        const bx = Math.floor(l[k + 2] * s + tx), by = Math.floor(l[k + 3] * s + ty);
        const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay), sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
        let err = dx + dy;
        for (;;) {
          set(ax, ay);
          if (ax === bx && ay === by) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; ax += sx; }
          if (e2 <= dx) { err += dx; ay += sy; }
        }
      }
      if (l.length === 2) set(Math.floor(l[0] * s + tx), Math.floor(l[1] * s + ty));
    }
    return g;
  }

  /** Stichfolgen je Farbblock (für die Vorschaubilder). */
  function colorRuns(pat) {
    const blocks = [[]];
    let run = null;
    for (const p of pat.ops) {
      if (p.c === STITCH) {
        if (!run) { run = []; blocks[blocks.length - 1].push(run); }
        run.push(p.x, p.y);
      } else if (p.c === COLOR) {
        blocks.push([]);
        run = null;
      } else run = null;
    }
    return blocks;
  }

  /** PEC-Teil: Kopf (Farben), Stichdaten, Vorschaubilder. */
  function writePec(b, pat, name, codes) {
    const [bx0, by0, bx1, by1] = pat.bounds;
    b.str(`LA:${asciiName(name, 8).padEnd(16, ' ')}\r`);
    b.str(' '.repeat(12));
    b.u8(0xff);
    b.u8(0x00);
    b.u8(6); // Bytes je Zeile des Vorschaubilds (48 px)
    b.u8(38); // Höhe des Vorschaubilds
    b.str(' '.repeat(12));
    b.u8(codes.length - 1);
    for (const c of codes) b.u8(c);
    for (let k = codes.length; k < 463; k++) b.u8(0x20);

    const start = b.pos;
    b.u16(0);
    b.u24(0); // Länge des Stichblocks (wird nachgetragen)
    b.bytes([0x31, 0xff, 0xf0]);
    b.u16(bx1 - bx0);
    b.u16(by1 - by0);
    b.u16(0x1e0);
    b.u16(0x1b0);
    const val = (v, flag) => {
      if (flag === undefined && v > -64 && v < 63) { b.u8(v & 0x7f); return; }
      const w = (v & 0x0fff) | 0x8000 | ((flag || 0) << 8);
      b.u8((w >> 8) & 255);
      b.u8(w & 255);
    };
    let x = 0, y = 0, first = true, jumping = true, trim = false, two = true;
    for (const p of pat.ops) {
      if (p.c === STITCH) {
        const dx = p.x - x, dy = p.y - y;
        if (jumping) {
          if (dx !== 0 && dy !== 0) { val(0); val(0); }
          jumping = false;
        }
        trim = false;
        for (const [sx, sy] of splitMove(dx, dy, 2047)) { val(sx); val(sy); }
        x = p.x;
        y = p.y;
      } else if (p.c === JUMP) {
        for (const [sx, sy] of splitMove(p.x - x, p.y - y, 2047)) {
          const flag = first ? 0x10 : trim ? 0x20 : 0x10;
          val(sx, flag);
          val(sy, flag);
          first = false;
        }
        trim = false;
        jumping = true;
        x = p.x;
        y = p.y;
      } else if (p.c === TRIM) {
        trim = true;
      } else if (p.c === COLOR) {
        if (jumping) { val(0); val(0); jumping = false; }
        b.bytes([0xfe, 0xb0, two ? 2 : 1]);
        two = !two;
      } else if (p.c === END) {
        b.u8(0xff);
        break;
      }
    }
    b.put24(start + 2, b.pos - start);

    const runs = colorRuns(pat);
    b.bytes(pecIcon(runs.flat(), pat.bounds, 4));
    for (const blk of runs) b.bytes(pecIcon(blk, pat.bounds, 5));
  }

  /**
   * PES Version 1: kurzer PES-Teil (Stichgruppen mit Farbnummern, für PE-Design und andere
   * Programme), danach der PEC-Teil, den die Maschine liest.
   */
  function toPes(pat, name) {
    checkPattern(pat);
    if (!pat.ops.some((p) => p.c === STITCH)) throw new Error('Stickmuster ist leer');
    const codes = pecIndices(pat.threads);
    // PEC speichert die Zahl der Farbblöcke in einem Byte
    if (codes.length > 256) throw new Error('PES: höchstens 256 Farbwechsel möglich');
    const b = makeBuf();
    const [bx0, by0, bx1, by1] = pat.bounds;
    const width = bx1 - bx0, height = by1 - by0;
    b.str('#PES0001');
    const pecAt = b.pos;
    b.u32(0);
    b.u16(1); // an Rahmen anpassen
    b.u16(width <= 1000 && height <= 1000 ? 0 : 1); // Rahmen: 0 = 100 × 100, 1 = 130 × 180 mm
    b.u16(1); // ein Objekt
    b.u16(0xffff);
    b.u16(0);
    b.u16(7);
    b.str('CEmbOne');
    for (let k = 0; k < 8; k++) b.u16(0);
    // Lage im Rahmen (Transformationsmatrix wie in PE-Design-Dateien)
    b.f32(1); b.f32(0); b.f32(0); b.f32(1);
    b.f32(350 + 1300 / 2 - width / 2);
    b.f32(100 + height + 1800 / 2 - height / 2);
    b.u16(1);
    b.u16(0);
    b.u16(0);
    b.u16(width);
    b.u16(height);
    b.bytes(new Uint8Array(8));
    const sectionsAt = b.pos;
    b.u16(0);
    b.u16(0xffff);
    b.u16(0);
    b.u16(7);
    b.str('CSewSeg');
    // Stichgruppen: Stiche (0) und Sprünge (1) mit Farbnummer, Koordinaten relativ zu links/unten
    const ax = bx0, ay = by1;
    let sections = 0, color = 0, prevCode = -1, sx = 0, sy = 0;
    const log = [];
    const section = (flag, pts) => {
      if (sections) b.u16(0x8003);
      const code = codes[color] || codes[codes.length - 1];
      if (code !== prevCode) { log.push([sections, code]); prevCode = code; }
      b.u16(flag);
      b.u16(code);
      b.u16(pts.length / 2);
      for (let k = 0; k < pts.length; k++) b.u16((pts[k] - (k % 2 ? ay : ax)) & 0xffff);
      sections++;
    };
    const ops = pat.ops;
    for (let k = 0; k < ops.length;) {
      const c = ops[k].c;
      let e = k;
      while (e < ops.length && ops[e].c === c) e++;
      if (c === JUMP) {
        section(1, [sx, sy, ops[e - 1].x, ops[e - 1].y]);
      } else if (c === STITCH) {
        // Stichzahl je Abschnitt ist 16 Bit: lange Stichfolgen auf mehrere Abschnitte verteilen,
        // jeder weitere beginnt am letzten Punkt des vorigen
        for (let j0 = k; ;) {
          const end = Math.min(e, j0 + 65535), pts = [];
          for (let j = j0; j < end; j++) pts.push(ops[j].x, ops[j].y);
          section(0, pts);
          if (end >= e) break;
          j0 = end - 1;
        }
        sx = ops[e - 1].x;
        sy = ops[e - 1].y;
      } else if (c === COLOR) {
        color += e - k;
      }
      k = e;
    }
    b.u16(log.length);
    for (const [s, c] of log) { b.u16(s); b.u16(c); }
    b.u16(0);
    b.u16(0);
    b.put16(sectionsAt, sections);
    b.put32(pecAt, b.pos);
    writePec(b, pat, name, codes);
    return b.done();
  }

  /* ---------------- Vorschau ---------------- */

  /**
   * Zeichnet die Stiche auf ein Canvas (Fadenfarbe, Fadenbreite ca. 0,35 mm).
   * scale = Pixel je 0,1 mm, ox/oy = Lage des Nullpunkts in Pixeln.
   * highlight: Index einer Ebene, die anderen werden blass gezeichnet (-1 = alle normal).
   */
  function draw(ctx, pat, scale, ox, oy, highlight = -1) {
    let x = null, y = null, cur = -1;
    const lw = Math.max(0.6, 3.5 * scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const stroke = () => {
      if (cur < 0) return;
      const t = (pat.layers && pat.layers[cur]) || pat.threads[0];
      const [r, g, b] = t ? t.rgb : [0, 0, 0];
      ctx.globalAlpha = highlight >= 0 && cur !== highlight ? 0.16 : 1;
      // Rand, darauf der Faden: einzelne Stiche bleiben erkennbar (dunkle Garne mit hellem Rand)
      const dark = 0.299 * r + 0.587 * g + 0.114 * b < 70;
      const edge = (v) => (dark ? v + (255 - v) * 0.4 : v * 0.55) | 0;
      ctx.strokeStyle = `rgb(${edge(r)},${edge(g)},${edge(b)})`;
      // Faden etwas schmaler als echt (0,35 mm), damit Reihen und Stichrichtung erkennbar bleiben
      ctx.lineWidth = lw * 1.15;
      ctx.stroke();
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = lw * 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    ctx.beginPath();
    for (const p of pat.ops) {
      if (p.c === STITCH) {
        const l = p.l || 0;
        if (l !== cur) { stroke(); ctx.beginPath(); cur = l; }
        const px = ox + p.x * scale, py = oy + p.y * scale;
        if (x === null) ctx.moveTo(px, py);
        else { ctx.moveTo(x, y); ctx.lineTo(px, py); }
        x = px;
        y = py;
      } else if (p.c === JUMP) {
        x = ox + p.x * scale;
        y = oy + p.y * scale;
      }
    }
    stroke();
  }

  return {
    pathToRings, scaleRings, plan, analyze, autoParams, FABRICS, UNDERLAY_NAMES, THIN_MM, toDst, toExp, toInf, toPes, draw, pecIndices,
    CMD: { STITCH, JUMP, TRIM, COLOR, END },
  };
})();

