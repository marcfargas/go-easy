import { readFileSync } from 'node:fs';

/** Parse --key=value flags from args */
export function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const arg of args) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/s);
    if (match) {
      flags[match[1]] = match[2] ?? 'true';
    }
  }
  return flags;
}

/**
 * Read body content from file flags.
 * Returns { body?, html?, markdown? } for SendOptions.
 */
export function readBodyFlags(flags: Record<string, string>): {
  body?: string;
  html?: string;
  markdown?: string;
} {
  const result: { body?: string; html?: string; markdown?: string } = {};

  if (flags['body-text-file']) {
    result.body = readFileSync(flags['body-text-file'], 'utf-8');
  }
  if (flags['body-html-file']) {
    result.html = readFileSync(flags['body-html-file'], 'utf-8');
  }
  if (flags['body-md-file']) {
    result.markdown = readFileSync(flags['body-md-file'], 'utf-8');
  }

  return result;
}
