import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OAuth2Client } from 'google-auth-library';
import { NotFoundError, QuotaError, SafetyError, GoEasyError } from '../../src/errors.js';

// ─── Gmail API Mock ────────────────────────────────────────

const mockMessagesList = vi.fn();
const mockMessagesGet = vi.fn();
const mockMessagesSend = vi.fn();
const mockMessagesBatchModify = vi.fn();
const mockThreadsGet = vi.fn();
const mockLabelsList = vi.fn();
const mockDraftsCreate = vi.fn();
const mockDraftsSend = vi.fn();
const mockDraftsList = vi.fn();
const mockDraftsGet = vi.fn();
const mockAttachmentsGet = vi.fn();
const mockGetProfile = vi.fn();

vi.mock('@googleapis/gmail', () => ({
  gmail: () => ({
      users: {
        getProfile: (args: unknown) => mockGetProfile(args),
        messages: {
          list: (args: unknown) => mockMessagesList(args),
          get: (args: unknown) => mockMessagesGet(args),
          send: (args: unknown) => mockMessagesSend(args),
          batchModify: (args: unknown) => mockMessagesBatchModify(args),
          attachments: {
            get: (args: unknown) => mockAttachmentsGet(args),
          },
        },
        threads: {
          get: (args: unknown) => mockThreadsGet(args),
        },
        labels: {
          list: (args: unknown) => mockLabelsList(args),
        },
        drafts: {
          create: (args: unknown) => mockDraftsCreate(args),
          send: (args: unknown) => mockDraftsSend(args),
          list: (args: unknown) => mockDraftsList(args),
          get: (args: unknown) => mockDraftsGet(args),
        },
      },
    }),
}));

// Mock safety — allow all by default, can override per test
const mockGuardOperation = vi.fn();
vi.mock('../../src/safety.js', () => ({
  guardOperation: (...args: unknown[]) => mockGuardOperation(...args),
}));

// Import after mocks
import {
  search,
  getMessage,
  getThread,
  getProfile,
  send,
  reply,
  forward,
  batchModifyLabels,
  listLabels,
  createDraft,
  sendDraft,
  listDrafts,
  getAttachmentContent,
} from '../../src/gmail/index.js';

// ─── Fixtures ──────────────────────────────────────────────

const fakeAuth = {} as OAuth2Client;

const textBody = Buffer.from('Hello').toString('base64url');
const fakeMessagePayload = {
  headers: [
    { name: 'From', value: 'sender@example.com' },
    { name: 'To', value: 'me@example.com' },
    { name: 'Subject', value: 'Test Email' },
    { name: 'Date', value: 'Mon, 3 Feb 2026 10:00:00 +0100' },
  ],
  mimeType: 'text/plain',
  body: { data: textBody },
};

const fakeRawMessage = {
  id: 'msg-1',
  threadId: 'thread-1',
  snippet: 'Hello...',
  labelIds: ['INBOX'],
  payload: fakeMessagePayload,
};

// ─── Tests ─────────────────────────────────────────────────

describe('getProfile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns authenticated email address', async () => {
    mockGetProfile.mockResolvedValue({ data: { emailAddress: 'me@example.com' } });
    const email = await getProfile(fakeAuth);
    expect(email).toBe('me@example.com');
  });
});

describe('search', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls list then get for each result, returns ListResult', async () => {
    mockMessagesList.mockResolvedValue({
      data: {
        messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
        nextPageToken: 'page2',
        resultSizeEstimate: 42,
      },
    });
    mockMessagesGet
      .mockResolvedValueOnce({ data: { ...fakeRawMessage, id: 'msg-1' } })
      .mockResolvedValueOnce({ data: { ...fakeRawMessage, id: 'msg-2' } });

    const result = await search(fakeAuth, { query: 'is:unread' });

    expect(mockMessagesList).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'is:unread', maxResults: 20 })
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe('msg-1');
    expect(result.items[1].id).toBe('msg-2');
    expect(result.nextPageToken).toBe('page2');
    expect(result.resultSizeEstimate).toBe(42);
  });

  it('returns empty list when no messages match', async () => {
    mockMessagesList.mockResolvedValue({ data: {} });
    const result = await search(fakeAuth, { query: 'nonexistent' });
    expect(result.items).toEqual([]);
  });

  it('passes maxResults and pageToken', async () => {
    mockMessagesList.mockResolvedValue({ data: {} });
    await search(fakeAuth, { query: 'test', maxResults: 5, pageToken: 'abc' });
    expect(mockMessagesList).toHaveBeenCalledWith(
      expect.objectContaining({ maxResults: 5, pageToken: 'abc' })
    );
  });
});

