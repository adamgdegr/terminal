# Personal terminal

This guidance applies to the entire repository.

## Project and content

- Adam Garza's personal portfolio and blog. Use `README.md` as the source for his bio, certifications, and social links.
- Dependency-free static HTML/CSS/JavaScript. `dist/` is the deployable site; keep asset URLs relative for subpath hosting.
- Edit `dist/content.js` for bio, projects, socials, funding, and posts. Keep honest empty states until real posts or funding links are supplied.
- Register published posts in `SITE.posts` with `slug`, `title`, `date`, and preferably `file: 'posts/my-post.md'`; store Markdown files in `dist/posts/`. Visitors read them with `blog SLUG` or `blog YYYY-MM-DD`. If multiple posts match a date, show a selector for those matches; an exact slug match takes precedence.
- Post content precedence is `file`, then inline `markdown`, then legacy `body` arrays of literal plain-text paragraphs. Keep all three formats working; a failed file load must show an error rather than fall back to inline content.
- `SITE.markdownDemo` points to `dist/posts/markdown-demo.md`. `blog --demo` previews it without adding a published post; preserve the empty blog state while `SITE.posts` is empty.
- Render content with DOM elements and text nodes, never `innerHTML` or HTML parsing. Commands execute only browser logic, never shell code.

## Markdown reader

- Use `MARKDOWN.md` for authoring examples and the supported-formatting reference. This is a dependency-free GitHub-style subset, not full CommonMark/GFM; do not claim unsupported features such as syntax highlighting or HTML support.
- `dist/markdown.js` exposes `window.blogMarkdown.render(parent, source)` and owns parsing and safe DOM rendering. `dist/terminal.js` owns asynchronous file loading and blog command integration. Reader styles live under `.markdown-body` in `dist/style.css` and use existing theme tokens.
- Preserve script order in `dist/index.html`: `theme.js` runs before styles; deferred `analytics.js`, `content.js` and `markdown.js` load before `terminal.js`.
- File paths resolve from `document.baseURI` and must be same-origin `.md` URLs. Reject failed HTTP responses and HTML content types. Serve over HTTP; retain `dist/posts/` and relative asset paths when deploying under a subpath.
- Resolve links and images inside file-backed posts relative to the Markdown file, but keep fragment links on the reader page. Show accessible loading and retryable error messages; a pending request must not restore a cleared transcript.
- Support Note, Heads Up, Context, Quote, and Disclaimer callouts with `> [!NOTE]`, `> [!HEADS UP]`, `> [!CONTEXT]`, `> [!QUOTE]`, and `> [!DISCLAIMER]`. Markers are case insensitive; `HEADS-UP` and `HEADS_UP` are aliases. Unknown markers remain ordinary blockquotes; callout bodies support Markdown.
- Keep HTML literal, code blocks inert, task checkboxes disabled, and parsing recursion bounded. Reject executable schemes and data URLs; allow safe HTTP(S), relative, and fragment destinations, plus `mailto:` for links only. Images load directly from author-supplied URLs, without a proxy.

## Terminal experience

- Fill the viewport (`100vw` × `100dvh`), with a scrolling transcript above a bottom status strip. No outer header, footer, window controls, border, or shadow.
- Startup shows the welcome/MOTD and a plain `help` hint. Reveal sections through typed commands; command names and blog entries are plain text, while external links in output remain actionable.
- Commands: `help`, `about`, `projects`, `blog`, `socials`, `funding`, `motd`, `clear`, `date`, `whoami`, `theme`.
- `blog` opens a selector in `SITE.posts` order with five posts per page. Keep `1) Exit Selection` fixed; number posts from 2, with `Title · date` labels and no slugs. Show `7) View Next Page` only while more posts remain, and reset numbering on each page. Opened posts show `date · slug` below the title. Empty blogs have no selector.
- In selection, Up/Down wraps through choices and Enter opens the highlighted row; a typed number plus Enter and native button click/tap also work. Initially highlight the first post. Escape or option 1 exits; other commands dismiss selection, and Ctrl L clears it. Disable stale transcript choices. Preserve Tab completion and IME input. Outside selection, keep arrow-key history and Escape to discard input. History is session-only.
- Opening a post (slug, date, selector, or demo) anchors the transcript at its echoed command for every post length and content format, including loading and errors. Never auto-scroll a post to the bottom or let a stale fetch move a newer command.
- Use native monospace typography and text-first content. Keep motion brief and honor reduced motion. Use 16px input text on mobile to prevent browser zoom; adapt spacing at 650px.

