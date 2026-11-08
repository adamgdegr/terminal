const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdtemp, mkdir, rm } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { spawn, execFileSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { join, resolve, extname } = require('node:path');

// A real browser without an npm dependency. CHROME_BIN supports CI/Linux installs.
const chrome = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
async function browserFlow() {
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const input = document.querySelector('#command-input');
  const form = document.querySelector('#command-form');
  const command = async value => {
    input.value = value; form.requestSubmit();
    const deadline = Date.now() + 4000;
    while ([...document.querySelectorAll('[role=status]')].some(node => /^Loading (Markdown|build information)…$/.test(node.textContent))) {
      assert(Date.now() < deadline, 'Markdown load completed');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  const publishedPosts = window.SITE.posts.slice();
  window.SITE.posts.length = 0;
  await command('clear'); await command('blog');
  assert(document.querySelector('#output').textContent.includes('No posts published yet'), 'empty blog');
  await command('blog --demo');
  const reader = document.querySelector('.markdown-body');
  assert(reader, 'reader appears after submitting command');
  assert([...reader.querySelectorAll('.md-callout-title')].map(el => el.textContent).join('|') === 'Note|Heads Up|Context|Quote|Disclaimer', 'five callouts');
  assert(reader.querySelector('pre code').textContent.includes('console.log'), 'fenced code');
  assert(reader.querySelector('table th').scope === 'col', 'table headers');
  assert(reader.querySelectorAll('input:disabled').length === 3, 'task checkboxes');
  assert(reader.querySelector('a').href === 'https://github.com/adamgdegr/adamgdegr', 'link destination');
  for (const theme of ['latte', 'frappe', 'macchiato', 'mocha']) {
    await command('theme ' + theme);
    assert(document.documentElement.dataset.theme === theme, 'theme ' + theme);
    assert(getComputedStyle(reader.querySelector('.md-note')).borderLeftColor === getComputedStyle(document.documentElement).getPropertyValue('--blue').trim().replace(/^#([\da-f]{6})$/i, (_, hex) => 'rgb(' + hex.match(/../g).map(part => parseInt(part, 16)).join(', ') + ')'), 'callout follows ' + theme);
  }
  const fixture = { slug: 'browser-smoke', title: 'Browser test', date: '2026-11-02', markdown: '# Title\n\n<script>window.markdownExecuted = true</script>\n\n[bad](javascript:alert(1))\n\n> [!CONTEXT]\n> **Safe**' };
  window.SITE.posts.push(fixture);
  await command('blog browser-smoke');
  const post = [...document.querySelectorAll('.markdown-body')].pop();
  assert(post.querySelector('h1').textContent === 'Title', 'published post renders');
  assert(post.querySelector('strong').textContent === 'Safe', 'format inside callout');
  assert(!post.querySelector('script,a') && !window.markdownExecuted, 'HTML and unsafe URLs inert');
  window.SITE.posts.pop();
  window.SITE.posts.push({ slug: 'file-smoke', title: 'File test', date: '2026-11-02', file: 'posts/browser-fixture.md' });
  await command('blog file-smoke');
  const filePost = [...document.querySelectorAll('.markdown-body')].pop();
  assert(filePost.querySelector('h1').textContent === 'Fetched Markdown', 'file post renders');
  assert(filePost.querySelector('a').getAttribute('href') === new URL('posts/next.md', document.baseURI).href, 'links relative to Markdown file');
  assert(filePost.querySelector('img').getAttribute('src') === new URL('favicon.png', document.baseURI).href, 'images relative to Markdown file');
  assert(filePost.querySelectorAll('.md-callout').length === 5 && !filePost.querySelector('script'), 'file callouts and HTML safety');
  window.SITE.posts[window.SITE.posts.length - 1].file = 'posts/missing.md';
  await command('blog file-smoke');
  assert(document.querySelector('#output').lastElementChild.textContent.includes('Could not load Markdown file'), 'missing file error');
  window.SITE.posts.pop();
  const key = value => input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  const choices = () => [...document.querySelectorAll('.blog-choice:not(:disabled)')];
  window.SITE.posts = Array.from({ length: 11 }, (_, i) => ({ slug: 'select-' + (i + 1), title: 'Selection post ' + (i + 1), date: '2026-11-' + String(i + 1).padStart(2, '0'), markdown: '# Selected body ' + (i + 1) }));
  await command('clear'); await command('blog');
  assert(choices().length === 7, 'five posts plus exit and next');
  assert(choices()[0].textContent === '1) Exit Selection', 'exit stays first');
  assert(choices()[1].textContent === '2) Selection post 1 · 2026-11-01', 'title before date without slug');
  key('ArrowDown');
  assert(choices()[2].getAttribute('aria-pressed') === 'true', 'arrow highlights next choice');
  await command('');
  assert(document.querySelector('#output').lastElementChild.textContent.includes('2026-11-02 · select-2'), 'Enter opens selected post with date and slug');
  key('ArrowUp'); assert(input.value === 'blog select-2', 'history resumes after selection');
  await command('blog');
  await command('7');
  assert(choices()[0].textContent === '1) Exit Selection' && choices()[1].textContent.includes('Selection post 6'), 'second page resets numbering');
  await command('7');
  assert(choices().length === 2 && !choices().some(button => button.textContent.includes('Next')), 'partial last page has no next');
  assert(choices()[1].textContent.includes('Selection post 11'), 'third page correct');
  input.value = '2'; input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: '2', bubbles: true }));
  assert(choices()[1].getAttribute('aria-pressed') === 'true', 'typed number highlights choice');
  await command('2');
  assert(document.querySelector('#output').lastElementChild.textContent.includes('Selected body 11'), 'number opens last-page choice');
  await command('blog 2026-11-03');
  assert(document.querySelector('#output').lastElementChild.textContent.includes('Selected body 3'), 'date command opens post');
  window.SITE.posts[3].date = '2026-11-03';
  await command('blog 2026-11-03'); assert(choices().length === 3, 'same-date posts use selection');
  choices()[2].focus();
  choices()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  assert(document.activeElement === choices()[1], 'button arrow moves native focus');
  choices()[1].click();
  assert(document.querySelector('#output').lastElementChild.textContent.includes('Selected body 3'), 'click or tap opens post');
  await command('blog'); key('Escape'); assert(choices().length === 0, 'Escape closes selection');
  await command('blog'); await command('0');
  assert(document.querySelector('#output').textContent.includes('Choose a number from 1 to 7'), 'invalid choice announced');
  await command('1'); assert(choices().length === 0, 'number one exits selection');
  await command('blog');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true, cancelable: true }));
  assert(!document.querySelector('#output').children.length && !input.hasAttribute('aria-describedby'), 'Ctrl L clears active selector');
  await command('blog'); await command('about'); assert(choices().length === 0, 'commands exit selection');
  // Geometry regressions: every reading path starts at the command, not the prompt.
  const anchored = async label => {
    await new Promise(resolve => setTimeout(resolve, 200));
    const body = document.querySelector('#terminal-body');
    const entry = document.querySelector('#output').lastElementChild;
    const top = entry.getBoundingClientRect().top - body.getBoundingClientRect().top;
    assert(Math.abs(top) <= 4, label + ' command aligned at top: ' + top);
  };
  for (const content of [{ markdown: 'Short post.' }, { body: ['Legacy short post.'] }, { markdown: Array(80).fill('Long paragraph.').join('\n\n') }, { file: 'posts/browser-fixture.md' }, { file: 'posts/missing.md' }]) {
    window.SITE.posts = [{ slug: 'anchor', title: 'Anchor test', date: '2026-11-03', ...content }];
    await command('clear'); await command('about');
    await command('blog anchor'); await anchored('slug ' + Object.keys(content)[0]);
    await command('blog 2026-11-03'); await anchored('date');
    await command('blog'); await command('2'); await anchored('number selection');
    await command('blog'); choices()[1].click();
    while (document.querySelector('#output').lastElementChild.textContent.includes('Loading Markdown…')) await new Promise(resolve => setTimeout(resolve, 10));
    await anchored('click selection');
  }
  await command('blog --demo'); await anchored('demo');
  window.SITE.posts = publishedPosts;
  await command('clear'); await command('blog');
  assert(document.documentElement.scrollWidth <= innerWidth, 'selection has no horizontal overflow');
  for (const button of choices()) if (innerWidth < 650) assert(button.getBoundingClientRect().height >= 44, 'mobile touch target');
  key('Escape');
  input.value = 'theme fra'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert(input.value === 'theme frappe', 'completion preserved');
  await command('clear'); await command('blog --demo');
  assert(document.documentElement.scrollWidth <= innerWidth, 'no page horizontal overflow');
  assert(innerWidth === Number(window.parent.location.search.match(/width=(\d+)/)[1]), 'exact responsive viewport');
  // Analytics: local hosts never load PostHog but still record events in memory.
  assert(window.terminalAnalytics && window.terminalAnalytics.enabled === false && !window.posthog, 'analytics disabled locally');
  assert(!performance.getEntriesByType('resource').some(entry => entry.name.includes('posthog')), 'no PostHog requests locally');
  // Remote-served lists ship empty; locally the terminal says so, then fixtures stand in for a PostHog payload.
  await command('socials');
  assert(document.querySelector('#output').lastElementChild.textContent.includes('No links listed yet'), 'empty socials state');
  window.SITE.socials = [{ name: 'GitHub', url: 'https://github.com/adamgdegr' }];
  await command('socials');
  const social = document.querySelector('#output').lastElementChild.querySelector('a[href]');
  const block = event => event.preventDefault();
  document.addEventListener('click', block, true);
  social.click();
  document.removeEventListener('click', block, true);
  const logged = window.terminalAnalytics.events;
  const click = logged.at(-1);
  assert(click.event === 'link_clicked' && click.properties.host === 'github.com' && click.properties.section === 'socials', 'link click tracked');
  assert(logged.some(item => item.event === 'terminal_command' && item.properties.command === 'socials' && item.properties.theme), 'command tracked with theme');
  assert(logged.some(item => item.event === 'post_read' && item.properties.slug === 'markdown-demo'), 'demo read time tracked');
  // Remote config: locally PostHog is absent, so bundled content applies and every section is on.
  const remote = window.terminalRemote;
  assert(remote && remote.settled && remote.enabled('blog') && Object.values(remote.sources).every(source => source === 'local'), 'remote config falls back locally');
  window.SITE.funding = [{ name: 'Buy me a Coffee', url: 'https://buymeacoffee.com/adamgdegr' }];
  remote.flags.funding = false;
  await command('clear'); await command('funding'); await command('help');
  const transcript = document.querySelector('#output').textContent;
  assert(transcript.includes('Funding links are switched off') && !transcript.includes('Buy me a Coffee'), 'switched-off section shows notice');
  assert(transcript.includes('funding'), 'switched-off command stays listed');
  assert(document.documentElement.scrollWidth <= innerWidth, 'notice has no horizontal overflow');
  remote.flags.funding = true;
  await command('funding');
  assert(document.querySelector('#output').lastElementChild.textContent.includes('Buy me a Coffee'), 'section returns when flag is on');
  // Version: the build file is written by scripts/version.js and rendered as plain text.
  await command('clear'); await command('version');
  const versionText = document.querySelector('#output').textContent;
  assert(versionText.includes('Build information') && /Branch/.test(versionText) && /Author/.test(versionText) && /Message/.test(versionText), 'version details render');
  assert(!versionText.includes('Build information is unavailable') && !versionText.includes('Loading build'), 'version loads');
  assert(document.documentElement.scrollWidth <= innerWidth, 'version has no horizontal overflow');
  window.parent.document.body.dataset.smoke = 'passed';
}