describe('getMessage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed GmailMessage', async () => {
    mockMessagesGet.mockResolvedValue({ data: fakeRawMessage });
    const msg = await getMessage(fakeAuth, 'msg-1');
    expect(msg.id).toBe('msg-1');
    expect(msg.subject).toBe('Test Email');
    expect(msg.body.text).toBe('Hello');
  });

  it('throws NotFoundError for 404', async () => {
    mockMessagesGet.mockRejectedValue({ code: 404, message: 'Not found' });
    await expect(getMessage(fakeAuth, 'bad-id')).rejects.toThrow(NotFoundError);
  });

  it('throws QuotaError for 429', async () => {
    mockMessagesGet.mockRejectedValue({ code: 429, message: 'Rate limit' });
    await expect(getMessage(fakeAuth, 'msg-1')).rejects.toThrow(QuotaError);
  });

  it('throws GoEasyError for unknown API errors', async () => {
    mockMessagesGet.mockRejectedValue({ code: 500, message: 'Server error' });
    await expect(getMessage(fakeAuth, 'msg-1')).rejects.toThrow(GoEasyError);
  });
});

describe('getThread', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns GmailThread with messages', async () => {
    mockThreadsGet.mockResolvedValue({
      data: {
        id: 'thread-1',
        snippet: 'Thread snippet',
        messages: [fakeRawMessage, { ...fakeRawMessage, id: 'msg-2' }],
      },
    });

    const thread = await getThread(fakeAuth, 'thread-1');
    expect(thread.id).toBe('thread-1');
    expect(thread.snippet).toBe('Thread snippet');
    expect(thread.messages).toHaveLength(2);
  });
});

describe('send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardOperation.mockResolvedValue(undefined);
    mockGetProfile.mockResolvedValue({ data: { emailAddress: 'me@example.com' } });
    mockMessagesSend.mockResolvedValue({
      data: { id: 'sent-1', threadId: 'thread-new', labelIds: ['SENT'] },
    });
  });

  it('guards as DESTRUCTIVE', async () => {
    await send(fakeAuth, { to: 'test@example.com', subject: 'Hi', body: 'Hello' });

    expect(mockGuardOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'gmail.send',
        level: 'DESTRUCTIVE',
      })
    );
  });

  it('sends and returns WriteResult', async () => {
    const result = await send(fakeAuth, {
      to: 'test@example.com',
      subject: 'Hi',
      body: 'Hello',
    });

    expect(result.ok).toBe(true);
    expect(result.id).toBe('sent-1');
    expect(result.threadId).toBe('thread-new');
    expect(mockMessagesSend).toHaveBeenCalled();
  });

  it('throws SafetyError when guard blocks', async () => {
    mockGuardOperation.mockRejectedValue(
      new SafetyError('gmail.send')
    );

    await expect(
      send(fakeAuth, { to: 'test@example.com', subject: 'Hi', body: 'Hello' })
    ).rejects.toThrow(SafetyError);
  });
});

