/**
 * Calendar types — agent-friendly shapes, not raw API types.
 */

/** A simplified calendar event */
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  /** ISO 8601 datetime or date (for all-day events) */
  start: string;
  /** ISO 8601 datetime or date (for all-day events) */
  end: string;
  /** Timezone (e.g. 'Europe/Madrid') */
  timeZone?: string;
  location?: string;
  attendees?: Attendee[];
  status?: 'confirmed' | 'tentative' | 'cancelled';
  /** Link to open in browser */
  htmlLink?: string;
  /** For recurring event instances */
  recurringEventId?: string;
  /** Whether this is an all-day event */
  allDay?: boolean;
  /** Organizer */
  organizer?: { email: string; displayName?: string };
  /** Creator */
  creator?: { email: string; displayName?: string };
}

/** An event attendee */
export interface Attendee {
  email: string;
  displayName?: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  organizer?: boolean;
  self?: boolean;
}

/** Calendar metadata */
export interface CalendarInfo {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  timeZone?: string;
  /** Background color */
  backgroundColor?: string;
}

/** A busy slot in free/busy query results */
export interface FreeBusySlot {
  start: string;
  end: string;
}

/** Free/busy result per calendar */
export interface FreeBusyResult {
  calendarId: string;
  busy: FreeBusySlot[];
}

/** Options for listing events */
export interface ListEventsOptions {
  /** Start of time range (ISO 8601) */
  timeMin?: string;
  /** End of time range (ISO 8601) */
  timeMax?: string;
  /** Maximum results (default: 20) */
  maxResults?: number;
  /** Page token for pagination */
  pageToken?: string;
  /** Text search query */
  query?: string;
  /** Whether to expand recurring events into instances (default: true) */
  singleEvents?: boolean;
  /** Order by (default: 'startTime' when singleEvents=true) */
  orderBy?: string;
}

/** Options for creating/updating an event */
export interface EventOptions {
  summary: string;
  description?: string;
  /** ISO 8601 datetime or date */
  start: string;
  /** ISO 8601 datetime or date */
  end: string;
  /** Timezone (default: account's timezone) */
  timeZone?: string;
  location?: string;
  /** Attendee emails */
  attendees?: string[];
  /** Whether this is an all-day event */
  allDay?: boolean;
}

/** Paginated list result */
export interface ListResult<T> {
  items: T[];
  nextPageToken?: string;
}

/** Result of a write operation */
export interface WriteResult {
  ok: true;
  id: string;
  htmlLink?: string;
}
