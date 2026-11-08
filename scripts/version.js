#!/usr/bin/env node
// Writes dist/version.json from git so the `version` command can show build details.
// Dependency-free; never fails the build. Emails are deliberately left out of the public file.
'use strict';
const { execFileSync } = require('node:child_process');
const { writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const out = join(__dirname, '..', 'dist', 'version.json');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return ''; } };

function repoUrl() {
  const match = tryGit('remote', 'get-url', 'origin').match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
  return match ? 'https://github.com/' + match[1] : '';
}

function build() {
  const [hash, shortHash, author, committer, authoredAt, committedAt, subject, ...rest] = git('log', '-1', '--format=%H%x00%h%x00%an%x00%cn%x00%aI%x00%cI%x00%s%x00%B').split('\0');
  const message = rest.join('\0');
  const coAuthors = [...message.matchAll(/^co-authored-by:\s*(.+?)\s*<[^>]*>\s*$/gim)].map(match => match[1]);
  // The subject is shown on its own; drop it and the trailers from the body.
  const body = message.replace(/^[^\n]*\n?/, '').split('\n').filter(line => !/^co-authored-by:/i.test(line)).join('\n').trim();
  const stat = tryGit('show', '--shortstat', '--format=', 'HEAD');
  const number = pattern => Number((stat.match(pattern) || [])[1] || 0);
  const branch = tryGit('rev-parse', '--abbrev-ref', 'HEAD');
  const base = repoUrl();
  return {
    generatedAt: new Date().toISOString(),
    branch: branch && branch !== 'HEAD' ? branch : process.env.WORKERS_CI_BRANCH || process.env.CF_PAGES_BRANCH || process.env.GITHUB_REF_NAME || 'detached HEAD',
    commit: {
      hash, short: shortHash, subject, body, authoredAt, committedAt,
      url: base ? base + '/commit/' + hash : '',
      tags: tryGit('tag', '--points-at', 'HEAD').split('\n').filter(Boolean),
      parents: tryGit('rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length - 1,
      files: number(/(\d+) files? changed/), insertions: number(/(\d+) insertions?/), deletions: number(/(\d+) deletions?/)
    },
    author, committer, coAuthors,
    commitCount: Number(tryGit('rev-list', '--count', 'HEAD')) || 0,
    dirty: Boolean(tryGit('status', '--porcelain'))
  };
}

try {
  writeFileSync(out, JSON.stringify(build(), null, 2) + '\n');
  console.log('Wrote dist/version.json');
} catch (error) {
  rmSync(out, { force: true });
  console.warn('Skipped dist/version.json (' + (error.message || error).split('\n')[0] + ')');
}
