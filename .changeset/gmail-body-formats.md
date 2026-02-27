---
"@marcfargas/go-easy": minor
---

Add `--format=text`, `--format=html`, and `--format=sane-html` to `go-gmail get` — extract message body directly without parsing the full JSON response.

- `--format=text` — plain text body
- `--format=html` — raw HTML body
- `--format=sane-html` — HTML with `<script>`, event handlers, `javascript:` hrefs, and `data:` image URIs stripped (safe to render)

All formats support `--output=<path>` and `--b64encode`, matching the existing `--format=eml` contract.

New library export: `sanitizeEmailHtml(html)` from `@marcfargas/go-easy/gmail`.
New dependency: `sanitize-html`.
