const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const source = readFileSync('dist/theme.js', 'utf8');

test('favicon uses a bundled PNG instead of a platform-dependent emoji glyph', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  assert.match(html, /<link rel="icon" type="image\/png" sizes="160x160" href="favicon\.png">/);
  assert.match(html, /<link rel="apple-touch-icon" href="favicon\.png">/);
  const png = readFileSync('dist/favicon.png');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 160);
  assert.equal(png.readUInt32BE(20), 160);
});

function boot({ dark = false, saved = null, blocked = false } = {}) {
  const listeners = {};
  const documentListeners = {};
  const stored = new Map(saved === null ? [] : [['adamgdegr.theme', saved]]);
  const label = { textContent: '' };
  const meta = { content: '' };
  const root = { dataset: {} };
  const device = { matches: dark, addEventListener(type, callback) { listeners[type] = callback; } };
  const context = {
    window: {
      matchMedia(query) { assert.equal(query, '(prefers-color-scheme: dark)'); return device; },
      localStorage: {
        getItem(key) { if (blocked) throw Error('blocked'); return stored.get(key) ?? null; },
        setItem(key, value) { if (blocked) throw Error('blocked'); stored.set(key, value); },
        removeItem(key) { if (blocked) throw Error('blocked'); stored.delete(key); }
      },
      addEventListener(type, callback) { listeners[type] = callback; }
    },
    document: {
      documentElement: root,
      querySelector(selector) { return selector === '#theme-status' ? label : meta; },
      addEventListener(type, callback) { documentListeners[type] = callback; }
    }
  };
  runInNewContext(source, context);
  return { theme: context.window.terminalTheme, root, label, meta, stored, context,
    change(dark) { device.matches = dark; listeners.change(); },
    storage(value, key = 'adamgdegr.theme') { listeners.storage({ key, newValue: value }); },
    ready() { documentListeners.DOMContentLoaded(); }
  };
}

test('defaults to Latte in light mode and Mocha in dark mode before DOM ready', () => {
  for (const dark of [false, true]) {
    const app = boot({ dark });
    assert.equal(app.root.dataset.theme, dark ? 'mocha' : 'latte');
    assert.equal(app.theme.preference(), 'system');
    assert.equal(app.meta.content, dark ? '#1e1e2e' : '#eff1f5');
    app.ready();
    assert.match(app.label.textContent, /\(system\)$/);
    assert.equal(app.stored.size, 0);
  }
});

test('reacts to live OS changes without reloading', () => {
  const app = boot();
  app.change(true);
  assert.equal(app.root.dataset.theme, 'mocha');
  app.change(false);
  assert.equal(app.root.dataset.theme, 'latte');
});

test('each explicit palette persists and ignores OS changes until system is restored', () => {
  for (const name of ['latte', 'frappe', 'macchiato', 'mocha']) {
    const app = boot();
    assert.equal(app.theme.set(name), true);
    assert.equal(app.stored.get('adamgdegr.theme'), name);
    app.change(true);
    assert.equal(app.root.dataset.theme, name);
    assert.equal(boot({ saved: name }).theme.current(), name);
    app.theme.set('system');
    assert.equal(app.root.dataset.theme, 'mocha');
    assert.equal(app.stored.size, 0);
    app.change(false);
    assert.equal(app.root.dataset.theme, 'latte');
  }
});

test('invalid values do not change the theme, and invalid saved choices use system', () => {
  const app = boot({ dark: true, saved: 'invalid' });
  assert.equal(app.theme.preference(), 'system');
  assert.equal(app.theme.set('invalid'), false);
  assert.equal(app.theme.current(), 'mocha');
});

test('blocked storage does not prevent automatic or manual theming', () => {
  const app = boot({ dark: true, blocked: true });
  app.theme.set('frappe');
  assert.equal(app.theme.current(), 'frappe');
  app.theme.set('system');
  app.change(false);
  assert.equal(app.theme.current(), 'latte');
});

test('cross-tab changes and clearing saved preferences update the open page', () => {
  const app = boot({ dark: true });
  app.storage('macchiato');
  assert.equal(app.root.dataset.theme, 'macchiato');
  app.storage('latte', 'unrelated');
  assert.equal(app.root.dataset.theme, 'macchiato');
  app.storage(null, null);
  assert.equal(app.root.dataset.theme, 'mocha');
});

function descendants(root) {
  return root.children.flatMap(child => [child, ...descendants(child)]);
}

function markdown(source) {
  const app = terminal();
  const parent = app.context.document.createElement('div');
  const root = app.context.window.blogMarkdown.render(parent, source);
  return { root, all: tag => descendants(root).filter(child => child.tagName === tag.toUpperCase()) };
}

function terminal({ reduced = false, canvas = true, posthog } = {}) {
  const app = boot();
  const analytics = [];
  app.context.window.terminalAnalytics = { track(event, properties, options) { analytics.push({ event, properties, options }); } };
  const nodes = {};
  const motion = { matches: reduced, addEventListener(type, fn) { this.change = fn; } };
  const matchMedia = app.context.window.matchMedia;
  app.context.window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? motion : matchMedia(query);
  app.context.window.getComputedStyle = () => ({ font: '13px monospace' });
  function node(tag = '') {
    return { tagName: tag.toUpperCase(), children: [], value: '', text: '', attributes: {}, events: {}, style: {}, scrollLeft: 0, selectionStart: 0,
      get textContent() { return this.text + this.children.map(child => child.textContent).join(''); },
      set textContent(value) { this.text = value; this.children = []; },
      append(...children) { children.forEach(child => { child.parent = this; child.isConnected = true; }); this.children.push(...children); },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      querySelector(selector) { return descendants(this).find(child => selector.startsWith('.') ? (child.className || '').split(' ').includes(selector.slice(1)) : child.tagName === selector.toUpperCase()) || null; },
      addEventListener(type, fn) { this.events[type] = fn; },
      remove() { this.parent.children = this.parent.children.filter(child => child !== this); },
      getContext() { return canvas ? { measureText(text) { return { width: Array.from(text).length * 8 }; } } : null; },
      focus() {}, replaceChildren() { this.children.forEach(child => child.isConnected = false); this.text = ''; this.children = []; }
    };
  }
  app.context.document.querySelector = selector => nodes[selector] ??= node();
  app.context.document.createElement = node;
  app.context.document.createTextNode = text => { const child = node(); child.textContent = text; return child; };
  app.context.requestAnimationFrame = fn => fn();
  app.context.URL = URL;
  app.context.document.baseURI = 'https://example.com/portfolio/';
  app.context.document.createElement = tag => {
    const element = node(tag);
    element.querySelectorAll = () => [];
    return element;
  };
  runInNewContext(readFileSync('dist/content.js', 'utf8'), app.context);
  app.context.SITE = app.context.window.SITE;
  // Tests own their posts, independently of the published content.
  app.context.SITE.posts = [];
  // Remote-served lists ship empty. Plain fixtures get sample links; remote tests start empty.
  if (!posthog) {
    app.context.SITE.socials = [{ name: 'GitHub', url: 'https://github.com/adamgdegr' }];
    app.context.SITE.funding = [{ name: 'Buy me a Coffee', url: 'https://buymeacoffee.com/adamgdegr' }];
    app.context.SITE.projects = [{ name: 'Personal Terminal', description: 'Sample project.', url: 'https://github.com/adamgdegr/adamgdegr' }];
  }
  runInNewContext(readFileSync('dist/markdown.js', 'utf8'), app.context);
  // Optional PostHog stand-in: flags, payloads and a timer the test can fire by hand.
  const timers = [];
  if (posthog) {
    app.context.window.posthog = posthog;
    app.context.window.terminalAnalytics.enabled = true;
    app.context.setTimeout = fn => { timers.push(fn); return timers.length; };
    app.context.clearTimeout = () => {};
    runInNewContext(readFileSync('dist/remote.js', 'utf8'), app.context);
    app.context.SITE.posts = app.context.SITE.posts.length ? app.context.SITE.posts : [];
  }
  runInNewContext(readFileSync('dist/terminal.js', 'utf8'), app.context);
  const input = nodes['#command-input'];
  const submit = value => { input.value = value; return nodes['#command-form'].events.submit({ preventDefault() {} }); };
  const type = (value, data, extra = {}) => {
    input.events.beforeinput();
    input.value = value;
    input.selectionStart = value.length;
    input.events.input({ inputType: 'insertText', data, ...extra });
  };
  const key = key => input.events.keydown({ key, preventDefault() {} });
  return { ...app, nodes, input, submit, type, key, motion, analytics, timers, layer: nodes['#typing-layer'] };
}

