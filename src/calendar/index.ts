/**
 * Calendar module — list calendars, manage events, check availability.
 *
 * All functions take an OAuth2Client as first argument.
 * Use `getAuth('calendar', 'account@email.com')` from the auth module.
 */

import { calendar } from '@googleapis/calendar';
import type { OAuth2Client } from 'google-auth-library';
import { guardOperation } from '../safety.js';
import { NotFoundError, QuotaError, GoEasyError } from '../errors.js';
import { parseEvent, parseCalendar, buildEventBody } from './helpers.js';
import type {
  CalendarEvent,
  CalendarInfo,
  FreeBusyResult,
  ListResult,
  WriteResult,
  ListEventsOptions,
  EventOptions,
} from './types.js';

export type {
  CalendarEvent,
  CalendarInfo,
  FreeBusyResult,
  ListResult,
  WriteResult,
  ListEventsOptions,
  EventOptions,
};
export type { Attendee, FreeBusySlot } from './types.js';

/** Get a Calendar API client instance */
function calendarApi(auth: OAuth2Client) {
  return calendar({ version: 'v3', auth });
}

/** Wrap Google API errors into our error types */
function handleApiError(err: unknown, context: string): never {
  if (err instanceof GoEasyError) throw err;

  const gErr = err as { code?: number; message?: string };
  if (gErr.code === 404) throw new NotFoundError('event', context, err);
  if (gErr.code === 429) throw new QuotaError('calendar', err);
  throw new GoEasyError(
    `Calendar ${context}: ${gErr.message ?? 'Unknown error'}`,
    'CALENDAR_ERROR',
    err
  );
}

/**
 * List all calendars for the account.
 */
export async function listCalendars(
  auth: OAuth2Client
): Promise<CalendarInfo[]> {
  const cal = calendarApi(auth);

  try {
    const res = await cal.calendarList.list();
    return (res.data.items ?? []).map(parseCalendar);
  } catch (err) {
    handleApiError(err, 'listCalendars');
  }
}

/**
 * List events on a calendar.
 *
 * @param calendarId - Calendar ID or 'primary' for the main calendar
 *
 * @example
 * ```ts
 * const events = await listEvents(auth, 'primary', {
 *   timeMin: '2026-02-01T00:00:00Z',
 *   timeMax: '2026-02-28T23:59:59Z',
 * });
 * ```
 */
export async function listEvents(
  auth: OAuth2Client,
  calendarId: string,
  opts: ListEventsOptions = {}
): Promise<ListResult<CalendarEvent>> {
  const cal = calendarApi(auth);

  const singleEvents = opts.singleEvents ?? true;

  try {
    const res = await cal.events.list({
      calendarId,
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      maxResults: opts.maxResults ?? 20,
      pageToken: opts.pageToken,
      q: opts.query,
      singleEvents,
      orderBy: opts.orderBy ?? (singleEvents ? 'startTime' : undefined),
    });

    return {
      items: (res.data.items ?? []).map(parseEvent),
      nextPageToken: res.data.nextPageToken ?? undefined,
    };
  } catch (err) {
    handleApiError(err, 'listEvents');
  }
}

/**
 * Get a single event by ID.
 */
export async function getEvent(
  auth: OAuth2Client,
  calendarId: string,
  eventId: string
): Promise<CalendarEvent> {
  const cal = calendarApi(auth);

  try {
    const res = await cal.events.get({ calendarId, eventId });
    return parseEvent(res.data);
  } catch (err) {
    handleApiError(err, eventId);
  }
}

/**
 * Create a new event.
 *
 * WRITE operation — no safety gate (reversible via delete).
 */
export async function createEvent(
  auth: OAuth2Client,
  calendarId: string,
  opts: EventOptions
): Promise<WriteResult> {
  const cal = calendarApi(auth);
  const body = buildEventBody(opts);

  try {
    const res = await cal.events.insert({
      calendarId,
      requestBody: body,
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      htmlLink: res.data.htmlLink ?? undefined,
    };
  } catch (err) {
    handleApiError(err, 'createEvent');
  }
}

/**
 * Update an existing event.
 *
 * WRITE operation — no safety gate (reversible).
 */
export async function updateEvent(
  auth: OAuth2Client,
  calendarId: string,
  eventId: string,
  opts: EventOptions
): Promise<WriteResult> {
  const cal = calendarApi(auth);
  const body = buildEventBody(opts);

  try {
    const res = await cal.events.update({
      calendarId,
      eventId,
      requestBody: body,
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      htmlLink: res.data.htmlLink ?? undefined,
    };
  } catch (err) {
    handleApiError(err, `updateEvent ${eventId}`);
  }
}

/**
 * Delete an event.
 *
 * ⚠️ DESTRUCTIVE — requires safety confirmation.
 */
export async function deleteEvent(
  auth: OAuth2Client,
  calendarId: string,
  eventId: string
): Promise<WriteResult> {
  // Fetch event to show details in confirmation
  const event = await getEvent(auth, calendarId, eventId);

  const hasAttendees = (event.attendees?.length ?? 0) > 0;
  const description = hasAttendees
    ? `Delete event "${event.summary}" (${event.start}) with ${event.attendees!.length} attendees — cancellation emails will be sent`
    : `Delete event "${event.summary}" (${event.start})`;

  await guardOperation({
    name: 'calendar.delete',
    level: 'DESTRUCTIVE',
    description,
    details: {
      eventId,
      summary: event.summary,
      start: event.start,
      attendees: event.attendees?.map((a) => a.email),
    },
  });

  const cal = calendarApi(auth);

  try {
    await cal.events.delete({ calendarId, eventId });
    return { ok: true, id: eventId };
  } catch (err) {
    handleApiError(err, `deleteEvent ${eventId}`);
  }
}

/**
 * Query free/busy information for one or more calendars.
 *
 * @example
 * ```ts
 * const result = await queryFreeBusy(auth,
 *   ['primary', 'colleague@example.com'],
 *   '2026-02-10T00:00:00Z',
 *   '2026-02-10T23:59:59Z'
 * );
 * ```
 */
export async function queryFreeBusy(
  auth: OAuth2Client,
  calendarIds: string[],
  timeMin: string,
  timeMax: string
): Promise<FreeBusyResult[]> {
  const cal = calendarApi(auth);

  try {
    const res = await cal.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: calendarIds.map((id) => ({ id })),
      },
    });

    const calendars = res.data.calendars ?? {};
    return calendarIds.map((calId) => ({
      calendarId: calId,
      busy: (calendars[calId]?.busy ?? []).map((slot) => ({
        start: slot.start ?? '',
        end: slot.end ?? '',
      })),
    }));
  } catch (err) {
    handleApiError(err, 'queryFreeBusy');
  }
}
