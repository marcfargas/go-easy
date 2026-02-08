/**
 * Gmail module — search, read, send, reply, forward, labels, drafts.
 *
 * All functions take an OAuth2Client as first argument.
 * Use `getAuth('gmail', 'account@email.com')` from the auth module.
 */

import { gmail } from '@googleapis/gmail';
import type { OAuth2Client } from 'google-auth-library';
import { guardOperation } from '../safety.js';
import { NotFoundError, QuotaError, GoEasyError } from '../errors.js';
import { parseMessage, buildMimeMessage, buildForwardMime, base64UrlEncode, getHeader } from './helpers.js';
import type {
  GmailMessage,
  GmailThread,
  GmailDraft,
  ListResult,
  WriteResult,
  SearchOptions,
  SendOptions,
  ReplyOptions,
  ForwardOptions,
  BatchLabelOptions,
  BufferAttachment,
} from './types.js';

export type {
  GmailMessage,
  GmailThread,
  GmailDraft,
  ListResult,
  WriteResult,
  SearchOptions,
  SendOptions,
  ReplyOptions,
  ForwardOptions,
  BatchLabelOptions,
};

/** Get a Gmail API client instance */
function gmailApi(auth: OAuth2Client) {
  return gmail({ version: 'v1', auth });
}

/** Wrap Google API errors into our error types */
function handleApiError(err: unknown, context: string): never {
  if (err instanceof GoEasyError) throw err;

  const gErr = err as { code?: number; message?: string };
  if (gErr.code === 404) throw new NotFoundError('message', context, err);
  if (gErr.code === 429) throw new QuotaError('gmail', err);
  throw new GoEasyError(
    `Gmail ${context}: ${gErr.message ?? 'Unknown error'}`,
    'GMAIL_ERROR',
    err
  );
}

/**
 * Get the authenticated user's email address.
 */
export async function getProfile(auth: OAuth2Client): Promise<string> {
  const gmail = gmailApi(auth);
  const res = await gmail.users.getProfile({ userId: 'me' });
  return res.data.emailAddress ?? '';
}

/**
 * Search messages using Gmail query syntax.
 *
 * @example
 * ```ts
 * const results = await search(auth, { query: 'from:client is:unread' });
 * ```
 */
export async function search(
  auth: OAuth2Client,
  opts: SearchOptions
): Promise<ListResult<GmailMessage>> {
  const gmail = gmailApi(auth);

  try {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: opts.query,
      maxResults: opts.maxResults ?? 20,
      pageToken: opts.pageToken,
      includeSpamTrash: opts.includeSpamTrash ?? false,
    });

    const messageRefs = listRes.data.messages ?? [];

    // Fetch full message data for each result
    const messages = await Promise.all(
      messageRefs.map(async (ref) => {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: ref.id!,
          format: 'full',
        });
        return parseMessage(msg.data);
      })
    );

    return {
      items: messages,
      nextPageToken: listRes.data.nextPageToken ?? undefined,
      resultSizeEstimate: listRes.data.resultSizeEstimate ?? undefined,
    };
  } catch (err) {
    handleApiError(err, `search "${opts.query}"`);
  }
}

/**
 * Get a single message by ID.
 */
export async function getMessage(
  auth: OAuth2Client,
  messageId: string
): Promise<GmailMessage> {
  const gmail = gmailApi(auth);

  try {
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    return parseMessage(res.data);
  } catch (err) {
    handleApiError(err, messageId);
  }
}

/**
 * Get a thread (conversation) by ID.
 */
export async function getThread(
  auth: OAuth2Client,
  threadId: string
): Promise<GmailThread> {
  const gmail = gmailApi(auth);

  try {
    const res = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    });

    const messages = (res.data.messages ?? []).map(parseMessage);

    return {
      id: res.data.id ?? threadId,
      snippet: res.data.snippet ?? '',
      messages,
    };
  } catch (err) {
    handleApiError(err, threadId);
  }
}

