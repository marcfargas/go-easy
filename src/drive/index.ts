/**
 * Drive module — list, search, download, upload, share, and manage files.
 *
 * All functions take an OAuth2Client as first argument.
 * Use `getAuth('drive', 'account@email.com')` from the auth module.
 */

import { drive } from '@googleapis/drive';
import type { OAuth2Client } from 'google-auth-library';
import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { guardOperation } from '../safety.js';
import { NotFoundError, QuotaError, GoEasyError } from '../errors.js';
import {
  parseFile,
  parsePermission,
  FILE_FIELDS,
  LIST_FIELDS,
  exportFormatToMime,
  isGoogleWorkspaceFile,
  guessMimeType,
} from './helpers.js';
import type {
  DriveFile,
  DrivePermission,
  ListResult,
  WriteResult,
  ListFilesOptions,
  SearchFilesOptions,
  UploadOptions,
  ShareOptions,
  ExportFormat,
} from './types.js';

export type {
  DriveFile,
  DrivePermission,
  ListResult,
  WriteResult,
  ListFilesOptions,
  SearchFilesOptions,
  UploadOptions,
  ShareOptions,
  ExportFormat,
};

/** Get a Drive API client instance */
function driveApi(auth: OAuth2Client) {
  return drive({ version: 'v3', auth });
}

/** Wrap Google API errors into our error types */
function handleApiError(err: unknown, context: string): never {
  if (err instanceof GoEasyError) throw err;

  const gErr = err as { code?: number; message?: string };
  if (gErr.code === 404) throw new NotFoundError('file', context, err);
  if (gErr.code === 429) throw new QuotaError('drive', err);
  throw new GoEasyError(
    `Drive ${context}: ${gErr.message ?? 'Unknown error'}`,
    'DRIVE_ERROR',
    err
  );
}

/**
 * List files in a folder or matching a query.
 *
 * @example
 * ```ts
 * // List root folder
 * const files = await listFiles(auth);
 *
 * // List specific folder
 * const files = await listFiles(auth, { folderId: 'folder-id' });
 *
 * // Query by metadata
 * const files = await listFiles(auth, { query: "name contains 'report'" });
 * ```
 */
