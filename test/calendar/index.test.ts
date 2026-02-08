import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OAuth2Client } from 'google-auth-library';
import { NotFoundError, QuotaError, SafetyError } from '../../src/errors.js';

// ─── Calendar API Mock ─────────────────────────────────────

const mockCalendarListList = vi.fn();
const mockEventsList = vi.fn();
const mockEventsGet = vi.fn();
const mockEventsInsert = vi.fn();
const mockEventsUpdate = vi.fn();
const mockEventsDelete = vi.fn();
const mockFreebusyQuery = vi.fn();

vi.mock('@googleapis/calendar', () => ({
  calendar: () => ({
    calendarList: {
      list: (args?: unknown) => mockCalendarListList(args),
    },
    events: {
      list: (args: unknown) => mockEventsList(args),
      get: (args: unknown) => mockEventsGet(args),
      insert: (args: unknown) => mockEventsInsert(args),
      update: (args: unknown) => mockEventsUpdate(args),
      delete: (args: unknown) => mockEventsDelete(args),
    },
    freebusy: {
      query: (args: unknown) => mockFreebusyQuery(args),
    },
  }),
}));

const mockGuardOperation = vi.fn();
vi.mock('../../src/safety.js', () => ({
  guardOperation: (...args: unknown[]) => mockGuardOperation(...args),
}));

import {
  listCalendars,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  queryFreeBusy,
} from '../../src/calendar/index.js';

// ─── Fixtures ──────────────────────────────────────────────

const fakeAuth = {} as OAuth2Client;

const fakeRawEvent = {
  id: 'evt-1',
  summary: 'Team Meeting',
  start: { dateTime: '2026-02-10T10:00:00+01:00', timeZone: 'Europe/Madrid' },
  end: { dateTime: '2026-02-10T11:00:00+01:00', timeZone: 'Europe/Madrid' },
  status: 'confirmed',
  htmlLink: 'https://calendar.google.com/...',
};

// ─── Tests ─────────────────────────────────────────────────

describe('listCalendars', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns calendar list', async () => {
    mockCalendarListList.mockResolvedValue({
      data: {
        items: [
          { id: 'primary', summary: 'My Calendar', primary: true, timeZone: 'Europe/Madrid' },
          { id: 'other', summary: 'Work', primary: false },
        ],
      },
    });

    const cals = await listCalendars(fakeAuth);
    expect(cals).toHaveLength(2);
    expect(cals[0].id).toBe('primary');
    expect(cals[0].primary).toBe(true);
    expect(cals[1].summary).toBe('Work');
  });
});

describe('listEvents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists events with default options', async () => {
    mockEventsList.mockResolvedValue({
      data: { items: [fakeRawEvent], nextPageToken: 'page2' },
    });

    const result = await listEvents(fakeAuth, 'primary');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].summary).toBe('Team Meeting');
    expect(result.nextPageToken).toBe('page2');
  });

  it('passes time range and max results', async () => {
    mockEventsList.mockResolvedValue({ data: { items: [] } });

    await listEvents(fakeAuth, 'primary', {
      timeMin: '2026-02-01T00:00:00Z',
      timeMax: '2026-02-28T23:59:59Z',
      maxResults: 50,
    });

    expect(mockEventsList).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        timeMin: '2026-02-01T00:00:00Z',
        timeMax: '2026-02-28T23:59:59Z',
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime',
      })
    );
  });

  it('returns empty list when no events', async () => {
    mockEventsList.mockResolvedValue({ data: {} });
    const result = await listEvents(fakeAuth, 'primary');
    expect(result.items).toEqual([]);
  });
});

describe('getEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed event', async () => {
    mockEventsGet.mockResolvedValue({ data: fakeRawEvent });
    const event = await getEvent(fakeAuth, 'primary', 'evt-1');
    expect(event.id).toBe('evt-1');
    expect(event.summary).toBe('Team Meeting');
  });

  it('throws NotFoundError for 404', async () => {
    mockEventsGet.mockRejectedValue({ code: 404, message: 'Not found' });
    await expect(getEvent(fakeAuth, 'primary', 'bad')).rejects.toThrow(NotFoundError);
  });

  it('throws QuotaError for 429', async () => {
    mockEventsGet.mockRejectedValue({ code: 429, message: 'Rate limit' });
    await expect(getEvent(fakeAuth, 'primary', 'evt')).rejects.toThrow(QuotaError);
  });
});