/**
 * Send an email.
 *
 * ⚠️ DESTRUCTIVE — requires safety confirmation.
 */
export async function send(
  auth: OAuth2Client,
  opts: SendOptions
): Promise<WriteResult> {
  const to = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to;

  await guardOperation({
    name: 'gmail.send',
    level: 'DESTRUCTIVE',
    description: `Send email to ${to}: "${opts.subject}"`,
    details: { to: opts.to, subject: opts.subject },
  });

  const gmail = gmailApi(auth);
  const from = await getProfile(auth);
  const mime = await buildMimeMessage(from, opts);
  const raw = base64UrlEncode(mime);

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      threadId: res.data.threadId ?? undefined,
      labelIds: res.data.labelIds ?? undefined,
    };
  } catch (err) {
    handleApiError(err, 'send');
  }
}

/**
 * Reply to a thread.
 *
 * ⚠️ DESTRUCTIVE — requires safety confirmation.
 */
export async function reply(
  auth: OAuth2Client,
  opts: ReplyOptions
): Promise<WriteResult> {
  await guardOperation({
    name: 'gmail.reply',
    level: 'DESTRUCTIVE',
    description: `Reply to thread ${opts.threadId}`,
    details: { threadId: opts.threadId, messageId: opts.messageId },
  });

  const gmail = gmailApi(auth);
  const from = await getProfile(auth);

  // Get the original message for threading headers and recipients
  const original = await getMessage(auth, opts.messageId);

  const replyTo = opts.replyAll
    ? [...new Set([original.from, ...original.to, ...original.cc])].filter(
        (addr) => !addr.includes(from)
      )
    : [original.from];

  const sendOpts: SendOptions = {
    to: replyTo,
    subject: original.subject.startsWith('Re:')
      ? original.subject
      : `Re: ${original.subject}`,
    body: opts.body,
    html: opts.html,
    attachments: opts.attachments,
  };

  const extraHeaders: Record<string, string> = {
    'In-Reply-To': `<${opts.messageId}>`,
    References: `<${opts.messageId}>`,
  };

  const mime = await buildMimeMessage(from, sendOpts, extraHeaders);
  const raw = base64UrlEncode(mime);

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        threadId: opts.threadId,
      },
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      threadId: res.data.threadId ?? undefined,
    };
  } catch (err) {
    handleApiError(err, 'reply');
  }
}

/**
 * Forward a message to new recipients.
 *
 * Fetches the original message, quotes its body, re-attaches original
 * attachments (unless `includeAttachments: false`), and sends.
 *
 * ⚠️ DESTRUCTIVE — requires safety confirmation.
 */
export async function forward(
  auth: OAuth2Client,
  opts: ForwardOptions
): Promise<WriteResult> {
  const to = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to;

  await guardOperation({
    name: 'gmail.forward',
    level: 'DESTRUCTIVE',
    description: `Forward message ${opts.messageId} to ${to}`,
    details: { messageId: opts.messageId, to: opts.to },
  });

  const gmail = gmailApi(auth);
  const from = await getProfile(auth);

  // Fetch original message
  const original = await getMessage(auth, opts.messageId);

  // Fetch original attachments as Buffers
  const bufferAttachments: BufferAttachment[] = [];
  if (opts.includeAttachments !== false && original.attachments.length > 0) {
    for (const att of original.attachments) {
      const data = await getAttachmentContent(auth, opts.messageId, att.id);
      bufferAttachments.push({
        filename: att.filename,
        mimeType: att.mimeType,
        data,
      });
    }
  }

  const subject = original.subject.startsWith('Fwd:')
    ? original.subject
    : `Fwd: ${original.subject}`;

  const mime = await buildForwardMime(
    from,
    to,
    subject,
    opts.body,
    original.body,
    bufferAttachments
  );
  const raw = base64UrlEncode(mime);

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      threadId: res.data.threadId ?? undefined,
    };
  } catch (err) {
    handleApiError(err, 'forward');
  }
}

