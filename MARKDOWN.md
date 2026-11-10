# Blog Markdown reader

Run `npm run dev`, open http://localhost:5173/, and enter `blog --demo` to preview the reader. The preview is not a published post; `blog` keeps its empty state until you add one.

## Author a post

Publishing takes two steps:

1. Write the Markdown in a `.md` file inside `dist/posts/` and deploy it (`npm run deploy`). A file on its own is not listed anywhere.
2. Add the post's metadata to the `terminal-config-posts` remote config flag in PostHog. Edit the JSON payload in the PostHog UI so it is validated:

```json
[
  { "slug": "my-post", "title": "My post", "date": "2026-11-02", "file": "posts/my-post.md" }
]
```

`dist/content.js` ships `posts: []` on purpose; do not list posts there. The payload lands in `SITE.posts`, and changes apply on the next `blog` command without a reload or redeploy. Each entry needs all four fields: a slug of letters, digits and hyphens (up to 100 characters, starting with a letter or digit), a title up to 160 characters, a `YYYY-MM-DD` date, and a same-origin `.md` path up to 200 characters. Invalid entries and repeated slugs are dropped, and only the first 50 entries are read. An empty array `[]` keeps the empty blog.

Without PostHog (local hosts such as `localhost` and `127.0.0.1`, Do Not Track, Global Privacy Control, a blocked script) the post list stays empty, so preview Markdown locally with `blog --demo`. The `terminal-blog` feature flag can switch the blog off; `blog`, slugs, dates and `--demo` then print a short notice instead.

Visitors enter `blog my-post` or `blog 2026-11-02` to read it. If several posts share a date, the date command opens a selection of those posts rather than choosing one silently.

Enter `blog` to browse five posts per page. `1) Exit Selection` always comes first; posts are numbered from 2 and display `Title · YYYY-MM-DD`. `7) View Next Page` appears only when more posts remain. Each page restarts its numbering, and the last page has no next-page choice. Posts keep their order from the payload, so list the newest first if that is the order you want.

Use Up/Down and Enter, type a number and press Enter, or click/tap a row. The first post is selected initially. Escape or option 1 exits selection; another command also exits. Arrow-key history resumes outside selection, and Ctrl L clears it with the transcript. Empty blogs keep the no-posts message without a menu. Opened posts show `date · slug` beneath their title, not in the selection. Opening any post anchors the transcript at its echoed blog command, even for short posts and legacy plain-text posts. File loading and errors keep that same starting point instead of jumping to the bottom.

File paths are relative to the site page and must point to same-origin `.md` files. No build step or backend is needed. Keep the `posts/` folder when deploying `dist/`, including when hosting under a subpath. Serve the site over HTTP rather than opening `index.html` directly.

`blog --demo` reads `dist/posts/markdown-demo.md` (set by `SITE.markdownDemo` in `dist/content.js`), so you can edit that file and rerun the command to preview changes without publishing a post. To preview a real draft, temporarily copy it over the demo file or point `markdownDemo.file` at it, and revert before committing.

Links and images inside a Markdown file resolve relative to that file; fragment links stay on the reader page. Failed requests show a readable error and can be retried with the same command. HTML stays literal text, including in file-backed posts.

The reader still supports inline `markdown` strings and legacy `body: ['Paragraph.', 'Another paragraph.']` arrays of literal plain-text paragraphs, but the PostHog payload accepts only file-backed posts. Those formats are kept for a local `SITE.posts` and the test fixtures. In a JavaScript template literal, escape backticks and `${`. A `file` takes precedence over inline `markdown`, which takes precedence over `body`. A failed file load shows an error rather than silently displaying stale inline content.

## Callouts

Use a blockquote with a marker on its own first line. Callout bodies support Markdown and multiple paragraphs; prefix every line, including blank lines, with `>`.

```markdown
> [!NOTE]
> Useful information.

> [!HEADS UP]
> Something to watch for.

> [!CONTEXT]
> Background for the reader.

> [!QUOTE]
> A quotation worth keeping.

> [!DISCLAIMER]
> Educational notes, not professional advice.
```

Markers are case insensitive. `HEADS-UP` and `HEADS_UP` also work. Unknown markers remain ordinary blockquotes.

## Supported formatting

The dependency-free reader supports ATX and setext headings, paragraphs, bold and italic emphasis, strikethrough, inline code, fenced and indented code blocks, hard breaks, horizontal rules, blockquotes, nested lists, ordered starts, disabled task checkboxes, pipe tables with alignment, links, reference links, images, HTTP(S) autolinks, and the five callouts. Soft line breaks render as spaces, as in GitHub prose.

This is a GitHub-style subset, not a full CommonMark/GFM implementation. It does not include syntax highlighting, footnotes, math, emoji shortcodes, GitHub issue/mention resolution, automatic heading permalinks, or HTML parsing. Images load from the URL the author supplies; no image proxy is used.

HTML is displayed as literal text. All output uses DOM elements and text nodes, never `innerHTML`. URL attributes allow HTTP(S), mailto links, relative paths, and fragments. Executable schemes and data URLs are rejected. Code blocks remain literal. Recursion is capped to keep malformed nested input bounded.

## Implementation and checks

`dist/markdown.js` owns parsing and DOM rendering. `dist/terminal.js` connects it to the blog command; `dist/style.css` scopes reader styles to `.markdown-body` and uses existing Catppuccin tokens. The terminal owns the paginated blog selector and date lookup. `dist/remote.js` validates the PostHog post payload and the `terminal-blog` flag before the terminal reads `SITE.posts`.

`npm run check` syntax-checks all JavaScript and enforces the no-HTML-parsing rule. `npm test` covers the reader alongside the existing terminal/theme tests in `tests/theme.test.cjs`. `npm run test:e2e` runs the blog command in real headless Chrome at exact desktop and mobile viewport sizes, including theme changes and security checks. It uses an isolated temporary browser profile and a local ephemeral HTTP server, with no npm packages. It requires Chrome/Chromium; set `CHROME_BIN` if it is not in a standard install location.
