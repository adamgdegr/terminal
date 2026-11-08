// PostHog feature flags and remote config for the terminal.
// Flags gate the blog, funding and projects commands; remote config flags carry
// JSON payloads that replace SITE.posts, SITE.projects, SITE.socials and
// SITE.funding. content.js stays the fallback: when PostHog is not loaded (local
// hosts, Do Not Track, Global Privacy Control, blocked scripts, slow networks) or
// a payload is missing or invalid, the local values are used and every section stays on.
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
  const analytics = window.terminalAnalytics;
  const live = Boolean(analytics?.enabled && window.posthog);
  let settled = false;
  let reported = false;
  let timer;
  let finish;
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

  function load() {
    const posthog = window.posthog;
    if (!live || !posthog) return;
    Object.entries(flagKeys).forEach(([section, key]) => {
      try { flags[section] = posthog.getFeatureFlag?.(key, { send_event: false }) !== false; } catch { flags[section] = true; }
    });
    Object.entries(configKeys).forEach(([kind, key]) => {
      let items;
      try { items = validate(kind, posthog.getFeatureFlagPayload?.(key)); } catch { items = undefined; }
      if (items) { site[kind] = items; sources[kind] = 'remote'; } else sources[kind] = 'fallback';
    });
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
    window.posthog.onFeatureFlags(() => { load(); settle(); });
  } catch { settle(); }
})();