test('terminal command validates arguments and Tab completes theme choices', () => {
  const app = terminal();
  const { input, submit } = app;
  submit('theme macchiato');
  assert.equal(app.theme.current(), 'macchiato');
  submit('theme mocha extra');
  assert.equal(app.theme.current(), 'macchiato');
  submit('theme invalid');
  assert.equal(app.theme.current(), 'macchiato');
  submit('theme system');
  app.change(true);
  assert.equal(app.theme.current(), 'mocha');
  input.value = 'theme fra';
  input.events.keydown({ key: 'Tab', preventDefault() {} });
  assert.equal(input.value, 'theme frappe');
});

test('typing reveals only the inserted character and cleans up after its animation', () => {
  const app = terminal();
  app.type('help', 'p');
  const reveal = app.layer.children[0];
  assert.equal(reveal.className, 'typing-reveal');
  assert.equal(reveal.style.left, '24px');
  assert.equal(reveal.style.width, '8px');
  assert.equal(app.input.value, 'help');
  assert.equal(app.input.selectionStart, 4);
  assert.equal(app.layer.children.length, 1);
  reveal.events.animationend();
  assert.equal(app.layer.children.length, 0);
});

test('fast typing keeps one short animation and submitting never waits for it', () => {
  const app = terminal();
  for (const value of ['h', 'he', 'hel', 'help']) {
    app.type(value, value.slice(-1));
    assert.equal(app.layer.children.length, 1);
  }
  app.submit('help');
  assert.equal(app.layer.children.length, 0);
  assert.equal(app.input.value, '');
  assert.equal(app.nodes['#output'].children.length, 1);
});

test('reduced motion skips the reveal and live changes finish pending animations', () => {
  const app = terminal({ reduced: true });
  app.type('h', 'h');
  assert.equal(app.layer.children.length, 0);
  app.motion.matches = false;
  app.motion.change();
  app.type('he', 'e');
  assert.equal(app.layer.children.length, 1);
  app.motion.matches = true;
  app.motion.change();
  assert.equal(app.layer.children.length, 0);
  app.type('help', 'p');
  assert.equal(app.layer.children.length, 0);
});

test('paste, deletion and composition do not animate or interfere with editing', () => {
  const app = terminal();
  for (const event of [
    { inputType: 'insertFromPaste' },
    { inputType: 'deleteContentBackward', data: null },
    { inputType: 'insertCompositionText', isComposing: true },
    { isComposing: true },
    { data: null }
  ]) {
    app.type('help', 'p', event);
    assert.equal(app.layer.children.length, 0);
    assert.equal(app.input.value, 'help');
  }
  app.input.events.keydown({ key: 'Escape', isComposing: true });
  assert.equal(app.input.value, 'help');
});

test('middle insertion, Unicode and horizontal scrolling use the native caret position', () => {
  const app = terminal();
  app.input.value = 'heXlp';
  app.input.selectionStart = 3;
  app.input.scrollLeft = 8;
  app.input.events.input({ inputType: 'insertText', data: 'X' });
  assert.equal(app.layer.children[0].style.left, '8px');
  assert.equal(app.layer.children[0].style.width, '8px');
  app.input.scrollLeft = 0;
  app.type('h🐱', '🐱');
  assert.equal(app.layer.children[0].style.left, '8px');
  assert.equal(app.layer.children[0].style.width, '8px');
});

test('history, completion, Escape and clearing keep working while a reveal is active', () => {
  const app = terminal();
  app.submit('theme mocha');
  app.type('he', 'e');
  app.key('ArrowUp');
  assert.equal(app.input.value, 'theme mocha');
  assert.equal(app.layer.children.length, 0);
  app.key('ArrowDown');
  assert.equal(app.input.value, 'he');
  app.key('Tab');
  assert.equal(app.input.value, 'help');
  app.type('help', 'p');
  app.key('Escape');
  assert.equal(app.input.value, '');
  assert.equal(app.layer.children.length, 0);
  app.type('h', 'h');
  app.input.events.keydown({ key: 'l', ctrlKey: true, preventDefault() {} });
  assert.equal(app.nodes['#output'].children.length, 0);
  assert.equal(app.layer.children.length, 0);
});

test('blur, selection, scroll and composition dismiss a pending reveal', () => {
  const app = terminal();
  for (const event of ['blur', 'pointerdown', 'scroll', 'compositionstart']) {
    app.type('help', 'p');
    app.input.events[event]();
    assert.equal(app.layer.children.length, 0);
  }
});

test('unavailable canvas measurement leaves the native input usable', () => {
  const app = terminal({ canvas: false });
  app.type('help', 'p');
  assert.equal(app.layer.children.length, 0);
  app.submit('help');
  assert.equal(app.nodes['#output'].children.length, 1);
});

