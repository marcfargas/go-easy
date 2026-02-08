import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OAuth2Client } from 'google-auth-library';
import { NotFoundError, QuotaError, SafetyError, GoEasyError } from '../../src/errors.js';

// ─── Drive API Mock ────────────────────────────────────────

const mockFilesList = vi.fn();
const mockFilesGet = vi.fn();
const mockFilesCreate = vi.fn();
const mockFilesUpdate = vi.fn();
const mockFilesCopy = vi.fn();
const mockFilesExport = vi.fn();
const mockPermissionsList = vi.fn();
const mockPermissionsCreate = vi.fn();
const mockPermissionsDelete = vi.fn();

vi.mock('@googleapis/drive', () => ({
  drive: () => ({
    files: {
      list: (args: unknown) => mockFilesList(args),
      get: (...args: unknown[]) => mockFilesGet(...args),
      create: (args: unknown) => mockFilesCreate(args),
      update: (args: unknown) => mockFilesUpdate(args),
      copy: (args: unknown) => mockFilesCopy(args),
      export: (...args: unknown[]) => mockFilesExport(...args),
    },
    permissions: {
      list: (args: unknown) => mockPermissionsList(args),
      create: (args: unknown) => mockPermissionsCreate(args),
      delete: (args: unknown) => mockPermissionsDelete(args),
    },
  }),
}));

const mockGuardOperation = vi.fn();
vi.mock('../../src/safety.js', () => ({
  guardOperation: (...args: unknown[]) => mockGuardOperation(...args),
}));

import {
  listFiles,
  searchFiles,
  getFile,
  downloadFile,
  exportFile,
  createFolder,
  moveFile,
  renameFile,
  copyFile,
  trashFile,
  listPermissions,
  shareFile,
  unshareFile,
} from '../../src/drive/index.js';

// ─── Fixtures ──────────────────────────────────────────────

const fakeAuth = {} as OAuth2Client;

const fakeRawFile = {
  id: 'file-1',
  name: 'report.pdf',
  mimeType: 'application/pdf',
  size: '1024',
  createdTime: '2026-01-01T00:00:00Z',
  modifiedTime: '2026-02-01T00:00:00Z',
  parents: ['root'],
  webViewLink: 'https://drive.google.com/file/d/file-1/view',
  shared: false,
  trashed: false,
};

// ─── Tests ─────────────────────────────────────────────────

describe('listFiles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists files with default options', async () => {
    mockFilesList.mockResolvedValue({
      data: { files: [fakeRawFile], nextPageToken: 'page2' },
    });

    const result = await listFiles(fakeAuth);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('report.pdf');
    expect(result.nextPageToken).toBe('page2');
    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 20 })
    );
  });

  it('filters by folder and query', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [] } });

    await listFiles(fakeAuth, { folderId: 'folder-1', query: "name contains 'test'" });

    const call = mockFilesList.mock.calls[0][0];
    expect(call.q).toContain("'folder-1' in parents");
    expect(call.q).toContain("name contains 'test'");
    expect(call.q).toContain('trashed = false');
  });

  it('returns empty list when no files', async () => {
    mockFilesList.mockResolvedValue({ data: {} });
    const result = await listFiles(fakeAuth);
    expect(result.items).toEqual([]);
  });
});

describe('searchFiles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses fullText contains query', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [] } });

    await searchFiles(fakeAuth, { query: 'quarterly report' });

    const call = mockFilesList.mock.calls[0][0];
    expect(call.q).toContain("fullText contains 'quarterly report'");
  });

  it('escapes single quotes in query', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [] } });

    await searchFiles(fakeAuth, { query: "it's a test" });

    const call = mockFilesList.mock.calls[0][0];
    expect(call.q).toContain("it\\'s a test");
  });
});

describe('getFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed DriveFile', async () => {
    mockFilesGet.mockResolvedValue({ data: fakeRawFile });
    const file = await getFile(fakeAuth, 'file-1');
    expect(file.id).toBe('file-1');
    expect(file.name).toBe('report.pdf');
    expect(file.size).toBe(1024);
  });

  it('throws NotFoundError for 404', async () => {
    mockFilesGet.mockRejectedValue({ code: 404, message: 'Not found' });
    await expect(getFile(fakeAuth, 'bad')).rejects.toThrow(NotFoundError);
  });

  it('throws QuotaError for 429', async () => {
    mockFilesGet.mockRejectedValue({ code: 429, message: 'Rate limit' });
    await expect(getFile(fakeAuth, 'file-1')).rejects.toThrow(QuotaError);
  });
});

describe('downloadFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('downloads file content as Buffer', async () => {
    // First call: getFile metadata
    mockFilesGet
      .mockResolvedValueOnce({ data: fakeRawFile })
      // Second call: media download
      .mockResolvedValueOnce({ data: new ArrayBuffer(5) });

    const result = await downloadFile(fakeAuth, 'file-1');
    expect(result.data).toBeInstanceOf(Buffer);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.name).toBe('report.pdf');
  });

  it('throws for Google Workspace files', async () => {
    mockFilesGet.mockResolvedValue({
      data: { ...fakeRawFile, mimeType: 'application/vnd.google-apps.document' },
    });

    await expect(downloadFile(fakeAuth, 'doc-1')).rejects.toThrow('exportFile');
  });
});

