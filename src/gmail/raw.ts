/**
 * Gmail raw message export — RFC 2822 / mbox format.
 *
 * Uses Gmail API `format=raw` to fetch the complete wire-format message.
 * This works for all messages including those with embedded message/rfc822
 * attachments that fail with the attachments.get endpoint.
 */

import type { OAuth2Client } from 'google-auth-library';
import { GoEasyError } from '../errors.js';
import { gmailApi, handleApiError } from './api.js';

/**
 * Fetch a single message as raw RFC 2822 bytes.
 *
 * Uses `format=raw` which returns the complete wire-format message including
 * all headers, body parts, and embedded attachments. This is the reliable
 * path for message/rfc822 embedded emails and nested attachments.
 */
export async function getMessageRaw(
  auth: OAuth2Client,
  messageId: string
): Promise<Buffer> {
  const api = gmailApi(auth);

  try {
    const res = await api.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'raw',
    });

    const raw = res.data.raw;
    if (!raw) throw new GoEasyError('No raw data returned by API', 'GMAIL_ERROR');
    return Buffer.from(raw, 'base64url');
  } catch (err) {
    handleApiError(err, `getMessage(raw) ${messageId}`);
  }
}

/**
 * Fetch all messages in a thread as a single mbox file (Buffer).
 *
 * The mbox format is the standard for storing multiple RFC 2822 messages in
 * one file. Each message is preceded by a "From " envelope line and separated
 * from the next by a blank line. Lines in the message body starting with
 * "From " are escaped with ">" (mboxo quoting).
 *
 * @param fromAddress - Used for the mbox envelope "From " line (typically the
 *   authenticated account's email address).
 */
export async function getThreadMbox(
  auth: OAuth2Client,
  threadId: string,
  fromAddress: string
): Promise<Buffer> {
  const api = gmailApi(auth);

  // Get thread message IDs (minimal format — no body data, just IDs + internalDate)
  let messageIds: string[];
  let internalDates: Record<string, string>;

  try {
    const res = await api.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'minimal',
    });

    const messages = res.data.messages ?? [];
    if (messages.length === 0) {
      throw new GoEasyError(`Thread ${threadId} has no messages`, 'GMAIL_ERROR');
    }

    messageIds = messages.map((m) => m.id!);
    internalDates = Object.fromEntries(
      messages.map((m) => [m.id!, m.internalDate ?? '0'])
    );
  } catch (err) {
    handleApiError(err, `getThread(minimal) ${threadId}`);
  }

  // Fetch all messages raw in parallel
  const rawMessages = await Promise.all(
    messageIds.map(async (id) => {
      try {
        const res = await api.users.messages.get({
          userId: 'me',
          id,
          format: 'raw',
        });
        const raw = res.data.raw;
        if (!raw) throw new GoEasyError(`No raw data for message ${id}`, 'GMAIL_ERROR');
        return { id, raw: Buffer.from(raw, 'base64url'), internalDate: internalDates[id] };
      } catch (err) {
        handleApiError(err, `getMessage(raw) ${id}`);
      }
    })
  );

  // Assemble mbox
  const parts: Buffer[] = [];
  for (const msg of rawMessages) {
    const envelopeLine = buildMboxEnvelopeLine(fromAddress, msg.internalDate);
    const body = mboxEscape(normalizeLf(msg.raw));
    parts.push(
      Buffer.from(envelopeLine + '\n', 'utf-8'),
      body,
      Buffer.from('\n', 'utf-8') // blank line separator between messages
    );
  }

  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the mbox "From " envelope line.
 *
 * Format: `From <sender> <ctime-date>\n`
 * The date is derived from Gmail's `internalDate` (milliseconds since epoch).
 */
function buildMboxEnvelopeLine(fromAddress: string, internalDateMs: string): string {
  const ms = parseInt(internalDateMs, 10);
  const date = isNaN(ms) ? new Date() : new Date(ms);
  // ctime format: "Thu Jan  1 00:00:00 1970" — fixed-width, UTC
  const ctime = formatCtime(date);
  return `From ${fromAddress} ${ctime}`;
}

/**
 * Format a Date as ctime (e.g. "Thu Jan  1 00:00:00 1970"), UTC.
 * This is the format expected in mbox envelope lines.
 */
function formatCtime(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const day = days[date.getUTCDay()];
  const mon = months[date.getUTCMonth()];
  const d = String(date.getUTCDate()).padStart(2, ' '); // space-pad day
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  const yyyy = date.getUTCFullYear();

  return `${day} ${mon} ${d} ${hh}:${mm}:${ss} ${yyyy}`;
}

/**
 * Normalize CRLF line endings to LF.
 * RFC 2822 messages use CRLF; mbox traditionally uses LF.
 */
function normalizeLf(buf: Buffer): Buffer {
  // Replace \r\n with \n
  // Process as string only if the buffer is valid UTF-8/ASCII for the headers.
  // Binary parts (attachments) may not be valid UTF-8, but CRLF sequences in
  // them are safe to convert: 0x0D 0x0A → 0x0A.
  const bytes = buf;
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0d && i + 1 < bytes.length && bytes[i + 1] === 0x0a) {
      // Skip the CR, keep the LF on next iteration
      continue;
    }
    out.push(bytes[i]);
  }
  return Buffer.from(out);
}

/**
 * Apply mboxo escaping: prefix any line starting with "From " with ">".
 * This prevents mbox parsers from treating message body lines as envelope separators.
 *
 * Operates on the LF-normalized message (call normalizeLf first).
 */
function mboxEscape(buf: Buffer): Buffer {
  const text = buf.toString('binary'); // binary to preserve byte values
  const lines = text.split('\n');
  const escaped = lines.map((line) =>
    line.startsWith('From ') ? '>' + line : line
  );
  return Buffer.from(escaped.join('\n'), 'binary');
}