test('blog reader works in desktop and mobile Chromium', { timeout: 60000 }, async () => {
  assert.ok(chrome, 'Install Chrome/Chromium or set CHROME_BIN to run browser tests');
  // The version command reads a build file that deploys generate (git-ignored).
  execFileSync('node', ['scripts/version.js'], { stdio: 'ignore' });
  const root = resolve('dist');
  const server = createServer(async (req, res) => {
    try {
      const request = new URL(req.url, 'http://localhost');
      const pathname = request.pathname;
      // Chrome window managers may clamp small windows. An iframe gives the
      // page the exact responsive viewport even when the outer window is wider.
      if (pathname === '/' && request.searchParams.has('width')) {
        const width = Number(request.searchParams.get('width'));
        const height = Number(request.searchParams.get('height'));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!doctype html><html lang=""><head><title>Reader browser test</title></head><body style="margin:0"><iframe title="Reader test viewport" src="/index.html" style="display:block;border:0;width:${width}px;height:${height}px"></iframe></body></html>`);
        return;
      }
      if (pathname === '/posts/browser-fixture.md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown' });
        res.end('# Fetched Markdown\n\n[Next](./next.md) ![Icon](../favicon.png)\n\n<script>window.markdownExecuted=true</script>\n\n' + ['NOTE', 'HEADS UP', 'CONTEXT', 'QUOTE', 'DISCLAIMER'].map(marker => '> [!' + marker + ']\n> **Safe**').join('\n\n'));
        return;
      }
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
      let content = await readFile(file);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.md': 'text/markdown' }[extname(file)] || 'application/octet-stream';
      if (extname(file) === '.html') content = content.toString().replace('</body>', `<script>addEventListener('load', async () => { try { await (${browserFlow.toString().replace(/<\/script/gi, '<\\/script')})(); } catch (error) { window.parent.document.body.dataset.smoke = 'failed: ' + error.message; } });</script></body>`);
      res.writeHead(200, { 'Content-Type': type }); res.end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const size of ['1280,900', '390,844']) {
      const profile = await mkdtemp(join(tmpdir(), 'terminal-browser-test-'));
      try {
        const capture = [];
        if (process.env.SCREENSHOT_DIR) {
          await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
          capture.push('--screenshot=' + resolve(process.env.SCREENSHOT_DIR, 'markdown-' + size.replace(',', 'x') + '.png'));
        }
        const output = await new Promise((resolve, reject) => {
          const child = spawn(chrome, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, '--window-size=' + size, '--force-device-scale-factor=1', '--dump-dom', '--timeout=10000', '--virtual-time-budget=10000', ...capture, url + '/?width=' + size.split(',')[0] + '&height=' + size.split(',')[1]]);
          let stdout = ''; let stderr = '';
          const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error('Browser timed out')); }, 20000);
          child.stdout.on('data', bytes => stdout += bytes);
          child.stderr.on('data', bytes => stderr += bytes);
          child.on('error', error => { clearTimeout(timer); reject(error); });
          child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(Error('Chrome exited ' + code + ': ' + stderr.slice(-1000))); });
        });
        assert.match(output, /data-smoke="passed"/, size + ': ' + (output.match(/data-smoke="([^"]*)"/) || [])[1]);
      } finally { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
