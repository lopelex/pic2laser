'use strict';

/**
 * Formen begradigen (Logos, Schilder): ersetzt Abschnitte der Potrace-Kurven, die innerhalb
 * einer Toleranz einer Grundform entsprechen, durch exakte Geraden und Kreisbögen; ganze
 * Konturen werden zu echten Kreisen bzw. Ellipsen. Optional rasten Geraden auf 0°/45°/90° ein
 * und benachbarte Geraden mit fast rechtem Winkel werden exakt rechtwinklig.
 *
 * Ablauf je Kontur:
 *  1. Die Potrace-Kurve wird dicht abgetastet (ca. 1 px), Potrace-Ecken werden vermerkt.
 *  2. Ganze Kontur ein Kreis/eine Ellipse? → direkt ausgeben.
 *  3. Kandidaten für Knickpunkte: Douglas-Peucker-Punkte und Potrace-Ecken.
 *  4. Dynamische Programmierung: kleinste Zahl von Geraden/Bögen, die alle Punkte innerhalb der
 *     Toleranz treffen. Was zu keiner Grundform passt, bleibt die ursprüngliche Potrace-Kurve.
 *  5. Winkel einrasten, Übergänge als Schnittpunkte der Nachbarformen (scharfe Ecken).
 *
 * Läuft im Vektorisierungsprozess (trace-worker.js), reines JavaScript ohne Abhängigkeiten.
 */

const TAU = Math.PI * 2;
const fx = (v) => v.toFixed(3).replace('.000', '');

/* ------------------------------------------------------------------ */
/* Potrace-Kurve → Teilstücke und Abtastpunkte                         */
/* ------------------------------------------------------------------ */

function curvePieces(curve) {
  const n = curve.n;
  const pieces = [];
  let prev = curve.c[(n - 1) * 3 + 2];
  for (let i = 0; i < n; i++) {
    const c0 = curve.c[i * 3], c1 = curve.c[i * 3 + 1], c2 = curve.c[i * 3 + 2];
    if (curve.tag[i] === 'CORNER') {
      pieces.push({ L: true, a: prev, b: c1, cornerEnd: true });
      pieces.push({ L: true, a: c1, b: c2 });
    } else {
      pieces.push({ L: false, a: prev, c1: c0, c2: c1, b: c2 });
    }
    prev = c2;
  }
  return pieces;
}

function pieceAt(p, t) {
  if (p.L) return { x: p.a.x + (p.b.x - p.a.x) * t, y: p.a.y + (p.b.y - p.a.y) * t };
  const s = 1 - t;
  const a = s * s * s, b = 3 * s * s * t, c = 3 * s * t * t, d = t * t * t;
  return {
    x: a * p.a.x + b * p.c1.x + c * p.c2.x + d * p.b.x,
    y: a * p.a.y + b * p.c1.y + c * p.c2.y + d * p.b.y,
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Abtastung mit etwa `step` px Abstand. Je Punkt: Lage, Teilstück, Parameter t, Ecke. */
function sample(pieces, step) {
  const xs = [], ys = [], pi = [], ts = [], corner = [];
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k];
    const len = p.L ? dist(p.a, p.b) : (dist(p.a, p.c1) + dist(p.c1, p.c2) + dist(p.c2, p.b) + dist(p.a, p.b)) / 2;
    const m = Math.max(1, Math.ceil(len / step));
    const prevCorner = pieces[(k - 1 + pieces.length) % pieces.length].cornerEnd === true;
    for (let j = 0; j < m; j++) {
      const t = j / m;
      const q = pieceAt(p, t);
      xs.push(q.x); ys.push(q.y); pi.push(k); ts.push(t);
      corner.push(j === 0 && prevCorner ? 1 : 0);
    }
  }
  return { xs, ys, pi, ts, corner };
}

/* ------------------------------------------------------------------ */
/* Anpassungen                                                         */
/* ------------------------------------------------------------------ */

/** Präfixsummen für schnelle Mittelwerte/Kovarianzen über Bereiche. */
function prefix(X, Y) {
  const n = X.length;
  const sx = new Float64Array(n + 1), sy = new Float64Array(n + 1);
  const sxx = new Float64Array(n + 1), syy = new Float64Array(n + 1), sxy = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    sx[i + 1] = sx[i] + X[i]; sy[i + 1] = sy[i] + Y[i];
    sxx[i + 1] = sxx[i] + X[i] * X[i]; syy[i + 1] = syy[i] + Y[i] * Y[i]; sxy[i + 1] = sxy[i] + X[i] * Y[i];
  }
  return { sx, sy, sxx, syy, sxy };
}

