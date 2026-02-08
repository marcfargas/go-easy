import { describe, it, expect } from 'vitest';
import {
  parseFile,
  parsePermission,
  isGoogleWorkspaceFile,
  exportFormatToMime,
  guessMimeType,
} from '../../src/drive/helpers.js';

describe('parseFile', () => {
  it('parses a full Drive API file', () => {
    const file = parseFile({
      id: 'file-1',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      size: '12345',
      createdTime: '2026-01-01T00:00:00Z',
      modifiedTime: '2026-02-01T00:00:00Z',
      parents: ['folder-1'],
      webViewLink: 'https://drive.google.com/file/d/file-1/view',
      shared: true,
      trashed: false,
    });

    expect(file.id).toBe('file-1');
    expect(file.name).toBe('report.pdf');
    expect(file.mimeType).toBe('application/pdf');
    expect(file.size).toBe(12345);
    expect(file.parents).toEqual(['folder-1']);
    expect(file.shared).toBe(true);
    expect(file.trashed).toBe(false);
  });

  it('handles missing fields', () => {
    const file = parseFile({});
    expect(file.id).toBe('');
    expect(file.name).toBe('');
    expect(file.size).toBeUndefined();
    expect(file.parents).toBeUndefined();
  });
});

describe('parsePermission', () => {
  it('parses a permission', () => {
    const perm = parsePermission({
      id: 'perm-1',
      type: 'user',
      role: 'writer',
      emailAddress: 'user@example.com',
      displayName: 'User',
    });

    expect(perm.id).toBe('perm-1');
    expect(perm.type).toBe('user');
    expect(perm.role).toBe('writer');
    expect(perm.emailAddress).toBe('user@example.com');
    expect(perm.displayName).toBe('User');
  });

  it('defaults type and role', () => {
    const perm = parsePermission({ id: 'perm-2' });
    expect(perm.type).toBe('user');
    expect(perm.role).toBe('reader');
  });
});

describe('isGoogleWorkspaceFile', () => {
  it('returns true for Google Docs', () => {
    expect(isGoogleWorkspaceFile('application/vnd.google-apps.document')).toBe(true);
  });

  it('returns true for Google Sheets', () => {
    expect(isGoogleWorkspaceFile('application/vnd.google-apps.spreadsheet')).toBe(true);
  });

  it('returns true for Google Slides', () => {
    expect(isGoogleWorkspaceFile('application/vnd.google-apps.presentation')).toBe(true);
  });

  it('returns false for regular files', () => {
    expect(isGoogleWorkspaceFile('application/pdf')).toBe(false);
    expect(isGoogleWorkspaceFile('text/plain')).toBe(false);
  });
});

describe('exportFormatToMime', () => {
  it('maps pdf', () => {
    expect(exportFormatToMime('pdf')).toBe('application/pdf');
  });

  it('maps docx', () => {
    expect(exportFormatToMime('docx')).toContain('wordprocessingml');
  });

  it('maps xlsx', () => {
    expect(exportFormatToMime('xlsx')).toContain('spreadsheetml');
  });

  it('maps csv', () => {
    expect(exportFormatToMime('csv')).toBe('text/csv');
  });
});

describe('guessMimeType', () => {
  it('guesses common types', () => {
    expect(guessMimeType('file.pdf')).toBe('application/pdf');
    expect(guessMimeType('photo.jpg')).toBe('image/jpeg');
    expect(guessMimeType('data.csv')).toBe('text/csv');
    expect(guessMimeType('doc.md')).toBe('text/markdown');
  });

  it('returns octet-stream for unknown', () => {
    expect(guessMimeType('file.xyz')).toBe('application/octet-stream');
  });
});