export async function listFiles(
  auth: OAuth2Client,
  opts: ListFilesOptions = {}
): Promise<ListResult<DriveFile>> {
  const drive = driveApi(auth);

  const queryParts: string[] = [];
  if (opts.folderId) {
    queryParts.push(`'${opts.folderId}' in parents`);
  }
  if (opts.query) {
    queryParts.push(opts.query);
  }
  if (!opts.includeTrashed) {
    queryParts.push('trashed = false');
  }

  try {
    const res = await drive.files.list({
      q: queryParts.length > 0 ? queryParts.join(' and ') : undefined,
      fields: LIST_FIELDS,
      pageSize: opts.maxResults ?? 20,
      pageToken: opts.pageToken,
      orderBy: opts.orderBy ?? 'modifiedTime desc',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    return {
      items: (res.data.files ?? []).map(parseFile),
      nextPageToken: res.data.nextPageToken ?? undefined,
    };
  } catch (err) {
    handleApiError(err, 'listFiles');
  }
}

/**
 * Full-text search inside file contents.
 *
 * @example
 * ```ts
 * const results = await searchFiles(auth, { query: 'quarterly revenue' });
 * ```
 */
export async function searchFiles(
  auth: OAuth2Client,
  opts: SearchFilesOptions
): Promise<ListResult<DriveFile>> {
  return listFiles(auth, {
    query: `fullText contains '${opts.query.replace(/'/g, "\\'")}'`,
    maxResults: opts.maxResults,
    pageToken: opts.pageToken,
  });
}

/**
 * Get a single file's metadata by ID.
 */
export async function getFile(
  auth: OAuth2Client,
  fileId: string
): Promise<DriveFile> {
  const drive = driveApi(auth);

  try {
    const res = await drive.files.get({
      fileId,
      fields: FILE_FIELDS,
      supportsAllDrives: true,
    });
    return parseFile(res.data);
  } catch (err) {
    handleApiError(err, fileId);
  }
}

/**
 * Download a file's content as a Buffer.
 * For Google Workspace files (Docs, Sheets, Slides), use `exportFile()` instead.
 */
export async function downloadFile(
  auth: OAuth2Client,
  fileId: string
): Promise<{ data: Buffer; mimeType: string; name: string }> {
  const drive = driveApi(auth);

  // Get metadata first to check type
  const file = await getFile(auth, fileId);

  if (isGoogleWorkspaceFile(file.mimeType)) {
    throw new GoEasyError(
      `Cannot download Google Workspace file "${file.name}" (${file.mimeType}). Use exportFile() instead.`,
      'DRIVE_EXPORT_REQUIRED'
    );
  }

  try {
    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );

    return {
      data: Buffer.from(res.data as ArrayBuffer),
      mimeType: file.mimeType,
      name: file.name,
    };
  } catch (err) {
    handleApiError(err, `download ${fileId}`);
  }
}

/**
 * Export a Google Workspace file (Doc, Sheet, Slides) to a standard format.
 *
 * @example
 * ```ts
 * const { data } = await exportFile(auth, 'doc-id', 'pdf');
 * ```
 */
export async function exportFile(
  auth: OAuth2Client,
  fileId: string,
  format: ExportFormat
): Promise<{ data: Buffer; mimeType: string; name: string }> {
  const drive = driveApi(auth);
  const file = await getFile(auth, fileId);
  const exportMime = exportFormatToMime(format);

  try {
    const res = await drive.files.export(
      { fileId, mimeType: exportMime },
      { responseType: 'arraybuffer' }
    );

    return {
      data: Buffer.from(res.data as ArrayBuffer),
      mimeType: exportMime,
      name: `${file.name}.${format}`,
    };
  } catch (err) {
    handleApiError(err, `export ${fileId} as ${format}`);
  }
}

/**
 * Upload a file to Google Drive.
 *
 * WRITE operation — no safety gate (reversible via trash).
 */
export async function uploadFile(
  auth: OAuth2Client,
  localPath: string,
  opts: UploadOptions = {}
): Promise<WriteResult> {
  const drive = driveApi(auth);
  const fileName = opts.name ?? basename(localPath);
  const mimeType = opts.mimeType ?? guessMimeType(fileName);

  try {
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType,
        parents: opts.folderId ? [opts.folderId] : undefined,
      },
      media: {
        mimeType,
        body: createReadStream(localPath),
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      name: res.data.name ?? fileName,
      webViewLink: res.data.webViewLink ?? undefined,
    };
  } catch (err) {
    handleApiError(err, `upload ${fileName}`);
  }
}

/**
 * Create a folder in Google Drive.
 *
 * WRITE operation — no safety gate.
 */
export async function createFolder(
  auth: OAuth2Client,
  name: string,
  parentId?: string
): Promise<WriteResult> {
  const drive = driveApi(auth);

  try {
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      name: res.data.name ?? name,
      webViewLink: res.data.webViewLink ?? undefined,
    };
  } catch (err) {
    handleApiError(err, `createFolder ${name}`);
  }
}

/**
 * Move a file to a different folder.
 *
 * WRITE operation — no safety gate (reversible).
 */