/**
 * Batch modify labels on multiple messages.
 *
 * This is a WRITE operation (reversible), no safety gate.
 */
export async function batchModifyLabels(
  auth: OAuth2Client,
  opts: BatchLabelOptions
): Promise<WriteResult> {
  const gmail = gmailApi(auth);

  try {
    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: opts.messageIds,
        addLabelIds: opts.addLabelIds,
        removeLabelIds: opts.removeLabelIds,
      },
    });

    return {
      ok: true,
      id: `batch:${opts.messageIds.length}`,
      labelIds: opts.addLabelIds,
    };
  } catch (err) {
    handleApiError(err, 'batchModifyLabels');
  }
}

/**
 * List all labels for the account.
 */
export async function listLabels(
  auth: OAuth2Client
): Promise<Array<{ id: string; name: string; type: string }>> {
  const gmail = gmailApi(auth);

  try {
    const res = await gmail.users.labels.list({ userId: 'me' });
    return (res.data.labels ?? []).map((l) => ({
      id: l.id ?? '',
      name: l.name ?? '',
      type: l.type ?? '',
    }));
  } catch (err) {
    handleApiError(err, 'listLabels');
  }
}

/**
 * Create a draft.
 *
 * WRITE operation (reversible), no safety gate.
 */
export async function createDraft(
  auth: OAuth2Client,
  opts: SendOptions
): Promise<GmailDraft> {
  const gmail = gmailApi(auth);
  const from = await getProfile(auth);
  const mime = await buildMimeMessage(from, opts);
  const raw = base64UrlEncode(mime);

  try {
    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw },
      },
    });

    return {
      id: res.data.id ?? '',
      message: parseMessage(res.data.message ?? {}),
    };
  } catch (err) {
    handleApiError(err, 'createDraft');
  }
}

/**
 * Send an existing draft.
 *
 * ⚠️ DESTRUCTIVE — requires safety confirmation.
 */
export async function sendDraft(
  auth: OAuth2Client,
  draftId: string
): Promise<WriteResult> {
  await guardOperation({
    name: 'gmail.sendDraft',
    level: 'DESTRUCTIVE',
    description: `Send draft ${draftId}`,
    details: { draftId },
  });

  const gmail = gmailApi(auth);

  try {
    const res = await gmail.users.drafts.send({
      userId: 'me',
      requestBody: { id: draftId },
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      threadId: res.data.threadId ?? undefined,
    };
  } catch (err) {
    handleApiError(err, 'sendDraft');
  }
}

/**
 * List drafts.
 */
export async function listDrafts(
  auth: OAuth2Client,
  maxResults = 20
): Promise<ListResult<GmailDraft>> {
  const gmail = gmailApi(auth);

  try {
    const res = await gmail.users.drafts.list({
      userId: 'me',
      maxResults,
    });

    const drafts = await Promise.all(
      (res.data.drafts ?? []).map(async (d) => {
        const full = await gmail.users.drafts.get({
          userId: 'me',
          id: d.id!,
          format: 'full',
        });
        return {
          id: full.data.id ?? '',
          message: parseMessage(full.data.message ?? {}),
        };
      })
    );

    return {
      items: drafts,
      nextPageToken: res.data.nextPageToken ?? undefined,
    };
  } catch (err) {
    handleApiError(err, 'listDrafts');
  }
}

/**
 * Download an attachment's content as a Buffer.
 */
export async function getAttachmentContent(
  auth: OAuth2Client,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const gmail = gmailApi(auth);

  try {
    const res = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    const data = res.data.data;
    if (!data) throw new GoEasyError('Empty attachment data', 'GMAIL_ERROR');
    return Buffer.from(data, 'base64url');
  } catch (err) {
    handleApiError(err, `attachment ${attachmentId}`);
  }
}
