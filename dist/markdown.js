'use strict';
// Deliberately builds a safe DOM, never interprets source as HTML.
window.blogMarkdown = (() => {
  const callouts = { NOTE: ['Note', 'note'], 'HEADS UP': ['Heads Up', 'heads-up'], CONTEXT: ['Context', 'context'], QUOTE: ['Quote', 'quote'], DISCLAIMER: ['Disclaimer', 'disclaimer'] };
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function safeURL(value, image = false) {
    // Relative paths are useful on subpath hosts; no executable or data schemes.
    if (!value || /[\s\u0000-\u001f\u007f\\]/.test(value)) return null;
    if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^(https?:|mailto:)/i.test(value)) return null;
    if (image && /^mailto:/i.test(value)) return null;
    return value;
  }
  function destination(text) {
    const match = text.trim().match(/^(?:<([^<>]*)>|(\S+?))(?:\s+["'](.*)["'])?$/);
    return match ? { url: match[1] ?? match[2], title: match[3] } : null;
  }
  function inline(parent, source, references, depth = 0, inLink = false) {
    if (depth > 32) { parent.append(document.createTextNode(source)); return; }
    let buffer = '';
    const flush = () => { if (buffer) { parent.append(document.createTextNode(buffer)); buffer = ''; } };
    for (let i = 0; i < source.length;) {
      const rest = source.slice(i);
      let match;
      if ((match = rest.match(/^\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/))) {
        buffer += match[1]; i += match[0].length; continue;
      }
      if (rest.startsWith('\\\n') || rest.startsWith('  \n')) {
        flush(); parent.append(node('br')); i += rest.startsWith('\\') ? 2 : 3; continue;
      }
      if ((match = rest.match(/^(`+)/))) {
        const marker = match[1];
        let end = source.indexOf(marker, i + marker.length);
        while (end !== -1 && (source[end - 1] === '`' || source[end + marker.length] === '`')) end = source.indexOf(marker, end + marker.length);
        if (end !== -1) {
          let code = source.slice(i + marker.length, end).replace(/\n/g, ' ');
          if (/^ .* $/.test(code) && /\S/.test(code)) code = code.slice(1, -1);
          flush(); parent.append(node('code', code)); i = end + marker.length; continue;
        }
      }
      const image = rest.startsWith('![');
      if (!inLink && (image || rest.startsWith('['))) {
        const start = i + (image ? 2 : 1);
        let end = start;
        let brackets = 1;
        for (; end < source.length; end++) {
          if (source[end] === '\\') { end++; continue; }
          if (source[end] === '[') brackets++;
          if (source[end] === ']' && --brackets === 0) break;
        }
        let target = null;
        let stop = end + 1;
        if (source[stop] === '(') {
          let nesting = 1;
          let cursor = stop + 1;
          for (; cursor < source.length; cursor++) {
            if (source[cursor] === '\\') { cursor++; continue; }
            if (source[cursor] === '(') nesting++;
            if (source[cursor] === ')' && --nesting === 0) break;
          }
          if (!nesting) { target = destination(source.slice(stop + 1, cursor)); stop = cursor + 1; }
        } else {
          const ref = source.slice(stop).match(/^\[([^\]]*)\]/);
          const label = ref ? ref[1] || source.slice(start, end) : source.slice(start, end);
          target = references.get(label.trim().toLowerCase());
          if (ref) stop += ref[0].length;
        }
        if (end < source.length && target) {
          const label = source.slice(start, end);
          const url = safeURL(target.url, image);
          flush();
          if (!url) parent.append(document.createTextNode(source.slice(i, stop)));
          else if (image) {
            const img = node('img'); img.src = url; img.alt = label; img.loading = 'lazy';
            img.referrerPolicy = 'no-referrer';
            if (target.title) img.title = target.title;
            parent.append(img);
          } else {
            const anchor = node('a'); anchor.href = url; anchor.rel = 'noopener noreferrer';
            if (target.title) anchor.title = target.title;
            inline(anchor, label, references, depth + 1, true); parent.append(anchor);
          }
          i = stop; continue;
        }
      }
      if (!inLink && (match = rest.match(/^<(https?:\/\/[^<>\s]+|mailto:[^<>\s]+|[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>/))) {
        flush(); const value = match[1]; const anchor = node('a', value.replace(/^mailto:/, ''));
        anchor.href = value.includes('@') && !/^(https?:|mailto:)/i.test(value) ? 'mailto:' + value : value;
        anchor.rel = 'noopener noreferrer'; parent.append(anchor); i += match[0].length; continue;
      }
      if (!inLink && (i === 0 || /[\s(]/.test(source[i - 1])) && (match = rest.match(/^https?:\/\/[^\s<>]+/))) {
        let url = match[0].replace(/[.,!?;:]+$/, '');
        while (url.endsWith(')') && (url.match(/\)/g) || []).length > (url.match(/\(/g) || []).length) url = url.slice(0, -1);
        if (safeURL(url)) { flush(); const anchor = node('a', url); anchor.href = url; anchor.rel = 'noopener noreferrer'; parent.append(anchor); i += url.length; continue; }
      }
      let formatted = false;
      for (const [marker, tag] of [['***', 'strong'], ['___', 'strong'], ['**', 'strong'], ['__', 'strong'], ['~~', 'del'], ['*', 'em'], ['_', 'em']]) {
        if (!rest.startsWith(marker) || /\s/.test(rest[marker.length] || ' ') || (marker.includes('_') && /[\p{L}\p{N}]/u.test(source[i - 1] || ''))) continue;
        let end = source.indexOf(marker, i + marker.length);
        while (end !== -1 && (source[end - 1] === '\\' || /\s/.test(source[end - 1]) || (marker.includes('_') && /[\p{L}\p{N}]/u.test(source[end + marker.length] || '')))) end = source.indexOf(marker, end + marker.length);
        if (end === -1) continue;
        flush(); const element = node(tag); let container = element;
        if (marker.length === 3) { container = node('em'); element.append(container); }
        inline(container, source.slice(i + marker.length, end), references, depth + 1, inLink);
        parent.append(element); i = end + marker.length; formatted = true; break;
      }
      if (!formatted) { buffer += source[i]; i++; }
    }
    flush();
  }
  function cells(line) {
    const values = []; let value = ''; let ticks = 0;
    line = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\' && line[i + 1] === '|') { value += '|'; i++; continue; }
      if (line[i] === '`') { const run = line.slice(i).match(/^`+/)[0]; ticks = ticks === run.length ? 0 : ticks || run.length; value += run; i += run.length - 1; continue; }
      if (line[i] === '|' && !ticks) { values.push(value.trim()); value = ''; } else value += line[i];
    }
    values.push(value.trim()); return values;
  }
  const listMarker = line => line.match(/^( {0,3})([-+*]|\d+[.)])\s+(.*)$/);
  const fenceMarker = line => line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  const rule = line => /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line);
  const tableDivider = line => line && line.includes('|') && cells(line).every(cell => /^:?-{3,}:?$/.test(cell));
  function startsBlock(lines, i) {
    return /^\s*$/.test(lines[i]) || /^ {0,3}(#{1,6})(?:\s|$)/.test(lines[i]) || /^ {0,3}>/.test(lines[i]) || fenceMarker(lines[i]) || listMarker(lines[i]) || rule(lines[i]) || (lines[i].includes('|') && tableDivider(lines[i + 1]));
  }
  function blocks(parent, lines, references, depth = 0) {
    if (depth > 32) { parent.append(node('p', lines.join('\n'))); return; }
    for (let i = 0; i < lines.length;) {
      let match;
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if ((match = fenceMarker(line))) {
        const marker = match[1]; const content = []; i++;
        const close = new RegExp('^ {0,3}' + marker[0] + '{' + marker.length + ',}\\s*$');
        while (i < lines.length && !close.test(lines[i])) content.push(lines[i++]);
        if (i < lines.length) i++;
        const pre = node('pre'); const code = node('code', content.join('\n'));
        const language = match[2].trim().split(/\s/)[0];
        if (/^[\w+-]+$/.test(language)) code.className = 'language-' + language;
        pre.setAttribute('tabindex', '0'); pre.setAttribute('aria-label', language ? language + ' code' : 'Code block');
        pre.append(code); parent.append(pre); continue;
      }
      if (/^( {4}|\t)/.test(line)) {
        const content = [];
        while (i < lines.length && (/^( {4}|\t)/.test(lines[i]) || !lines[i].trim())) content.push(lines[i++].replace(/^( {4}|\t)/, ''));
        while (content.length && !content[content.length - 1]) content.pop();
        const pre = node('pre'); pre.setAttribute('tabindex', '0'); pre.setAttribute('aria-label', 'Code block'); pre.append(node('code', content.join('\n'))); parent.append(pre); continue;
      }
      if ((match = line.match(/^ {0,3}(#{1,6})(?:\s+(.*?)\s*#*\s*|\s*)$/))) {
        const heading = node('h' + match[1].length); inline(heading, match[2] || '', references); parent.append(heading); i++; continue;
      }
      if (i + 1 < lines.length && /^ {0,3}(=+|-+)\s*$/.test(lines[i + 1])) {
        const heading = node(lines[i + 1].trim()[0] === '=' ? 'h1' : 'h2'); inline(heading, line, references); parent.append(heading); i += 2; continue;
      }
      if (rule(line)) { parent.append(node('hr')); i++; continue; }
      if (/^ {0,3}>/.test(line)) {
        const quote = [];
        while (i < lines.length && /^ {0,3}>/.test(lines[i])) quote.push(lines[i++].replace(/^ {0,3}> ?/, ''));
        const alert = quote[0].match(/^\[!([^\]]+)\]\s*$/);
        const kind = alert && callouts[alert[1].toUpperCase().replace(/[-_]/g, ' ')];
        const block = node('blockquote', undefined, kind ? 'md-callout md-' + kind[1] : undefined);
        if (kind) { block.append(node('p', kind[0], 'md-callout-title')); quote.shift(); }
        blocks(block, quote, references, depth + 1); parent.append(block); continue;
      }
      if (line.includes('|') && tableDivider(lines[i + 1])) {
        const headers = cells(line); const alignment = cells(lines[i + 1]);
        if (headers.length === alignment.length) {
          const wrap = node('div', undefined, 'md-table'); wrap.setAttribute('tabindex', '0'); wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Scrollable Markdown table');
          const table = node('table'); const head = node('thead'); const row = node('tr');
          const addCell = (row, tag, value, index) => {
            const cell = node(tag); if (tag === 'th') cell.setAttribute('scope', 'col');
            const spec = alignment[index];
            cell.style.textAlign = spec.startsWith(':') && spec.endsWith(':') ? 'center' : spec.endsWith(':') ? 'right' : 'left';
            inline(cell, value, references); row.append(cell);
          };
          headers.forEach((value, index) => addCell(row, 'th', value, index)); head.append(row); table.append(head);
          const body = node('tbody'); i += 2;
          while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
            const values = cells(lines[i++]); const row = node('tr'); headers.forEach((_, index) => addCell(row, 'td', values[index] || '', index)); body.append(row);
          }
          table.append(body); wrap.append(table); parent.append(wrap); continue;
        }
      }
      if ((match = listMarker(line))) {
        const ordered = /^\d/.test(match[2]); const list = node(ordered ? 'ol' : 'ul');
        if (ordered) list.setAttribute('start', String(parseInt(match[2], 10)));
        while (i < lines.length) {
          const item = listMarker(lines[i]);
          if (!item || /^\d/.test(item[2]) !== ordered || item[1].length !== match[1].length || rule(lines[i])) break;
          const indent = lines[i].length - item[3].length; const content = [item[3]]; i++;
          while (i < lines.length) {
            if (!lines[i].trim()) {
              let next = i + 1; while (next < lines.length && !lines[next].trim()) next++;
              if (next < lines.length && lines[next].startsWith(' '.repeat(indent))) { content.push(''); i++; continue; }
              break;
            }
            if (!lines[i].startsWith(' '.repeat(indent))) break;
            content.push(lines[i++].slice(indent));
          }
          const li = node('li'); const task = content[0].match(/^\[([ xX])\]\s+(.*)$/);
          if (task) {
            li.className = 'md-task';
            const box = node('input'); box.type = 'checkbox'; box.disabled = true; box.checked = task[1].toLowerCase() === 'x';
            box.setAttribute('aria-label', (box.checked ? 'Completed: ' : 'Incomplete: ') + task[2]); li.append(box); content[0] = task[2];
          }
          blocks(li, content, references, depth + 1); list.append(li);
          if (!lines[i]?.trim()) {
            let next = i; while (next < lines.length && !lines[next].trim()) next++;
            if (listMarker(lines[next] || '')) i = next; else break;
          }
        }
        parent.append(list); continue;
      }
      const content = [line]; i++;
      while (i < lines.length && !startsBlock(lines, i)) {
        if (/^ {0,3}(=+|-+)\s*$/.test(lines[i])) break;
        content.push(lines[i++]);
      }
      const paragraph = node('p'); inline(paragraph, content.join('\n'), references); parent.append(paragraph);
    }
  }
  function render(parent, markdown) {
    const references = new Map();
    const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
    // Only definitions outside fenced code are extracted.
    let fence = null;
    for (let i = 0; i < lines.length; i++) {
      const marker = fenceMarker(lines[i]);
      if (fence) { if (new RegExp('^ {0,3}' + fence[0] + '{' + fence.length + ',}\\s*$').test(lines[i])) fence = null; continue; }
      if (marker) { fence = marker[1]; continue; }
      const definition = lines[i].match(/^ {0,3}\[([^\]]+)\]:\s+(.+)$/);
      if (definition) { const target = destination(definition[2]); if (target) { references.set(definition[1].trim().toLowerCase(), target); lines[i] = ''; } }
    }
    const article = node('div', undefined, 'markdown-body'); blocks(article, lines, references); parent.append(article); return article;
  }
  return { render };
})();
