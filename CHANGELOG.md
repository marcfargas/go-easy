# go-easy

## 0.2.0

### Minor Changes

- [`5f424e1`](https://github.com/marcfargas/go-easy/commit/5f424e16c3c9971c2be196725a5d9c1d7e88633b) Thanks [@marcfargas](https://github.com/marcfargas)! - Initial release — Gmail, Drive & Calendar APIs for AI agents and humans.

  - Gmail: search, getMessage, getThread, send, reply, forward, createDraft, sendDraft, listDrafts, listLabels, batchModifyLabels, getAttachmentContent, getProfile
  - Drive: listFiles, searchFiles, getFile, downloadFile, exportFile, uploadFile, createFolder, moveFile, renameFile, copyFile, trashFile, listPermissions, shareFile, unshareFile
  - Calendar: listCalendars, listEvents, getEvent, createEvent, updateEvent, deleteEvent, queryFreeBusy
  - Gateway CLIs: go-gmail, go-drive, go-calendar (JSON output, --confirm safety)
  - Safety model: READ/WRITE/DESTRUCTIVE operation classification
  - Auth: multi-account OAuth2 with per-service token stores
