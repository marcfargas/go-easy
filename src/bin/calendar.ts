#!/usr/bin/env node
/**
 * go-calendar — Gateway CLI for Google Calendar operations.
 *
 * Always outputs JSON. Designed for agent consumption.
 *
 * Usage:
 *   go-calendar <account> <command> [args...]
 *   go-calendar marc@blegal.eu calendars
 *   go-calendar marc@blegal.eu events primary --from=2026-02-01T00:00:00Z
 *   go-calendar marc@blegal.eu create primary --summary="Meeting" --start=... --end=...
 *
 * Safety:
 *   Destructive operations (delete) require --confirm flag.
 */

import { getAuth } from '../auth.js';
import { setSafetyContext } from '../safety.js';
import * as calendar from '../calendar/index.js';

const args = process.argv.slice(2);

function usage(): never {
  console.log(JSON.stringify({
    error: 'USAGE',
    message: 'go-calendar <account> <command> [args...]',
    commands: {
      calendars: 'go-calendar <account> calendars',
      events: 'go-calendar <account> events <calendarId> [--from=<dt>] [--to=<dt>] [--max=N] [--query="..."]',
      event: 'go-calendar <account> event <calendarId> <eventId>',
      create: 'go-calendar <account> create <calendarId> --summary="..." --start=<dt> --end=<dt> [--description="..."] [--location="..."] [--attendees=a@b,c@d] [--all-day] [--tz=<tz>]',
      update: 'go-calendar <account> update <calendarId> <eventId> --summary="..." --start=<dt> --end=<dt> [--description="..."] [--location="..."] [--attendees=a@b,c@d] [--all-day] [--tz=<tz>]',
      delete: 'go-calendar <account> delete <calendarId> <eventId> [--confirm]',
      freebusy: 'go-calendar <account> freebusy <calendarId1,calendarId2> --from=<dt> --to=<dt>',
    },
  }, null, 2));
  process.exit(1);
}

/** Parse --key=value flags from args */
function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const arg of args) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) {
      flags[match[1]] = match[2] ?? 'true';
    }
  }
  return flags;
}

/** Get positional args (non-flag) */
function positional(args: string[]): string[] {
  return args.filter((a) => !a.startsWith('--'));
}

async function main() {
  if (args.length < 2) usage();

  const account = args[0];
  const command = args[1];
  const rest = args.slice(2);
  const flags = parseFlags(rest);
  const pos = positional(rest);

  // Set up safety context: --confirm flag allows destructive ops
  const hasConfirm = 'confirm' in flags;
  setSafetyContext({
    confirm: async (op) => {
      if (!hasConfirm) {
        console.log(JSON.stringify({
          blocked: true,
          operation: op.name,
          description: op.description,
          details: op.details,
          hint: 'Add --confirm to execute this operation',
        }, null, 2));
        process.exit(2);
      }
      return true;
    },
  });

  const auth = await getAuth('calendar', account);

  try {
    let result: unknown;

    switch (command) {
      case 'calendars':
        result = await calendar.listCalendars(auth);
        break;

      case 'events':
        if (!pos[0]) usage();
        result = await calendar.listEvents(auth, pos[0], {
          timeMin: flags.from,
          timeMax: flags.to,
          maxResults: flags.max ? parseInt(flags.max) : undefined,
          query: flags.query,
        });
        break;

      case 'event':
        if (!pos[0] || !pos[1]) usage();
        result = await calendar.getEvent(auth, pos[0], pos[1]);
        break;

      case 'create': {
        if (!pos[0]) usage();
        const createOpts: calendar.EventOptions = {
          summary: flags.summary ?? '',
          description: flags.description,
          start: flags.start ?? '',
          end: flags.end ?? '',
          timeZone: flags.tz,
          location: flags.location,
          attendees: flags.attendees?.split(','),
          allDay: 'all-day' in flags,
        };
        result = await calendar.createEvent(auth, pos[0], createOpts);
        break;
      }

      case 'update': {
        if (!pos[0] || !pos[1]) usage();
        const updateOpts: calendar.EventOptions = {
          summary: flags.summary ?? '',
          description: flags.description,
          start: flags.start ?? '',
          end: flags.end ?? '',
          timeZone: flags.tz,
          location: flags.location,
          attendees: flags.attendees?.split(','),
          allDay: 'all-day' in flags,
        };
        result = await calendar.updateEvent(auth, pos[0], pos[1], updateOpts);
        break;
      }

      case 'delete':
        if (!pos[0] || !pos[1]) usage();
        result = await calendar.deleteEvent(auth, pos[0], pos[1]);
        break;

      case 'freebusy': {
        if (!pos[0] || !flags.from || !flags.to) usage();
        const calIds = pos[0].split(',');
        result = await calendar.queryFreeBusy(auth, calIds, flags.from, flags.to);
        break;
      }

      default:
        usage();
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (err: unknown) {
    const e = err as { toJSON?: () => unknown; message?: string; code?: string };
    if (typeof e.toJSON === 'function') {
      console.error(JSON.stringify(e.toJSON(), null, 2));
    } else {
      console.error(JSON.stringify({
        error: e.code ?? 'UNKNOWN',
        message: e.message ?? String(err),
      }, null, 2));
    }
    process.exit(1);
  }
}

main();
