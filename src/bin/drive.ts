#!/usr/bin/env node
/**
 * go-drive — Gateway CLI for Google Drive operations.
 *
 * Always outputs JSON. Designed for agent consumption.
 *
 * Usage:
 *   go-drive <account> <command> [args...]
 *   go-drive marc@blegal.eu ls
 *   go-drive marc@blegal.eu search "quarterly report"
 *   go-drive marc@blegal.eu download <fileId>
 *   go-drive marc@blegal.eu upload ./file.pdf --folder=<folderId>
 *
 * Safety:
 *   Destructive operations (trash, share --anyone, unshare) require --confirm flag.
 */

import { writeFile } from 'node:fs/promises';
import { getAuth } from '../auth.js';
import { setSafetyContext } from '../safety.js';
import * as drive from '../drive/index.js';
import type { ShareOptions } from '../drive/types.js';

const args = process.argv.slice(2);

function usage(): never {
  console.log(JSON.stringify({
    error: 'USAGE',
    message: 'go-drive <account> <command> [args...]',
    commands: {
      ls: 'go-drive <account> ls [folderId] [--query="..."] [--max=N] [--order="..."]',
      search: 'go-drive <account> search "<text>" [--max=N]',
      get: 'go-drive <account> get <fileId>',
      download: 'go-drive <account> download <fileId> [destPath]',
      export: 'go-drive <account> export <fileId> <format> [destPath]',
      upload: 'go-drive <account> upload <localPath> [--folder=<folderId>] [--name=<name>]',
      mkdir: 'go-drive <account> mkdir <name> [--parent=<folderId>]',
      move: 'go-drive <account> move <fileId> <newParentId>',
      rename: 'go-drive <account> rename <fileId> <newName>',
      copy: 'go-drive <account> copy <fileId> [--name=<name>] [--parent=<folderId>]',
      trash: 'go-drive <account> trash <fileId> [--confirm]',
      permissions: 'go-drive <account> permissions <fileId>',
      share: 'go-drive <account> share <fileId> --type=<type> --role=<role> [--email=<email>] [--confirm]',
      unshare: 'go-drive <account> unshare <fileId> <permissionId> [--confirm]',
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

  const auth = await getAuth('drive', account);

  try {
    let result: unknown;

    switch (command) {
      case 'ls':
        result = await drive.listFiles(auth, {
          folderId: pos[0],
          query: flags.query,
          maxResults: flags.max ? parseInt(flags.max) : undefined,
          orderBy: flags.order,
        });
        break;

      case 'search':
        if (!pos[0]) usage();
        result = await drive.searchFiles(auth, {
          query: pos[0],
          maxResults: flags.max ? parseInt(flags.max) : undefined,
        });
        break;

      case 'get':
        if (!pos[0]) usage();
        result = await drive.getFile(auth, pos[0]);
        break;

      case 'download': {
        if (!pos[0]) usage();
        const dl = await drive.downloadFile(auth, pos[0]);
        const destPath = pos[1] ?? dl.name;
        await writeFile(destPath, dl.data);
        result = { ok: true, path: destPath, size: dl.data.length, mimeType: dl.mimeType };
        break;
      }

      case 'export': {
        if (!pos[0] || !pos[1]) usage();
        const exp = await drive.exportFile(auth, pos[0], pos[1] as drive.ExportFormat);
        const exportDest = pos[2] ?? exp.name;
        await writeFile(exportDest, exp.data);
        result = { ok: true, path: exportDest, size: exp.data.length, mimeType: exp.mimeType };
        break;
      }

      case 'upload':
        if (!pos[0]) usage();
        result = await drive.uploadFile(auth, pos[0], {
          folderId: flags.folder,
          name: flags.name,
        });
        break;

      case 'mkdir':
        if (!pos[0]) usage();
        result = await drive.createFolder(auth, pos[0], flags.parent);
        break;

      case 'move':
        if (!pos[0] || !pos[1]) usage();
        result = await drive.moveFile(auth, pos[0], pos[1]);
        break;

      case 'rename':
        if (!pos[0] || !pos[1]) usage();
        result = await drive.renameFile(auth, pos[0], pos[1]);
        break;

      case 'copy':
        if (!pos[0]) usage();
        result = await drive.copyFile(auth, pos[0], flags.name, flags.parent);
        break;

      case 'trash':
        if (!pos[0]) usage();
        result = await drive.trashFile(auth, pos[0]);
        break;

      case 'permissions':
        if (!pos[0]) usage();
        result = await drive.listPermissions(auth, pos[0]);
        break;

      case 'share': {
        if (!pos[0]) usage();
        const shareOpts: ShareOptions = {
          type: (flags.type ?? 'user') as ShareOptions['type'],
          role: (flags.role ?? 'reader') as ShareOptions['role'],
          emailAddress: flags.email,
          domain: flags.domain,
        };
        result = await drive.shareFile(auth, pos[0], shareOpts);
        break;
      }

      case 'unshare':
        if (!pos[0] || !pos[1]) usage();
        result = await drive.unshareFile(auth, pos[0], pos[1]);
        break;

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
