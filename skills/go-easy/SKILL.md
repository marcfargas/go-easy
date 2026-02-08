---
name: go-easy
description: Google APIs made easy — Gmail, Drive, Calendar. Unified library and gateway CLIs (go-gmail, go-drive, go-calendar) for AI agents. Use when user needs to work with Gmail, Google Drive, or Google Calendar. Replaces gmcli, gdcli, gccli.
---

# go-easy — Google APIs Made Easy

TypeScript library and gateway CLIs for Gmail, Drive, and Calendar.
Designed for AI agent consumption with structured JSON output and safety guards.

> **First use**: `npx` will download go-easy and dependencies (~23 MB) on the first call.
> Advise the user of a possible delay on the first response.

## Architecture

- **Library** (`go-easy/gmail`, `go-easy/drive`, `go-easy/calendar`, `go-easy/auth`): Importable modules
- **Gateway CLIs** (`npx go-gmail`, `npx go-drive`, `npx go-calendar`): Always JSON output, `--confirm` for destructive ops

## Available Services

| Service | Gateway CLI | Status | Details |
|---------|-------------|--------|---------|
| Gmail | `npx go-gmail` | ✅ Ready | [gmail.md](gmail.md) |
| Drive | `npx go-drive` | ✅ Ready | [drive.md](drive.md) |
| Calendar | `npx go-calendar` | ✅ Ready | [calendar.md](calendar.md) |

**Read the per-service doc for full command reference and examples.**

## Auth

Uses tokens from existing CLI stores (Phase 1 — zero re-auth):
- `~/.gmcli/accounts.json` → Gmail tokens
- `~/.gdcli/accounts.json` → Drive tokens  
- `~/.gccli/accounts.json` → Calendar tokens

All share the same OAuth2 client (clientId/clientSecret), with separate refresh tokens per service.

```bash
# Check available accounts
npx go-gmail marc@blegal.eu profile
```

## Safety Model

Operations are classified:
- **READ** — no gate (search, get, list)
- **WRITE** — no gate (create draft, label, upload)
- **DESTRUCTIVE** — blocked unless `--confirm` flag is passed (send, reply, forward, delete, trash, public share)

Without `--confirm`, destructive commands show what WOULD happen and exit with code 2.

## Project Location

```
C:\dev\go-easy
```

## Quick Start (for agents)

Load the per-service doc for the full reference:
- Gmail → [gmail.md](gmail.md)
- Drive → [drive.md](drive.md)
- Calendar → [calendar.md](calendar.md)
