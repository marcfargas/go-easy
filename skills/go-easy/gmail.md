# go-easy: Gmail Reference

## Gateway CLI: `npx go-gmail`

```
npx go-gmail <account> <command> [args...] [--flags]
```

All commands output JSON to stdout. Errors output JSON to stderr with exit code 1.

### Commands

#### profile
Get authenticated account info.
```bash
npx go-gmail marc@blegal.eu profile
# → { "email": "marc@blegal.eu" }
```

#### search
Search emails using Gmail query syntax.
```bash
npx go-gmail marc@blegal.eu search "from:client is:unread"
npx go-gmail marc@blegal.eu search "subject:invoice after:2026/01/01" --max=5
```
Returns: `{ items: GmailMessage[], nextPageToken?, resultSizeEstimate? }`

#### get
Get a single message by ID.
```bash
npx go-gmail marc@blegal.eu get <messageId>
```
Returns: `GmailMessage`

#### thread
Get a full thread (conversation) by ID.
```bash
npx go-gmail marc@blegal.eu thread <threadId>
```
Returns: `{ id, snippet, messages: GmailMessage[] }`

#### labels
List all labels.
```bash
npx go-gmail marc@blegal.eu labels
```
Returns: `[{ id, name, type }]`

#### send ⚠️ DESTRUCTIVE
Send an email. Requires `--confirm`.
```bash
npx go-gmail marc@blegal.eu send \
  --to=recipient@example.com \
  --subject="Hello" \
  --body="Message body" \
  --confirm

# With CC, BCC, HTML, attachments:
npx go-gmail marc@blegal.eu send \
  --to=a@example.com \
  --cc=b@example.com \
  --bcc=c@example.com \
  --subject="Report" \
  --body="See attached" \
  --html="<p>See attached</p>" \
  --attach=report.pdf,data.xlsx \
  --confirm
```
Returns: `{ ok: true, id, threadId?, labelIds? }`

Without `--confirm`:
```json
{ "blocked": true, "operation": "gmail.send", "description": "...", "hint": "Add --confirm to execute" }
```

#### draft
Create a draft (WRITE — no `--confirm` needed).
```bash
npx go-gmail marc@blegal.eu draft \
  --to=recipient@example.com \
  --subject="Draft subject" \
  --body="Draft body"
```
Returns: `{ id, message: GmailMessage }`

#### send-draft ⚠️ DESTRUCTIVE
Send an existing draft. Requires `--confirm`.
```bash
npx go-gmail marc@blegal.eu send-draft <draftId> --confirm
```

#### drafts
List drafts.
```bash
npx go-gmail marc@blegal.eu drafts
npx go-gmail marc@blegal.eu drafts --max=5
```

#### batch-label
Batch modify labels on messages (WRITE — no `--confirm` needed).
```bash
npx go-gmail marc@blegal.eu batch-label \
  --ids=msg1,msg2,msg3 \
  --add=Label_1 \
  --remove=UNREAD
```

#### attachment
Download an attachment (returns base64).
```bash
npx go-gmail marc@blegal.eu attachment <messageId> <attachmentId>
# → { "data": "<base64>", "size": 12345 }
```

## Library API

For direct TypeScript import (when building tools, not using CLI):

```typescript
import { getAuth } from 'go-easy/auth';
import { search, getMessage, getThread, send, reply, forward,
         createDraft, sendDraft, listDrafts, listLabels,
         batchModifyLabels, getAttachmentContent, getProfile
} from 'go-easy/gmail';
import { setSafetyContext } from 'go-easy';

// Auth
const auth = await getAuth('gmail', 'marc@blegal.eu');

// Safety context (required for destructive ops)
setSafetyContext({
  confirm: async (op) => {
    console.log(`⚠️  ${op.description}`);
    return true; // or prompt user
  }
});

// Search
const results = await search(auth, { query: 'is:unread', maxResults: 10 });

// Get message
const msg = await getMessage(auth, 'messageId');

// Get thread
const thread = await getThread(auth, 'threadId');

// Send (DESTRUCTIVE — needs safety context)
const sent = await send(auth, {
  to: 'recipient@example.com',
  subject: 'Hello',
  body: 'Message text',
  html: '<p>Message HTML</p>',
  attachments: ['path/to/file.pdf'],
});

// Reply (DESTRUCTIVE)
const replied = await reply(auth, {
  threadId: 'thread-id',
  messageId: 'msg-id',
  body: 'Thanks!',
  replyAll: false,
});

// Forward (DESTRUCTIVE)
const forwarded = await forward(auth, {
  messageId: 'msg-id',
  to: 'other@example.com',
  body: 'FYI',
  includeAttachments: true,
});

// Draft (WRITE — no safety gate)
const draft = await createDraft(auth, {
  to: 'recipient@example.com',
  subject: 'Draft',
  body: 'Content',
});

// Labels
const labels = await listLabels(auth);
await batchModifyLabels(auth, {
  messageIds: ['msg1', 'msg2'],
  addLabelIds: ['Label_1'],
  removeLabelIds: ['UNREAD'],
});

// Attachments
const content = await getAttachmentContent(auth, 'msgId', 'attId');
// content is a Buffer
```

## Gmail Query Syntax (for search)

Same as Gmail UI search:
- `from:user@example.com` — from sender
- `to:user@example.com` — to recipient
- `subject:invoice` — subject contains
- `is:unread` — unread messages
- `is:starred` — starred
- `has:attachment` — has attachments
- `after:2026/01/01` — after date
- `before:2026/02/01` — before date
- `label:important` — with label
- `in:inbox` — in inbox
- `filename:pdf` — attachment filename

Combine with spaces (AND) or `OR`:
```
from:client subject:invoice after:2026/01/01
from:alice OR from:bob
```

## Types

```typescript
interface GmailMessage {
  id: string;
  threadId: string;
  date: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  snippet: string;
  body: { text?: string; html?: string };
  labelIds: string[];
  attachments: AttachmentInfo[];
}

interface AttachmentInfo {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface ListResult<T> {
  items: T[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface WriteResult {
  ok: true;
  id: string;
  threadId?: string;
  labelIds?: string[];
}
```

## Error Codes

| Code | Meaning |
|------|---------|
| `AUTH_ERROR` | Token expired, missing, or invalid |
| `NOT_FOUND` | Message/thread not found (404) |
| `QUOTA_EXCEEDED` | Gmail API rate limit (429) |
| `SAFETY_BLOCKED` | Destructive op without `--confirm` |
| `GMAIL_ERROR` | Other Gmail API error |

## Available Accounts

Check `~/.gmcli/accounts.json` for configured accounts.
Typically: `marc@blegal.eu`, `telenieko@gmail.com`.
