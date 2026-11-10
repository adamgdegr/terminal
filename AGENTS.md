# Personal terminal

This guidance applies to the entire repository.

## Project and content

- Adam Garza's personal portfolio and blog. Use `README.md` as the source for his bio, certifications, and social links.
- Dependency-free static HTML/CSS/JavaScript. `dist/` is the deployable site; keep asset URLs relative for subpath hosting.
- Edit `dist/content.js` for the bio, location, certifications and studying list. Projects, posts, socials and funding links are served only by PostHog remote config and ship empty in `content.js` on purpose; keep honest empty states for them when PostHog is not live.
- Publish posts by adding `{slug, title, date, file: 'posts/my-post.md'}` to the `terminal-config-posts` payload in PostHog (they land in `SITE.posts`); store Markdown files in `dist/posts/`, which still need a deploy. Visitors read them with `blog SLUG` or `blog YYYY-MM-DD`. If multiple posts match a date, show a selector for those matches; an exact slug match takes precedence.
- Post content precedence is `file`, then inline `markdown`, then legacy `body` arrays of literal plain-text paragraphs. Keep all three formats working; a failed file load must show an error rather than fall back to inline content. The PostHog payload validator accepts file-backed posts only, so inline `markdown` and `body` posts are reachable only through a local `SITE.posts` (tests and fixtures).
- `SITE.markdownDemo` points to `dist/posts/markdown-demo.md`. `blog --demo` previews it without adding a published post; preserve the empty blog state while `SITE.posts` is empty.
- Render content with DOM elements and text nodes, never `innerHTML` or HTML parsing. Commands execute only browser logic, never shell code.

## Markdown reader

- Use `MARKDOWN.md` for authoring examples and the supported-formatting reference. This is a dependency-free GitHub-style subset, not full CommonMark/GFM; do not claim unsupported features such as syntax highlighting or HTML support.
- `dist/markdown.js` exposes `window.blogMarkdown.render(parent, source)` and owns parsing and safe DOM rendering. `dist/terminal.js` owns asynchronous file loading and blog command integration. Reader styles live under `.markdown-body` in `dist/style.css` and use existing theme tokens.
- Preserve script order in `dist/index.html`: `theme.js` runs before styles; deferred `analytics.js`, `content.js`, `remote.js` and `markdown.js` load before `terminal.js`.
- File paths resolve from `document.baseURI` and must be same-origin `.md` URLs. Reject failed HTTP responses and HTML content types. Serve over HTTP; retain `dist/posts/` and relative asset paths when deploying under a subpath.
- Resolve links and images inside file-backed posts relative to the Markdown file, but keep fragment links on the reader page. Show accessible loading and retryable error messages; a pending request must not restore a cleared transcript.
- Support Note, Heads Up, Context, Quote, and Disclaimer callouts with `> [!NOTE]`, `> [!HEADS UP]`, `> [!CONTEXT]`, `> [!QUOTE]`, and `> [!DISCLAIMER]`. Markers are case insensitive; `HEADS-UP` and `HEADS_UP` are aliases. Unknown markers remain ordinary blockquotes; callout bodies support Markdown.
- Keep HTML literal, code blocks inert, task checkboxes disabled, and parsing recursion bounded. Reject executable schemes and data URLs; allow safe HTTP(S), relative, and fragment destinations, plus `mailto:` for links only. Images load directly from author-supplied URLs, without a proxy.

## Terminal experience

- Fill the viewport (`100vw` × `100dvh`), with a scrolling transcript above a bottom status strip. No outer header, footer, window controls, border, or shadow.
- Startup shows the welcome/MOTD and a plain `help` hint. Reveal sections through typed commands; command names and blog entries are plain text, while external links in output remain actionable.
- Commands: `help`, `about`, `projects`, `blog`, `socials`, `funding`, `motd`, `clear`, `date`, `whoami`, `version`, `theme`.
- Familiar shell aliases live in the `aliases` table in `dist/terminal.js` (e.g. `ls`→`help`, `ver`/`--version`→`version`, `cat`→`blog`, `contact`→`socials`, `cls`→`clear`, `dark`/`light`→`theme mocha`/`latte`). Aliases resolve before dispatch, so analytics report the canonical command plus an `alias` property; unknown commands keep recording only their first word. `help` lists up to four aliases per command, unknown commands get a "Did you mean" hint, and Tab falls back to aliases when no command matches.
- `blog` opens a selector in `SITE.posts` order with five posts per page. Keep `1) Exit Selection` fixed; number posts from 2, with `Title · date` labels and no slugs. Show `7) View Next Page` only while more posts remain, and reset numbering on each page. Opened posts show `date · slug` below the title. Empty blogs have no selector.
- In selection, Up/Down wraps through choices and Enter opens the highlighted row; a typed number plus Enter and native button click/tap also work. Initially highlight the first post. Escape or option 1 exits; other commands dismiss selection, and Ctrl L clears it. Disable stale transcript choices. Preserve Tab completion and IME input. Outside selection, keep arrow-key history and Escape to discard input. History is session-only.
- Opening a post (slug, date, selector, or demo) anchors the transcript at its echoed command for every post length and content format, including loading and errors. Never auto-scroll a post to the bottom or let a stale fetch move a newer command.
- Use native monospace typography and text-first content. Keep motion brief and honor reduced motion. Use 16px input text on mobile to prevent browser zoom; adapt spacing at 650px.

