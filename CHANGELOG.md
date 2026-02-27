# @marcfargas/go-easy

## 0.4.0

### Minor Changes

- [#3](https://github.com/marcfargas/go-easy/pull/3) [`5a516d5`](https://github.com/marcfargas/go-easy/commit/5a516d5bc8662a2ae9ff4b45bc3cac4c0f8b9e99) Thanks [@marcfargas](https://github.com/marcfargas)! - Add `--format=text`, `--format=html`, and `--format=sane-html` to `go-gmail get` — extract message body directly without parsing the full JSON response.

  - `--format=text` — plain text body
  - `--format=html` — raw HTML body
  - `--format=sane-html` — HTML with `<script>`, event handlers, `javascript:` hrefs, and `data:` image URIs stripped (safe to render)

  All formats support `--output=<path>` and `--b64encode`, matching the existing `--format=eml` contract.

  New library export: `sanitizeEmailHtml(html)` from `@marcfargas/go-easy/gmail`.
  New dependency: `sanitize-html`.

- [#3](https://github.com/marcfargas/go-easy/pull/3) [`5a516d5`](https://github.com/marcfargas/go-easy/commit/5a516d5bc8662a2ae9ff4b45bc3cac4c0f8b9e99) Thanks [@marcfargas](https://github.com/marcfargas)! - Add `--format=eml` for `go-gmail get` and `--format=mbox` for `go-gmail thread` — download raw RFC 2822 email or full thread as mbox.

  New output modes work with `--output=<path>` (write to file) and `--b64encode` (base64 JSON, agent-safe), or pipe raw bytes directly to stdout.

  This also fixes retrieval of `message/rfc822` embedded attachments (forwarded .eml files) which previously failed with "Invalid attachment token" — `--format=eml` returns the complete outer message via Gmail's `format=raw` API, bypassing the broken `attachments.get` endpoint.

  New library exports: `getMessageRaw(auth, messageId)`, `getThreadMbox(auth, threadId, fromAddress)`.

### Patch Changes

- [#3](https://github.com/marcfargas/go-easy/pull/3) [`5a516d5`](https://github.com/marcfargas/go-easy/commit/5a516d5bc8662a2ae9ff4b45bc3cac4c0f8b9e99) Thanks [@marcfargas](https://github.com/marcfargas)! - Internal code quality improvements — no behaviour changes.

  - Extract `gmailApi` and `handleApiError` to `src/gmail/api.ts` (eliminates duplication between `index.ts` and `raw.ts`)
  - Extract `parseFlags` and `readBodyFlags` to `src/bin/gmail-flags.ts` (enables proper test imports)
  - Extract `serializeMimePart()` MIME helper (eliminates copy-paste between `buildMimeMessage` and `buildForwardMime`)
  - Remove unused `lookup` import from `helpers.ts`
  - Fix `handleRawOutput` return type annotation

## 0.3.1

### Patch Changes

- Fix encoding of non-ASCII display names in email address headers (From, To, Cc, Bcc). Characters like "Júlia" were corrupted due to missing RFC 2047 encoding — now properly encoded as `=?UTF-8?B?...?=`.

## 0.3.0

### Minor Changes

- [`8cf8524`](https://github.com/marcfargas/go-easy/commit/8cf85243659e1151b896a69f5405534062a82899) Thanks [@marcfargas](https://github.com/marcfargas)! - Beta release — own auth system, Google Tasks, reply CLI, file-based body flags, Markdown emails.

  ### Auth (BREAKING)

  go-easy now owns its own OAuth2 tokens at `~/.go-easy/` instead of reading from legacy CLI stores (`~/.gmcli`, `~/.gdcli`, `~/.gccli`).

  - `npx go-easy auth add <email>` — agent-compatible two-phase OAuth flow (start → poll)
  - `npx go-easy auth list` — list configured accounts and scopes
  - `npx go-easy auth remove <email> --confirm` — remove an account
  - One combined token per account covers Gmail + Drive + Calendar + Tasks
  - Specific error codes with `fix` field: `AUTH_NO_ACCOUNT`, `AUTH_MISSING_SCOPE`, `AUTH_TOKEN_REVOKED`, `AUTH_NO_CREDENTIALS`

  ### Google Tasks (NEW)

  New service module and CLI for Google Tasks API:

  - `npx go-tasks <account> lists` — list task lists
  - `npx go-tasks <account> tasks <listId>` — list tasks with pagination
  - `npx go-tasks <account> get/add/update/complete/move/delete` — full CRUD
  - `npx go-tasks <account> create-list/delete-list/clear` — list management
  - Subtask support via `--parent` flag
  - Library: `@marcfargas/go-easy/tasks` export
  - Requires re-auth for existing accounts (`npx go-easy auth add <email>`)

  ### Gmail CLI

  - Add `reply` command — reply and reply-all with `--reply-all` flag (DESTRUCTIVE, requires `--confirm`)
  - Add `--in-reply-to` flag for `draft` command (thread association)
  - Add `--cc` and `--bcc` flags for `draft` and `send` commands
  - Add `--page-token` for `search` and `drafts` pagination

  ### Body Flags (BREAKING)

  Replace inline `--body`, `--html`, `--md` flags with file-based alternatives:

  - `--body-text-file=<path>` — read plain text body from UTF-8 file
  - `--body-html-file=<path>` — read HTML body from UTF-8 file
  - `--body-md-file=<path>` — read Markdown body from file (auto-converted to HTML)

  This eliminates shell escaping, encoding, and multiline issues for agent use.

  ### Markdown Email Support

  - New `markdown` option on `send`, `reply`, `forward`, and `createDraft`
  - Auto-converts Markdown to email-safe HTML with inline styles
  - GFM support: tables, strikethrough, code blocks, links, lists
  - `markdownToHtml()` helper exported from `@marcfargas/go-easy/gmail`

  ### Forward Improvements

  - Forward creates a draft by default (WRITE, no safety gate)
  - `--send-now --confirm` to send immediately (DESTRUCTIVE)
  - Attachment filtering: `--include=name` and `--exclude=name` (substring match)
  - `--no-thread` to break out of the original thread
  - Body content appears above the forwarded message

  ### Calendar

  - Support all event types: working location, out-of-office, focus time, birthday
  - `--page-token` for events pagination
  - Fix `update` command: use PATCH instead of PUT to prevent data loss on partial updates

  ### Drive

  - `--page-token` for `ls` and `search` pagination

  ### Fixes

  - RFC 2047 encode Subject headers with non-ASCII characters
  - Fix forward threading (keep in original thread by default)
  - Fix auth HTML pages: add `<meta charset="utf-8">` for emoji rendering

## 0.2.0

### Minor Changes

- [`5f424e1`](https://github.com/marcfargas/go-easy/commit/5f424e16c3c9971c2be196725a5d9c1d7e88633b) Thanks [@marcfargas](https://github.com/marcfargas)! - Initial release — Gmail, Drive & Calendar APIs for AI agents and humans.

  - Gmail: search, getMessage, getThread, send, reply, forward, createDraft, sendDraft, listDrafts, listLabels, batchModifyLabels, getAttachmentContent, getProfile
  - Drive: listFiles, searchFiles, getFile, downloadFile, exportFile, uploadFile, createFolder, moveFile, renameFile, copyFile, trashFile, listPermissions, shareFile, unshareFile
  - Calendar: listCalendars, listEvents, getEvent, createEvent, updateEvent, deleteEvent, queryFreeBusy
  - Gateway CLIs: go-gmail, go-drive, go-calendar (JSON output, --confirm safety)
  - Safety model: READ/WRITE/DESTRUCTIVE operation classification
  - Auth: multi-account OAuth2 with per-service token stores