/** Gerade durch die Punkte a..b (Hauptachse). null, wenn die Toleranz überschritten wird. */
function fitLine(X, Y, S, a, b, tol) {
  const n = b - a + 1;
  const mx = (S.sx[b + 1] - S.sx[a]) / n, my = (S.sy[b + 1] - S.sy[a]) / n;
  const cxx = (S.sxx[b + 1] - S.sxx[a]) / n - mx * mx;
  const cyy = (S.syy[b + 1] - S.syy[a]) / n - my * my;
  const cxy = (S.sxy[b + 1] - S.sxy[a]) / n - mx * my;
  const th = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const dx = Math.cos(th), dy = Math.sin(th);
  // kleinster Eigenwert = mittlere quadratische Abweichung
  const tr = cxx + cyy, det = cxx * cyy - cxy * cxy;
  const lmin = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  if (lmin > (tol * tol) / 9) return null; // mittlere Abweichung ≤ tol/3
  // Abweichungen e(t) entlang der Geraden; eine gekrümmte Kante zeigt sich als Parabel
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, e0 = 0, e1 = 0, e2 = 0, tmin = Infinity, tmax = -Infinity;
  for (let i = a; i <= b; i++) {
    const ux = X[i] - mx, uy = Y[i] - my;
    const e = ux * dy - uy * dx;
    if (e > tol || e < -tol) return null;
    const t = ux * dx + uy * dy;
    if (t < tmin) tmin = t;
    if (t > tmax) tmax = t;
    const t2 = t * t;
    s0++; s1 += t; s2 += t2; s3 += t2 * t; s4 += t2 * t2;
    e0 += e; e1 += e * t; e2 += e * t2;
  }
  if (n >= 6) {
    const c = solve3([s0, s1, s2, s1, s2, s3, s2, s3, s4], [e0, e1, e2]);
    const half = (tmax - tmin) / 2;
    // Pfeilhöhe der angepassten Parabel über die halbe Länge
    if (c && Math.abs(c[2]) * half * half > Math.max(0.6, tol / 3)) return null;
  }
  return { kind: 'line', mx, my, dx, dy };
}

/** Präfixsummen der Momente bis 3. Ordnung (für die algebraische Kreisanpassung in O(1)). */
function moments(X, Y) {
  const n = X.length;
  const keys = ['x', 'y', 'xx', 'yy', 'xy', 'xxx', 'yyy', 'xyy', 'xxy'];
  const M = Object.fromEntries(keys.map((k) => [k, new Float64Array(n + 1)]));
  for (let i = 0; i < n; i++) {
    const x = X[i], y = Y[i];
    M.x[i + 1] = M.x[i] + x; M.y[i + 1] = M.y[i] + y;
    M.xx[i + 1] = M.xx[i] + x * x; M.yy[i + 1] = M.yy[i] + y * y; M.xy[i + 1] = M.xy[i] + x * y;
    M.xxx[i + 1] = M.xxx[i] + x * x * x; M.yyy[i + 1] = M.yyy[i] + y * y * y;
    M.xyy[i + 1] = M.xyy[i] + x * y * y; M.xxy[i + 1] = M.xxy[i] + x * x * y;
  }
  return M;
}

