/**
 * Smoke test — verify go-easy works against the real Gmail API.
 * READ-only operations, no destructive actions.
 *
 * Run: npx tsx test/smoke.ts
 */

import { getAuth } from '../src/auth.js';
import * as gmail from '../src/gmail/index.js';

async function smoke() {
  const results: Array<{ test: string; status: string; detail?: unknown }> = [];

  // 1. Auth
  try {
    const auth = await getAuth('gmail');
    results.push({ test: 'getAuth("gmail")', status: 'PASS', detail: 'OAuth2Client created' });

    // 2. Profile
    try {
      const email = await gmail.getProfile(auth);
      results.push({ test: 'getProfile', status: email ? 'PASS' : 'FAIL', detail: email });
    } catch (err) {
      results.push({ test: 'getProfile', status: 'FAIL', detail: String(err) });
    }

    // 3. Search (1 message)
    try {
      const searchResult = await gmail.search(auth, { query: 'is:inbox', maxResults: 1 });
      results.push({
        test: 'search("is:inbox", max=1)',
        status: searchResult.items.length > 0 ? 'PASS' : 'WARN',
        detail: {
          count: searchResult.items.length,
          firstSubject: searchResult.items[0]?.subject ?? '(none)',
          hasNextPage: !!searchResult.nextPageToken,
        },
      });

      // 4. getMessage (using first search result)
      if (searchResult.items.length > 0) {
        const msgId = searchResult.items[0].id;
        try {
          const msg = await gmail.getMessage(auth, msgId);
          results.push({
            test: `getMessage("${msgId}")`,
            status: msg.id === msgId ? 'PASS' : 'FAIL',
            detail: {
              from: msg.from,
              subject: msg.subject,
              hasText: !!msg.body.text,
              hasHtml: !!msg.body.html,
              attachments: msg.attachments.length,
            },
          });

          // 5. getThread
          try {
            const thread = await gmail.getThread(auth, msg.threadId);
            results.push({
              test: `getThread("${msg.threadId}")`,
              status: thread.id === msg.threadId ? 'PASS' : 'FAIL',
              detail: { messageCount: thread.messages.length },
            });
          } catch (err) {
            results.push({ test: 'getThread', status: 'FAIL', detail: String(err) });
          }
        } catch (err) {
          results.push({ test: 'getMessage', status: 'FAIL', detail: String(err) });
        }
      }
    } catch (err) {
      results.push({ test: 'search', status: 'FAIL', detail: String(err) });
    }

    // 6. Labels
    try {
      const labels = await gmail.listLabels(auth);
      results.push({
        test: 'listLabels',
        status: labels.length > 0 ? 'PASS' : 'FAIL',
        detail: { count: labels.length, sample: labels.slice(0, 5).map((l) => l.name) },
      });
    } catch (err) {
      results.push({ test: 'listLabels', status: 'FAIL', detail: String(err) });
    }
  } catch (err) {
    results.push({ test: 'getAuth("gmail")', status: 'FAIL', detail: String(err) });
  }

  // Output
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  console.log(JSON.stringify({ results, summary: { passed, failed, total: results.length } }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

smoke();
