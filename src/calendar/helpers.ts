/**
 * Calendar helpers — event parsing and date handling.
 */

import type { calendar_v3 } from '@googleapis/calendar';
import type { CalendarEvent, Attendee, CalendarInfo } from './types.js';

/** Parse a raw Calendar API event into our CalendarEvent shape */
export function parseEvent(raw: calendar_v3.Schema$Event): CalendarEvent {
  const isAllDay = !!raw.start?.date;

  return {
    id: raw.id ?? '',
    summary: raw.summary ?? '(no title)',
    description: raw.description ?? undefined,
    start: isAllDay ? (raw.start?.date ?? '') : (raw.start?.dateTime ?? ''),
    end: isAllDay ? (raw.end?.date ?? '') : (raw.end?.dateTime ?? ''),
    timeZone: raw.start?.timeZone ?? undefined,
    location: raw.location ?? undefined,
    attendees: raw.attendees?.map(parseAttendee) ?? undefined,
    status: raw.status as CalendarEvent['status'] ?? undefined,
    htmlLink: raw.htmlLink ?? undefined,
    recurringEventId: raw.recurringEventId ?? undefined,
    allDay: isAllDay,
    organizer: raw.organizer
      ? { email: raw.organizer.email ?? '', displayName: raw.organizer.displayName ?? undefined }
      : undefined,
    creator: raw.creator
      ? { email: raw.creator.email ?? '', displayName: raw.creator.displayName ?? undefined }
      : undefined,
  };
}

/** Parse an attendee */
export function parseAttendee(raw: calendar_v3.Schema$EventAttendee): Attendee {
  return {
    email: raw.email ?? '',
    displayName: raw.displayName ?? undefined,
    responseStatus: raw.responseStatus as Attendee['responseStatus'] ?? undefined,
    organizer: raw.organizer ?? undefined,
    self: raw.self ?? undefined,
  };
}

/** Parse a calendar list entry */
export function parseCalendar(raw: calendar_v3.Schema$CalendarListEntry): CalendarInfo {
  return {
    id: raw.id ?? '',
    summary: raw.summary ?? '',
    description: raw.description ?? undefined,
    primary: raw.primary ?? undefined,
    timeZone: raw.timeZone ?? undefined,
    backgroundColor: raw.backgroundColor ?? undefined,
  };
}

/** Build event request body from EventOptions */
export function buildEventBody(
  opts: { summary: string; description?: string; start: string; end: string; timeZone?: string; location?: string; attendees?: string[]; allDay?: boolean }
): calendar_v3.Schema$Event {
  const event: calendar_v3.Schema$Event = {
    summary: opts.summary,
    description: opts.description,
    location: opts.location,
  };

  if (opts.allDay) {
    event.start = { date: opts.start };
    event.end = { date: opts.end };
  } else {
    event.start = { dateTime: opts.start, timeZone: opts.timeZone };
    event.end = { dateTime: opts.end, timeZone: opts.timeZone };
  }

  if (opts.attendees?.length) {
    event.attendees = opts.attendees.map((email) => ({ email }));
  }

  return event;
}