/** Kreis durch die Punkte a..b (algebraisch, dann geometrisch verfeinert). */
function fitCircle(X, Y, a, b, tol, maxR, minR = 0.8, Mo = null) {
  const n = b - a + 1;
  if (n < 5) return null;
  let mx, my, suu, svv, suv, suuu, svvv, suvv, svuu, offX = 0, offY = 0;
  if (Mo) {
    offX = Mo.ox; offY = Mo.oy;
    const g = (k) => Mo[k][b + 1] - Mo[k][a];
    const Sx = g('x'), Sy = g('y'), Sxx = g('xx'), Syy = g('yy'), Sxy = g('xy');
    mx = Sx / n; my = Sy / n;
    suu = Sxx - n * mx * mx; svv = Syy - n * my * my; suv = Sxy - n * mx * my;
    suuu = g('xxx') - 3 * mx * Sxx + 3 * mx * mx * Sx - n * mx * mx * mx;
    svvv = g('yyy') - 3 * my * Syy + 3 * my * my * Sy - n * my * my * my;
    suvv = g('xyy') - 2 * my * Sxy + my * my * Sx - mx * Syy + 2 * mx * my * Sy - n * mx * my * my;
    svuu = g('xxy') - 2 * mx * Sxy + mx * mx * Sy - my * Sxx + 2 * mx * my * Sx - n * my * mx * mx;
  } else {
    mx = 0; my = 0;
    for (let i = a; i <= b; i++) { mx += X[i]; my += Y[i]; }
    mx /= n; my /= n;
    suu = 0; svv = 0; suv = 0; suuu = 0; svvv = 0; suvv = 0; svuu = 0;
    for (let i = a; i <= b; i++) {
      const u = X[i] - mx, v = Y[i] - my;
      suu += u * u; svv += v * v; suv += u * v;
      suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
    }
  }
  // Kåsa: x² + y² + D x + E y + F = 0 (zentriert)
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const r1 = 0.5 * (suuu + suvv), r2 = 0.5 * (svvv + svuu);
  let cx = (r1 * svv - r2 * suv) / det, cy = (r2 * suu - r1 * suv) / det;
  let r = Math.sqrt(cx * cx + cy * cy + (suu + svv) / n);
  cx += mx + offX; cy += my + offY;
  if (!Number.isFinite(r) || r > maxR || r < minR * 0.5) return null;
  // schnelle Vorprüfung an wenigen Punkten: schon die algebraische Lösung weit daneben → kein Kreis
  const stepQ = Math.max(1, Math.floor(n / 16));
  for (let i = a; i <= b; i += stepQ) {
    const e = Math.hypot(X[i] - cx, Y[i] - cy) - r;
    if (e > 2 * tol || e < -2 * tol) return null;
  }
  // Abweichung prüfen (max ≤ tol, Mittel ≤ tol/3)
  const check = () => {
    let sq = 0;
    for (let i = a; i <= b; i++) {
      const e = Math.hypot(X[i] - cx, Y[i] - cy) - r;
      if (e > tol || e < -tol) return false;
      sq += e * e;
    }
    return sq / n <= (tol * tol) / 9;
  };
  // Meist passt schon die algebraische Lösung; sonst Gauß-Newton auf den geometrischen Abstand
  if (!check()) {
    for (let it = 0; it < 3; it++) {
      let j11 = 0, j12 = 0, j13 = 0, j22 = 0, j23 = 0, j33 = 0, g1 = 0, g2 = 0, g3 = 0;
      for (let i = a; i <= b; i++) {
        const ddx = X[i] - cx, ddy = Y[i] - cy;
        const d = Math.hypot(ddx, ddy) || 1e-9;
        const res = d - r;
        const ja = -ddx / d, jb = -ddy / d, jc = -1;
        j11 += ja * ja; j12 += ja * jb; j13 += ja * jc; j22 += jb * jb; j23 += jb * jc; j33 += jc * jc;
        g1 += ja * res; g2 += jb * res; g3 += jc * res;
      }
      const s = solve3([j11, j12, j13, j12, j22, j23, j13, j23, j33], [-g1, -g2, -g3]);
      if (!s) break;
      cx += s[0]; cy += s[1]; r += s[2];
      if (Math.abs(s[0]) + Math.abs(s[1]) + Math.abs(s[2]) < 1e-4) break;
    }
    if (!Number.isFinite(r) || !check()) return null;
  }
  if (r > maxR || r < minR) return null;
  // Drehsinn und überstrichener Winkel (über 16 Stützpunkte; die Punkte liegen dicht am Kreis)
  const K = Math.min(16, b - a);
  let sweep = 0, prev = Math.atan2(Y[a] - cy, X[a] - cx);
  for (let k = 1; k <= K; k++) {
    const i = a + Math.round(((b - a) * k) / K);
    const ang = Math.atan2(Y[i] - cy, X[i] - cx);
    let d = ang - prev;
    if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
    sweep += d;
    prev = ang;
  }
  return { kind: 'arc', cx, cy, r, sweep };
}

function solve3(m, v) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  return [
    (v[0] * (e * i - f * h) - b * (v[1] * i - f * v[2]) + c * (v[1] * h - e * v[2])) / det,
    (a * (v[1] * i - f * v[2]) - v[0] * (d * i - f * g) + c * (d * v[2] - v[1] * g)) / det,
    (a * (e * v[2] - v[1] * h) - b * (d * v[2] - v[1] * g) + v[0] * (d * h - e * g)) / det,
  ];
}

