//! Sinuswellen-Schattierung („Wellen“) für Pic2Laser.
//!
//! Portierung des Verfahrens aus img2laser (Kyle Larsen, MIT-Lizenz,
//! https://github.com/0not/img2laser): Das Bild wird in Zeilen zerlegt, jede Zeile
//! wird zu einer Sinuswelle, deren Frequenz der Dunkelheit folgt (dunkel = dichte
//! Wellen, hell = flache Linie). Die Phase wird aufsummiert, damit die Welle beim
//! Wechsel der Frequenz nicht springt.
//!
//! Erweiterungen gegenüber dem Original: senkrechte Wellen, Aussparen weißer
//! Flächen (Stift hoch), Frequenzen in Bildpunkten statt fester Größen,
//! Ausdünnen fast gerader Punktfolgen (kleinere SVGs).
//!
//! Schnittstelle ohne wasm-bindgen:
//!   ptr = alloc(n)  → Graustufen (w × h, 0 = schwarz, 255 = weiß) hineinschreiben
//!   len = sine_paths(ptr, w, h, …) → SVG-Pfaddaten (ASCII) ab result_ptr(), len Bytes
//!   dealloc(ptr, n)

use std::fmt::Write;

static mut RESULT: String = String::new();

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(p: *mut u8, n: usize) {
    drop(Vec::from_raw_parts(p, 0, n.max(1)));
}

#[no_mangle]
pub extern "C" fn result_ptr() -> *const u8 {
    unsafe { (*std::ptr::addr_of!(RESULT)).as_ptr() }
}

/// Gibt den Ergebnis-Speicher frei.
#[no_mangle]
pub extern "C" fn result_free() {
    unsafe { *std::ptr::addr_of_mut!(RESULT) = String::new() }
}

const FLAG_VERTICAL: u32 = 1;
const FLAG_SKIP_WHITE: u32 = 2;
const FLAG_NORMALIZE: u32 = 4;

/// Grauwert, ab dem eine Stelle als weiß gilt (Stift hoch bei FLAG_SKIP_WHITE).
const WHITE: f32 = 253.5;

/// Berechnet die Wellen als SVG-Pfaddaten im Pixelraum des Bildes.
///
/// * `spacing` – Abstand der Wellen (Zeilenhöhe) in Pixeln
/// * `amplitude` – Ausschlag als Anteil der Zeilenhöhe (0,5 = Wellen berühren sich)
/// * `f_min`, `f_max` – Kreisfrequenz in rad je Pixel für weiß bzw. schwarz
/// * `tol` – erlaubte Abweichung beim Ausdünnen in Pixeln
/// * `min_run` – nur mit FLAG_SKIP_WHITE: kürzere weiße Lücken werden überbrückt, kürzere
///   Linienstücke zwischen weißen Flächen entfallen (Pixel entlang der Welle)
#[no_mangle]
pub unsafe extern "C" fn sine_paths(
    gray: *const u8,
    w: u32,
    h: u32,
    spacing: f32,
    amplitude: f32,
    f_min: f32,
    f_max: f32,
    tol: f32,
    min_run: f32,
    flags: u32,
) -> usize {
    let (w, h) = (w as usize, h as usize);
    let img = std::slice::from_raw_parts(gray, w * h);
    let out = &mut *std::ptr::addr_of_mut!(RESULT);
    *out = render(img, w, h, spacing, amplitude, f_min, f_max, tol, min_run, flags);
    out.len()
}

