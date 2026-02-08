/**
 * Drive types — agent-friendly shapes, not raw API types.
 */

/** A simplified file/folder */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** Size in bytes (not present for Google Docs/Sheets/Slides) */
  size?: number;
  createdTime?: string;
  modifiedTime?: string;
  /** Parent folder IDs */
  parents?: string[];
  /** Link to open in browser */
  webViewLink?: string;
  /** Shared Drive ID (if in a Shared Drive) */
  driveId?: string;
  /** Whether the file is shared */
  shared?: boolean;
  /** Whether the file is trashed */
  trashed?: boolean;
}

/** A sharing permission */
export interface DrivePermission {
  id: string;
  type: 'user' | 'group' | 'domain' | 'anyone';
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  emailAddress?: string;
  displayName?: string;
}

/** Supported export formats for Google Workspace files */
export type ExportFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'csv' | 'txt' | 'html';

/** Options for listing files */
export interface ListFilesOptions {
  /** Folder ID to list (default: 'root') */
  folderId?: string;
  /** Drive API query filter (metadata search) */
  query?: string;
  /** Maximum results (default: 20) */
  maxResults?: number;
  /** Page token for pagination */
  pageToken?: string;
  /** Include trashed files (default: false) */
  includeTrashed?: boolean;
  /** Order by (e.g. 'modifiedTime desc', 'name') */
  orderBy?: string;
}

/** Options for full-text search */
export interface SearchFilesOptions {
  /** Text to search for inside file contents */
  query: string;
  /** Maximum results (default: 20) */
  maxResults?: number;
  /** Page token for pagination */
  pageToken?: string;
}

/** Options for uploading a file */
export interface UploadOptions {
  /** Parent folder ID (default: root) */
  folderId?: string;
  /** Override filename (default: basename of localPath) */
  name?: string;
  /** MIME type (auto-detected if not provided) */
  mimeType?: string;
}

/** Options for sharing a file */
export interface ShareOptions {
  /** Who to share with */
  type: 'user' | 'group' | 'domain' | 'anyone';
  /** Permission level */
  role: 'reader' | 'commenter' | 'writer';
  /** Email (required for user/group), domain (required for domain) */
  emailAddress?: string;
  /** Domain (required for type 'domain') */
  domain?: string;
}

/** Paginated list result */
export interface ListResult<T> {
  items: T[];
  /** Token for next page, undefined if no more results */
  nextPageToken?: string;
}

/** Result of a write operation */
export interface WriteResult {
  ok: true;
  id: string;
  name?: string;
  webViewLink?: string;
}
