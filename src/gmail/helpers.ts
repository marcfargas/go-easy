/**
 * Gmail helpers — MIME building, header extraction, encoding utilities.
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { gmail_v1 } from '@googleapis/gmail';
import type { GmailMessage, AttachmentInfo, SendOptions, BufferAttachment } from './types.js';

/**
 * Extract a header value from a Gmail message payload.
 */
export function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/**
 * Parse address lists like "a@b.com, c@d.com" into arrays.
 */
export function parseAddressList(value: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Extract attachments metadata from a message payload.
 */
export function extractAttachments(
  payload: gmail_v1.Schema$MessagePart | undefined
): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];
  if (!payload) return attachments;

  function walk(part: gmail_v1.Schema$MessagePart) {
    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      attachments.push({
        id: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        size: part.body.size ?? 0,
      });
    }
    if (part.parts) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  walk(payload);
  return attachments;
}

/**
 * Extract body text and HTML from a message payload.
 */
export function extractBody(
  payload: gmail_v1.Schema$MessagePart | undefined
): { text?: string; html?: string } {
  const result: { text?: string; html?: string } = {};
  if (!payload) return result;

  function walk(part: gmail_v1.Schema$MessagePart) {
    if (part.mimeType === 'text/plain' && part.body?.data && !result.text) {
      result.text = base64Decode(part.body.data);
    }
    if (part.mimeType === 'text/html' && part.body?.data && !result.html) {
      result.html = base64Decode(part.body.data);
    }
    if (part.parts) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  walk(payload);
  return result;
}

/**
 * Decode base64url-encoded string (as used by Gmail API).
 */
export function base64Decode(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

/**
 * Encode string to base64url (for Gmail API raw messages).
 */
export function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return buf.toString('base64url');
}

/**
 * RFC 2047 encode a header value if it contains non-ASCII characters.
 * Uses Base64 encoding: =?UTF-8?B?<base64>?=
 *
 * Returns the value unchanged if it's pure ASCII.
 */
export function rfc2047Encode(value: string): string {
  // Check if all characters are printable ASCII (0x20-0x7E)
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const encoded = Buffer.from(value, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

/**
 * RFC 2047 encode the display name portion of a single email address.
 * "Júlia Fargas <julia@example.com>" → "=?UTF-8?B?...?= <julia@example.com>"
 * Plain addresses like "julia@example.com" are returned unchanged.
 */
export function rfc2047EncodeAddress(address: string): string {
  const trimmed = address.trim();
  // Match "Display Name <email@example.com>" or "\"Display Name\" <email>"
  const match = trimmed.match(/^"?(.+?)"?\s*<([^>]+)>$/);
  if (match) {
    const [, displayName, email] = match;
    const encodedName = rfc2047Encode(displayName.trim());
    return `${encodedName} <${email}>`;
  }
  // Just an email address, no encoding needed
  return trimmed;
}

/**
 * RFC 2047 encode a comma-separated list of email addresses.
 * Each display name is encoded individually if it contains non-ASCII chars.
 */
export function rfc2047EncodeAddressList(addresses: string): string {
  if (!addresses) return addresses;
  return addresses
    .split(',')
    .map((a) => rfc2047EncodeAddress(a))
    .join(', ');
}

/**
 * Parse a raw Gmail API message into our GmailMessage shape.
 */
export function parseMessage(raw: gmail_v1.Schema$Message): GmailMessage {
  const headers = raw.payload?.headers;

  const rfc822MessageId = getHeader(headers, 'Message-ID') || undefined;

  return {
    id: raw.id ?? '',
    threadId: raw.threadId ?? '',
    date: getHeader(headers, 'Date'),
    from: getHeader(headers, 'From'),
    to: parseAddressList(getHeader(headers, 'To')),
    cc: parseAddressList(getHeader(headers, 'Cc')),
    bcc: parseAddressList(getHeader(headers, 'Bcc')),
    subject: getHeader(headers, 'Subject'),
    snippet: raw.snippet ?? '',
    body: extractBody(raw.payload),
    labelIds: raw.labelIds ?? [],
    attachments: extractAttachments(raw.payload),
    ...(rfc822MessageId ? { rfc822MessageId } : {}),
  };
}

/**
 * Serialize a single MIME attachment part.
 * Used by both buildMimeMessage (file paths → Buffers) and buildForwardMime (Buffers).
 */
function serializeMimePart(
  boundary: string,
  filename: string,
  mimeType: string,
  data: Buffer
): string[] {
  return [
    `--${boundary}`,
    `Content-Type: ${mimeType}; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    data.toString('base64'),
  ];
}

/**
 * Build a MIME message string from SendOptions.
 * Supports plain text, HTML multipart, and file attachments.
 */
export async function buildMimeMessage(
  from: string,
  opts: SendOptions,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const to = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to;
  const cc = opts.cc
    ? Array.isArray(opts.cc)
      ? opts.cc.join(', ')
      : opts.cc
    : '';
  const bcc = opts.bcc
    ? Array.isArray(opts.bcc)
      ? opts.bcc.join(', ')
      : opts.bcc
    : '';

  const boundary = `go-easy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const hasAttachments = opts.attachments && opts.attachments.length > 0;
  const hasHtml = !!opts.html;

  let headers = [
    `From: ${rfc2047EncodeAddress(from)}`,
    `To: ${rfc2047EncodeAddressList(to)}`,
    ...(cc ? [`Cc: ${rfc2047EncodeAddressList(cc)}`] : []),
    ...(bcc ? [`Bcc: ${rfc2047EncodeAddressList(bcc)}`] : []),
    `Subject: ${rfc2047Encode(opts.subject)}`,
    'MIME-Version: 1.0',
  ];

  // Add extra headers (In-Reply-To, References, etc.)
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.push(`${key}: ${value}`);
    }
  }

  // Simple plain text
  if (!hasHtml && !hasAttachments) {
    headers.push('Content-Type: text/plain; charset=utf-8');
    return [...headers, '', opts.body ?? ''].join('\r\n');
  }

  // With attachments: multipart/mixed wrapping multipart/alternative
  if (hasAttachments) {
    const altBoundary = `alt-${boundary}`;
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

    const parts: string[] = [...headers, '', `--${boundary}`];

    // Text/HTML alternative part
    if (hasHtml) {
      parts.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`, '');
      if (opts.body) {
        parts.push(`--${altBoundary}`, 'Content-Type: text/plain; charset=utf-8', '', opts.body);
      }
      parts.push(`--${altBoundary}`, 'Content-Type: text/html; charset=utf-8', '', opts.html!);
      parts.push(`--${altBoundary}--`);
    } else {
      parts.push('Content-Type: text/plain; charset=utf-8', '', opts.body ?? '');
    }

    // Attachments
    for (const filePath of opts.attachments!) {
      const content = await readFile(filePath);
      const filename = basename(filePath);
      // Simple MIME type detection
      const mimeType = guessMimeType(filename);

      parts.push(...serializeMimePart(boundary, filename, mimeType, content));
    }

    parts.push(`--${boundary}--`);
    return parts.join('\r\n');
  }

  // HTML without attachments: multipart/alternative
  const altBoundary = `alt-${boundary}`;
  headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);

  const parts = [...headers, ''];
  if (opts.body) {
    parts.push(`--${altBoundary}`, 'Content-Type: text/plain; charset=utf-8', '', opts.body);
  }
  parts.push(`--${altBoundary}`, 'Content-Type: text/html; charset=utf-8', '', opts.html!);
  parts.push(`--${altBoundary}--`);

  return parts.join('\r\n');
}

/**
 * Build a MIME message for forwarding, with in-memory Buffer attachments.
 *
 * Similar to buildMimeMessage but accepts BufferAttachment[] instead of file paths.
 * Builds the forwarded body with quoted original content.
 */
export async function buildForwardMime(
  from: string,
  to: string,
  subject: string,
  userBody: string | undefined,
  originalBody: { text?: string; html?: string },
  bufferAttachments: BufferAttachment[],
  extraHeaders?: Record<string, string>,
  userHtml?: string
): Promise<string> {
  const boundary = `go-easy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const hasAttachments = bufferAttachments.length > 0;

  // Build forwarded text body
  const forwardedText = [
    ...(userBody ? [userBody, ''] : []),
    '---------- Forwarded message ----------',
    ...(originalBody.text ? [originalBody.text] : []),
  ].join('\r\n');

  // Build forwarded HTML body
  const userHtmlBlock = userHtml
    ? userHtml
    : userBody
      ? `<p>${escapeHtml(userBody)}</p>`
      : undefined;

  const forwardedHtml = originalBody.html
    ? [
        ...(userHtmlBlock ? [userHtmlBlock] : []),
        '<hr><b>---------- Forwarded message ----------</b><br>',
        originalBody.html,
      ].join('\r\n')
    : userHtmlBlock
      ? [
          userHtmlBlock,
          '<hr><b>---------- Forwarded message ----------</b><br>',
          `<pre>${escapeHtml(originalBody.text ?? '')}</pre>`,
        ].join('\r\n')
      : undefined;

  let headers = [
    `From: ${rfc2047EncodeAddress(from)}`,
    `To: ${rfc2047EncodeAddressList(to)}`,
    `Subject: ${rfc2047Encode(subject)}`,
    'MIME-Version: 1.0',
  ];

  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.push(`${key}: ${value}`);
    }
  }

  // No attachments, no HTML — simple text
  if (!hasAttachments && !forwardedHtml) {
    headers.push('Content-Type: text/plain; charset=utf-8');
    return [...headers, '', forwardedText].join('\r\n');
  }

  // No attachments, with HTML — multipart/alternative
  if (!hasAttachments && forwardedHtml) {
    const altBoundary = `alt-${boundary}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    const parts = [...headers, ''];
    parts.push(`--${altBoundary}`, 'Content-Type: text/plain; charset=utf-8', '', forwardedText);
    parts.push(`--${altBoundary}`, 'Content-Type: text/html; charset=utf-8', '', forwardedHtml);
    parts.push(`--${altBoundary}--`);
    return parts.join('\r\n');
  }

  // With attachments — multipart/mixed
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts: string[] = [...headers, '', `--${boundary}`];

  if (forwardedHtml) {
    const altBoundary = `alt-${boundary}`;
    parts.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`, '');
    parts.push(`--${altBoundary}`, 'Content-Type: text/plain; charset=utf-8', '', forwardedText);
    parts.push(`--${altBoundary}`, 'Content-Type: text/html; charset=utf-8', '', forwardedHtml);
    parts.push(`--${altBoundary}--`);
  } else {
    parts.push('Content-Type: text/plain; charset=utf-8', '', forwardedText);
  }

  // Buffer attachments
  for (const att of bufferAttachments) {
    parts.push(...serializeMimePart(boundary, att.filename, att.mimeType, att.data));
  }

  parts.push(`--${boundary}--`);
  return parts.join('\r\n');
}

/** Minimal HTML escape for forwarded body text */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Simple MIME type guessing by extension */
function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    csv: 'text/csv',
    html: 'text/html',
    json: 'application/json',
    zip: 'application/zip',
    eml: 'message/rfc822',
  };
  return types[ext ?? ''] ?? 'application/octet-stream';
}