describe('exportFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exports to requested format', async () => {
    mockFilesGet.mockResolvedValue({
      data: { ...fakeRawFile, mimeType: 'application/vnd.google-apps.document', name: 'My Doc' },
    });
    mockFilesExport.mockResolvedValue({ data: new ArrayBuffer(10) });

    const result = await exportFile(fakeAuth, 'doc-1', 'pdf');
    expect(result.data).toBeInstanceOf(Buffer);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.name).toBe('My Doc.pdf');
  });
});

describe('createFolder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates folder and returns WriteResult', async () => {
    mockFilesCreate.mockResolvedValue({
      data: { id: 'folder-new', name: 'New Folder', webViewLink: 'https://...' },
    });

    const result = await createFolder(fakeAuth, 'New Folder', 'parent-1');
    expect(result.ok).toBe(true);
    expect(result.id).toBe('folder-new');
    expect(result.name).toBe('New Folder');

    const call = mockFilesCreate.mock.calls[0][0];
    expect(call.requestBody.mimeType).toBe('application/vnd.google-apps.folder');
    expect(call.requestBody.parents).toEqual(['parent-1']);
  });
});

describe('moveFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves file to new parent', async () => {
    mockFilesGet.mockResolvedValue({ data: fakeRawFile });
    mockFilesUpdate.mockResolvedValue({
      data: { id: 'file-1', name: 'report.pdf' },
    });

    const result = await moveFile(fakeAuth, 'file-1', 'new-parent');
    expect(result.ok).toBe(true);

    const call = mockFilesUpdate.mock.calls[0][0];
    expect(call.addParents).toBe('new-parent');
    expect(call.removeParents).toBe('root');
  });
});

describe('renameFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renames file', async () => {
    mockFilesUpdate.mockResolvedValue({
      data: { id: 'file-1', name: 'new-name.pdf' },
    });

    const result = await renameFile(fakeAuth, 'file-1', 'new-name.pdf');
    expect(result.ok).toBe(true);
    expect(result.name).toBe('new-name.pdf');
  });
});

describe('copyFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('copies file', async () => {
    mockFilesCopy.mockResolvedValue({
      data: { id: 'copy-1', name: 'report (copy).pdf' },
    });

    const result = await copyFile(fakeAuth, 'file-1', 'report (copy).pdf');
    expect(result.ok).toBe(true);
    expect(result.id).toBe('copy-1');
  });
});

describe('trashFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardOperation.mockResolvedValue(undefined);
    mockFilesGet.mockResolvedValue({ data: fakeRawFile });
    mockFilesUpdate.mockResolvedValue({ data: { id: 'file-1', name: 'report.pdf' } });
  });

  it('guards as DESTRUCTIVE', async () => {
    await trashFile(fakeAuth, 'file-1');
    expect(mockGuardOperation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'drive.trash', level: 'DESTRUCTIVE' })
    );
  });

  it('sets trashed = true', async () => {
    await trashFile(fakeAuth, 'file-1');
    const call = mockFilesUpdate.mock.calls[0][0];
    expect(call.requestBody.trashed).toBe(true);
  });

  it('throws SafetyError when blocked', async () => {
    mockGuardOperation.mockRejectedValue(new SafetyError('drive.trash'));
    await expect(trashFile(fakeAuth, 'file-1')).rejects.toThrow(SafetyError);
  });
});

describe('listPermissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns permission list', async () => {
    mockPermissionsList.mockResolvedValue({
      data: {
        permissions: [
          { id: 'perm-1', type: 'user', role: 'owner', emailAddress: 'me@test.com' },
        ],
      },
    });

    const perms = await listPermissions(fakeAuth, 'file-1');
    expect(perms).toHaveLength(1);
    expect(perms[0].emailAddress).toBe('me@test.com');
  });
});

describe('shareFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardOperation.mockResolvedValue(undefined);
    mockFilesGet.mockResolvedValue({ data: fakeRawFile });
    mockPermissionsCreate.mockResolvedValue({ data: { id: 'perm-new' } });
  });

  it('guards as DESTRUCTIVE for anyone sharing', async () => {
    await shareFile(fakeAuth, 'file-1', { type: 'anyone', role: 'reader' });
    expect(mockGuardOperation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'drive.share', level: 'DESTRUCTIVE' })
    );
  });

  it('does NOT guard for user sharing', async () => {
    await shareFile(fakeAuth, 'file-1', {
      type: 'user',
      role: 'reader',
      emailAddress: 'other@test.com',
    });
    expect(mockGuardOperation).not.toHaveBeenCalled();
  });

  it('returns WriteResult', async () => {
    const result = await shareFile(fakeAuth, 'file-1', {
      type: 'user',
      role: 'writer',
      emailAddress: 'other@test.com',
    });
    expect(result.ok).toBe(true);
    expect(result.id).toBe('perm-new');
  });
});

describe('unshareFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardOperation.mockResolvedValue(undefined);
    mockFilesGet.mockResolvedValue({ data: fakeRawFile });
    mockPermissionsDelete.mockResolvedValue({});
  });

  it('guards as DESTRUCTIVE', async () => {
    await unshareFile(fakeAuth, 'file-1', 'perm-1');
    expect(mockGuardOperation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'drive.unshare', level: 'DESTRUCTIVE' })
    );
  });

  it('returns WriteResult with permissionId', async () => {
    const result = await unshareFile(fakeAuth, 'file-1', 'perm-1');
    expect(result.ok).toBe(true);
    expect(result.id).toBe('perm-1');
  });
});
