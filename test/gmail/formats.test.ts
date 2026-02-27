/**
 * Tests for src/gmail/formats.ts — sanitizeEmailHtml.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml } from '../../src/gmail/formats.js';

// ─── Dangerous content is stripped ────────────────────────────────────────

describe('sanitizeEmailHtml — strips dangerous content', () => {
  it('removes <script> tags and their content', () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    expect(sanitizeEmailHtml(input)).not.toContain('<script');
    expect(sanitizeEmailHtml(input)).not.toContain('alert');
  });

  it('removes inline event handlers', () => {
    const input = '<p onclick="evil()">Click me</p>';
    const out = sanitizeEmailHtml(input);
    expect(out).not.toContain('onclick');
    expect(out).toContain('Click me'); // text preserved
  });

  it('removes onerror on img', () => {
    const input = '<img src="x" onerror="evil()">';
    expect(sanitizeEmailHtml(input)).not.toContain('onerror');
  });

  it('removes onload on body', () => {
    const input = '<body onload="evil()"><p>Hi</p></body>';
    expect(sanitizeEmailHtml(input)).not.toContain('onload');
  });

  it('strips javascript: hrefs', () => {
    const input = '<a href="javascript:evil()">click</a>';
    const out = sanitizeEmailHtml(input);
    expect(out).not.toContain('javascript:');
    expect(out).toContain('click'); // link text preserved
  });

  it('strips data: URIs from img src', () => {
    const input = '<img src="data:image/png;base64,abc123" alt="img">';
    const out = sanitizeEmailHtml(input);
    // src attribute should be removed (data: not in allowed schemes for img)
    expect(out).not.toContain('data:');
  });

  it('removes <iframe>', () => {
    const input = '<div>content</div><iframe src="https://evil.com"></iframe>';
    expect(sanitizeEmailHtml(input)).not.toContain('<iframe');
  });

  it('removes <object>', () => {
    const input = '<object data="evil.swf"></object>';
    expect(sanitizeEmailHtml(input)).not.toContain('<object');
  });

  it('removes <form> and <input>', () => {
    const input = '<form action="/steal"><input name="cc"></form>';
    const out = sanitizeEmailHtml(input);
    expect(out).not.toContain('<form');
    expect(out).not.toContain('<input');
  });

  it('removes <meta> tags', () => {
    const input = '<meta http-equiv="refresh" content="0; url=evil.com"><p>Hi</p>';
    expect(sanitizeEmailHtml(input)).not.toContain('<meta');
  });
});

// ─── Safe content is preserved ────────────────────────────────────────────

describe('sanitizeEmailHtml — preserves safe content', () => {
  it('keeps plain text', () => {
    const input = '<p>Hello, world!</p>';
    expect(sanitizeEmailHtml(input)).toContain('Hello, world!');
  });

  it('keeps http:// links', () => {
    const input = '<a href="https://example.com">Visit</a>';
    const out = sanitizeEmailHtml(input);
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('Visit');
  });

  it('keeps mailto: links', () => {
    const input = '<a href="mailto:me@example.com">Email me</a>';
    expect(sanitizeEmailHtml(input)).toContain('href="mailto:me@example.com"');
  });

  it('keeps http/https img src', () => {
    const input = '<img src="https://example.com/img.png" alt="logo">';
    const out = sanitizeEmailHtml(input);
    expect(out).toContain('src="https://example.com/img.png"');
  });

  it('keeps cid: img src (inline email attachments)', () => {
    const input = '<img src="cid:image001@01D2345.6789ABCD" alt="logo">';
    const out = sanitizeEmailHtml(input);
    expect(out).toContain('src="cid:image001@01D2345.6789ABCD"');
  });

  it('keeps style attributes', () => {
    const input = '<p style="color:red; font-size:14px">Styled</p>';
    const out = sanitizeEmailHtml(input);
    expect(out).toContain('style=');
    expect(out).toContain('Styled');
  });

  it('keeps table structure', () => {
    const input = `
      <table border="1" cellpadding="4">
        <tr><th>Name</th><th>Value</th></tr>
        <tr><td colspan="2">Row</td></tr>
      </table>
    `;
    const out = sanitizeEmailHtml(input);
    expect(out).toContain('<table');
    expect(out).toContain('<th>');
    expect(out).toContain('colspan="2"');
  });

  it('keeps formatting tags', () => {
    const input = '<b>bold</b> <i>italic</i> <u>underline</u> <strong>strong</strong>';
    const out = sanitizeEmailHtml(input);
    expect(out).toContain('<b>bold</b>');
    expect(out).toContain('<i>italic</i>');
    expect(out).toContain('<strong>strong</strong>');
  });

  it('keeps blockquote (quoted reply content)', () => {
    const input = '<blockquote>Original message</blockquote>';
    expect(sanitizeEmailHtml(input)).toContain('<blockquote>');
  });

  it('keeps legacy <font> and <center> tags', () => {
    const input = '<center><font face="Arial" size="2">Old-style email</font></center>';
    const out = sanitizeEmailHtml(input);
    expect(out).toContain('<center>');
    expect(out).toContain('<font');
    expect(out).toContain('face="Arial"');
  });
});

// ─── rel=noopener injection ────────────────────────────────────────────────

describe('sanitizeEmailHtml — rel=noopener for _blank links', () => {
  it('adds rel="noopener noreferrer" to target="_blank" links', () => {
    const input = '<a href="https://example.com" target="_blank">Link</a>';
    const out = sanitizeEmailHtml(input);
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('does not add rel to non-blank links', () => {
    const input = '<a href="https://example.com">Link</a>';
    const out = sanitizeEmailHtml(input);
    // rel should not be injected if no target=_blank
    expect(out).not.toContain('rel="noopener noreferrer"');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe('sanitizeEmailHtml — edge cases', () => {
  it('handles empty string', () => {
    expect(sanitizeEmailHtml('')).toBe('');
  });

  it('handles plain text with no HTML', () => {
    const input = 'Just plain text, no tags.';
    expect(sanitizeEmailHtml(input)).toBe('Just plain text, no tags.');
  });

  it('handles deeply nested structure', () => {
    const input = '<div><div><div><p>Deep</p></div></div></div>';
    expect(sanitizeEmailHtml(input)).toContain('Deep');
  });
});