/** Gauß-Elimination für kleine Systeme. */
function solveN(A, bv) {
  const n = bv.length;
  const M = A.map((row, i) => [...row, bv[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Ellipse durch alle Punkte (Kegelschnitt a u² + b uv + c v² + d u + e v = 1, zentriert). */
function fitEllipse(X, Y, n, tol) {
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += X[i]; my += Y[i]; }
  mx /= n; my /= n;
  const A = Array.from({ length: 5 }, () => new Array(5).fill(0));
  const B = new Array(5).fill(0);
  for (let i = 0; i < n; i++) {
    const u = X[i] - mx, v = Y[i] - my;
    const row = [u * u, u * v, v * v, u, v];
    for (let r = 0; r < 5; r++) {
      B[r] += row[r];
      for (let k = 0; k < 5; k++) A[r][k] += row[r] * row[k];
    }
  }
  const s = solveN(A, B);
  if (!s) return null;
  const [a, b, c, d, e] = s;
  if (b * b - 4 * a * c >= 0) return null; // keine Ellipse
  const den = 4 * a * c - b * b;
  const u0 = (b * e - 2 * c * d) / den, v0 = (b * d - 2 * a * e) / den;
  const F0 = a * u0 * u0 + b * u0 * v0 + c * v0 * v0 + d * u0 + e * v0 - 1;
  const phi = 0.5 * Math.atan2(b, a - c);
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const l1 = a * cp * cp + b * cp * sp + c * sp * sp;
  const l2 = a * sp * sp - b * cp * sp + c * cp * cp;
  if (!(-F0 / l1 > 0 && -F0 / l2 > 0)) return null;
  const rx = Math.sqrt(-F0 / l1), ry = Math.sqrt(-F0 / l2);
  const cx = mx + u0, cy = my + v0;
  return { kind: 'ellipse', cx, cy, rx, ry, phi };
}

/** Größte und mittlere Abweichung der Punkte von einer Ellipse (Näherung entlang des Strahls). */
function ellipseError(X, Y, n, el) {
  const cp = Math.cos(el.phi), sp = Math.sin(el.phi);
  let max = 0, sq = 0;
  for (let i = 0; i < n; i++) {
    const dx = X[i] - el.cx, dy = Y[i] - el.cy;
    const u = dx * cp + dy * sp, v = -dx * sp + dy * cp;
    const rho = Math.hypot(u / el.rx, v / el.ry) || 1e-9;
    const e = Math.hypot(u, v) * Math.abs(1 - 1 / rho);
    if (e > max) max = e;
    sq += e * e;
  }
  return { max, rms: Math.sqrt(sq / n) };
}

/* ------------------------------------------------------------------ */
/* Kandidaten, Segmentierung                                           */
/* ------------------------------------------------------------------ */

/** Douglas-Peucker auf X/Y[a..b]; fügt die gefundenen Indizes in out ein. */
function douglasPeucker(X, Y, a, b, tol, out) {
  const stack = [[a, b]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    if (i1 - i0 < 2) continue;
    const dx = X[i1] - X[i0], dy = Y[i1] - Y[i0];
    const len = Math.hypot(dx, dy);
    let best = -1, bi = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = len > 1e-9
        ? Math.abs((X[i] - X[i0]) * dy - (Y[i] - Y[i0]) * dx) / len
        : Math.hypot(X[i] - X[i0], Y[i] - Y[i0]);
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) {
      out.add(bi);
      stack.push([i0, bi], [bi, i1]);
    }
  }
}

function snapAngle(th, snapRad) {
  const step = Math.PI / 4;
  const k = Math.round(th / step);
  return Math.abs(th - k * step) <= snapRad ? k * step : null;
}

/** Winkel einrasten: 0°/45°/90° absolut, sonst rechtwinklig zur benachbarten Geraden. */
function snapLines(prims, snapRad) {
  const lines = prims.filter((p) => p.kind === 'line');
  for (const p of lines) {
    const th = snapAngle(Math.atan2(p.dy, p.dx), snapRad);
    if (th != null) { p.dx = Math.cos(th); p.dy = Math.sin(th); p.fixed = true; }
  }
  if (lines.length < 2) return;
  // Nachbarn über höchstens einen kurzen Bogen (abgerundete Ecke) hinweg
  const neighbor = (i, dir) => {
    for (let k = 1; k <= 2; k++) {
      const q = prims[(i + dir * k + prims.length * 2) % prims.length];
      if (q.kind === 'line') return q;
      if (q.kind !== 'arc') return null;
    }
    return null;
  };
  for (let pass = 0; pass < 2; pass++) {
    prims.forEach((p, i) => {
      if (p.kind !== 'line' || p.fixed) return;
      for (const dir of [-1, 1]) {
        const q = neighbor(i, dir);
        if (!q || q === p || !q.fixed) continue;
        const dot = p.dx * q.dx + p.dy * q.dy;
        const cross = p.dx * q.dy - p.dy * q.dx;
        const ang = Math.atan2(Math.abs(cross), Math.abs(dot)); // 0 … 90°
        if (Math.abs(ang - Math.PI / 2) <= snapRad) {
          // senkrecht zu q, in Richtung von p
          const s = Math.sign(p.dx * -q.dy + p.dy * q.dx) || 1;
          p.dx = -q.dy * s; p.dy = q.dx * s; p.fixed = true;
          return;
        }
        if (ang <= snapRad) {
          const s = Math.sign(dot) || 1;
          p.dx = q.dx * s; p.dy = q.dy * s; p.fixed = true;
          return;
        }
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* Übergänge                                                           */
/* ------------------------------------------------------------------ */

function projLine(p, s) {
  const t = (s.x - p.mx) * p.dx + (s.y - p.my) * p.dy;
  return { x: p.mx + t * p.dx, y: p.my + t * p.dy };
}
function projCircle(p, s) {
  const dx = s.x - p.cx, dy = s.y - p.cy;
  const d = Math.hypot(dx, dy) || 1e-9;
  return { x: p.cx + (dx / d) * p.r, y: p.cy + (dy / d) * p.r };
}
const proj = (p, s) => (p.kind === 'line' ? projLine(p, s) : p.kind === 'arc' ? projCircle(p, s) : s);

function lineLine(p, q) {
  const den = p.dx * q.dy - p.dy * q.dx;
  if (Math.abs(den) < 0.05) return null; // fast parallel
  const t = ((q.mx - p.mx) * q.dy - (q.my - p.my) * q.dx) / den;
  return [{ x: p.mx + t * p.dx, y: p.my + t * p.dy }];
}
function lineCircle(l, c) {
  const fx0 = l.mx - c.cx, fy0 = l.my - c.cy;
  const bq = fx0 * l.dx + fy0 * l.dy;
  const cq = fx0 * fx0 + fy0 * fy0 - c.r * c.r;
  const disc = bq * bq - cq;
  if (disc < 0) {
    // knapp verfehlt: Berührpunkt (tangentialer Übergang)
    const t = -bq;
    const p = { x: l.mx + t * l.dx, y: l.my + t * l.dy };
    return [p];
  }
  const sq = Math.sqrt(disc);
  return [-bq - sq, -bq + sq].map((t) => ({ x: l.mx + t * l.dx, y: l.my + t * l.dy }));
}
function circleCircle(a, b) {
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return [];
  const al = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
  const h2 = a.r * a.r - al * al;
  const h = Math.sqrt(Math.max(0, h2));
  const mx = a.cx + (al * dx) / d, my = a.cy + (al * dy) / d;
  return [{ x: mx + (h * dy) / d, y: my - (h * dx) / d }, { x: mx - (h * dy) / d, y: my + (h * dx) / d }];
}

/** Übergang zwischen p und q am Abtastpunkt s → [Endpunkt von p, Startpunkt von q]. */
function junction(p, q, s, lim) {
  // ohne passenden Schnittpunkt: gemeinsamer Punkt zwischen beiden Formen (keine Stufe)
  const between = () => {
    const a = proj(p, s), b = proj(q, s);
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return [m, m];
  };
  if (p.kind === 'free' || q.kind === 'free') return [proj(p, s), proj(q, s)];
  let cands;
  if (p.kind === 'line' && q.kind === 'line') {
    cands = lineLine(p, q);
    if (!cands) return between(); // fast parallel
  }
  else if (p.kind === 'line') cands = lineCircle(p, q);
  else if (q.kind === 'line') cands = lineCircle(q, p);
  else cands = circleCircle(p, q);
  let best = null, bd = lim;
  for (const c of cands) {
    const d = dist(c, s);
    if (d <= bd) { bd = d; best = c; }
  }
  if (best) {
    // bei knapp verfehlten Formen liegt der Punkt nur auf einer genau: auf beide projizieren
    const a = proj(p, best), b = proj(q, best);
    return dist(a, b) < 1e-3 ? [best, best] : [a, b];
  }
  return between();
}

/* ------------------------------------------------------------------ */
/* Ausgabe                                                             */
/* ------------------------------------------------------------------ */

/** Teil einer Kubik zwischen t0 und t1. */
function subCubic(p, t0, t1) {
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const split = (P, t) => {
    const [p0, p1, p2, p3] = P;
    const a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t);
    const d = lerp(a, b, t), e = lerp(b, c, t), f = lerp(d, e, t);
    return [[p0, a, d, f], [f, e, c, p3]];
  };
  let P = [p.a, p.c1, p.c2, p.b];
  if (t1 < 1) P = split(P, t1)[0];
  if (t0 > 0) P = split(P, t1 > 0 ? t0 / t1 : 0)[1];
  return P;
}

function emitPiece(out, p, t0, t1) {
  if (t1 <= t0 + 1e-9) return;
  if (p.L) {
    const q = pieceAt(p, t1);
    out.push(`L ${fx(q.x)} ${fx(q.y)}`);
  } else {
    const [, c1, c2, e] = subCubic(p, t0, t1);
    out.push(`C ${fx(c1.x)} ${fx(c1.y)}, ${fx(c2.x)} ${fx(c2.y)}, ${fx(e.x)} ${fx(e.y)}`);
  }
}

/** Ursprüngliche Kurve vom Abtastpunkt a bis b (Indizes in die gedrehte Abtastung). */
function emitOriginal(out, pieces, PI, T, a, b) {
  const P = pieces.length;
  const pa = PI[a], ta = T[a], pb = PI[b], tb = T[b];
  if (pa === pb && ta <= tb && b - a < PI.length - 1) {
    emitPiece(out, pieces[pa], ta, tb);
    return;
  }
  emitPiece(out, pieces[pa], ta, 1);
  for (let k = (pa + 1) % P; k !== pb; k = (k + 1) % P) emitPiece(out, pieces[k], 0, 1);
  emitPiece(out, pieces[pb], 0, tb);
}

/** Winkel des Bogens von st nach en im Drehsinn der Abtastung. */
function arcAngle(p, st, en) {
  const a0 = Math.atan2(st.y - p.cy, st.x - p.cx), a1 = Math.atan2(en.y - p.cy, en.x - p.cx);
  let ang = a1 - a0;
  if (p.sweep >= 0) { while (ang < 0) ang += TAU; } else { while (ang > 0) ang -= TAU; }
  return ang;
}

/** Liegt die ausgegebene Form (st → en) überall nahe an den ursprünglichen Abtastpunkten? */
function onContour(p, st, en, X, Y, N, maxDev) {
  const a = Math.max(0, p.a - 2), b = Math.min(N, p.b + 2);
  const len = p.kind === 'line' ? dist(st, en) : Math.abs(arcAngle(p, st, en)) * p.r;
  if (p.kind === 'arc' && Math.abs(arcAngle(p, st, en)) > Math.abs(p.sweep) * 1.5 + 0.4) return false;
  const m = Math.max(2, Math.min(64, Math.ceil(len / 2)));
  const a0 = p.kind === 'arc' ? Math.atan2(st.y - p.cy, st.x - p.cx) : 0;
  const ang = p.kind === 'arc' ? arcAngle(p, st, en) : 0;
  const md2 = maxDev * maxDev;
  for (let k = 0; k <= m; k++) {
    const t = k / m;
    const q = p.kind === 'line'
      ? { x: st.x + (en.x - st.x) * t, y: st.y + (en.y - st.y) * t }
      : { x: p.cx + p.r * Math.cos(a0 + ang * t), y: p.cy + p.r * Math.sin(a0 + ang * t) };
    let ok = false;
    for (let i = a; i <= b; i++) {
      const dx = X[i] - q.x, dy = Y[i] - q.y;
      if (dx * dx + dy * dy <= md2) { ok = true; break; }
    }
    if (!ok) return false;
  }
  // umgekehrt: jeder Abtastpunkt nahe an der ausgegebenen Strecke bzw. dem Bogen
  for (let i = p.a; i <= p.b; i++) {
    const q = { x: X[i], y: Y[i] };
    let d;
    if (p.kind === 'line') {
      const vx = en.x - st.x, vy = en.y - st.y;
      const l2 = vx * vx + vy * vy || 1e-9;
      const t = Math.max(0, Math.min(1, ((q.x - st.x) * vx + (q.y - st.y) * vy) / l2));
      d = Math.hypot(q.x - st.x - t * vx, q.y - st.y - t * vy);
    } else {
      const qa = arcAngle(p, st, q);
      const inside = Math.abs(qa) <= Math.abs(ang);
      d = inside ? Math.abs(Math.hypot(q.x - p.cx, q.y - p.cy) - p.r) : Math.min(dist(q, st), dist(q, en));
    }
    if (d > maxDev) return false;
  }
  return true;
}

function arcTo(out, p, st, en) {
  const ang = arcAngle(p, st, en);
  // Endpunkte durch die Übergänge über das Bogenende hinaus verschoben → sonst fast ein Vollkreis
  const sw = Math.abs(p.sweep);
  if (Math.abs(ang) < 1e-6 || Math.abs(ang) > sw * 1.5 + 0.4) {
    out.push(`L ${fx(en.x)} ${fx(en.y)}`);
    return;
  }
  const large = Math.abs(ang) > Math.PI ? 1 : 0;
  const sweep = p.sweep >= 0 ? 1 : 0;
  out.push(`A ${fx(p.r)} ${fx(p.r)} 0 ${large} ${sweep} ${fx(en.x)} ${fx(en.y)}`);
}

function ellipsePath(el) {
  const deg = (el.phi * 180) / Math.PI;
  const cp = Math.cos(el.phi), sp = Math.sin(el.phi);
  const p0 = { x: el.cx + el.rx * cp, y: el.cy + el.rx * sp };
  const p1 = { x: el.cx - el.rx * cp, y: el.cy - el.rx * sp };
  const r = `${fx(el.rx)} ${fx(el.ry)} ${fx(deg)}`;
  return `M ${fx(p0.x)} ${fx(p0.y)} A ${r} 0 1 ${fx(p1.x)} ${fx(p1.y)} A ${r} 0 1 ${fx(p0.x)} ${fx(p0.y)} Z`;
}

/* ------------------------------------------------------------------ */
/* Hauptfunktion                                                       */
/* ------------------------------------------------------------------ */

/**
 * @param curve Potrace-Kurve (path.curve)
 * @param opts { tol: Toleranz in px, snap: Winkel einrasten, snapDeg, renderOriginal(curve) }
 * @returns SVG-Pfaddaten dieser Kontur
 */
function fitCurve(curve, opts) {
  const tol = Math.max(0.5, opts.tol || 1.5);
  const snapRad = ((opts.snapDeg ?? 4) * Math.PI) / 180;
  const pieces = curvePieces(curve);
  const smp = sample(pieces, Math.min(1, tol / 2));
  const N = smp.xs.length;
  if (N < 6) return opts.renderOriginal(curve);

  // Ausdehnung der Kontur – begrenzt Radien (sehr große Radien sind praktisch Geraden)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < N; i++) {
    if (smp.xs[i] < minX) minX = smp.xs[i];
    if (smp.xs[i] > maxX) maxX = smp.xs[i];
    if (smp.ys[i] < minY) minY = smp.ys[i];
    if (smp.ys[i] > maxY) maxY = smp.ys[i];
  }
  const extent = Math.max(maxX - minX, maxY - minY);

  // 1. Ganze Kontur: Kreis oder Ellipse
  {
    const circ = fitCircle(smp.xs, smp.ys, 0, N - 1, tol, extent * 2);
    if (circ && Math.abs(circ.sweep) > TAU * 0.95) {
      return ellipsePath({ cx: circ.cx, cy: circ.cy, rx: circ.r, ry: circ.r, phi: 0 });
    }
    if (N >= 12) {
      const el = fitEllipse(smp.xs, smp.ys, N, tol);
      if (el) {
        const err = ellipseError(smp.xs, smp.ys, N, el);
        if (err.max <= tol && err.rms <= tol / 2) {
          if (opts.snap) {
            const th = snapAngle(el.phi, snapRad);
            if (th != null) el.phi = th;
          }
          if (Math.abs(el.rx - el.ry) <= tol / 2) { el.rx = el.ry = (el.rx + el.ry) / 2; el.phi = 0; }
          return ellipsePath(el);
        }
      }
    }
  }
  if (N < 12) return opts.renderOriginal(curve);

  // 2. Startpunkt: eine Potrace-Ecke, sonst ein äußerer Punkt
  let start = smp.corner.indexOf(1);
  if (start < 0) {
    // ohne Ecken: der vom ersten Punkt am weitesten entfernte Punkt
    let fd = -1;
    for (let i = 0; i < N; i++) {
      const d = (smp.xs[i] - smp.xs[0]) ** 2 + (smp.ys[i] - smp.ys[0]) ** 2;
      if (d > fd) { fd = d; start = i; }
    }
  }
  // gedreht + geschlossen (Index N = Startpunkt)
  const X = new Float64Array(N + 1), Y = new Float64Array(N + 1);
  const PI = new Int32Array(N + 1), T = new Float64Array(N + 1);
  const C = new Uint8Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const j = (start + i) % N;
    X[i] = smp.xs[j]; Y[i] = smp.ys[j]; PI[i] = smp.pi[j]; T[i] = smp.ts[j]; C[i] = smp.corner[j];
  }

  // 3. Kandidaten für Knickpunkte
  const set = new Set([0, N]);
  for (let i = 1; i < N; i++) if (C[i]) set.add(i);
  const sorted0 = [...set].sort((a, b) => a - b);
  for (let k = 0; k + 1 < sorted0.length; k++) douglasPeucker(X, Y, sorted0[k], sorted0[k + 1], tol / 3, set);
  // zusätzliche Kandidaten auf langen Strecken (genauere Übergänge zwischen Gerade und Bogen)
  let cand = [...set].sort((a, b) => a - b);
  const extra = [];
  for (let k = 0; k + 1 < cand.length; k++) {
    const gap = cand[k + 1] - cand[k];
    const parts = Math.min(4, Math.floor(gap / Math.max(4, 3 * tol)));
    for (let j = 1; j < parts; j++) extra.push(cand[k] + Math.round((gap * j) / parts));
  }
  if (extra.length) cand = [...new Set([...cand, ...extra])].sort((a, b) => a - b);
  const M = cand.length;

  // 4. Kleinste Zahl von Grundformen (dynamische Programmierung)
  // Koordinaten für die Momentsummen um den Konturmittelpunkt verschoben (Genauigkeit)
  const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2;
  const S = prefix(X, Y);
  const Mo = moments(X.map((v) => v - ox), Y.map((v) => v - oy));
  Mo.ox = ox; Mo.oy = oy;
  const maxR = extent * 4;
  const COST = { line: 1, arc: 1.05, free: 3 };
  const best = new Float64Array(M).fill(Infinity);
  const from = new Int32Array(M).fill(-1);
  const prim = new Array(M);
  best[0] = 0;
  const MAXSPAN = 60;
  for (let k = 1; k < M; k++) {
    for (let j = k - 1; j >= 0 && j >= k - MAXSPAN; j--) {
      if (best[j] === Infinity) continue;
      const a = cand[j], b = cand[k];
      let ln = fitLine(X, Y, S, a, b, tol);
      let arc = null;
      // Bogen: über einen Potrace-Eckpunkt hinweg nie
      let hasCorner = false;
      for (let i = a + 1; i < b; i++) if (C[i]) { hasCorner = true; break; }
      // kleine Rundungen (Radius < 4 × Toleranz) bleiben die Potrace-Kurve – sonst verformen sich feine Details
      if (!hasCorner) arc = fitCircle(X, Y, a, b, tol, maxR, 4 * tol, Mo);
      else ln = null;
      // über eine Ecke hinweg und bei fehlender Anpassung passen größere Spannen erst recht nicht
      if (hasCorner || (!ln && !arc)) {
        if (j === k - 1) {
          const c = best[j] + COST.free;
          if (c < best[k]) { best[k] = c; from[k] = j; prim[k] = { kind: 'free' }; }
        }
        break;
      }
      if (ln) {
        const c = best[j] + COST.line;
        if (c < best[k]) { best[k] = c; from[k] = j; prim[k] = ln; }
      } else if (arc && Math.abs(arc.sweep) < TAU * 0.98) {
        const c = best[j] + COST.arc;
        if (c < best[k]) { best[k] = c; from[k] = j; prim[k] = arc; }
      }
    }
    if (best[k] === Infinity && best[k - 1] !== Infinity) {
      best[k] = best[k - 1] + COST.free; from[k] = k - 1; prim[k] = { kind: 'free' };
    }
  }
  const prims = [];
  for (let k = M - 1; k > 0; k = from[k]) {
    if (from[k] < 0) return opts.renderOriginal(curve);
    prims.push({ ...prim[k], a: cand[from[k]], b: cand[k] });
  }
  prims.reverse();
  // benachbarte freie Stücke zusammenfassen
  const merged = [];
  for (const p of prims) {
    const last = merged[merged.length - 1];
    if (last && last.kind === 'free' && p.kind === 'free') last.b = p.b;
    else merged.push(p);
  }
  if (merged.every((p) => p.kind === 'free')) return opts.renderOriginal(curve);

  // 5. Winkel einrasten und Übergänge. Danach prüfen, ob jede Form wirklich auf der
  //    ursprünglichen Kontur liegt (die Übergänge verschieben Endpunkte); sonst Originalkurve.
  if (opts.snap) snapLines(merged, snapRad);
  const lim = Math.max(2 * tol, 2);
  let list = merged, n, ends, starts;
  for (let iter = 0; ; iter++) {
    n = list.length;
    ends = new Array(n); starts = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = list[i], q = list[(i + 1) % n];
      const s = { x: X[p.b], y: Y[p.b] };
      const [e, st] = n === 1 ? [proj(p, s), proj(p, s)] : junction(p, q, s, lim);
      ends[i] = e;
      starts[(i + 1) % n] = st;
    }
    // Endpunkte genau auf die eigene Form legen: SVG-Bögen berechnen ihren Mittelpunkt aus den
    // Endpunkten, eingerastete Geraden bleiben exakt waagrecht/senkrecht. Ein evtl. Versatz zum
    // Nachbarn wird beim Ausgeben mit einem kurzen Verbindungsstück geschlossen.
    for (let i = 0; i < n; i++) {
      const p = list[i];
      if (p.kind === 'free') continue;
      starts[i] = proj(p, starts[i]);
      ends[i] = proj(p, ends[i]);
    }
    let bad = false;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      if (p.kind !== 'free' && !onContour(p, starts[i], ends[i], X, Y, N, 1.5 * tol)) { p.kind = 'free'; bad = true; }
    }
    if (!bad || iter >= 3) break;
    const next = [];
    for (const p of list) {
      const last = next[next.length - 1];
      if (last && last.kind === 'free' && p.kind === 'free') last.b = p.b;
      else next.push(p);
    }
    list = next;
    if (list.every((p) => p.kind === 'free')) return opts.renderOriginal(curve);
  }
  const merged2 = list;

  const out = [];
  const st0 = starts[0];
  out.push(`M ${fx(st0.x)} ${fx(st0.y)}`);
  let cur = st0;
  for (let i = 0; i < n; i++) {
    const p = merged2[i];
    const st = starts[i], en = ends[i];
    if (dist(cur, st) > 1e-3) out.push(`L ${fx(st.x)} ${fx(st.y)}`);
    if (p.kind === 'line') out.push(`L ${fx(en.x)} ${fx(en.y)}`);
    else if (p.kind === 'arc') arcTo(out, p, st, en);
    else {
      const sa = { x: X[p.a], y: Y[p.a] };
      if (dist(st, sa) > 1e-3) out.push(`L ${fx(sa.x)} ${fx(sa.y)}`);
      emitOriginal(out, pieces, PI, T, p.a, p.b);
      const sb = { x: X[p.b], y: Y[p.b] };
      if (dist(sb, en) > 1e-3) out.push(`L ${fx(en.x)} ${fx(en.y)}`);
    }
    cur = en;
  }
  out.push('Z');
  return out.join(' ');
}

module.exports = { fitCurve };
