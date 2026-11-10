// PostHog remote config for the terminal: one remote config flag, `terminal-config`,
// whose JSON payload switches sections off and fills the remote-served lists:
//   { "disabled": ["blog"], "posts": [...], "projects": [...], "socials": [...], "funding": [...] }
// content.js ships those lists empty, so when PostHog is not loaded (local hosts,
// Do Not Track, Global Privacy Control, blocked scripts, slow networks) or the payload
// is missing or invalid, every section is on but empty and shows its empty state.
(() => {
  'use strict';
  const configKey = 'terminal-config';
  const timeoutMs = 1500;
  const maxItems = 50;
  const site = window.SITE || (window.SITE = {});
  const flags = { blog: true, funding: true, projects: true };
  const sources = { posts: 'local', projects: 'local', socials: 'local', funding: 'local' };
  // Local values (empty by default), restored when the payload later disappears or turns invalid.
  const defaults = { posts: site.posts, projects: site.projects, socials: site.socials, funding: site.funding };
  const analytics = window.terminalAnalytics;
  const live = Boolean(analytics?.enabled && window.posthog);
  let settled = false;
  let finish;
  let answerPending;
  const ready = new Promise(resolve => { finish = resolve; });

  const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
  const safeUrl = value => {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
    } catch { return undefined; }
  };
  const sameOriginMarkdown = value => {
    if (typeof value !== 'string' || value.length > 200) return undefined;
    try {
      const base = new URL(document.baseURI);
      const url = new URL(value, base);
      return url.origin === base.origin && /\.md$/i.test(url.pathname) ? value : undefined;
    } catch { return undefined; }
  };
  const link = item => {
    const name = text(item?.name, 80), url = safeUrl(item?.url);
    return name && url ? { name, url } : undefined;
  };
  const project = item => {
    const name = text(item?.name, 80), description = text(item?.description, 400);
    if (!name || !description) return undefined;
    if (item.url === undefined || item.url === null || item.url === '') return { name, description };
    const url = safeUrl(item.url);
    return url ? { name, description, url } : undefined;
  };
  const post = item => {
    const slug = typeof item?.slug === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/i.test(item.slug) ? item.slug : undefined;
    const title = text(item?.title, 160);
    const date = typeof item?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : undefined;
    const file = sameOriginMarkdown(item?.file);
    return slug && title && date && file ? { slug, title, date, file } : undefined;
  };
  const parsers = { posts: post, projects: project, socials: link, funding: link };

  // The whole payload as a plain object, or undefined when it is missing or unusable.
  function parse(payload) {
    try {
      const value = typeof payload === 'string' ? JSON.parse(payload) : payload;
      return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
    } catch { return undefined; }
  }

  // Returns a clean array, or undefined when the list is missing or unusable.
  function validate(kind, value) {
    if (!Array.isArray(value)) return undefined;
    const seen = new Set();
    const items = value.slice(0, maxItems).map(parsers[kind]).filter(item => {
      if (!item) return false;
      if (kind === 'posts') { if (seen.has(item.slug)) return false; seen.add(item.slug); }
      return true;
    });
    // A deliberate empty array keeps the honest empty state; a non-empty list with no valid items is a mistake.
    return value.length && !items.length ? undefined : items;
  }

  function load() {
    let config;
    try { config = parse(window.posthog.getFeatureFlagPayload?.(configKey)); } catch { config = undefined; }
    const disabled = Array.isArray(config?.disabled) ? config.disabled : [];
    Object.keys(flags).forEach(section => { flags[section] = !disabled.includes(section); });
    Object.keys(sources).forEach(kind => {
      const items = config && validate(kind, config[kind]);
      if (items) { site[kind] = items; sources[kind] = 'remote'; return; }
      // Missing or invalid: go back to the bundled content if a remote value was applied earlier.
      if (sources[kind] === 'remote') site[kind] = defaults[kind];
      sources[kind] = 'fallback';
    });
  }

  function settle() {
    if (settled) return;
    settled = true;
    finish();
    try {
      analytics?.track('remote_config_loaded', {
        enabled: live,
        flags_off: Object.keys(flags).filter(section => !flags[section]),
        remote: Object.keys(sources).filter(kind => sources[kind] === 'remote'),
        fallback: Object.keys(sources).filter(kind => sources[kind] === 'fallback')
      });
    } catch { /* Analytics must never break the terminal. */ }
  }

  // Wait for PostHog's next answer, at most timeoutMs; either way apply the latest values.
  // Concurrent callers share one wait, but each still asks PostHog (via start) to answer again.
  let waiting;
  function nextAnswer(start) {
    waiting ??= new Promise(resolve => {
      let done = false;
      const timer = setTimeout(() => complete(), timeoutMs);
      function complete() {
        if (done) return;
        done = true; clearTimeout(timer); waiting = undefined; answerPending = undefined;
        load(); settle(); resolve();
      }
      answerPending = complete;
    });
    const wait = waiting;
    try { start?.(); } catch { answerPending?.(); }
    return wait;
  }

  // Ask PostHog again before each remote-backed command, so payload edits apply without a reload.
  const refresh = () => live ? nextAnswer(() => window.posthog.reloadFeatureFlags()) : Promise.resolve();

  window.terminalRemote = {
    ready,
    live,
    refresh,
    get settled() { return settled; },
    enabled: section => flags[section] !== false,
    source: kind => sources[kind],
    flags,
    sources
  };

  if (!live) { settle(); return; }
  // Late answers still apply to later commands.
  nextAnswer();
  try {
    window.posthog.onFeatureFlags(() => answerPending ? answerPending() : load());
  } catch { answerPending?.(); }
})();