test('all theme foregrounds retain readable contrast on base and status surfaces', () => {
  const css = readFileSync('dist/themes.css', 'utf8');
  const luminance = hex => {
    const rgb = hex.match(/\w\w/g).map(s => parseInt(s, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  for (const match of css.matchAll(/:root\[data-theme="(\w+)"\]\s*\{([^}]+)\}/g)) {
    const colors = Object.fromEntries([...match[2].matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g)].map(m => [m[1], m[2]]));
    for (const background of ['base', 'mantle']) {
      const foregrounds = background === 'mantle' ? ['muted', 'green'] : ['text', 'muted', 'green', 'blue', 'mauve', 'red'];
      for (const foreground of foregrounds) {
        const a = luminance(colors[background].slice(1));
        const b = luminance(colors[foreground].slice(1));
        const contrast = (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
        assert.ok(contrast >= 4.5, `${match[1]} ${foreground}/${background}: ${contrast}`);
      }
    }
  }
});

test('Markdown headings, emphasis, deletion, escapes, code spans and hard breaks', () => {
  const view = markdown('# Heading\n\n## Subheading\n\n**strong** *em* ~~gone~~ ***both*** `a < b` \\*literal\\*  \nnext\n\nSetext\n======');
  assert.equal(view.all('h1').length, 2);
  assert.equal(view.all('h2')[0].textContent, 'Subheading');
  assert.equal(view.all('strong').length, 2);
  assert.equal(view.all('em').length, 2);
  assert.equal(view.all('del')[0].textContent, 'gone');
  assert.equal(view.all('code')[0].textContent, 'a < b');
  assert.match(view.root.textContent, /\*literal\*/);
  assert.equal(view.all('br').length, 1);
});

for (const [marker, label, style] of [
  ['NOTE', 'Note', 'note'], ['HEADS UP', 'Heads Up', 'heads-up'], ['CONTEXT', 'Context', 'context'], ['QUOTE', 'Quote', 'quote'], ['disclaimer', 'Disclaimer', 'disclaimer']
]) {
  test(`Markdown ${label} callout supports formatted content and nested blocks`, () => {
    const view = markdown(`> [!${marker}]\n> **Read this.**\n>\n> - First\n> - Second`);
    const quote = view.all('blockquote')[0];
    assert.equal(quote.className, 'md-callout md-' + style);
    assert.equal(quote.children[0].textContent, label);
    assert.equal(view.all('strong')[0].textContent, 'Read this.');
    assert.equal(view.all('li').length, 2);
  });
}

test('Markdown callout aliases are case insensitive and unknown markers stay ordinary quotes', () => {
  const view = markdown('> [!heads-up]\n> Warning\n\n> [!heads_up]\n> Warning\n\n> [!CUSTOM]\n> Ordinary\n\n> Plain quote');
  assert.equal(view.all('blockquote').length, 4);
  assert.equal(view.all('blockquote')[0].className, 'md-callout md-heads-up');
  assert.equal(view.all('blockquote')[1].className, 'md-callout md-heads-up');
  assert.match(view.all('blockquote')[2].textContent, /\[!CUSTOM\]/);
  assert.equal(view.all('blockquote')[3].textContent, 'Plain quote');
});

test('Markdown fenced and indented code remains literal, including HTML and callout syntax', () => {
  const view = markdown('```html\n<script>alert(1)</script>\n> [!NOTE]\n```\n\n    <b>literal</b>\n\n~~~js\nconst x = 1;\n~~~~');
  assert.equal(view.all('pre').length, 3);
  assert.equal(view.all('code')[0].className, 'language-html');
  assert.equal(view.all('script').length, 0);
  assert.equal(view.all('blockquote').length, 0);
  assert.match(view.all('pre')[0].textContent, /<script>/);
  assert.equal(markdown('```\nunclosed').all('code')[0].textContent, 'unclosed');
});

test('Markdown lists support nesting, ordered starts and disabled task checkboxes', () => {
  const view = markdown('3. First\n   - Nested **item**\n4. Next\n\n- [x] Done\n- [ ] Pending');
  assert.equal(view.all('ol')[0].attributes.start, '3');
  assert.equal(view.all('ul').length, 2);
  assert.equal(view.all('li').length, 5);
  assert.equal(view.all('input').length, 2);
  assert.equal(view.all('input')[0].checked, true);
  assert.equal(view.all('input')[1].checked, false);
  assert.ok(view.all('input').every(box => box.disabled && box.attributes['aria-label']));
});

test('Markdown tables support alignment, inline formatting, escaped pipes and code pipes', () => {
  const view = markdown('| Left | Right | Center |\n| :--- | ---: | :---: |\n| **one** | a\\|b | `x|y` |');
  assert.equal(view.all('table').length, 1);
  assert.equal(view.all('th')[0].attributes.scope, 'col');
  assert.deepEqual(view.all('th').map(cell => cell.style.textAlign), ['left', 'right', 'center']);
  assert.equal(view.all('td')[1].textContent, 'a|b');
  assert.equal(view.all('code')[0].textContent, 'x|y');
  assert.equal(view.all('strong')[0].textContent, 'one');
});

test('Markdown links, references, autolinks, images and relative paths use safe DOM attributes', () => {
  const view = markdown('[link](https://example.com/a_(b) "Title") [local](./post.md) [jump](#heading) [email](mailto:a@example.com)\n\n[reference][id] <https://example.com> https://example.com/end.\n\n![Alt text](./picture.png "Picture")\n\n[id]: https://example.com/ref');
  assert.equal(view.all('a').length, 7);
  assert.equal(view.all('a')[0].href, 'https://example.com/a_(b)');
  assert.equal(view.all('a')[0].title, 'Title');
  assert.equal(view.all('a')[4].href, 'https://example.com/ref');
  assert.equal(view.all('a')[6].href, 'https://example.com/end');
  assert.equal(view.all('img')[0].alt, 'Alt text');
  assert.equal(view.all('img')[0].loading, 'lazy');
  assert.ok(view.all('a').every(anchor => anchor.rel === 'noopener noreferrer'));
});

test('Markdown HTML, handlers and unsafe link schemes never become executable nodes', () => {
  const view = markdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://example.com"></iframe>\n\n[bad](javascript:alert(1)) ![bad](data:image/svg+xml,bad) [bad](vbscript:evil) [bad](java\tscript:evil)');
  for (const tag of ['script', 'iframe', 'img', 'a']) assert.equal(view.all(tag).length, 0, tag);
  assert.match(view.root.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.match(view.root.textContent, /javascript:/);
  assert.equal(markdown('[safe](https://example.com/"onclick="evil)').all('a')[0].href, 'https://example.com/"onclick="evil');
});

test('Markdown malformed syntax and deep nesting are bounded and remain readable', () => {
  const view = markdown('**unfinished [link](broken\n\n' + '> '.repeat(45) + 'nested\n\n---');
  assert.match(view.root.textContent, /unfinished/);
  assert.match(view.root.textContent, /nested/);
  assert.ok(view.all('blockquote').length <= 33);
  assert.equal(view.all('hr').length, 1);
});

test('blog command renders Markdown posts while preserving literal legacy paragraphs and empty state', async () => {
  const app = terminal();
  app.submit('blog');
  assert.match(app.nodes['#output'].textContent, /No posts published yet/);
  app.context.SITE.posts.push({ slug: 'new', title: 'New post', date: '2026-11-02', markdown: '## Hello\n\n> [!NOTE]\n> **Safe**' });
  app.context.SITE.posts.push({ slug: 'old', title: 'Old post', date: '2026-11-01', body: ['**Keep literal** <b>text</b>'] });
  app.submit('blog new');
  assert.equal(app.nodes['#output'].querySelector('.markdown-body').querySelector('strong').textContent, 'Safe');
  app.submit('blog old');
  assert.match(app.nodes['#output'].children[2].textContent, /\*\*Keep literal\*\* <b>text<\/b>/);
  app.submit('blog missing');
  assert.match(app.nodes['#output'].textContent, /Post not found/);
  app.context.SITE.markdownDemo = { markdown: readFileSync('dist/posts/markdown-demo.md', 'utf8') };
  await app.submit('blog --demo');
  const demo = app.nodes['#output'].children[4];
  assert.equal(descendants(demo).filter(child => (child.className || '').includes('md-callout-title')).length, 5);
  assert.match(demo.textContent, /not a published post/);
});

function blogPosts(app, count) {
  app.context.SITE.posts = Array.from({ length: count }, (_, i) => ({
    slug: 'post-' + (i + 1), title: 'Post ' + (i + 1),
    date: '2026-11-' + String(i + 1).padStart(2, '0'), markdown: '**Body ' + (i + 1) + '**'
  }));
}
function blogButtons(app) {
  return descendants(app.nodes['#output']).filter(child => child.className === 'blog-choice' && !child.disabled);
}

for (const count of [1, 3, 5, 6, 10, 11]) {
  test('blog selection paginates ' + count + ' posts in groups of five', async () => {
    const app = terminal(); blogPosts(app, count);
    await app.submit('blog');
    let seen = 0;
    while (seen < count) {
      const buttons = blogButtons(app);
      const size = Math.min(5, count - seen);
      const next = count - seen > 5;
      assert.equal(buttons[0].textContent, '1) Exit Selection');
      assert.equal(buttons.length, 1 + size + Number(next));
      for (let i = 0; i < size; i++) {
        const post = app.context.SITE.posts[seen + i];
        assert.equal(buttons[i + 1].textContent, (i + 2) + ') ' + post.title + ' · ' + post.date);
        assert.doesNotMatch(buttons[i + 1].textContent, /post-/);
      }
      seen += size;
      if (next) {
        assert.equal(buttons.at(-1).textContent, '7) View Next Page');
        await app.submit('7');
      } else assert.ok(!buttons.some(button => button.textContent.includes('View Next Page')));
    }
    assert.equal(app.nodes['#output'].children.length, 1, 'paging updates one selection in place');
  });
}

test('empty blog keeps its honest empty state without selection controls', async () => {
  const app = terminal(); await app.submit('blog');
  assert.match(app.nodes['#output'].textContent, /No posts published yet/);
  assert.equal(blogButtons(app).length, 0);
});

test('arrow selection wraps, Enter opens the selected post, and history resumes', async () => {
  const app = terminal(); blogPosts(app, 3);
  await app.submit('blog');
  assert.equal(blogButtons(app)[1].attributes['aria-pressed'], 'true');
  app.key('ArrowUp');
  assert.equal(blogButtons(app)[0].attributes['aria-pressed'], 'true');
  app.key('ArrowUp');
  assert.equal(blogButtons(app)[3].attributes['aria-pressed'], 'true');
  app.key('ArrowDown'); app.key('ArrowDown'); app.key('ArrowDown');
  await app.submit('');
  const post = app.nodes['#output'].children.at(-1);
  assert.match(post.textContent, /2026-11-02 · post-2/);
  assert.match(post.textContent, /Body 2/);
  assert.equal(blogButtons(app).length, 0);
  app.key('ArrowUp'); assert.equal(app.input.value, 'blog post-2');
  app.key('ArrowUp'); assert.equal(app.input.value, 'blog');
});

test('typing a number highlights and opens a choice, including on a later page', async () => {
  const app = terminal(); blogPosts(app, 6);
  await app.submit('blog'); app.type('7', '7');
  assert.equal(blogButtons(app).at(-1).attributes['aria-pressed'], 'true');
  await app.submit('7');
  app.type('2', '2'); assert.equal(blogButtons(app)[1].attributes['aria-pressed'], 'true');
  await app.submit('2');
  assert.match(app.nodes['#output'].children.at(-1).textContent, /2026-11-06 · post-6/);
  assert.match(app.nodes['#output'].children.at(-1).textContent, /Body 6/);
});

test('invalid numbers leave selection open and announce its valid range', async () => {
  const app = terminal(); blogPosts(app, 1); await app.submit('blog');
  for (const number of ['0', '3', '999999999999999999999']) {
    await app.submit(number);
    assert.equal(blogButtons(app).length, 2);
    assert.match(app.nodes['#output'].textContent, /Choose a number from 1 to 2/);
  }
  await app.submit('2'); assert.match(app.nodes['#output'].textContent, /Body 1/);
});

test('date commands open one match or select among same-date posts without exposing slugs', async () => {
  const app = terminal(); blogPosts(app, 3);
  await app.submit('blog 2026-11-02');
  assert.match(app.nodes['#output'].textContent, /2026-11-02 · post-2/);
  app.context.SITE.posts[2].date = '2026-11-02';
  await app.submit('blog 2026-11-02');
  assert.equal(blogButtons(app).length, 3);
  assert.match(blogButtons(app)[1].textContent, /Post 2 · 2026-11-02/);
  assert.match(blogButtons(app)[2].textContent, /Post 3 · 2026-11-02/);
  await app.submit('3'); assert.match(app.nodes['#output'].children.at(-1).textContent, /Body 3/);
  await app.submit('blog 1999-01-01'); assert.match(app.nodes['#output'].children.at(-1).textContent, /Post not found/);
  app.context.SITE.posts[0].slug = '2026-11-02';
  await app.submit('blog 2026-11-02'); assert.match(app.nodes['#output'].children.at(-1).textContent, /Body 1/);
});

test('Exit, Escape, clear and other commands dismiss selection and stale choices stay inert', async () => {
  for (const action of ['exit', 'escape', 'clear', 'command', 'ctrl-l']) {
    const app = terminal(); blogPosts(app, 2); await app.submit('blog');
    const stale = blogButtons(app)[1];
    if (action === 'exit') await app.submit('1');
    if (action === 'escape') { app.input.value = '2'; app.key('Escape'); assert.equal(app.input.value, ''); }
    if (action === 'clear') await app.submit('clear');
    if (action === 'command') await app.submit('about');
    if (action === 'ctrl-l') app.input.events.keydown({ key: 'l', ctrlKey: true, preventDefault() {} });
    assert.equal(blogButtons(app).length, 0, action);
    assert.equal(app.input.attributes['aria-describedby'], undefined);
    const before = app.nodes['#output'].textContent;
    await stale.events.click(); assert.equal(app.nodes['#output'].textContent, before);
    if (action === 'clear' || action === 'ctrl-l') assert.equal(before, '');
    await app.submit('blog'); assert.equal(blogButtons(app)[0].textContent, '1) Exit Selection');
  }
});

test('menu buttons support click and arrow keys without intercepting IME or command history', async () => {
  const app = terminal(); blogPosts(app, 2); await app.submit('blog');
  app.input.events.keydown({ key: 'ArrowDown', isComposing: true });
  assert.equal(blogButtons(app)[1].attributes['aria-pressed'], 'true');
  blogButtons(app)[1].events.keydown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(blogButtons(app)[2].attributes['aria-pressed'], 'true');
  blogButtons(app)[2].events.keydown({ key: '2', preventDefault() {} });
  assert.equal(app.input.value, '2');
  assert.equal(blogButtons(app)[1].attributes['aria-pressed'], 'true');
  await app.submit(app.input.value); assert.match(app.nodes['#output'].textContent, /Body 1/);
  await app.submit('blog');
  await blogButtons(app)[2].events.click(); assert.match(app.nodes['#output'].textContent, /Body 2/);
  await app.submit('blog');
  blogButtons(app)[1].events.keydown({ key: 'l', ctrlKey: true, preventDefault() {} });
  assert.equal(app.nodes['#output'].textContent, '');
  await app.submit('blog'); app.input.value = 'theme fra'; app.key('Tab');
  assert.equal(app.input.value, 'theme frappe');
  app.key('ArrowUp'); assert.equal(app.input.value, 'blog');
});

test('file posts selected by number retain loading, error and clear-during-fetch handling', async () => {
  const app = terminal(); filePost(app);
  let finish;
  app.context.fetch = () => new Promise(resolve => { finish = resolve; });
  await app.submit('blog'); const pending = app.submit('2');
  assert.match(app.nodes['#output'].textContent, /2026-11-02 · file/);
  assert.match(app.nodes['#output'].textContent, /Loading Markdown/);
  await app.submit('clear');
  finish({ ok: true, headers: { get: () => 'text/plain' }, text: async () => '# Late' });
  await pending; assert.equal(app.nodes['#output'].textContent, '');
  app.context.fetch = async () => ({ ok: false, status: 404 });
  await app.submit('blog'); await app.submit('2');
  assert.match(app.nodes['#output'].textContent, /Could not load Markdown file/);
});

for (const content of [{ markdown: 'Short.' }, { body: ['Legacy.'] }, { markdown: 'Long paragraph.\n\n'.repeat(80) }, { file: 'posts/test.md' }]) {
  test('blog anchors at its command for ' + Object.keys(content)[0] + ' content', async () => {
    const app = terminal();
    const body = app.nodes['#terminal-body']; body.clientHeight = 800; body.offsetTop = 10;
    const output = app.nodes['#output'];
    const append = output.append;
    output.append = function(entry) { entry.offsetTop = 210; append.call(this, entry); };
    app.context.SITE.posts.push({ slug: 'anchor', title: 'Anchor', date: '2026-11-03', ...content });
    let finish;
    app.context.fetch = () => new Promise(resolve => { finish = resolve; });
    const pending = app.submit('blog anchor');
    assert.equal(body.scrollTop, 200, 'anchors immediately, including while loading');
    assert.equal(output.children[0].style.minHeight, '800px', 'short posts leave alignment room');
    if (finish) finish({ ok: true, headers: { get: () => 'text/markdown' }, text: async () => '> [!DISCLAIMER]\n> **Read first.**' });
    await pending;
    assert.equal(body.scrollTop, 200, 'completion never scrolls to bottom');
  });
}

function filePost(app, file = 'posts/test.md') {
  app.context.SITE.posts.push({ slug: 'file', title: 'File post', date: '2026-11-02', file, markdown: 'Inline fallback' });
}

test('blog fetches a Markdown file under a hosting subpath and renders all five callouts safely', async () => {
  const app = terminal();
  filePost(app);
  app.context.fetch = async url => {
    assert.equal(url, 'https://example.com/portfolio/posts/test.md');
    return { ok: true, headers: { get: () => 'text/markdown' }, text: async () => '# From a file\n\n<script>unsafe()</script>\n\n' + ['NOTE', 'HEADS UP', 'CONTEXT', 'QUOTE', 'DISCLAIMER'].map(marker => '> [!' + marker + ']\n> **Safe**').join('\n\n') };
  };
  await app.submit('blog file');
  const output = app.nodes['#output'];
  assert.match(output.textContent, /From a file/);
  assert.doesNotMatch(output.textContent, /Loading|Inline fallback/);
  assert.equal(descendants(output).filter(child => child.tagName === 'BLOCKQUOTE').length, 5);
  assert.equal(descendants(output).filter(child => child.tagName === 'SCRIPT').length, 0);
});

for (const failure of ['404', 'network', 'html']) {
  test('blog file ' + failure + ' failure is readable and retryable', async () => {
    const app = terminal(); filePost(app);
    app.context.fetch = async () => {
      if(failure === 'network') throw Error('offline');
      return { ok: failure !== '404', status: 404, headers: { get: () => failure === 'html' ? 'text/html' : 'text/plain' }, text: async () => '<html>Not a post</html>' };
    };
    await app.submit('blog file');
    assert.match(app.nodes['#output'].textContent, /Could not load Markdown file/);
    assert.equal(app.nodes['#output'].querySelector('.markdown-body'), null);
    app.context.fetch = async () => ({ ok: true, headers: { get: () => 'text/plain' }, text: async () => '**Recovered**' });
    await app.submit('blog file');
    assert.equal(app.nodes['#output'].querySelector('.markdown-body').querySelector('strong').textContent, 'Recovered');
  });
}

test('blog rejects external, executable and non-Markdown file paths before fetching', async () => {
  for (const file of ['https://other.example/post.md', 'javascript:alert(1)', 'posts/post.html']) {
    const app = terminal(); filePost(app, file);
    app.context.fetch = () => { assert.fail('invalid file must not be fetched'); };
    await app.submit('blog file');
    assert.match(app.nodes['#output'].textContent, /Could not load Markdown file/);
  }
});

test('clearing during a pending Markdown fetch never restores its transcript', async () => {
  const app = terminal(); filePost(app);
  let finish;
  app.context.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = app.submit('blog file');
  assert.match(app.nodes['#output'].textContent, /Loading Markdown/);
  app.submit('clear');
  app.nodes['#terminal-body'].scrollTop = 123;
  finish({ ok: true, headers: { get: () => 'text/plain' }, text: async () => '# Late post' });
  await pending;
  assert.equal(app.nodes['#terminal-body'].scrollTop, 123, 'stale completion cannot change the viewport');
  assert.equal(app.nodes['#output'].textContent, '');
});


function loadAnalytics({ hostname = 'adamgdegr.com', protocol = 'https:', doNotTrack, gpc } = {}) {
  const inserted = [];
  const first = { parentNode: { insertBefore(node) { inserted.push(node); } } };
  const window = { location: { hostname, protocol }, navigator: { doNotTrack, globalPrivacyControl: gpc }, terminalTheme: { current: () => 'mocha' } };
  const context = { window, Array, Object, document: { createElement: tag => ({ tagName: tag }), getElementsByTagName: () => [first] } };
  runInNewContext(readFileSync('dist/analytics.js', 'utf8'), context);
  return { analytics: window.terminalAnalytics, posthog: window.posthog, inserted };
}

test('analytics loads PostHog in production without cookies and queues tracked events with the theme', () => {
  const { analytics, posthog, inserted } = loadAnalytics();
  assert.equal(analytics.enabled, true);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].src, 'https://pulse.adamgd.dev/static/array.js');
  const [[key, config]] = posthog._i;
  assert.match(key, /^phc_/);
  assert.equal(config.api_host, 'https://pulse.adamgd.dev');
  assert.equal(config.ui_host, 'https://us.posthog.com');
  assert.equal(config.persistence, 'localStorage');
  assert.equal(config.respect_dnt, true);
  analytics.track('terminal_command', { command: 'help' });
  const queued = posthog.find(call => call[0] === 'capture');
  assert.deepEqual(JSON.parse(JSON.stringify(queued.slice(0, 3))), ['capture', 'terminal_command', { theme: 'mocha', command: 'help' }]);
});

test('analytics stays local on dev hosts and for Do Not Track or Global Privacy Control', () => {
  for (const options of [{ hostname: 'localhost' }, { hostname: '127.0.0.1' }, { protocol: 'file:', hostname: '' }, { doNotTrack: '1' }, { gpc: true }]) {
    const { analytics, posthog, inserted } = loadAnalytics(options);
    assert.equal(analytics.enabled, false, JSON.stringify(options));
    assert.equal(posthog, undefined);
    assert.equal(inserted.length, 0);
    analytics.track('terminal_command', { command: 'help' });
    assert.equal(analytics.events.at(-1).event, 'terminal_command');
  }
});

test('commands are tracked by name without recording unknown arguments', async () => {
  const app = terminal();
  app.submit('help');
  app.submit('theme frappe');
  app.submit('sudo rm -rf / my secret');
  app.submit('clear');
  const commands = app.analytics.filter(item => item.event === 'terminal_command').map(item => item.properties);
  assert.deepEqual(commands.map(item => item.command), ['help', 'theme', 'unknown', 'clear']);
  assert.equal(commands[1].argument, 'frappe');
  assert.equal(commands[2].attempted, 'sudo');
  assert.doesNotMatch(JSON.stringify(app.analytics), /secret|rm -rf/);
  assert.equal(app.analytics.find(item => item.event === 'theme_changed').properties.preference, 'frappe');
});

test('posts report how they were opened, read time, and load failures', async () => {
  const app = terminal();
  app.context.SITE.posts.push({ slug: 'hello', title: 'Hello', date: '2026-11-02', markdown: 'Hi' });
  await app.submit('blog hello');
  await app.submit('blog 2026-11-02');
  await app.submit('blog');
  await app.submit('2');
  await app.submit('about');
  const opened = app.analytics.filter(item => item.event === 'post_opened').map(item => item.properties.via);
  assert.deepEqual(opened, ['slug', 'date', 'selection']);
  const reads = app.analytics.filter(item => item.event === 'post_read');
  assert.equal(reads.length, 3);
  assert.equal(reads[0].properties.slug, 'hello');
  assert.equal(typeof reads[0].properties.seconds, 'number');
  assert.equal(reads[2].properties.reason, 'command');
  assert.ok(app.analytics.some(item => item.event === 'blog_selector_opened' && item.properties.post_count === 1));
  filePost(app, 'posts/missing.md');
  app.context.fetch = async () => ({ ok: false, status: 404, headers: { get: () => 'text/plain' } });
  await app.submit('blog file');
  assert.equal(app.analytics.at(-1).event, 'post_load_failed');
  app.submit('clear');
  assert.equal(app.analytics.filter(item => item.event === 'post_read').length, 3, 'failed loads are not reads');
});

test('link clicks report their label, destination and section, and analytics failures stay silent', () => {
  const app = terminal();
  app.submit('socials');
  const anchor = { href: 'https://github.com/adamgdegr', textContent: 'GitHub ↗', closest: selector => selector === 'a[href]' ? anchor : selector === '.entry' ? app.nodes['#output'].children[0] : null };
  app.nodes['#terminal-body'].events.click({ target: { closest: () => anchor }, type: 'click' });
  const click = app.analytics.at(-1);
  assert.equal(click.event, 'link_clicked');
  assert.deepEqual({ ...click.properties }, { label: 'GitHub', url: 'https://github.com/adamgdegr', host: 'github.com', outbound: true, section: 'socials', in_post: false, post_slug: undefined });
  assert.equal(click.options.transport, 'sendBeacon');
  app.context.window.terminalAnalytics.track = () => { throw Error('blocked'); };
  app.submit('about');
  assert.match(app.nodes['#output'].textContent, /Howdy/);
});

test('familiar shell aliases resolve to commands, with typo hints and Tab completion', async () => {
  const app = terminal();
  const out = () => app.nodes['#output'].textContent;
  await app.submit('ls');
  assert.match(out(), /A few places to go/);
  await app.submit('dark');
  assert.equal(app.theme.current(), 'mocha');
  await app.submit('light');
  assert.equal(app.theme.current(), 'latte');
  await app.submit('hlep');
  assert.match(out(), /Did you mean help\?/);
  await app.submit('zzzzzz');
  assert.doesNotMatch(out(), /Did you mean zzzzzz/);
  const commands = app.analytics.filter(item => item.event === 'terminal_command').map(item => item.properties);
  assert.deepEqual(commands.slice(0, 3).map(item => item.command), ['help', 'theme', 'theme']);
  assert.equal(commands[0].alias, 'ls');
  assert.equal(commands[1].argument, 'mocha');
  assert.equal(commands[2].attempted, undefined);
  app.input.value = 'cont'; app.key('Tab');
  assert.equal(app.input.value, 'contact');
});


// auto: every reload answers right away with the current flags, like a fast network.
// auto: every reload answers right away with the current flags, like a fast network.
function fakePostHog({ flags = {}, payloads = {}, auto = true } = {}) {
  const callbacks = [];
  return { flags, payloads, callbacks, reloads: 0, onFeatureFlags(callback) { callbacks.push(callback); },
    reloadFeatureFlags() { this.reloads++; if (auto) Promise.resolve().then(() => this.fire()); },
    getFeatureFlag: key => flags[key], getFeatureFlagPayload: key => payloads[key], fire() { callbacks.forEach(callback => callback()); } };
}
const post = { slug: 'remote-post', title: 'Remote post', date: '2026-11-08', file: 'posts/remote-post.md' };
const allOn = { 'terminal-blog': true, 'terminal-funding': true, 'terminal-projects': true };
const goodPayloads = () => ({
  'terminal-config-posts': [post],
  'terminal-config-projects': [{ name: 'Remote project', description: 'Served remotely' }],
  'terminal-config-socials': [{ name: 'GitHub', url: 'https://github.com/adamgdegr' }],
  'terminal-config-funding': [{ name: 'Coffee', url: 'https://buymeacoffee.com/adamgdegr' }]
});

test('the bundled content serves none of the remote payloads', () => {
  const app = boot();
  runInNewContext(readFileSync('dist/content.js', 'utf8'), app.context);
  const site = app.context.window.SITE;
  for (const kind of ['posts', 'projects', 'socials', 'funding']) assert.equal(site[kind].length, 0, kind);
  assert.equal(site.markdownDemo.file, 'posts/markdown-demo.md');
});

test('without PostHog every remote-served section shows an honest empty state', async () => {
  const app = terminal();
  Object.assign(app.context.SITE, { projects: [], socials: [], funding: [] });
  runInNewContext(readFileSync('dist/remote.js', 'utf8'), app.context);
  const remote = app.context.window.terminalRemote;
  assert.equal(remote.settled, true);
  assert.equal(remote.live, false);
  assert.deepEqual([...Object.values(remote.sources)], ['local', 'local', 'local', 'local']);
  assert.equal(remote.enabled('blog') && remote.enabled('funding') && remote.enabled('projects'), true);
  for (const command of ['blog', 'projects', 'socials', 'funding']) await app.submit(command);
  const text = app.nodes['#output'].textContent;
  assert.match(text, /No posts published yet/);
  assert.match(text, /No projects listed yet/);
  assert.match(text, /No links listed yet/);
  assert.match(text, /Funding links haven’t been added yet/);
});

test('remote config payloads are validated, and anything invalid leaves the section empty', async () => {
  const posthog = fakePostHog({ flags: allOn, payloads: {
    'terminal-config-posts': JSON.stringify([post, { ...post, slug: 'bad file', file: 'https://evil.example/x.md' }, { ...post, slug: 'dupe-check' }, post]),
    'terminal-config-projects': [{ name: 'Remote project', description: 'Works', url: 'javascript:alert(1)' }, { name: 'Safe', description: 'No link' }],
    'terminal-config-socials': [{ name: 'Mastodon', url: 'https://example.social/@adam' }, { name: 'Bad', url: 'data:text/html,x' }],
    'terminal-config-funding': 'not json'
  } });
  const app = terminal({ posthog });
  const remote = app.context.window.terminalRemote;
  assert.equal(remote.settled, false);
  posthog.fire();
  assert.equal(remote.settled, true);
  assert.deepEqual([...app.context.SITE.posts.map(item => item.slug)], ['remote-post', 'dupe-check']);
  assert.deepEqual([...app.context.SITE.projects.map(item => item.name)], ['Safe']);
  assert.deepEqual([...app.context.SITE.socials.map(item => item.name)], ['Mastodon']);
  assert.equal(app.context.SITE.funding.length, 0, 'invalid payload leaves funding empty');
  assert.deepEqual({ ...remote.sources }, { posts: 'remote', projects: 'remote', socials: 'remote', funding: 'fallback' });
  const loaded = app.analytics.find(item => item.event === 'remote_config_loaded');
  assert.deepEqual([...loaded.properties.remote], ['posts', 'projects', 'socials']);
  assert.deepEqual([...loaded.properties.fallback], ['funding']);
});

test('an empty remote array shows the empty state', async () => {
  const posthog = fakePostHog({ flags: allOn, payloads: { 'terminal-config-posts': [] } });
  const app = terminal({ posthog });
  await app.submit('blog');
  assert.match(app.nodes['#output'].textContent, /No posts published yet/);
});

test('switched-off sections stay listed and show a notice, even for blog slugs and --demo', async () => {
  const posthog = fakePostHog({ flags: { 'terminal-blog': false, 'terminal-funding': false, 'terminal-projects': false }, payloads: goodPayloads() });
  const app = terminal({ posthog });
  const out = () => app.nodes['#output'].textContent;
  await app.submit('help');
  assert.match(out(), /blog.*funding|funding.*blog/s);
  for (const command of ['blog', 'blog remote-post', 'blog --demo', 'cat remote-post']) await app.submit(command);
  await app.submit('funding'); await app.submit('projects');
  assert.equal((out().match(/The blog is switched off/g) || []).length, 4);
  assert.match(out(), /Funding links are switched off/);
  assert.match(out(), /Projects are switched off/);
  assert.doesNotMatch(out(), /Coffee|Remote project|Remote post/);
  assert.equal(app.analytics.filter(item => item.event === 'section_disabled').length, 6);
  assert.equal(app.analytics.some(item => ['post_opened', 'blog_selector_opened'].includes(item.event)), false);
  app.input.value = 'fun'; app.key('Tab');
  assert.equal(app.input.value, 'funding', 'Tab still completes disabled commands');
});

test('projects tolerates remote socials without a GitHub entry', async () => {
  const posthog = fakePostHog({ flags: allOn, payloads: { ...goodPayloads(), 'terminal-config-socials': [{ name: 'Mastodon', url: 'https://example.social/@adam' }] } });
  const app = terminal({ posthog });
  await app.submit('projects');
  assert.match(app.nodes['#output'].textContent, /Remote project/);
  assert.doesNotMatch(app.nodes['#output'].textContent, /More code lives on GitHub/);
});

test('commands wait for PostHog, time out to empty states, and never act on a cleared transcript', async () => {
  const posthog = fakePostHog({ flags: { 'terminal-funding': false }, auto: false });
  const app = terminal({ posthog });
  const waiting = app.submit('funding');
  assert.match(app.nodes['#output'].textContent, /Loading…/);
  posthog.fire();
  await waiting;
  assert.match(app.nodes['#output'].textContent, /Funding links are switched off/);
  assert.doesNotMatch(app.nodes['#output'].textContent, /Loading…/);

  const slow = fakePostHog({ auto: false });
  const timeout = terminal({ posthog: slow });
  const pending = timeout.submit('funding');
  timeout.timers.forEach(fn => fn());
  await pending;
  assert.match(timeout.nodes['#output'].textContent, /Funding links haven’t been added yet/);
  assert.equal(timeout.context.window.terminalRemote.sources.funding, 'fallback');

  const cleared = terminal({ posthog: fakePostHog({ auto: false }) });
  const stale = cleared.submit('blog');
  cleared.submit('clear');
  cleared.timers.forEach(fn => fn());
  await stale;
  assert.equal(cleared.nodes['#output'].textContent, '');
});

test('every remote-backed command re-checks PostHog, so flag and payload edits apply without a reload', async () => {
  const posthog = fakePostHog({ flags: allOn, payloads: goodPayloads() });
  const app = terminal({ posthog });
  const out = () => app.nodes['#output'].textContent;
  await app.submit('projects');
  assert.match(out(), /Remote project/);
  assert.equal(posthog.reloads, 1);
  posthog.flags['terminal-projects'] = false;
  await app.submit('projects');
  assert.equal(posthog.reloads, 2, 'checked again on the next command');
  assert.match(out(), /Projects are switched off/);
  posthog.flags['terminal-projects'] = true;
  posthog.payloads['terminal-config-projects'] = [{ name: 'Edited remotely', description: 'Fresh' }];
  await app.submit('projects');
  assert.match(out(), /Edited remotely/);
  delete posthog.payloads['terminal-config-projects'];
  await app.submit('clear'); await app.submit('projects');
  assert.match(out(), /No projects listed yet/, 'a removed payload empties the section');
  assert.equal(app.context.SITE.projects.length, 0);
  await app.submit('about'); assert.equal(posthog.reloads, 4, 'other commands do not poll');
});

test('a flag absent from a real PostHog answer is off, but silence from PostHog fails open', async () => {
  // PostHog answered (other flags present) without terminal-projects: it was deactivated or deleted.
  const answered = fakePostHog({ flags: { 'terminal-blog': true, 'terminal-funding': true }, payloads: goodPayloads() });
  const off = terminal({ posthog: answered });
  await off.submit('projects');
  assert.match(off.nodes['#output'].textContent, /Projects are switched off/);
  // No flags at all: the request failed or was blocked, so the section stays on (and empty without a payload).
  const silent = fakePostHog();
  const open = terminal({ posthog: silent });
  await open.submit('projects');
  assert.match(open.nodes['#output'].textContent, /No projects listed yet/);
  assert.doesNotMatch(open.nodes['#output'].textContent, /switched off/);
});

const buildInfo = {
  branch: 'main', author: 'Adam Garza', committer: 'Adam Garza', coAuthors: ['Claude Sonnet 5.5'], commitCount: 7, dirty: true, generatedAt: '2026-11-08T22:43:51Z',
  commit: { hash: 'a'.repeat(40), short: 'aaaaaaa', subject: 'Add <b>version</b> command', body: 'Line one.\n- detail', authoredAt: '2026-11-08T16:33:44-06:00', committedAt: '2026-11-08T16:33:44-06:00',
    url: 'https://github.com/adamgdegr/terminal/commit/' + 'a'.repeat(40), tags: ['v1'], parents: 1, files: 8, insertions: 290, deletions: 11 }
};
const versionResponse = (body, { ok = true, type = 'application/json' } = {}) => ({ ok, status: ok ? 200 : 404, headers: { get: () => type }, json: async () => body });

test('version shows commit message, authors, branch and build details as plain text', async () => {
  const app = terminal(); const urls = [];
  app.context.fetch = async url => { urls.push(url); return versionResponse(buildInfo); };
  await app.submit('version');
  const text = app.nodes['#output'].textContent;
  for (const expected of ['Build information', 'main', 'Add <b>version</b> command', 'Line one.', 'Adam Garza', 'Claude Sonnet 5.5', 'v1', '8 files · +290 −11', '7 commits on this branch', 'uncommitted changes']) assert.ok(text.includes(expected), expected);
  assert.match(text, /aaaaaaa/);
  assert.equal(urls[0], 'https://example.com/portfolio/version.json', 'resolves from the page base');
  await app.submit('--version');
  assert.equal(urls.length, 1, 'build info is cached after the first load');
  assert.equal(app.analytics.find(item => item.event === 'terminal_command' && item.properties.alias === '--version').properties.command, 'version');
  app.input.value = 'vers'; app.key('Tab');
  assert.equal(app.input.value, 'version');
});

test('version reports a missing or malformed build file and recovers on retry', async () => {
  const app = terminal(); let reply = versionResponse({}, { ok: false });
  app.context.fetch = async () => reply;
  await app.submit('version');
  assert.match(app.nodes['#output'].textContent, /Build information is unavailable/);
  reply = versionResponse(buildInfo, { type: 'text/html' });
  await app.submit('ver');
  assert.equal((app.nodes['#output'].textContent.match(/unavailable/g) || []).length, 2, 'HTML responses are rejected');
  reply = versionResponse(buildInfo);
  await app.submit('build');
  assert.match(app.nodes['#output'].textContent, /Adam Garza/);
});

test('a version load that finishes after a newer command still completes its own entry', async () => {
  const app = terminal(); let finish;
  app.context.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = app.submit('version');
  await app.submit('whoami');
  finish(versionResponse(buildInfo));
  await pending;
  assert.doesNotMatch(app.nodes['#output'].textContent, /Loading build information/);
  assert.match(app.nodes['#output'].textContent, /Adam Garza/);
});

test('clearing during a pending version load never restores its transcript', async () => {
  const app = terminal(); let finish;
  app.context.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = app.submit('version');
  assert.match(app.nodes['#output'].textContent, /Loading build information/);
  app.submit('clear');
  finish(versionResponse(buildInfo));
  await pending;
  assert.equal(app.nodes['#output'].textContent, '');
});