## Remote flags and config (PostHog)

- `dist/remote.js` owns `window.terminalRemote` (`ready`, `live`, `refresh()`, `settled`, `enabled(section)`, `source(kind)`, `flags`, `sources`). `live` is true only when analytics is enabled and `window.posthog` exists. It reads PostHog and writes validated arrays onto `SITE.posts`, `SITE.projects`, `SITE.socials` and `SITE.funding`; `content.js` ships these four lists empty, so there is no bundled fallback content.
- Boolean flags `terminal-blog`, `terminal-funding` and `terminal-projects` gate those commands. A switched-off command stays listed in `help` and Tab completion and prints a fixed local notice (`disabledNotices` in `dist/terminal.js`) instead of its content; for `blog` this covers slugs, dates, selection and `--demo`. Disabled commands also record a `section_disabled` event.
- Remote config flags (`is_remote_configuration`, payload under `true`) `terminal-config-posts`, `-projects`, `-socials` and `-funding` carry JSON arrays: posts `{slug,title,date,file}` (same-origin `.md` only), projects `{name,description,url?}`, socials and funding `{name,url}`. Payloads are validated (JSON string or array, first 50 items, `http(s)` URLs, duplicate slugs dropped). Limits: slugs `^[a-z0-9][a-z0-9-]{0,99}$` (case-insensitive), dates `YYYY-MM-DD`, titles 160 chars, file paths 200, names 80, project descriptions 400. Invalid items are dropped; a non-empty payload with no valid items, or a missing payload, falls back to the (empty) `content.js` list with source `fallback`; a deliberate empty array keeps the honest empty state. Post Markdown files still ship in `dist/posts/`.
- Fail open: when PostHog is not live (local hosts, Do Not Track, GPC, blocked script) or has not answered, every section is on but empty. `projects`, `socials`, `blog` and `funding` then show their honest empty states, so a local or opted-out visit has no projects, links or posts. While PostHog is live, every `blog`, `funding`, `projects` and `socials` command (the `remoteBacked` list in `dist/terminal.js`) calls `terminalRemote.refresh()`, which reloads PostHog flags and waits at most 1.5s (accessible `Loading…` status; on timeout the last known values apply), so flag and payload edits take effect on the next command without a page reload. A superseded or cleared transcript is never acted on. Other commands do not poll.
- To switch a section off, deactivate the flag or set its rollout to 0%: a flag absent from a real PostHog answer counts as off, while no answer at all (blocked, offline, errored) fails open. A payload that is removed or invalid empties its section. Edit remote config payloads in the PostHog UI so the JSON is validated.
- `remote_config_loaded` records which flags are off and which payloads were `remote` or `fallback`; `post_opened` and `blog_selector_opened` carry `config_source`. Flags are read with `send_event: false`, so no `$feature_flag_called` events are added.
- `projects` links GitHub by finding the social named GitHub, not by position.

## Version command

- `version` shows the last commit's branch, short hash (linked to GitHub), subject, body, author, co-authors (from `Co-authored-by` trailers), committer, dates, tags, change stats, parent count for merges, commit count, whether the tree was dirty and when the file was built. Emails are never included. The commit link comes from the `origin` GitHub remote; the branch falls back to `WORKERS_CI_BRANCH`, `CF_PAGES_BRANCH` or `GITHUB_REF_NAME` on a detached HEAD.
- `scripts/version.js` (dependency-free, never fails a build) writes the git-ignored `dist/version.json`. `npm run dev`, `npm start` and `npm run deploy` run it; run `npm run build:version` to refresh it while the dev server is up. Any other deploy path must run it before publishing, or `version` reports that build information is unavailable.
- `dist/terminal.js` fetches `version.json` relative to `document.baseURI` (same origin, no HTML responses), validates and caps every field, fetches it with `cache: 'no-store'`, caches it for the session and renders text nodes only. A newer command never loses or restores a cleared transcript.

## Catppuccin themes

- `dist/themes.css` owns theme tokens; `dist/style.css` owns layout and component styles. Use tokens for text, surfaces, errors, selection, focus, caret, and scrollbars.
- Follow the device by default: Latte for light mode, Mocha for dark mode, including live changes. Support Frappé and Macchiato as additional dark themes.
- `dist/theme.js` runs before styles paint to prevent a light flash; keep the CSS device-preference fallback.
- `theme latte|frappe|macchiato|mocha` saves a browser-local override; `theme system` clears it and resumes device sync. The terminal must work when storage is blocked; synchronize changes across tabs.
- Palette source: https://github.com/catppuccin/palette. Latte green (`#38732b`) and blue (`#1b5cdd`) are darkened for small-text contrast; preserve readable contrast in each palette.
- No cookies or external font requests. Local storage holds the manual theme choice and PostHog's anonymous visitor ID.

