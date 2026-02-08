/**
 * Gmail types — agent-friendly shapes, not raw API types.
 */

/** A simplified email message */
export interface GmailMessage {
  id: string;
  threadId: string;
  /** RFC 2822 date string */
  date: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  /** Snippet (truncated plain text preview) */
  snippet: string;
  /** Message body */
  body: {
    text?: string;
    html?: string;
  };
  /** Label IDs applied to this message */
  labelIds: string[];
  /** Attachment metadata (not downloaded by default) */
  attachments: AttachmentInfo[];
}

/** A thread (conversation) */
export interface GmailThread {
  id: string;
  /** Snippet of the last message */
  snippet: string;
  /** All messages in the thread, oldest first */
  messages: GmailMessage[];
}

/** Attachment metadata */
export interface AttachmentInfo {
  /** Attachment ID (needed for download) */
  id: string;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** Size in bytes */
  size: number;
}

/** Options for sending an email */
export interface SendOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  /** Plain text body */
  body?: string;
  /** HTML body (if provided, creates multipart/alternative) */
  html?: string;
  /** File paths to attach */
  attachments?: string[];
}

/** Options for replying to a thread */
export interface ReplyOptions {
  /** Thread ID to reply to */
  threadId: string;
  /** Message ID to reply to (for In-Reply-To header) */
  messageId: string;
  /** Plain text body */
  body?: string;
  /** HTML body */
  html?: string;
  /** File paths to attach */
  attachments?: string[];
  /** Reply to all recipients (default: false, reply to sender only) */
  replyAll?: boolean;
}

/** Options for forwarding a message */
export interface ForwardOptions {
  /** Message ID to forward */
  messageId: string;
  /** Recipients */
  to: string | string[];
  /** Optional body prepended to the forwarded message */
  body?: string;
  /** Include original attachments (default: true) */
  includeAttachments?: boolean;
}

/** Options for listing/searching */
export interface SearchOptions {
  /** Gmail search query (same syntax as Gmail UI) */
  query: string;
  /** Maximum results (default: 20) */
  maxResults?: number;
  /** Page token for pagination */
  pageToken?: string;
  /** Include spam and trash (default: false) */
  includeSpamTrash?: boolean;
}

/** Paginated list result */
export interface ListResult<T> {
  items: T[];
  /** Token for next page, undefined if no more results */
  nextPageToken?: string;
  /** Estimated total results (Gmail-specific, may be inaccurate) */
  resultSizeEstimate?: number;
}

/** Options for batch label modification */
export interface BatchLabelOptions {
  /** Message IDs to modify */
  messageIds: string[];
  /** Label IDs to add */
  addLabelIds?: string[];
  /** Label IDs to remove */
  removeLabelIds?: string[];
}

/** Draft info */
export interface GmailDraft {
  id: string;
  message: GmailMessage;
}

/** An in-memory attachment (for forwarding, where data comes from API not filesystem) */
export interface BufferAttachment {
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** Attachment content */
  data: Buffer;
}

/** Result of a write operation */
export interface WriteResult {
  /** Whether the operation succeeded */
  ok: true;
  /** ID of the created/modified resource */
  id: string;
  /** Thread ID (for messages) */
  threadId?: string;
  /** Label IDs (for label operations) */
  labelIds?: string[];
}
