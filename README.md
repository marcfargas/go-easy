# go-easy 🟢

> Google APIs made easy — Gmail, Drive & Calendar. For AI agents and humans.

Thin TypeScript wrappers over Google's individual `@googleapis/*` packages with:
- **Simple auth** — multi-account OAuth2 with token import from existing tools
- **Agent-friendly types** — structured `GmailMessage`, `DriveFile`, `CalendarEvent`
- **Safety guards** — destructive operations (send, share, delete) require explicit confirmation
- **JSON gateways** — CLI tools that always output structured JSON
- **Progressive skills** — designed for AI agent consumption (pi coding agent)

## Installation

```bash
# As a library
npm install go-easy

# As CLI tools (no install needed)
npx go-gmail you@example.com search "is:unread"
npx go-drive you@example.com ls
npx go-calendar you@example.com events primary
```

Requires **Node.js ≥ 20**.

## Auth Setup

go-easy uses OAuth2 tokens stored per-service. Each service reads from its own token store:

| Service | Token store |
|---|---|
| Gmail | `~/.gmcli/accounts.json` |
| Drive | `~/.gdcli/accounts.json` |
| Calendar | `~/.gccli/accounts.json` |

Each `accounts.json` file contains an array of accounts:

```json
[
  {
    "email": "you@example.com",
    "oauth2": {
      "clientId": "YOUR_CLIENT_ID.apps.googleusercontent.com",
      "clientSecret": "YOUR_CLIENT_SECRET",
      "refreshToken": "YOUR_REFRESH_TOKEN"
    }
  }
]
```

To obtain credentials:
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Gmail, Drive, and/or Calendar APIs
3. Create OAuth2 credentials (Desktop application)
4. Use the OAuth2 playground or a local flow to obtain a refresh token
5. Place the token in the appropriate `accounts.json` file

## Quick Start

```ts
import { getAuth } from 'go-easy/auth';
import { search, send } from 'go-easy/gmail';

const auth = await getAuth('gmail', 'you@example.com');

// Search (READ — no safety gate)
const results = await search(auth, { query: 'is:unread from:client' });
console.log(results.items);

// Send (DESTRUCTIVE — requires safety context)
import { setSafetyContext } from 'go-easy';

setSafetyContext({
  confirm: async (op) => {
    console.log(`⚠️ ${op.description}`);
    return true; // or prompt the user
  },
});

await send(auth, {
  to: 'client@example.com',
  subject: 'Invoice attached',
  html: '<h1>Invoice</h1><p>Please find attached.</p>',
  attachments: ['./invoice.pdf'],
});
```

## Gateway CLIs

All gateway CLIs output JSON to stdout and work via `npx`:

```bash
# Gmail
npx go-gmail you@example.com search "is:unread" --max=10
npx go-gmail you@example.com get <messageId>
npx go-gmail you@example.com send --to=x@y.com --subject="Hi" --body="Hello" --confirm

# Drive
npx go-drive you@example.com ls
npx go-drive you@example.com search "quarterly report"
npx go-drive you@example.com upload ./file.pdf --folder=<folderId>

# Calendar
npx go-calendar you@example.com events primary --from=2026-02-01T00:00:00Z
npx go-calendar you@example.com create primary --summary="Meeting" --start=... --end=...
npx go-calendar you@example.com freebusy primary --from=... --to=...
```

Destructive operations require `--confirm`. Without it, they show what *would* happen and exit with code 2.

## Services

| Service | Module | Gateway | Status |
|---------|--------|---------|--------|
| Gmail | `go-easy/gmail` | `npx go-gmail` | ✅ Ready |
| Drive | `go-easy/drive` | `npx go-drive` | ✅ Ready |
| Calendar | `go-easy/calendar` | `npx go-calendar` | ✅ Ready |

### Gmail