## Analytics (PostHog)

- `dist/analytics.js` owns PostHog: the official loader snippet, the project key, reverse-proxy host `pulse.adamgd.dev` as `api_host` with `ui_host` `https://us.posthog.com`, `defaults: '2026-05-30'` (pageviews, page leaves with time on page, autocapture, web vitals), `persistence: 'localStorage'` (no cookies), `person_profiles: 'identified_only'`, and `respect_dnt`.
- PostHog never loads on `localhost`, `127.x`, `0.0.0.0`, `[::1]`, `*.local`, or `file:`, nor for visitors sending Do Not Track or Global Privacy Control. Events still go to `window.terminalAnalytics.events` (last 50) for debugging and tests.
- `dist/terminal.js` calls `terminalAnalytics.track()` through a guarded `track()` helper; analytics failures or a missing module must never break a command. Every event carries the current `theme`.
- Custom events: `terminal_command` (command, source typed/selection, argument_count, command_number, seconds_since_load; theme names and blog argument type only), `theme_changed`, `blog_selector_opened`, `blog_page_viewed`, `post_opened` (slug, title, date, via slug/date/selection/demo, format), `post_read` (seconds, scroll_depth %, reason command/clear/hidden; sent on leaving a post), `post_load_failed` (slug, file, reason), `post_not_found` (query_type only), `link_clicked` (label, url, host, outbound, section command, in_post, post_slug; click and middle-click, sent by beacon; `mailto:` links record only the scheme), `section_disabled` (command), and `remote_config_loaded` (sent once from `remote.js`).
- Privacy: unknown commands record only their first word (`attempted`, 32 chars); never record free-form arguments, raw blog queries, or typed input. PostHog requests come from the visitor's browser, so the deployment needs no outbound hosts.

## Develop and verify

- Run `npm run dev` (or `npm start`), then open http://localhost:5173; set `PORT` to serve on another port. Requires Python 3 for the server and Node.js for checks; no install or build step is needed.
- Run `npm run check` for syntax checks on all browser JavaScript (including `analytics.js`, `remote.js` and `scripts/version.js`) and `npm test` for unit tests in `tests/theme.test.cjs`. Extend the existing fixtures and helpers rather than creating a parallel test suite.
- Unit coverage includes device and manual themes, cross-tab sync, blocked storage, keyboard controls, typing animation, reduced motion, and text contrast. Reader tests cover formatting, callout aliases, literal HTML, unsafe URLs, malformed input, legacy posts, file loading under subpaths, rejected file paths, and clearing during a pending fetch. Analytics tests cover the PostHog config and queue, local/DNT/GPC opt-outs, command and argument privacy, post open/read/failure events, link clicks, and silent tracking failures; the `terminal()` fixture stubs `terminalAnalytics` and exposes `app.analytics`. Remote tests pass a fake `posthog` to `terminal({ posthog })` (which loads `remote.js` with a manual timer) and cover validation, fallback, empty arrays, flag-off notices, waiting, timeout and clearing during a pending load.
- Run `npm run test:e2e` for real Chromium desktop/mobile blog flows in `tests/browser.test.cjs` (1280×900 and 390×844). It starts an ephemeral HTTP server and isolated temporary browser profiles without npm dependencies. Chrome/Chromium is required; use `CHROME_BIN` for a nonstandard binary location.
- Browser tests exercise the empty blog, demo and published posts, all four themes and five callouts, plus command anchoring for short/long and legacy posts, Markdown file assets, missing-file errors, HTML/URL safety, Tab completion, and horizontal overflow. Selector coverage includes page boundaries, keyboard and numbered selection, click/tap, date collisions, exit/clear cleanup, restored history, and mobile touch targets. They also assert PostHog stays unloaded on 127.0.0.1 while commands, demo reads, and link clicks reach the in-memory event log. Test fixtures own their post arrays independently of published content.
- For reader or terminal changes, run all three checks and inspect the live page. Keep `MARKDOWN.md` current when authoring behavior or supported syntax changes.

## Deploy (Cloudflare Workers)

- `wrangler.jsonc` deploys `dist/` as Workers static assets (worker `terminal`, custom domain `adamgd.dev`, `workers.dev` and preview URLs on, persisted observability logs). There is no Worker script, backend, bindings or secrets.
- `npm run deploy` runs `check`, `test` and `build:version`, then `npx wrangler deploy`. `dist/_headers` sets `nosniff`, `strict-origin-when-cross-origin` referrer policy, `X-Frame-Options: DENY` and a Permissions-Policy that blocks camera, microphone and geolocation; keep it when adding assets.
- `.wrangler`, `.dev.vars*`, `superbot.app.json` and `dist/version.json` are git-ignored; `superbot.app.json` is a local leftover, not the deployment source.