describe('reply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardOperation.mockResolvedValue(undefined);
    mockGetProfile.mockResolvedValue({ data: { emailAddress: 'me@example.com' } });
    mockMessagesGet.mockResolvedValue({ data: fakeRawMessage });
    mockMessagesSend.mockResolvedValue({
      data: { id: 'reply-1', threadId: 'thread-1' },
    });
  });

  it('guards as DESTRUCTIVE', async () => {
    await reply(fakeAuth, {
      threadId: 'thread-1',
      messageId: 'msg-1',
      body: 'Thanks',
    });

    expect(mockGuardOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'gmail.reply',
        level: 'DESTRUCTIVE',
      })
    );
  });

  it('fetches original message for threading', async () => {
    await reply(fakeAuth, {
      threadId: 'thread-1',
      messageId: 'msg-1',
      body: 'Thanks',
    });

    expect(mockMessagesGet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'msg-1' })
    );
  });

  it('sends reply with threadId and returns WriteResult', async () => {
    const result = await reply(fakeAuth, {
      threadId: 'thread-1',
      messageId: 'msg-1',
      body: 'Thanks',
    });

    expect(result.ok).toBe(true);
    expect(result.id).toBe('reply-1');
    expect(mockMessagesSend).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ threadId: 'thread-1' }),
      })
    );
  });

  it('uses RFC 2822 Message-ID for In-Reply-To when available', async () => {
    const payloadWithMessageId = {
      ...fakeMessagePayload,
      headers: [
        ...fakeMessagePayload.headers,
        { name: 'Message-ID', value: '<CAxxxxxx@mail.gmail.com>' },
      ],
    };
    mockMessagesGet.mockResolvedValue({
      data: { ...fakeRawMessage, payload: payloadWithMessageId },
    });

    await reply(fakeAuth, {
      threadId: 'thread-1',
      messageId: 'msg-1',
      body: 'Thanks',
    });

    const sendCall = mockMessagesSend.mock.calls[0][0];
    const raw = sendCall.requestBody.raw;
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    expect(decoded).toContain('In-Reply-To: <CAxxxxxx@mail.gmail.com>');
    expect(decoded).toContain('References: <CAxxxxxx@mail.gmail.com>');
  });

  it('falls back to Gmail message ID for In-Reply-To when no Message-ID header', async () => {
    // Default fixture has no Message-ID header
    await reply(fakeAuth, {
      threadId: 'thread-1',
      messageId: 'msg-1',
      body: 'Thanks',
    });

    const sendCall = mockMessagesSend.mock.calls[0][0];
    const raw = sendCall.requestBody.raw;
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    expect(decoded).toContain('In-Reply-To: <msg-1>');
  });
});

