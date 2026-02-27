/**
 * Integration test for CLI body file flags.
 * Runs the actual go-gmail binary with temp files to verify
 * --body-text-file, --body-html-file, --body-md-file work end-to-end.
 *
 * Uses `draft` command against a mock — but since we can't easily mock
 * the Gmail API in an integration test, we test the readBodyFlags logic
 * by extracting it and testing directly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readBodyFlags, parseFlags } from '../../src/bin/gmail-flags.js';

describe('readBodyFlags', () => {
  let tmpDir: string;

  function writeTmp(name: string, content: string): string {
    const path = join(tmpDir, name);
    writeFileSync(path, content, 'utf-8');
    return path;
  }

  // Create/clean temp dir per test
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'go-gmail-test-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads plain text body from file', () => {
    const path = writeTmp('body.txt', 'Buenos días,\n\nMuchas gracias.\n\nSaludos,\nmarc');
    const result = readBodyFlags({ 'body-text-file': path });
    expect(result.body).toBe('Buenos días,\n\nMuchas gracias.\n\nSaludos,\nmarc');
    expect(result.html).toBeUndefined();
    expect(result.markdown).toBeUndefined();
  });

  it('reads HTML body from file', () => {
    const html = '<p>Buenos días</p><p>Muchas gracias.</p>';
    const path = writeTmp('body.html', html);
    const result = readBodyFlags({ 'body-html-file': path });
    expect(result.html).toBe(html);
    expect(result.body).toBeUndefined();
  });

  it('reads Markdown body from file', () => {
    const md = '# Status\n\n- Task 1: **done**\n- Task 2: _in progress_';
    const path = writeTmp('body.md', md);
    const result = readBodyFlags({ 'body-md-file': path });
    expect(result.markdown).toBe(md);
    expect(result.body).toBeUndefined();
  });

  it('reads both text and HTML files for multipart/alternative', () => {
    const textPath = writeTmp('body.txt', 'Plain text version');
    const htmlPath = writeTmp('body.html', '<p>HTML version</p>');
    const result = readBodyFlags({
      'body-text-file': textPath,
      'body-html-file': htmlPath,
    });
    expect(result.body).toBe('Plain text version');
    expect(result.html).toBe('<p>HTML version</p>');
  });

  it('preserves UTF-8 characters from file', () => {
    const content = 'Solicitud NIF-N para inversión en España\n\n¡Gracias! — José María';
    const path = writeTmp('body.txt', content);
    const result = readBodyFlags({ 'body-text-file': path });
    expect(result.body).toBe(content);
  });

  it('preserves multiline content with blank lines', () => {
    const content = 'Line 1\n\nLine 3\n\n\nLine 6\nLine 7';
    const path = writeTmp('body.txt', content);
    const result = readBodyFlags({ 'body-text-file': path });
    expect(result.body).toBe(content);
  });

  it('returns empty object when no body flags provided', () => {
    const result = readBodyFlags({ to: 'test@example.com', subject: 'Hi' });
    expect(result).toEqual({});
  });

  it('throws when file does not exist', () => {
    expect(() => readBodyFlags({ 'body-text-file': '/nonexistent/path.txt' })).toThrow();
  });
});

describe('parseFlags with s flag', () => {
  it('handles multiline flag values', () => {
    const flags = parseFlags(['--body=line1\nline2\nline3']);
    expect(flags['body']).toBe('line1\nline2\nline3');
  });

  it('handles standard single-line flags', () => {
    const flags = parseFlags(['--to=test@example.com', '--subject=Hello']);
    expect(flags['to']).toBe('test@example.com');
    expect(flags['subject']).toBe('Hello');
  });

  it('handles boolean flags without value', () => {
    const flags = parseFlags(['--confirm', '--send-now']);
    expect(flags['confirm']).toBe('true');
    expect(flags['send-now']).toBe('true');
  });

  it('handles flag with equals sign in value', () => {
    const flags = parseFlags(['--subject=RE: a=b']);
    expect(flags['subject']).toBe('RE: a=b');
  });
});
