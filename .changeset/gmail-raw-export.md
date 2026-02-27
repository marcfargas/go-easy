---
"@marcfargas/go-easy": minor
---

Add `--format=eml` for `go-gmail get` and `--format=mbox` for `go-gmail thread` — download raw RFC 2822 email or full thread as mbox.

New output modes work with `--output=<path>` (write to file) and `--b64encode` (base64 JSON, agent-safe), or pipe raw bytes directly to stdout.

This also fixes retrieval of `message/rfc822` embedded attachments (forwarded .eml files) which previously failed with "Invalid attachment token" — `--format=eml` returns the complete outer message via Gmail's `format=raw` API, bypassing the broken `attachments.get` endpoint.

New library exports: `getMessageRaw(auth, messageId)`, `getThreadMbox(auth, threadId, fromAddress)`.
