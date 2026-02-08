/**
 * Smoke test — verify go-easy Drive module works against real API.
 * READ-only operations, no destructive actions.
 *
 * Run: npx tsx test/smoke-drive.ts
 */

import { getAuth } from '../src/auth.js';
import * as drive from '../src/drive/index.js';

async function smoke() {
  const results: Array<{ test: string; status: string; detail?: unknown }> = [];

  try {
    const auth = await getAuth('drive');
    results.push({ test: 'getAuth("drive")', status: 'PASS', detail: 'OAuth2Client created' });

    // 1. List root files
    try {
      const files = await drive.listFiles(auth, { maxResults: 3 });
      results.push({
        test: 'listFiles (root, max=3)',
        status: files.items.length > 0 ? 'PASS' : 'WARN',
        detail: {
          count: files.items.length,
          files: files.items.map((f) => ({ name: f.name, mimeType: f.mimeType })),
          hasNextPage: !!files.nextPageToken,
        },
      });

      // 2. Get file metadata (use first result)
      if (files.items.length > 0) {
        const fileId = files.items[0].id;
        try {
          const file = await drive.getFile(auth, fileId);
          results.push({
            test: `getFile("${fileId}")`,
            status: file.id === fileId ? 'PASS' : 'FAIL',
            detail: { name: file.name, mimeType: file.mimeType, size: file.size },
          });
        } catch (err) {
          results.push({ test: 'getFile', status: 'FAIL', detail: String(err) });
        }

        // 3. List permissions
        try {
          const perms = await drive.listPermissions(auth, fileId);
          results.push({
            test: `listPermissions("${fileId}")`,
            status: 'PASS',
            detail: { count: perms.length, types: perms.map((p) => p.type) },
          });
        } catch (err) {
          results.push({ test: 'listPermissions', status: 'FAIL', detail: String(err) });
        }
      }
    } catch (err) {
      results.push({ test: 'listFiles', status: 'FAIL', detail: String(err) });
    }

    // 4. Search
    try {
      const search = await drive.searchFiles(auth, { query: 'test', maxResults: 2 });
      results.push({
        test: 'searchFiles("test", max=2)',
        status: 'PASS',
        detail: { count: search.items.length },
      });
    } catch (err) {
      results.push({ test: 'searchFiles', status: 'FAIL', detail: String(err) });
    }
  } catch (err) {
    results.push({ test: 'getAuth("drive")', status: 'FAIL', detail: String(err) });
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  console.log(JSON.stringify({ results, summary: { passed, failed, total: results.length } }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

smoke();
