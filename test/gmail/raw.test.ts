/**
 * Tests for src/gmail/raw.ts — RFC 2822 / mbox export.
 *
 * Mocks @googleapis/gmail so no real network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OAuth2Client } from 'google-auth-library';

// ─── Mock @googleapis/gmail ────────────────────────────────────────────────

const mockMessagesGet = vi.fn();
const mockThreadsGet = vi.fn();

vi.mock('@googleapis/gmail', () => ({
  gmail: vi.fn(() => ({
    users: {
      messages: {
        get: mockMessagesGet,
      },
      threads: {
        get: mockThreadsGet,
      },
    },
  })),
}));

// Import after mock setup
import { getMessageRaw, getThreadMbox } from '../../src/gmail/raw.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const FAKE_AUTH = {} as OAuth2Client;

/** A minimal RFC 2822 message (CRLF line endings, as returned by Gmail) */
const RFC2822_MSG = [
  'From: sender@example.com',
  'To: recipient@example.com',
  'Subject: Test',
  'Date: Thu, 26 Feb 2026 18:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hello, this is the body.',
  'From this line starts with "From " — it should be escaped in mbox.',
].join('\r\n');

/** The same message base64url encoded (as Gmail API returns it) */
const RFC2822_MSG_B64 = Buffer.from(RFC2822_MSG, 'utf-8').toString('base64url');

/** A second message for multi-message thread tests */
const RFC2822_MSG2 = [
  'From: reply@example.com',
  'To: sender@example.com',
  'Subject: Re: Test',
  'Date: Thu, 26 Feb 2026 18:30:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Reply body here.',
].join('\r\n');

const RFC2822_MSG2_B64 = Buffer.from(RFC2822_MSG2, 'utf-8').toString('base64url');

// ─── getMessageRaw ─────────────────────────────────────────────────────────

describe('getMessageRaw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches message with format=raw and returns a Buffer', async () => {
    mockMessagesGet.mockResolvedValue({ data: { id: 'msg-1', raw: RFC2822_MSG_B64 } });

    const buf = await getMessageRaw(FAKE_AUTH, 'msg-1');

    expect(mockMessagesGet).toHaveBeenCalledWith({
      userId: 'me',
      id: 'msg-1',
      format: 'raw',
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.toString('utf-8')).toBe(RFC2822_MSG);
  });

  it('throws GoEasyError when API returns no raw field', async () => {
    mockMessagesGet.mockResolvedValue({ data: { id: 'msg-1' } }); // no raw

    await expect(getMessageRaw(FAKE_AUTH, 'msg-1')).rejects.toThrow('No raw data');
  });

  it('wraps 404 API errors as NotFoundError', async () => {
    mockMessagesGet.mockRejectedValue({ code: 404, message: 'Not Found' });

    await expect(getMessageRaw(FAKE_AUTH, 'missing-msg')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ─── getThreadMbox ─────────────────────────────────────────────────────────

describe('getThreadMbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles a valid mbox from a single-message thread', async () => {
    mockThreadsGet.mockResolvedValue({
      data: {
        id: 'thread-1',
        messages: [{ id: 'msg-1', internalDate: '1740589200000' }], // 2025-02-26T17:00:00Z
      },
    });
    mockMessagesGet.mockResolvedValue({ data: { id: 'msg-1', raw: RFC2822_MSG_B64 } });

    const buf = await getThreadMbox(FAKE_AUTH, 'thread-1', 'me@example.com');
    const mbox = buf.toString('utf-8');

    // Must start with "From " envelope line
    expect(mbox).toMatch(/^From me@example\.com /);
    // Must contain the subject
    expect(mbox).toContain('Subject: Test');
    // "From " in the body should be escaped to ">From "
    expect(mbox).toContain('>From this line');
    // Must end with a trailing newline (blank separator)
    expect(mbox.endsWith('\n')).toBe(true);
  });

  it('assembles mbox with multiple messages', async () => {
    mockThreadsGet.mockResolvedValue({
      data: {
        id: 'thread-1',
        messages: [
          { id: 'msg-1', internalDate: '1740589200000' },
          { id: 'msg-2', internalDate: '1740591000000' },
        ],
      },
    });
    mockMessagesGet
      .mockResolvedValueOnce({ data: { id: 'msg-1', raw: RFC2822_MSG_B64 } })
      .mockResolvedValueOnce({ data: { id: 'msg-2', raw: RFC2822_MSG2_B64 } });

    const buf = await getThreadMbox(FAKE_AUTH, 'thread-1', 'me@example.com');
    const mbox = buf.toString('utf-8');

    // Both subjects should be present
    expect(mbox).toContain('Subject: Test');
    expect(mbox).toContain('Subject: Re: Test');

    // Should have two "From " envelope lines
    const envelopeLines = mbox.split('\n').filter((l) => l.match(/^From \S+ /));
    expect(envelopeLines).toHaveLength(2);
  });

  it('requests threads with format=minimal', async () => {
    mockThreadsGet.mockResolvedValue({
      data: { id: 'thread-1', messages: [{ id: 'msg-1', internalDate: '0' }] },
    });
    mockMessagesGet.mockResolvedValue({ data: { id: 'msg-1', raw: RFC2822_MSG_B64 } });

    await getThreadMbox(FAKE_AUTH, 'thread-1', 'me@example.com');

    expect(mockThreadsGet).toHaveBeenCalledWith({
      userId: 'me',
      id: 'thread-1',
      format: 'minimal',
    });
  });

  it('normalizes CRLF to LF in output', async () => {
    mockThreadsGet.mockResolvedValue({
      data: { id: 't', messages: [{ id: 'msg-1', internalDate: '0' }] },
    });
    mockMessagesGet.mockResolvedValue({ data: { id: 'msg-1', raw: RFC2822_MSG_B64 } });

    const buf = await getThreadMbox(FAKE_AUTH, 't', 'me@example.com');
    // No CRLF sequences should remain
    expect(buf.toString('binary')).not.toContain('\r\n');
  });

  it('throws when thread has no messages', async () => {
    mockThreadsGet.mockResolvedValue({
      data: { id: 'thread-empty', messages: [] },
    });

    await expect(getThreadMbox(FAKE_AUTH, 'thread-empty', 'me@example.com'))
      .rejects.toThrow('no messages');
  });

  it('uses a fallback date when internalDate is missing', async () => {
    mockThreadsGet.mockResolvedValue({
      data: { id: 't', messages: [{ id: 'msg-1' }] }, // no internalDate
    });
    mockMessagesGet.mockResolvedValue({ data: { id: 'msg-1', raw: RFC2822_MSG_B64 } });

    // Should not throw
    const buf = await getThreadMbox(FAKE_AUTH, 't', 'me@example.com');
    expect(buf.length).toBeGreaterThan(0);
  });
});

// ─── mbox envelope line format ─────────────────────────────────────────────

describe('mbox envelope line format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envelope line uses ctime-style date', async () => {
    // internalDate = 2025-02-26T17:00:00Z = 1740589200000
    mockThreadsGet.mockResolvedValue({
      data: { id: 't', messages: [{ id: 'msg-1', internalDate: '1740589200000' }] },
    });
    mockMessagesGet.mockResolvedValue({ data: { id: 'msg-1', raw: RFC2822_MSG_B64 } });

    const buf = await getThreadMbox(FAKE_AUTH, 't', 'sender@example.com');
    const firstLine = buf.toString('utf-8').split('\n')[0];

    // 1740589200000 = Wed Feb 26 2025 17:00:00 UTC (verified)
    expect(firstLine).toBe('From sender@example.com Wed Feb 26 17:00:00 2025');
  });
});
