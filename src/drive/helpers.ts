/**
 * Drive helpers — parsing, MIME type mapping, field lists.
 */

import type { drive_v3 } from '@googleapis/drive';
import type { DriveFile, DrivePermission, ExportFormat } from './types.js';

/** Standard fields to request for file metadata */
export const FILE_FIELDS =
  'id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, driveId, shared, trashed';

/** Fields for file listing */
export const LIST_FIELDS = `nextPageToken, files(${FILE_FIELDS})`;

/** Parse a raw Drive API file into our DriveFile shape */
export function parseFile(raw: drive_v3.Schema$File): DriveFile {
  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    mimeType: raw.mimeType ?? '',
    size: raw.size ? parseInt(raw.size, 10) : undefined,
    createdTime: raw.createdTime ?? undefined,
    modifiedTime: raw.modifiedTime ?? undefined,
    parents: raw.parents ?? undefined,
    webViewLink: raw.webViewLink ?? undefined,
    driveId: raw.driveId ?? undefined,
    shared: raw.shared ?? undefined,
    trashed: raw.trashed ?? undefined,
  };
}

/** Parse a raw permission into our DrivePermission shape */
export function parsePermission(raw: drive_v3.Schema$Permission): DrivePermission {
  return {
    id: raw.id ?? '',
    type: (raw.type ?? 'user') as DrivePermission['type'],
    role: (raw.role ?? 'reader') as DrivePermission['role'],
    emailAddress: raw.emailAddress ?? undefined,
    displayName: raw.displayName ?? undefined,
  };
}

/** Google Workspace MIME types (these need export, not download) */
export const GOOGLE_MIME_TYPES: Record<string, string> = {
  'application/vnd.google-apps.document': 'Google Doc',
  'application/vnd.google-apps.spreadsheet': 'Google Sheet',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/vnd.google-apps.drawing': 'Google Drawing',
};

/** Check if a MIME type is a Google Workspace type (needs export) */
export function isGoogleWorkspaceFile(mimeType: string): boolean {
  return mimeType in GOOGLE_MIME_TYPES;
}

/** Map export format to MIME type for Google Drive export */
export function exportFormatToMime(format: ExportFormat): string {
  const map: Record<ExportFormat, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv',
    txt: 'text/plain',
    html: 'text/html',
  };
  return map[format];
}

/** Simple MIME type guessing by extension (for uploads) */
export function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    csv: 'text/csv',
    html: 'text/html',
    json: 'application/json',
    zip: 'application/zip',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    md: 'text/markdown',
  };
  return types[ext ?? ''] ?? 'application/octet-stream';
}
