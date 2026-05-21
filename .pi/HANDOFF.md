# go-easy — Handoff

> Last updated: 2026-02-08 11:39

## What is this?

`go-easy` replaces three CLI tools (`gmcli`, `gdcli`, `gccli`) with a single TypeScript library providing thin wrappers over Google's `googleapis` SDK. Designed for AI agent consumption (pi coding agent) but usable by humans too.

## What's done

### Scaffold (complete)
- Project structure, `package.json`, `tsconfig.json`
- `npm install` clean, `tsc --noEmit` passes
- Git initialized

### Core modules (complete)
- **`src/auth.ts`** — OAuth2 client factory. Imports tokens from existing CLI stores (`~/.gmcli/`, `~/.gdcli/`, `~/.gccli/`). Multi-account support. Caches clients.
- **`src/safety.ts`** — Operation guard. READ/WRITE pass through, DESTRUCTIVE blocked unless `SafetyContext.confirm()` returns true. Default: block everything.
- **`src/errors.ts`** — `GoEasyError` → `AuthError`, `NotFoundError`, `QuotaError`, `SafetyError`

### Gmail module (complete — code + tests)
- **`src/gmail/index.ts`** — `search`, `getMessage`, `getThread`, `send`, `reply`, `forward`, `batchModifyLabels`, `listLabels`, `createDraft`, `sendDraft`, `listDrafts`, `getAttachmentContent`
- **`src/gmail/types.ts`** — `GmailMessage`, `GmailThread`, `ListResult<T>`, `WriteResult`, `SendOptions`, `ReplyOptions`, `ForwardOptions`, `BufferAttachment`, etc.
- **`src/gmail/helpers.ts`** — MIME builder (plain + HTML + attachments + forward), header extraction, body parsing, base64url encoding
- **`src/bin/gmail.ts`** — Gateway CLI `go-gmail <account> <command>`, always JSON output, `--confirm` flag for destructive ops

### Tests (complete — 97 tests, all passing)
- `test/errors.test.ts` — 10 tests (error hierarchy, toJSON, inheritance)
- `test/safety.test.ts` — 9 tests (guard behavior, context switching)
- `test/auth.test.ts` — 12 tests (token loading, caching, errors)
- `test/gmail/helpers.test.ts` — 34 tests (all helper functions including buildForwardMime)
- `test/gmail/index.test.ts` — 32 tests (all gmail functions, error handling)

### Pi skill files (complete)
- `~/.pi/agent/skills/go-easy/SKILL.md` — entry point with service routing
- `~/.pi/agent/skills/go-easy/gmail.md` — full Gmail reference (CLI + library API)

### Stubs (types only, no implementation)
- `src/drive/` — `DriveFile`, `DrivePermission`, `ExportFormat`
- `src/calendar/` — `CalendarEvent`, `Attendee`, `CalendarInfo`, `FreeBusySlot`

## What's NOT done

### Soon
1. **Smoke test** — verify `getAuth('gmail')` + `gmail.search()` works against real Gmail API
2. **Build + link** — `npm run build` and `npm link` to make `go-gmail` CLI available globally

### Later (Phase 2-3)
3. Drive module implementation
4. Calendar module implementation
5. Drive/Calendar gateway CLIs + skill files
6. Migration cutover (update pi skills to use go-easy, retire CLI references)
7. Auth Phase 2: unified token store at `~/.go-easy/` with combined scopes

## Key design decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Package name | `go-easy` (unscoped) | May scope under `@marcfargas` later |
| Abstraction level | Thin wrappers over `googleapis` | Don't rewrite — simplify signatures and parse responses |
| Safety | Library-level `safety.ts` | More robust than gateway-only; catches agents that skip skills |
| Auth (MVP) | Import existing CLI tokens | Zero re-auth friction. Each service gets its own refresh token. |
| Output | Always JSON | No human-formatted text — eliminates lossy re-parsing |
| Gateway CLI names | `go-gmail`, `go-drive`, `go-calendar` | Per-service, not monolithic |
| Forward impl | BufferAttachment type | Original attachments come from API as Buffers, not filesystem |

## Auth details

All three CLIs use the same OAuth2 client (same `clientId`/`clientSecret`). Each has separate refresh tokens per service per account. Token files at:
- `~/.gmcli/accounts.json` — 2 accounts (marc@blegal.eu, telenieko@gmail.com)
- `~/.gdcli/accounts.json` — 2 accounts
- `~/.gccli/accounts.json` — 1 account (marc@blegal.eu only)

## Design source

Full 4-model design review and synthesis at:
`C:\dev\mypi\experiments\pi-integration-strategy\reviews\google-lib\synthesis.md`
