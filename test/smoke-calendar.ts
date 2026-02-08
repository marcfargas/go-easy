/**
 * Smoke test — verify go-easy Calendar module works against real API.
 * READ-only operations, no destructive actions.
 *
 * Run: npx tsx test/smoke-calendar.ts
 */

import { getAuth } from '../src/auth.js';
import * as calendar from '../src/calendar/index.js';

async function smoke() {
  const results: Array<{ test: string; status: string; detail?: unknown }> = [];

  try {
    const auth = await getAuth('calendar');
    results.push({ test: 'getAuth("calendar")', status: 'PASS', detail: 'OAuth2Client created' });

    // 1. List calendars
    try {
      const cals = await calendar.listCalendars(auth);
      results.push({
        test: 'listCalendars',
        status: cals.length > 0 ? 'PASS' : 'FAIL',
        detail: {
          count: cals.length,
          calendars: cals.map((c) => ({ id: c.id, summary: c.summary, primary: c.primary })),
        },
      });
    } catch (err) {
      results.push({ test: 'listCalendars', status: 'FAIL', detail: String(err) });
    }

    // 2. List upcoming events (next 7 days)
    try {
      const now = new Date();
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const events = await calendar.listEvents(auth, 'primary', {
        timeMin: now.toISOString(),
        timeMax: weekLater.toISOString(),
        maxResults: 5,
      });
      results.push({
        test: 'listEvents (primary, next 7 days, max=5)',
        status: 'PASS',
        detail: {
          count: events.items.length,
          events: events.items.map((e) => ({ summary: e.summary, start: e.start, allDay: e.allDay })),
        },
      });

      // 3. Get single event (if any)
      if (events.items.length > 0) {
        const eventId = events.items[0].id;
        try {
          const event = await calendar.getEvent(auth, 'primary', eventId);
          results.push({
            test: `getEvent("${eventId}")`,
            status: event.id === eventId ? 'PASS' : 'FAIL',
            detail: { summary: event.summary, start: event.start, end: event.end },
          });
        } catch (err) {
          results.push({ test: 'getEvent', status: 'FAIL', detail: String(err) });
        }
      }
    } catch (err) {
      results.push({ test: 'listEvents', status: 'FAIL', detail: String(err) });
    }

    // 4. Free/busy
    try {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const freebusy = await calendar.queryFreeBusy(
        auth,
        ['primary'],
        now.toISOString(),
        tomorrow.toISOString()
      );
      results.push({
        test: 'queryFreeBusy (primary, next 24h)',
        status: 'PASS',
        detail: {
          calendars: freebusy.length,
          busySlots: freebusy[0]?.busy.length ?? 0,
        },
      });
    } catch (err) {
      results.push({ test: 'queryFreeBusy', status: 'FAIL', detail: String(err) });
    }
  } catch (err) {
    results.push({ test: 'getAuth("calendar")', status: 'FAIL', detail: String(err) });
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  console.log(JSON.stringify({ results, summary: { passed, failed, total: results.length } }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

smoke();