describe('createEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates event and returns WriteResult', async () => {
    mockEventsInsert.mockResolvedValue({
      data: { id: 'new-evt', htmlLink: 'https://...' },
    });

    const result = await createEvent(fakeAuth, 'primary', {
      summary: 'New Meeting',
      start: '2026-02-10T14:00:00+01:00',
      end: '2026-02-10T15:00:00+01:00',
    });

    expect(result.ok).toBe(true);
    expect(result.id).toBe('new-evt');
    expect(mockGuardOperation).not.toHaveBeenCalled();
  });

  it('passes attendees to API', async () => {
    mockEventsInsert.mockResolvedValue({ data: { id: 'new-evt' } });

    await createEvent(fakeAuth, 'primary', {
      summary: 'With People',
      start: '2026-02-10T14:00:00Z',
      end: '2026-02-10T15:00:00Z',
      attendees: ['a@example.com', 'b@example.com'],
    });

    const call = mockEventsInsert.mock.calls[0][0];
    expect(call.requestBody.attendees).toHaveLength(2);
  });
});

describe('updateEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates event and returns WriteResult', async () => {
    mockEventsUpdate.mockResolvedValue({
      data: { id: 'evt-1', htmlLink: 'https://...' },
    });

    const result = await updateEvent(fakeAuth, 'primary', 'evt-1', {
      summary: 'Updated Meeting',
      start: '2026-02-10T14:00:00Z',
      end: '2026-02-10T15:00:00Z',
    });

    expect(result.ok).toBe(true);
    expect(result.id).toBe('evt-1');
    expect(mockGuardOperation).not.toHaveBeenCalled();
  });
});

describe('deleteEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardOperation.mockResolvedValue(undefined);
    mockEventsGet.mockResolvedValue({ data: fakeRawEvent });
    mockEventsDelete.mockResolvedValue({});
  });

  it('guards as DESTRUCTIVE', async () => {
    await deleteEvent(fakeAuth, 'primary', 'evt-1');
    expect(mockGuardOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'calendar.delete',
        level: 'DESTRUCTIVE',
      })
    );
  });

  it('fetches event for confirmation details', async () => {
    await deleteEvent(fakeAuth, 'primary', 'evt-1');
    expect(mockEventsGet).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: 'primary', eventId: 'evt-1' })
    );
  });

  it('returns WriteResult', async () => {
    const result = await deleteEvent(fakeAuth, 'primary', 'evt-1');
    expect(result.ok).toBe(true);
    expect(result.id).toBe('evt-1');
  });

  it('mentions attendees in description when present', async () => {
    mockEventsGet.mockResolvedValue({
      data: {
        ...fakeRawEvent,
        attendees: [
          { email: 'a@example.com', responseStatus: 'accepted' },
          { email: 'b@example.com', responseStatus: 'needsAction' },
        ],
      },
    });

    await deleteEvent(fakeAuth, 'primary', 'evt-1');

    const guardCall = mockGuardOperation.mock.calls[0][0];
    expect(guardCall.description).toContain('2 attendees');
    expect(guardCall.description).toContain('cancellation');
  });

  it('throws SafetyError when blocked', async () => {
    mockGuardOperation.mockRejectedValue(new SafetyError('calendar.delete'));
    await expect(deleteEvent(fakeAuth, 'primary', 'evt-1')).rejects.toThrow(SafetyError);
  });
});

describe('queryFreeBusy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns free/busy results per calendar', async () => {
    mockFreebusyQuery.mockResolvedValue({
      data: {
        calendars: {
          primary: {
            busy: [
              { start: '2026-02-10T10:00:00Z', end: '2026-02-10T11:00:00Z' },
              { start: '2026-02-10T14:00:00Z', end: '2026-02-10T15:00:00Z' },
            ],
          },
          other: { busy: [] },
        },
      },
    });

    const results = await queryFreeBusy(
      fakeAuth,
      ['primary', 'other'],
      '2026-02-10T00:00:00Z',
      '2026-02-10T23:59:59Z'
    );

    expect(results).toHaveLength(2);
    expect(results[0].calendarId).toBe('primary');
    expect(results[0].busy).toHaveLength(2);
    expect(results[1].calendarId).toBe('other');
    expect(results[1].busy).toHaveLength(0);
  });
});
