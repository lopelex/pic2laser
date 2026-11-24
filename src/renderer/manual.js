'use strict';

/*
 * Handbuch-Dialog (F1): zeigt HANDBUCH.md aus dem App-Verzeichnis. Kleiner eigener Markdown-Renderer für
 * genau das, was das Handbuch nutzt (Überschriften, Absätze, verschachtelte Listen, Tabellen, Codeblöcke,
 * Trennlinien, fett/kursiv/Code/Links) – ohne zusätzliche Abhängigkeit. Links auf Abschnitte (#…) springen
 * innerhalb des Dialogs; Verweise auf andere Dateien werden als Text gezeigt.
 * Links ein Inhaltsverzeichnis (folgt beim Scrollen mit), oben eine Suche mit Treffer-Navigation.
 */
const Manual = (() => {
  const $ = (sel) => document.querySelector(sel);
  let html = null; // gerendertes Handbuch (ohne Suchmarkierungen)
  let hits = [];
  let hitIndex = -1;
  let searchTimer = 0;

  /** Sprungmarke wie bei GitHub: klein, Satzzeichen weg, Leerzeichen → „-“ (Umlaute bleiben). */
  const slug = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plain = (t) => t.replace(/`([^`]*)`/g, '$1').replace(/\*\*|__|\*/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  function inline(text) {
    const codes = [];
    let s = esc(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => (href.startsWith('#')
      ? `<a href="${href}" data-anchor="${href.slice(1)}">${label}</a>`
      : `<span class="manual-ref" title="${href}">${label}</span>`));
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/(^|[\s(„])\*([^*\s][^*]*?)\*(?=[\s).,;:!?“]|$)/g, '$1<i>$2</i>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }

  const isTableRow = (l) => /^\s*\|/.test(l);
  const listMatch = (l) => l.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

  function renderTable(rows) {
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    return `<div class="manual-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`
      + `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /** Listenzeilen (mit Einrückung) zu verschachtelten <ul>/<ol>. */
  function renderList(items) {
    let out = '';
    const stack = []; // { indent, tag }
    for (const it of items) {
      while (stack.length && it.indent < stack[stack.length - 1].indent) out += `</li></${stack.pop().tag}>`;
      const top = stack[stack.length - 1];
      if (!top || it.indent > top.indent) {
        stack.push({ indent: it.indent, tag: it.ordered ? 'ol' : 'ul' });
        out += `<${it.ordered ? 'ol' : 'ul'}><li>`;
      } else {
        out += '</li><li>';
      }
      out += inline(it.text);
    }
    while (stack.length) out += `</li></${stack.pop().tag}>`;
    return out;
  }

  function render(md) {
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^\s*```/.test(line)) {
        const code = [];
        for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
        i++;
        out.push(`<pre>${esc(code.join('\n'))}</pre>`);
        continue;
      }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        const n = h[1].length;
        out.push(`<h${n} id="${esc(slug(plain(h[2])))}">${inline(h[2])}</h${n}>`);
        i++;
        continue;
      }
      if (/^\s*-{3,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (isTableRow(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
        const rows = [];
        while (i < lines.length && isTableRow(lines[i])) rows.push(lines[i++]);
        out.push(renderTable(rows));
        continue;
      }
      if (listMatch(line)) {
        const items = [];
        while (i < lines.length && lines[i].trim() && !isTableRow(lines[i])) {
          const m = listMatch(lines[i]);
          if (m) items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] });
          else if (items.length) items[items.length - 1].text += ` ${lines[i].trim()}`; // Fortsetzungszeile
          i++;
        }
        out.push(renderList(items));
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*-{3,}\s*$)/.test(lines[i])
        && !listMatch(lines[i]) && !isTableRow(lines[i])) para.push(lines[i++].trim());
      out.push(`<p>${inline(para.join(' '))}</p>`);
    }
    return out.join('\n');
  }

  function buildNav() {
    const nav = $('#manual-nav');
    nav.innerHTML = '';
    for (const h of $('#manual-content').querySelectorAll('h2, h3')) {
      const a = document.createElement('a');
      a.href = `#${h.id}`;
      a.dataset.anchor = h.id;
      a.className = h.tagName === 'H2' ? 'lvl2' : 'lvl3';
      a.textContent = h.textContent;
      nav.append(a);
    }
    syncNav();
  }

  /** Abschnitt im Inhaltsverzeichnis hervorheben, der gerade oben im Text steht. */
  function syncNav() {
    const content = $('#manual-content');
    const top = content.getBoundingClientRect().top + 24;
    let current = null;
    for (const h of content.querySelectorAll('h2, h3')) {
      if (h.getBoundingClientRect().top <= top) current = h.id;
      else break;
    }
    const nav = $('#manual-nav');
    for (const a of nav.querySelectorAll('a')) {
      const on = a.dataset.anchor === current;
      // Verzeichnis direkt verschieben – scrollIntoView würde einen laufenden sanften Sprung im Text abbrechen
      if (on && !a.classList.contains('active')) {
        const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect();
        if (r.top < n.top) nav.scrollTop -= n.top - r.top + 8;
        else if (r.bottom > n.bottom) nav.scrollTop += r.bottom - n.bottom + 8;
      }
      a.classList.toggle('active', on);
    }
  }

  function jump(id) {
    const target = document.getElementById(id);
    if (!target || !$('#manual-content').contains(target)) return;
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /** Suchbegriff im Text markieren (ohne Groß/Klein), Treffer zählen, zum ersten springen. */
  function search(term) {
    const content = $('#manual-content');
    content.innerHTML = html;
    hits = [];
    hitIndex = -1;
    term = term.trim();
    if (term.length >= 2) {
      const lower = term.toLowerCase();
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const text = node.nodeValue;
        let at = text.toLowerCase().indexOf(lower);
        if (at < 0) continue;
        const frag = document.createDocumentFragment();
        let last = 0;
        while (at >= 0) {
          frag.append(text.slice(last, at));
          const mark = document.createElement('mark');
          mark.textContent = text.slice(at, at + term.length);
          frag.append(mark);
          hits.push(mark);
          last = at + term.length;
          at = text.toLowerCase().indexOf(lower, last);
        }
        frag.append(text.slice(last));
        node.replaceWith(frag);
      }
    }
    buildNav();
    if (hits.length) step(1);
    else $('#manual-hits').textContent = term.length >= 2 ? 'keine Treffer' : '';
  }

  function step(dir) {
    if (!hits.length) return;
    hits[hitIndex]?.classList.remove('current');
    hitIndex = (hitIndex + dir + hits.length) % hits.length;
    const mark = hits[hitIndex];
    mark.classList.add('current');
    mark.scrollIntoView({ block: 'center' });
    $('#manual-hits').textContent = `${hitIndex + 1} / ${hits.length}`;
  }

  async function load() {
    if (html !== null) return;
    try {
      html = render(await window.api.manual());
    } catch (err) {
      html = `<p class="manual-error">Das Handbuch konnte nicht geladen werden${err?.message ? ` (${esc(err.message)})` : ''}.</p>`;
    }
    $('#manual-content').innerHTML = html;
    buildNav();
  }

  let bound = false;
  function bind() {
    if (bound) return;
    bound = true;
    const content = $('#manual-content');
    const nav = $('#manual-nav');
    const go = (e) => {
      const a = e.target.closest('a[data-anchor]');
      if (!a) return;
      e.preventDefault();
      jump(a.dataset.anchor);
    };
    content.addEventListener('click', go);
    nav.addEventListener('click', go);
    content.addEventListener('scroll', () => requestAnimationFrame(syncNav), { passive: true });
    const input = $('#manual-search');
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => search(input.value), 180);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    });
    // Strg/Cmd+F im Handbuch = Suche
    $('#manual-dialog').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); input.focus(); input.select(); }
    });
  }

  async function open() {
    bind();
    const dlg = $('#manual-dialog');
    if (!dlg.open) dlg.showModal();
    await load();
    $('#manual-search').focus();
  }

  function toggle() {
    const dlg = $('#manual-dialog');
    if (dlg.open) dlg.close();
    else open();
  }

  return { open, toggle };
})();