## Catppuccin themes

- `dist/themes.css` owns theme tokens; `dist/style.css` owns layout and component styles. Use tokens for text, surfaces, errors, selection, focus, caret, and scrollbars.
- Follow the device by default: Latte for light mode, Mocha for dark mode, including live changes. Support Frappé and Macchiato as additional dark themes.
- `dist/theme.js` runs before styles paint to prevent a light flash; keep the CSS device-preference fallback.
- `theme latte|frappe|macchiato|mocha` saves a browser-local override; `theme system` clears it and resumes device sync. The terminal must work when storage is blocked; synchronize changes across tabs.
- Palette source: https://github.com/catppuccin/palette. Latte green (`#38732b`) and blue (`#1b5cdd`) are darkened for small-text contrast; preserve readable contrast in each palette.
- No cookies or external font requests. Local storage holds the manual theme choice and PostHog's anonymous visitor ID.

## Analytics (PostHog)

- `dist/analytics.js` owns PostHog: the official loader snippet, the project key, US host (`us.i.posthog.com`), `defaults: '2026-05-30'` (pageviews, page leaves with time on page, autocapture, web vitals), `persistence: 'localStorage'` (no cookies), `person_profiles: 'identified_only'`, and `respect_dnt`.
- PostHog never loads on `localhost`, `127.x`, `0.0.0.0`, `[::1]`, `*.local`, or `file:`, nor for visitors sending Do Not Track or Global Privacy Control. Events still go to `window.terminalAnalytics.events` (last 50) for debugging and tests.
- `dist/terminal.js` calls `terminalAnalytics.track()` through a guarded `track()` helper; analytics failures or a missing module must never break a command. Every event carries the current `theme`.
- Custom events: `terminal_command` (command, source typed/selection, argument_count, command_number, seconds_since_load; theme names and blog argument type only), `theme_changed`, `blog_selector_opened`, `blog_page_viewed`, `post_opened` (slug, title, date, via slug/date/selection/demo, format), `post_read` (seconds, scroll_depth %, reason command/clear/hidden; sent on leaving a post), `post_load_failed`, `post_not_found`, and `link_clicked` (label, url, host, outbound, section command, in_post, post_slug; click and middle-click, sent by beacon).
- Privacy: unknown commands record only their first word (`attempted`, 32 chars); never record free-form arguments, raw blog queries, or typed input. `outboundHosts` in `superbot.app.json` stays empty because PostHog requests come from the visitor's browser.

## Develop and verify

- Run `npm run dev` (or `npm start`), then open http://localhost:5173; set `PORT` to serve on another port. Requires Python 3 for the server and Node.js for checks; no install or build step is needed.
- Run `npm run check` for syntax checks on all browser JavaScript (including `analytics.js`) and `npm test` for unit tests in `tests/theme.test.cjs`. Extend the existing fixtures and helpers rather than creating a parallel test suite.
- Unit coverage includes device and manual themes, cross-tab sync, blocked storage, keyboard controls, typing animation, reduced motion, and text contrast. Reader tests cover formatting, callout aliases, literal HTML, unsafe URLs, malformed input, legacy posts, file loading under subpaths, rejected file paths, and clearing during a pending fetch. Analytics tests cover the PostHog config and queue, local/DNT/GPC opt-outs, command and argument privacy, post open/read/failure events, link clicks, and silent tracking failures; the `terminal()` fixture stubs `terminalAnalytics` and exposes `app.analytics`.
- Run `npm run test:e2e` for real Chromium desktop/mobile blog flows in `tests/browser.test.cjs` (1280×900 and 390×844). It starts an ephemeral HTTP server and isolated temporary browser profiles without npm dependencies. Chrome/Chromium is required; use `CHROME_BIN` for a nonstandard binary location.
- Browser tests exercise the empty blog, demo and published posts, all four themes and five callouts, plus command anchoring for short/long and legacy posts, Markdown file assets, missing-file errors, HTML/URL safety, Tab completion, and horizontal overflow. Selector coverage includes page boundaries, keyboard and numbered selection, click/tap, date collisions, exit/clear cleanup, restored history, and mobile touch targets. They also assert PostHog stays unloaded on 127.0.0.1 while commands, demo reads, and link clicks reach the in-memory event log. Test fixtures own their post arrays independently of published content.
- For reader or terminal changes, run all three checks and inspect the live page. Keep `MARKDOWN.md` current when authoring behavior or supported syntax changes. `superbot.app.json` records the static deployment configuration; no backend, bindings, or secrets are currently required.
