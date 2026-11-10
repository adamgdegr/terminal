#!/usr/bin/env node
// Dependency-free lint for the static site. Run with `npm run check`.
//  1. Syntax-checks every JavaScript file in dist/, scripts/ and tests/ (new files are picked up automatically).
//  2. Enforces repository rules: no HTML-string DOM APIs or dynamic code in dist/,
//     relative asset URLs and the required script order in dist/index.html.
'use strict';
const { readdirSync, readFileSync } = require('node:fs');
const { join, relative } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = join(__dirname, '..');
const failures = [];
const fail = (file, message) => failures.push(relative(root, file) + ': ' + message);

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
const scripts = ['dist', 'scripts', 'tests'].flatMap(dir => walk(join(root, dir))).filter(file => /\.c?js$/.test(file));

for (const file of scripts) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(file, 'syntax error\n' + (result.stderr || '').trim());
}

// Content is rendered with DOM elements and text nodes; commands never run code.
const banned = [
  [/\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write\b|DOMParser|createContextualFragment/, 'parses HTML strings; build DOM nodes instead'],
  [/\beval\s*\(|\bnew Function\s*\(/, 'evaluates dynamic code']
];
for (const file of scripts.filter(file => file.startsWith(join(root, 'dist')))) {
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    for (const [pattern, message] of banned) if (pattern.test(line)) fail(file + ':' + (index + 1), message);
  });
}

// Relative asset URLs keep subpath hosting working; the script order is load-bearing.
const indexFile = join(root, 'dist', 'index.html');
const html = readFileSync(indexFile, 'utf8');
for (const [, url] of html.matchAll(/\b(?:src|href)="([^"]*)"/g)) {
  if (/^(?:\/|[a-z][a-z0-9+.-]*:)/i.test(url)) fail(indexFile, 'asset URL must be relative: ' + url);
}
const order = [...html.matchAll(/<script src="([^"]+)"([^>]*)>/g)].map(([, src, attrs]) => src + (/\bdefer\b/.test(attrs) ? ' (defer)' : ''));
const expected = ['theme.js', 'analytics.js (defer)', 'content.js (defer)', 'remote.js (defer)', 'markdown.js (defer)', 'terminal.js (defer)'];
if (order.join() !== expected.join()) fail(indexFile, 'script order must be ' + expected.join(', ') + '; found ' + order.join(', '));
if (html.indexOf('theme.js') > html.indexOf('stylesheet')) fail(indexFile, 'theme.js must load before the stylesheets');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('check: ' + scripts.length + ' scripts and dist/index.html look good');