export async function moveFile(
  auth: OAuth2Client,
  fileId: string,
  newParentId: string
): Promise<WriteResult> {
  const drive = driveApi(auth);

  // Get current parents to remove
  const file = await getFile(auth, fileId);
  const previousParents = (file.parents ?? []).join(',');

  try {
    const res = await drive.files.update({
      fileId,
      addParents: newParentId,
      removeParents: previousParents,
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      name: res.data.name ?? '',
      webViewLink: res.data.webViewLink ?? undefined,
    };
  } catch (err) {
    handleApiError(err, `move ${fileId}`);
  }
}

/**
 * Rename a file.
 *
 * WRITE operation — no safety gate.
 */
export async function renameFile(
  auth: OAuth2Client,
  fileId: string,
  newName: string
): Promise<WriteResult> {
  const drive = driveApi(auth);

  try {
    const res = await drive.files.update({
      fileId,
      requestBody: { name: newName },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      name: res.data.name ?? newName,
      webViewLink: res.data.webViewLink ?? undefined,
    };
  } catch (err) {
    handleApiError(err, `rename ${fileId}`);
  }
}

/**
 * Copy a file.
 *
 * WRITE operation — no safety gate.
 */
export async function copyFile(
  auth: OAuth2Client,
  fileId: string,
  name?: string,
  parentId?: string
): Promise<WriteResult> {
  const drive = driveApi(auth);

  try {
    const res = await drive.files.copy({
      fileId,
      requestBody: {
        name,
        parents: parentId ? [parentId] : undefined,
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      name: res.data.name ?? '',
      webViewLink: res.data.webViewLink ?? undefined,
    };
  } catch (err) {
    handleApiError(err, `copy ${fileId}`);
  }
}

/**
 * Trash a file.
 *
 * ⚠️ DESTRUCTIVE — requires safety confirmation.
 */
export async function trashFile(
  auth: OAuth2Client,
  fileId: string
): Promise<WriteResult> {
  const file = await getFile(auth, fileId);

  await guardOperation({
    name: 'drive.trash',
    level: 'DESTRUCTIVE',
    description: `Trash file "${file.name}" (${fileId})`,
    details: { fileId, name: file.name, mimeType: file.mimeType },
  });

  const drive = driveApi(auth);

  try {
    const res = await drive.files.update({
      fileId,
      requestBody: { trashed: true },
      fields: 'id, name',
      supportsAllDrives: true,
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      name: res.data.name ?? '',
    };
  } catch (err) {
    handleApiError(err, `trash ${fileId}`);
  }
}

/**
 * List permissions on a file.
 */
export async function listPermissions(
  auth: OAuth2Client,
  fileId: string
): Promise<DrivePermission[]> {
  const drive = driveApi(auth);

  try {
    const res = await drive.permissions.list({
      fileId,
      fields: 'permissions(id, type, role, emailAddress, displayName)',
      supportsAllDrives: true,
    });

    return (res.data.permissions ?? []).map(parsePermission);
  } catch (err) {
    handleApiError(err, `listPermissions ${fileId}`);
  }
}

/**
 * Share a file with a user, group, domain, or anyone.
 *
 * ⚠️ DESTRUCTIVE when sharing with 'anyone' — requires safety confirmation.
 * WRITE for user/group/domain sharing.
 */
export async function shareFile(
  auth: OAuth2Client,
  fileId: string,
  opts: ShareOptions
): Promise<WriteResult> {
  const file = await getFile(auth, fileId);

  if (opts.type === 'anyone') {
    await guardOperation({
      name: 'drive.share',
      level: 'DESTRUCTIVE',
      description: `Share "${file.name}" publicly (anyone with link, role: ${opts.role})`,
      details: { fileId, name: file.name, type: opts.type, role: opts.role },
    });
  }

  const drive = driveApi(auth);

  const permission: Record<string, string> = {
    type: opts.type,
    role: opts.role,
  };
  if (opts.emailAddress) permission.emailAddress = opts.emailAddress;
  if (opts.domain) permission.domain = opts.domain;

  try {
    const res = await drive.permissions.create({
      fileId,
      requestBody: permission,
      fields: 'id',
      supportsAllDrives: true,
    });

    return {
      ok: true,
      id: res.data.id ?? '',
      name: file.name,
      webViewLink: file.webViewLink ?? undefined,
    };
  } catch (err) {
    handleApiError(err, `share ${fileId}`);
  }
}

/**
 * Remove a sharing permission from a file.
 *
 * ⚠️ DESTRUCTIVE — requires safety confirmation.
 */
export async function unshareFile(
  auth: OAuth2Client,
  fileId: string,
  permissionId: string
): Promise<WriteResult> {
  const file = await getFile(auth, fileId);

  await guardOperation({
    name: 'drive.unshare',
    level: 'DESTRUCTIVE',
    description: `Remove permission ${permissionId} from "${file.name}"`,
    details: { fileId, name: file.name, permissionId },
  });

  const drive = driveApi(auth);

  try {
    await drive.permissions.delete({
      fileId,
      permissionId,
      supportsAllDrives: true,
    });

    return {
      ok: true,
      id: permissionId,
      name: file.name,
    };
  } catch (err) {
    handleApiError(err, `unshare ${fileId}`);
  }
}
