# go-easy — Project Instructions

> Google APIs made easy — Gmail, Drive, Calendar for AI agents and humans.

## Language

English — all code, docs, and commits.

## Overview

`go-easy` is a TypeScript library providing thin wrappers over Google's official `googleapis` SDK. It simplifies OAuth2 auth, provides agent-friendly function signatures, structured JSON output, and safety checks for destructive operations.

### Architecture

- **Library** (`src/`): Importable modules — `go-easy/gmail`, `go-easy/drive`, `go-easy/calendar`, `go-easy/auth`
- **Gateways** (`src/bin/`): CLI entry points (`go-gmail`, `go-drive`, `go-calendar`) — always output JSON, enforce safety via `--confirm` flag
- **Auth**: Phase 1 imports tokens from existing CLI stores (`~/.gmcli/`, `~/.gdcli/`, `~/.gccli/`)

### Key Design Decisions

1. **Thin wrappers over `googleapis`** — don't rewrite the wheel, simplify signatures
2. **JSON output always** — no human-formatted text from gateways
3. **Safety via `safety.ts`** — `guardOperation()` blocks destructive ops unless confirmed
4. **Agent-first** — types, errors, and function signatures designed for AI agent use
5. **Progressive skill loading** — SKILL.md routes to per-service docs (Odoo pattern)

## Structure

| Path | Purpose |
|------|---------|
| `src/auth.ts` | OAuth2 client factory, multi-account, token import |
| `src/safety.ts` | Safety context and operation guard |
| `src/errors.ts` | Error hierarchy (GoEasyError, AuthError, etc.) |
| `src/gmail/` | Gmail module (search, send, reply, forward, labels, drafts) |
| `src/drive/` | Drive module (stub — phase 2) |
| `src/calendar/` | Calendar module (stub — phase 3) |
| `src/bin/` | Gateway CLIs |
| `test/` | Vitest tests |

## Implementation Phases

| Phase | Module | Status |
|-------|--------|--------|
| 1 | Auth + Gmail (P0: search, get, thread, send, reply) | **In progress** |
| 1b | Gmail P1 (forward, batch labels, drafts) | Pending |
| 1c | Gmail P2 (updateDraft, listDrafts, downloadAttachment) | Pending |
| 1d | Gmail gateway + pi skill | Pending |
| 2 | Drive (list, search, download, upload, export, share, Shared Drives) | Pending |
| 3 | Calendar (list, create, update, delete, free/busy) | Pending |

## Conventions

- All functions take `OAuth2Client` as first param (from `getAuth()`)
- Return types: `GmailMessage`, `ListResult<T>`, `WriteResult` — never raw API responses
- Errors: always throw from the `GoEasyError` hierarchy
- Safety: DESTRUCTIVE ops call `guardOperation()` before executing
- Tests: use vitest, mock `googleapis` — never hit real API in tests
- Gateway output: always `JSON.stringify(result, null, 2)` to stdout

## Auth (Phase 1 — Token Import)

Existing CLI tools store tokens at:
- `~/.gmcli/accounts.json` — Gmail
- `~/.gdcli/accounts.json` — Drive  
- `~/.gccli/accounts.json` — Calendar

Format: `[{ email, oauth2: { clientId, clientSecret, refreshToken } }]`

Same clientId/clientSecret across all three. Different refresh tokens per service.
`getAuth(service, email?)` loads the right token and returns an OAuth2Client.

## Naming

Package name: `go-easy` (Google Easy). Currently unscoped.
May be scoped under `@marcfargas/go-easy` once npm scope is set up.
Gateway CLIs: `go-gmail`, `go-drive`, `go-calendar`.

## Design Docs

Full design synthesis at: `C:\dev\mypi\experiments\pi-integration-strategy\reviews\google-lib\synthesis.md`