describe('forward', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardOperation.mockResolvedValue(undefined);
    mockGetProfile.mockResolvedValue({ data: { emailAddress: 'me@example.com' } });
    mockMessagesGet.mockResolvedValue({ data: fakeRawMessage });
    mockMessagesSend.mockResolvedValue({
      data: { id: 'fwd-1', threadId: 'thread-fwd' },
    });
  });

  it('creates draft by default (no safety guard)', async () => {
    mockDraftsCreate.mockResolvedValue({
      data: { id: 'draft-fwd-1', message: {} },
    });

    const result = await forward(fakeAuth, {
      messageId: 'msg-1',
      to: 'other@example.com',
    });

    expect(mockGuardOperation).not.toHaveBeenCalled();
    expect(mockDraftsCreate).toHaveBeenCalled();
    expect(mockMessagesSend).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.id).toBe('draft-fwd-1');
  });

  it('guards as DESTRUCTIVE when sendNow', async () => {
    await forward(fakeAuth, {
      messageId: 'msg-1',
      to: 'other@example.com',
      sendNow: true,
    });

    expect(mockGuardOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'gmail.forward',
        level: 'DESTRUCTIVE',
      })
    );
    expect(mockMessagesSend).toHaveBeenCalled();
  });

  it('fetches original message', async () => {
    mockDraftsCreate.mockResolvedValue({
      data: { id: 'draft-fwd-1', message: {} },
    });

    await forward(fakeAuth, {
      messageId: 'msg-1',
      to: 'other@example.com',
    });

    expect(mockMessagesGet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'msg-1' })
    );
  });

  it('sends forwarded message when sendNow and returns WriteResult', async () => {
    const result = await forward(fakeAuth, {
      messageId: 'msg-1',
      to: 'other@example.com',
      body: 'FYI',
      sendNow: true,
    });

    expect(result.ok).toBe(true);
    expect(result.id).toBe('fwd-1');
    expect(mockMessagesSend).toHaveBeenCalled();
  });

  it('fetches attachments when original has them', async () => {
    mockDraftsCreate.mockResolvedValue({
      data: { id: 'draft-fwd-1', message: {} },
    });
    const payloadWithAttachment = {
      ...fakeMessagePayload,
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: { data: textBody } },
        {
          mimeType: 'application/pdf',
          filename: 'doc.pdf',
          body: { attachmentId: 'att-1', size: 100 },
        },
      ],
    };
    mockMessagesGet.mockResolvedValue({
      data: { ...fakeRawMessage, payload: payloadWithAttachment },
    });
    const attData = Buffer.from('pdf data').toString('base64url');
    mockAttachmentsGet.mockResolvedValue({ data: { data: attData } });

    await forward(fakeAuth, {
      messageId: 'msg-1',
      to: 'other@example.com',
    });

    expect(mockAttachmentsGet).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'msg-1', id: 'att-1' })
    );
  });

  it('skips attachments when includeAttachments is false', async () => {
    mockDraftsCreate.mockResolvedValue({
      data: { id: 'draft-fwd-1', message: {} },
    });
    const payloadWithAttachment = {
      ...fakeMessagePayload,
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: { data: textBody } },
        {
          mimeType: 'application/pdf',
          filename: 'doc.pdf',
          body: { attachmentId: 'att-1', size: 100 },
        },
      ],
    };
    mockMessagesGet.mockResolvedValue({
      data: { ...fakeRawMessage, payload: payloadWithAttachment },
    });

    await forward(fakeAuth, {
      messageId: 'msg-1',
      to: 'other@example.com',
      includeAttachments: false,
    });

    expect(mockAttachmentsGet).not.toHaveBeenCalled();
  });

  it('prefixes subject with Fwd: if not already', async () => {
    mockDraftsCreate.mockResolvedValue({
      data: { id: 'draft-fwd-1', message: {} },
    });
    mockMessagesGet.mockResolvedValue({
      data: fakeRawMessage,
    });

    await forward(fakeAuth, {
      messageId: 'msg-1',
      to: 'other@example.com',
    });

    // Verify the MIME in the draft has Fwd: prefix
    const createCall = mockDraftsCreate.mock.calls[0][0];
    const raw = createCall.requestBody.message.raw;
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    expect(decoded).toContain('Subject: Fwd: Test Email');
  });
});

describe('batchModifyLabels', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls batchModify and returns WriteResult', async () => {
    mockMessagesBatchModify.mockResolvedValue({});

    const result = await batchModifyLabels(fakeAuth, {
      messageIds: ['msg-1', 'msg-2'],
      addLabelIds: ['Label_1'],
      removeLabelIds: ['UNREAD'],
    });

    expect(result.ok).toBe(true);
    expect(result.id).toBe('batch:2');
    expect(mockMessagesBatchModify).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: {
          ids: ['msg-1', 'msg-2'],
          addLabelIds: ['Label_1'],
          removeLabelIds: ['UNREAD'],
        },
      })
    );
  });
});

describe('listLabels', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns label list', async () => {
    mockLabelsList.mockResolvedValue({
      data: {
        labels: [
          { id: 'INBOX', name: 'INBOX', type: 'system' },
          { id: 'Label_1', name: 'Custom', type: 'user' },
        ],
      },
    });

    const labels = await listLabels(fakeAuth);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toEqual({ id: 'INBOX', name: 'INBOX', type: 'system' });
    expect(labels[1]).toEqual({ id: 'Label_1', name: 'Custom', type: 'user' });
  });
});