| Function | Safety | Description |
|---|---|---|
| `search` | READ | Search messages by Gmail query |
| `getMessage` | READ | Get a single message with parsed fields |
| `getThread` | READ | Get a full conversation thread |
| `listLabels` | READ | List all labels |
| `getAttachmentContent` | READ | Download an attachment as Buffer |
| `getProfile` | READ | Get the authenticated email address |
| `createDraft` | WRITE | Create a draft (no send) |
| `listDrafts` | READ | List existing drafts |
| `batchModifyLabels` | WRITE | Add/remove labels on multiple messages |
| `send` | ⚠️ DESTRUCTIVE | Send a new email |
| `reply` | ⚠️ DESTRUCTIVE | Reply to a message (preserves thread) |
| `forward` | ⚠️ DESTRUCTIVE | Forward a message with attachments |
| `sendDraft` | ⚠️ DESTRUCTIVE | Send an existing draft |

### Drive

| Function | Safety | Description |
|---|---|---|
| `listFiles` | READ | List folder contents or query by metadata |
| `searchFiles` | READ | Full-text search inside file contents |
| `getFile` | READ | Get file metadata by ID |
| `downloadFile` | READ | Download binary files as Buffer |
| `exportFile` | READ | Export Workspace files (Docs → pdf/docx, Sheets → xlsx/csv, etc.) |
| `listPermissions` | READ | List sharing permissions on a file |
| `uploadFile` | WRITE | Upload a local file |
| `createFolder` | WRITE | Create a folder |
| `moveFile` | WRITE | Move a file to a different folder |
| `renameFile` | WRITE | Rename a file |
| `copyFile` | WRITE | Copy a file |
| `trashFile` | ⚠️ DESTRUCTIVE | Trash a file |
| `shareFile` | ⚠️ DESTRUCTIVE* | Share a file (*public sharing only; user/group is WRITE) |
| `unshareFile` | ⚠️ DESTRUCTIVE | Remove a sharing permission |

### Calendar

| Function | Safety | Description |
|---|---|---|
| `listCalendars` | READ | List all calendars for the account |
| `listEvents` | READ | List events with time range, search, pagination |
| `getEvent` | READ | Get a single event by ID |
| `queryFreeBusy` | READ | Check availability across calendars |
| `createEvent` | WRITE | Create an event (with attendees, all-day, location) |
| `updateEvent` | WRITE | Update an existing event |
| `deleteEvent` | ⚠️ DESTRUCTIVE | Delete an event (warns about attendee cancellation) |

## Safety Model

Operations are classified into three levels:

| Level | Gate | Examples |
|-------|------|----------|
| **READ** | None | search, getMessage, listLabels |
| **WRITE** | Logged | createDraft, batchModifyLabels, upload |
| **DESTRUCTIVE** | Blocked unless confirmed | send, reply, forward, share, delete |

Set up a `SafetyContext` at startup to handle confirmation prompts.
Without one, all destructive operations are blocked by default.

## Module Structure

go-easy uses **subpath exports** — import only what you need:

```ts
// Subpath imports (recommended)
import { getAuth } from 'go-easy/auth';
import { search, send } from 'go-easy/gmail';
import { listFiles, upload } from 'go-easy/drive';
import { listEvents, createEvent } from 'go-easy/calendar';
import { setSafetyContext } from 'go-easy';         // root: safety, errors, shared utils
```

| Import path | What's in it |
|---|---|
| `go-easy` | Safety context, errors, plus `gmail`/`drive`/`calendar` as namespaces |
| `go-easy/auth` | `getAuth`, `listAccounts`, `clearAuthCache` |
| `go-easy/gmail` | All Gmail operations |
| `go-easy/drive` | All Drive operations |
| `go-easy/calendar` | All Calendar operations |

The root export also re-exports each service as a namespace, so `import { gmail } from 'go-easy'` works if you prefer a single import.

## Development

```bash
npm install        # install deps
npm run build      # compile TypeScript
npm test           # run tests (vitest)
npm run lint       # type-check without emitting
npm run dev        # watch mode
```

## Contributing

Found a bug or have a feature request? [Open an issue](https://github.com/marcfargas/go-easy/issues).

## License

MIT