#[allow(clippy::too_many_arguments)]
fn render(
    img: &[u8],
    w: usize,
    h: usize,
    spacing: f32,
    amplitude: f32,
    f_min: f32,
    f_max: f32,
    tol: f32,
    min_run: f32,
    flags: u32,
) -> String {
    let vertical = flags & FLAG_VERTICAL != 0;
    let skip_white = flags & FLAG_SKIP_WHITE != 0;
    let normalize = flags & FLAG_NORMALIZE != 0;
    if w == 0 || h == 0 {
        return String::new();
    }
    // Länge entlang der Welle (len) und quer dazu (across)
    let (len, across) = if vertical { (h, w) } else { (w, h) };
    let px = |along: usize, cross: usize| -> u32 {
        if vertical { img[along * w + cross] as u32 } else { img[cross * w + along] as u32 }
    };

    let spacing = spacing.max(0.5);
    let lines = ((across as f32 / spacing).round() as usize).clamp(1, across);
    let row_h = across as f32 / lines as f32;
    let amp = amplitude.clamp(0.0, 1.0) * row_h;

    // 1. Mittelwert jeder Zeile quer zur Welle (wie average_rows im Original)
    let mut avg = vec![0f32; lines * len];
    for n in 0..lines {
        let start = (n as f32 * row_h).round() as usize;
        let end = (((n + 1) as f32 * row_h).round() as usize).clamp(start + 1, across);
        let cnt = (end - start) as f32;
        let row = &mut avg[n * len..(n + 1) * len];
        for (a, r) in row.iter_mut().enumerate() {
            let mut sum = 0u32;
            for c in start..end {
                sum += px(a, c);
            }
            *r = sum as f32 / cnt;
        }
    }

    // 2. Dunkelheit 0…1, optional auf den Umfang des Bildes gestreckt
    let mut d_lo = 0f32;
    let mut d_hi = 1f32;
    if normalize {
        d_lo = f32::MAX;
        d_hi = f32::MIN;
        for &g in avg.iter() {
            if skip_white && g >= WHITE {
                continue;
            }
            let d = (255.0 - g) / 255.0;
            d_lo = d_lo.min(d);
            d_hi = d_hi.max(d);
        }
        if d_hi - d_lo < 1e-6 {
            d_lo = 0.0;
            d_hi = 1.0;
        }
    }
    let scale = (f_max - f_min) / (d_hi - d_lo);

    // 3. Abtastung: mindestens 10 Punkte je Wellenlänge bei der höchsten Frequenz
    let fs = ((10.0 * f_max.max(f_min).max(0.0) / std::f32::consts::TAU).ceil() as usize).clamp(1, 32);
    let steps = len * fs;

    let mut s = String::with_capacity(lines * len * 8);
    let mut pts: Vec<(f32, f32)> = Vec::with_capacity(steps + 1);
    let min_run = min_run.max(0.0).round() as usize;
    let mut blank = vec![false; len];
    for n in 0..lines {
        let row = &avg[n * len..(n + 1) * len];
        if skip_white {
            for (b, &g) in blank.iter_mut().zip(row) {
                *b = g >= WHITE;
            }
            clean_runs(&mut blank, min_run);
        }
        let mid = (n as f32 + 0.5) * row_h;
        let mut phi = 0f32;
        pts.clear();
        for i in 0..=steps {
            let a = (i / fs).min(len - 1);
            let g = row[a];
            if skip_white && blank[a] {
                flush(&mut s, &mut pts, vertical, tol);
            } else {
                let x = i as f32 / fs as f32;
                let y = mid + amp * phi.sin();
                pts.push((x, y));
            }
            let d = ((255.0 - g) / 255.0).clamp(d_lo, d_hi);
            phi += (f_min + scale * (d - d_lo)) / fs as f32;
        }
        flush(&mut s, &mut pts, vertical, tol);
    }
    s
}

/// Glättet die Stift-hoch-Bereiche einer Zeile: weiße Lücken unter `min` Pixeln werden
/// überbrückt, danach entfallen Linienstücke unter `min` Pixeln (keine Krümel im Rauschen).
fn clean_runs(blank: &mut [bool], min: usize) {
    if min <= 1 {
        return;
    }
    for pass in [true, false] {
        // pass true: kurze weiße Läufe zwischen Linie füllen; false: kurze Linienläufe entfernen
        let n = blank.len();
        let mut i = 0;
        while i < n {
            if blank[i] != pass {
                i += 1;
                continue;
            }
            let start = i;
            while i < n && blank[i] == pass {
                i += 1;
            }
            // Weiß am Zeilenrand bleibt weiß (Rand ist keine Lücke)
            let inner = start > 0 && i < n;
            if i - start < min && (inner || !pass) {
                blank[start..i].fill(!pass);
            }
        }
    }
}