describe('createDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProfile.mockResolvedValue({ data: { emailAddress: 'me@example.com' } });
    mockDraftsCreate.mockResolvedValue({
      data: {
        id: 'draft-1',
        message: fakeRawMessage,
      },
    });
  });

  it('does NOT call guardOperation (WRITE, not DESTRUCTIVE)', async () => {
    await createDraft(fakeAuth, {
      to: 'test@example.com',
      subject: 'Draft',
      body: 'Content',
    });

    expect(mockGuardOperation).not.toHaveBeenCalled();
  });

  it('returns GmailDraft', async () => {
    const draft = await createDraft(fakeAuth, {
      to: 'test@example.com',
      subject: 'Draft',
      body: 'Content',
    });

    expect(draft.id).toBe('draft-1');
    expect(draft.message.id).toBe('msg-1');
  });

  it('passes threadId to API when provided', async () => {
    await createDraft(fakeAuth, {
      to: 'test@example.com',
      subject: 'RE: Thread',
      body: 'Reply',
      threadId: 'thread-42',
    });

    expect(mockDraftsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          message: expect.objectContaining({
            threadId: 'thread-42',
          }),
        }),
      })
    );
  });

  it('does not set threadId when not provided', async () => {
    await createDraft(fakeAuth, {
      to: 'test@example.com',
      subject: 'New',
      body: 'Content',
    });

    const call = mockDraftsCreate.mock.calls[0][0];
    expect(call.requestBody.message.threadId).toBeUndefined();
  });

  it('includes extraHeaders (In-Reply-To, References) in MIME', async () => {
    await createDraft(fakeAuth, {
      to: 'test@example.com',
      subject: 'RE: Thread',
      body: 'Reply',
      threadId: 'thread-42',
      extraHeaders: {
        'In-Reply-To': '<CAxxxxxx@mail.gmail.com>',
        'References': '<CAxxxxxx@mail.gmail.com>',
      },
    });

    const call = mockDraftsCreate.mock.calls[0][0];
    const raw = call.requestBody.message.raw;
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    expect(decoded).toContain('In-Reply-To: <CAxxxxxx@mail.gmail.com>');
    expect(decoded).toContain('References: <CAxxxxxx@mail.gmail.com>');
  });
});

describe('sendDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardOperation.mockResolvedValue(undefined);
    mockDraftsSend.mockResolvedValue({
      data: { id: 'sent-draft-1', threadId: 'thread-1' },
    });
  });

  it('guards as DESTRUCTIVE', async () => {
    await sendDraft(fakeAuth, 'draft-1');

    expect(mockGuardOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'gmail.sendDraft',
        level: 'DESTRUCTIVE',
      })
    );
  });

  it('returns WriteResult', async () => {
    const result = await sendDraft(fakeAuth, 'draft-1');
    expect(result.ok).toBe(true);
    expect(result.id).toBe('sent-draft-1');
  });
});

describe('listDrafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDraftsList.mockResolvedValue({
      data: {
        drafts: [{ id: 'draft-1' }],
        nextPageToken: undefined,
      },
    });
    mockDraftsGet.mockResolvedValue({
      data: {
        id: 'draft-1',
        message: fakeRawMessage,
      },
    });
  });

  it('lists and fetches full drafts', async () => {
    const result = await listDrafts(fakeAuth);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('draft-1');
    expect(result.items[0].message.id).toBe('msg-1');
  });
});

describe('getAttachmentContent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns attachment as Buffer', async () => {
    const data = Buffer.from('file content').toString('base64url');
    mockAttachmentsGet.mockResolvedValue({ data: { data } });

    const buf = await getAttachmentContent(fakeAuth, 'msg-1', 'att-1');
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.toString()).toBe('file content');
  });

  it('throws GoEasyError for empty attachment data', async () => {
    mockAttachmentsGet.mockResolvedValue({ data: {} });
    await expect(
      getAttachmentContent(fakeAuth, 'msg-1', 'att-1')
    ).rejects.toThrow(GoEasyError);
  });
});

