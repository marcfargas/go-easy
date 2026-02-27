---
"@marcfargas/go-easy": patch
---

Internal code quality improvements — no behaviour changes.

- Extract `gmailApi` and `handleApiError` to `src/gmail/api.ts` (eliminates duplication between `index.ts` and `raw.ts`)
- Extract `parseFlags` and `readBodyFlags` to `src/bin/gmail-flags.ts` (enables proper test imports)
- Extract `serializeMimePart()` MIME helper (eliminates copy-paste between `buildMimeMessage` and `buildForwardMime`)
- Remove unused `lookup` import from `helpers.ts`
- Fix `handleRawOutput` return type annotation
