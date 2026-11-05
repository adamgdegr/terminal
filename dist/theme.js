  // Run before styles paint so a dark device never flashes the light palette.
(() => {
  'use strict';
  const options = ['system', 'latte', 'frappe', 'macchiato', 'mocha'];
  const backgrounds = { latte: '#eff1f5', frappe: '#303446', macchiato: '#24273a', mocha: '#1e1e2e' };
  const storageKey = 'adamgdegr.theme';
  const device = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (options.includes(saved)) preference = saved;
  } catch { /* Storage can be blocked; theming still works for this visit. */ }

  function current() {
    return preference === 'system' ? (device.matches ? 'mocha' : 'latte') : preference;
  }
  function apply() {
    const theme = current();
    document.documentElement.dataset.theme = theme;
    const label = document.querySelector('#theme-status');
    if (label) label.textContent = `catppuccin / ${theme}${preference === 'system' ? ' (system)' : ''}`;
    const browserColor = document.querySelector('meta[name="theme-color"]');
    if (browserColor) browserColor.content = backgrounds[theme];
  }
  window.terminalTheme = {
    options,
    current,
    preference: () => preference,
    set(value) {
      if (!options.includes(value)) return false;
      preference = value;
      try {
        if (value === 'system') window.localStorage.removeItem(storageKey);
        else window.localStorage.setItem(storageKey, value);
      } catch { /* Keep the in-memory preference if persistence is unavailable. */ }
      apply();
      return true;
    }
  };
  device.addEventListener('change', apply);
  // Keep open tabs consistent when a manual preference changes elsewhere.
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = options.includes(event.newValue) ? event.newValue : 'system';
    apply();
  });
  document.addEventListener('DOMContentLoaded', apply);
  apply();
})();
