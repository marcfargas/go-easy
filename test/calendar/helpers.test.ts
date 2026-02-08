import { describe, it, expect } from 'vitest';
import {
  parseEvent,
  parseAttendee,
  parseCalendar,
  buildEventBody,
} from '../../src/calendar/helpers.js';

describe('parseEvent', () => {
  it('parses a timed event', () => {
    const event = parseEvent({
      id: 'evt-1',
      summary: 'Team Meeting',
      description: 'Weekly sync',
      start: { dateTime: '2026-02-10T10:00:00+01:00', timeZone: 'Europe/Madrid' },
      end: { dateTime: '2026-02-10T11:00:00+01:00', timeZone: 'Europe/Madrid' },
      location: 'Office',
      status: 'confirmed',
      htmlLink: 'https://calendar.google.com/...',
      organizer: { email: 'org@example.com', displayName: 'Organizer' },
      creator: { email: 'creator@example.com' },
      attendees: [
        { email: 'a@example.com', responseStatus: 'accepted' },
      ],
    });

    expect(event.id).toBe('evt-1');
    expect(event.summary).toBe('Team Meeting');
    expect(event.description).toBe('Weekly sync');
    expect(event.start).toBe('2026-02-10T10:00:00+01:00');
    expect(event.end).toBe('2026-02-10T11:00:00+01:00');
    expect(event.timeZone).toBe('Europe/Madrid');
    expect(event.location).toBe('Office');
    expect(event.allDay).toBe(false);
    expect(event.status).toBe('confirmed');
    expect(event.organizer?.email).toBe('org@example.com');
    expect(event.attendees).toHaveLength(1);
  });

  it('parses an all-day event', () => {
    const event = parseEvent({
      id: 'evt-2',
      summary: 'Holiday',
      start: { date: '2026-02-14' },
      end: { date: '2026-02-15' },
    });

    expect(event.start).toBe('2026-02-14');
    expect(event.end).toBe('2026-02-15');
    expect(event.allDay).toBe(true);
  });

  it('handles missing fields', () => {
    const event = parseEvent({});
    expect(event.id).toBe('');
    expect(event.summary).toBe('(no title)');
    expect(event.start).toBe('');
    expect(event.allDay).toBe(false);
    expect(event.attendees).toBeUndefined();
  });
});

describe('parseAttendee', () => {
  it('parses attendee', () => {
    const att = parseAttendee({
      email: 'user@example.com',
      displayName: 'User',
      responseStatus: 'accepted',
      organizer: true,
      self: false,
    });

    expect(att.email).toBe('user@example.com');
    expect(att.displayName).toBe('User');
    expect(att.responseStatus).toBe('accepted');
    expect(att.organizer).toBe(true);
    expect(att.self).toBe(false);
  });

  it('handles missing fields', () => {
    const att = parseAttendee({});
    expect(att.email).toBe('');
    expect(att.displayName).toBeUndefined();
  });
});

describe('parseCalendar', () => {
  it('parses calendar info', () => {
    const cal = parseCalendar({
      id: 'cal-1',
      summary: 'My Calendar',
      description: 'Personal',
      primary: true,
      timeZone: 'Europe/Madrid',
      backgroundColor: '#4285f4',
    });

    expect(cal.id).toBe('cal-1');
    expect(cal.summary).toBe('My Calendar');
    expect(cal.primary).toBe(true);
    expect(cal.timeZone).toBe('Europe/Madrid');
  });
});

describe('buildEventBody', () => {
  it('builds timed event body', () => {
    const body = buildEventBody({
      summary: 'Meeting',
      description: 'Discuss project',
      start: '2026-02-10T10:00:00+01:00',
      end: '2026-02-10T11:00:00+01:00',
      timeZone: 'Europe/Madrid',
      location: 'Office',
      attendees: ['a@example.com', 'b@example.com'],
    });

    expect(body.summary).toBe('Meeting');
    expect(body.description).toBe('Discuss project');
    expect(body.start?.dateTime).toBe('2026-02-10T10:00:00+01:00');
    expect(body.start?.timeZone).toBe('Europe/Madrid');
    expect(body.end?.dateTime).toBe('2026-02-10T11:00:00+01:00');
    expect(body.location).toBe('Office');
    expect(body.attendees).toHaveLength(2);
    expect(body.attendees![0].email).toBe('a@example.com');
  });

  it('builds all-day event body', () => {
    const body = buildEventBody({
      summary: 'Holiday',
      start: '2026-02-14',
      end: '2026-02-15',
      allDay: true,
    });

    expect(body.start?.date).toBe('2026-02-14');
    expect(body.start?.dateTime).toBeUndefined();
    expect(body.end?.date).toBe('2026-02-15');
  });

  it('omits attendees when empty', () => {
    const body = buildEventBody({
      summary: 'Solo',
      start: '2026-02-10T10:00:00Z',
      end: '2026-02-10T11:00:00Z',
    });

    expect(body.attendees).toBeUndefined();
  });
});
