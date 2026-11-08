// PostHog feature flags and remote config for the terminal.
// Flags gate the blog, funding and projects commands; remote config flags carry
// JSON payloads that fill SITE.posts, SITE.projects, SITE.socials and SITE.funding.
// content.js ships those lists empty, so when PostHog is not loaded (local hosts,
// Do Not Track, Global Privacy Control, blocked scripts, slow networks) or a payload
// is missing or invalid, the section is empty and the terminal shows its empty state.
// Every section stays on unless PostHog explicitly answers that its flag is off.
(() => {
  'use strict';
  const flagKeys = { blog: 'terminal-blog', funding: 'terminal-funding', projects: 'terminal-projects' };
  const configKeys = {
    posts: 'terminal-config-posts',
    projects: 'terminal-config-projects',
    socials: 'terminal-config-socials',
    funding: 'terminal-config-funding'
  };
  const timeoutMs = 1500;
  const maxItems = 50;
  const site = window.SITE || (window.SITE = {});
  const flags = { blog: true, funding: true, projects: true };
  const sources = { posts: 'local', projects: 'local', socials: 'local', funding: 'local' };
  // Local values (empty by default), restored when a payload later disappears or turns invalid.
  const defaults = { posts: site.posts, projects: site.projects, socials: site.socials, funding: site.funding };
  const analytics = window.terminalAnalytics;
  const live = Boolean(analytics?.enabled && window.posthog);
  let settled = false;
  let reported = false;
  let timer;
  let finish;
  const waiters = [];
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

  // Returns a clean array, or undefined when the payload is unusable.
  function validate(kind, payload) {
    try {
      const value = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!Array.isArray(value)) return undefined;
      const seen = new Set();
      const items = value.slice(0, maxItems).map(parsers[kind]).filter(item => {
        if (!item) return false;
        if (kind === 'posts') { if (seen.has(item.slug)) return false; seen.add(item.slug); }
        return true;
      });
      // A deliberate empty array keeps the honest empty state; a non-empty payload with no valid items is a mistake.
      return value.length && !items.length ? undefined : items;
    } catch { return undefined; }
  }

  // True once PostHog has really answered (not blocked, offline or still loading).
  function answered(posthog) {
    try {
      if (Object.values(flagKeys).concat(Object.values(configKeys)).some(key => posthog.getFeatureFlag?.(key, { send_event: false }) !== undefined)) return true;
      return posthog.featureFlags?.hasLoadedFlags === true && !posthog.featureFlags?.errorsLoading;
    } catch { return false; }
  }

  function load() {
    const posthog = window.posthog;
    if (!live || !posthog) return;
    const heard = answered(posthog);
    Object.entries(flagKeys).forEach(([section, key]) => {
      let value;
      try { value = posthog.getFeatureFlag?.(key, { send_event: false }); } catch { value = undefined; }
      // Off when PostHog says false, or when it answered without the flag (inactive or deleted). Fail open otherwise.
      flags[section] = heard ? value !== false && value !== undefined : true;
    });
    Object.entries(configKeys).forEach(([kind, key]) => {
      let items;
      try { items = validate(kind, posthog.getFeatureFlagPayload?.(key)); } catch { items = undefined; }
      if (items) { site[kind] = items; sources[kind] = 'remote'; return; }
      // Missing or invalid: go back to the bundled content if a remote value was applied earlier.
      if (sources[kind] === 'remote') site[kind] = defaults[kind];
      sources[kind] = 'fallback';
    });
  }

  // Ask PostHog again and wait (briefly) for its answer, so each command follows the current flags.
  function refresh() {
    if (!live) return Promise.resolve();
    return new Promise(resolve => {
      const waiter = { resolve, timer: undefined };
      waiter.timer = setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); load(); settle(); resolve(); }, timeoutMs);
      waiters.push(waiter);
      try { window.posthog.reloadFeatureFlags(); } catch { waiters.splice(waiters.indexOf(waiter), 1); clearTimeout(waiter.timer); load(); settle(); resolve(); }
    });
  }

  function answer() {
    load(); settle();
    waiters.splice(0).forEach(waiter => { clearTimeout(waiter.timer); waiter.resolve(); });
  }

  function settle() {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    finish();
    if (reported) return;
    reported = true;
    try {
      analytics?.track('remote_config_loaded', {
        enabled: live,
        flags_off: Object.keys(flags).filter(section => !flags[section]),
        remote: Object.keys(sources).filter(kind => sources[kind] === 'remote'),
        fallback: Object.keys(sources).filter(kind => sources[kind] === 'fallback')
      });
    } catch { /* Analytics must never break the terminal. */ }
  }

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
  // Commands wait at most timeoutMs; late flags still apply to later commands.
  timer = setTimeout(() => { load(); settle(); }, timeoutMs);
  try {
    window.posthog.onFeatureFlags(answer);
  } catch { settle(); }
})();