/// Schreibt eine Punktfolge als Teilpfad (M … L …) und leert sie.
fn flush(s: &mut String, pts: &mut Vec<(f32, f32)>, vertical: bool, tol: f32) {
    if pts.len() >= 2 {
        let keep = simplify(pts, tol);
        let mut first = true;
        for &(a, c) in keep.iter() {
            let (x, y) = if vertical { (c, a) } else { (a, c) };
            if first {
                s.push('M');
            } else if s.ends_with(|ch: char| ch.is_ascii_digit()) {
                s.push(' ');
            }
            num(s, x);
            s.push(' ');
            num(s, y);
            if first {
                s.push('L');
                first = false;
            }
        }
    }
    pts.clear();
}

/// Ausdünnen: Punkte weglassen, solange alle übersprungenen höchstens `tol` von der
/// Verbindungsgeraden abweichen (Fenster mit Neustart, linear in der Punktzahl).
fn simplify(p: &[(f32, f32)], tol: f32) -> Vec<(f32, f32)> {
    if tol <= 0.0 || p.len() < 3 {
        return p.to_vec();
    }
    let mut out = Vec::with_capacity(p.len() / 2);
    out.push(p[0]);
    let mut anchor = 0usize;
    let mut i = 2usize;
    while i < p.len() {
        let (ax, ay) = p[anchor];
        let (bx, by) = p[i];
        let (dx, dy) = (bx - ax, by - ay);
        let l = (dx * dx + dy * dy).sqrt().max(1e-9);
        let ok = (anchor + 1..i).all(|k| {
            let (px, py) = p[k];
            ((px - ax) * dy - (py - ay) * dx).abs() / l <= tol
        }) && i - anchor < 64;
        if !ok {
            anchor = i - 1;
            out.push(p[anchor]);
        }
        i += 1;
    }
    out.push(p[p.len() - 1]);
    out
}

/// Zahl mit höchstens zwei Nachkommastellen, ohne überflüssige Nullen.
fn num(s: &mut String, v: f32) {
    let r = (v * 100.0).round() as i64;
    if r < 0 {
        s.push('-');
    }
    let r = r.unsigned_abs();
    let _ = write!(s, "{}", r / 100);
    let f = r % 100;
    if f != 0 {
        if f % 10 == 0 {
            let _ = write!(s, ".{}", f / 10);
        } else {
            let _ = write!(s, ".{:02}", f);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn white_is_flat_and_black_waves() {
        let w = 20;
        let h = 4;
        let mut img = vec![255u8; w * h];
        for y in 0..h {
            for x in 10..w {
                img[y * w + x] = 0;
            }
        }
        let d = render(&img, w, h, 4.0, 0.4, 0.0, 2.0, 0.05, 0.0, FLAG_NORMALIZE);
        assert!(d.starts_with("M0 2L"));
        let d2 = render(&img, w, h, 4.0, 0.4, 0.0, 2.0, 0.05, 3.0, FLAG_NORMALIZE | FLAG_SKIP_WHITE);
        assert!(d2.starts_with("M10 "));
    }

    #[test]
    fn runs() {
        let mut b: Vec<bool> = "..#....##.......#.#..".chars().map(|c| c == '.').collect();
        clean_runs(&mut b, 3);
        let s: String = b.iter().map(|&x| if x { '.' } else { '#' }).collect();
        // Lücke von 4 bleibt, kurze Striche verschwinden, „#.#“ wird zu einem Strich von 3
        assert_eq!(s, "................###..");
        let mut b: Vec<bool> = "####..####......#".chars().map(|c| c == '.').collect();
        clean_runs(&mut b, 3);
        let s: String = b.iter().map(|&x| if x { '.' } else { '#' }).collect();
        assert_eq!(s, "##########.......");
    }

    #[test]
    fn numbers() {
        let mut s = String::new();
        num(&mut s, 1.5);
        s.push(' ');
        num(&mut s, -0.04);
        s.push(' ');
        num(&mut s, 3.0);
        assert_eq!(s, "1.5 -0.04 3");
    }
}
