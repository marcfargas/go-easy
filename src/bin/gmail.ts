#!/usr/bin/env node
/**
 * go-gmail — Gateway CLI for Gmail operations.
 *
 * Always outputs JSON. Designed for agent consumption.
 *
 * Usage:
 *   go-gmail <account> <command> [args...]
 *   go-gmail marc@blegal.eu search "from:client is:unread"
 *   go-gmail marc@blegal.eu get <messageId>
 *   go-gmail marc@blegal.eu thread <threadId>
 *   go-gmail marc@blegal.eu labels
 *   go-gmail marc@blegal.eu send --to=x@y.com --subject="Hi" --body-text-file=body.txt --confirm
 *
 * Body content:
 *   --body-text-file=<path>  Read plain text body from file (UTF-8)
 *   --body-html-file=<path>  Read HTML body from file (UTF-8)
 *   --body-md-file=<path>    Read Markdown body from file (auto-converted to HTML)
 *
 * Safety:
 *   Destructive operations (send, reply, forward, sendDraft) require --confirm flag.
 *   Without --confirm, the command shows what WOULD happen and exits.
 */

import { writeFileSync } from 'node:fs';
import { getAuth } from '../auth.js';
import { setSafetyContext } from '../safety.js';
import * as gmail from '../gmail/index.js';
import { parseFlags, readBodyFlags } from './gmail-flags.js';

const args = process.argv.slice(2);

function usage(): never {
  console.log(JSON.stringify({
    error: 'USAGE',
    message: 'go-gmail <account> <command> [args...]',
    commands: {
      search: 'go-gmail <account> search "<query>" [--max=N] [--page-token=<token>]',
      get: 'go-gmail <account> get <messageId> [--format=eml|text|html|sane-html] [--output=<path>] [--b64encode]',
      thread: 'go-gmail <account> thread <threadId> [--format=mbox] [--output=<path>] [--b64encode]',
      labels: 'go-gmail <account> labels',
      send: 'go-gmail <account> send --to=<addr> --subject="..." --body-text-file=body.txt [--cc=<addr>] [--bcc=<addr>] [--confirm]',
      reply: 'go-gmail <account> reply <messageId> --body-text-file=reply.txt [--reply-all] --confirm',
      forward: 'go-gmail <account> forward <messageId> --to=<addr> [--body-text-file=note.txt] [--exclude=file1,file2] [--send-now --confirm]',
      draft: 'go-gmail <account> draft --to=<addr> --subject="..." --body-text-file=body.txt [--cc=<addr>] [--bcc=<addr>] [--in-reply-to=<messageId>]',
      'send-draft': 'go-gmail <account> send-draft <draftId> [--confirm]',
      drafts: 'go-gmail <account> drafts [--max=N] [--page-token=<token>]',
      'batch-label': 'go-gmail <account> batch-label --ids=id1,id2 --add=LABEL_ID --remove=LABEL_ID',
      attachment: 'go-gmail <account> attachment <messageId> <attachmentId>',
      profile: 'go-gmail <account> profile',
    },
    bodyFlags: {
      '--body-text-file': 'Read plain text body from file (UTF-8)',
      '--body-html-file': 'Read HTML body from file (UTF-8)',
      '--body-md-file': 'Read Markdown body from file (auto-converted to HTML)',
    },
  }, null, 2));
  process.exit(1);
}

/** Get positional args (non-flag) */
function positional(args: string[]): string[] {
  return args.filter((a) => !a.startsWith('--'));
}

/**
 * Handle output for --format=eml / --format=mbox / --format=text / --format=html / --format=sane-html.
 *
 * Three output modes:
 *   --output=<path>   Write bytes to file → JSON { ok, format, path, bytes }
 *   --b64encode       Emit JSON { format, data: "<base64>", bytes } to stdout
 *   (neither)         Write content directly to stdout (pipe-friendly, non-JSON)
 *
 * Returns the JSON result object when writing to file or b64, or undefined
 * when writing raw to stdout (caller must not JSON.stringify again).
 */
function handleRawOutput(
  buf: Buffer,
  format: string,
  flags: Record<string, string>
): object | undefined {
  const outputPath = flags['output'];
  const b64encode = 'b64encode' in flags;

  if (outputPath) {
    writeFileSync(outputPath, buf);
    return { ok: true, format, path: outputPath, bytes: buf.length };
  }

  if (b64encode) {
    return { format, data: buf.toString('base64'), bytes: buf.length };
  }

  // Raw bytes to stdout — intentionally non-JSON for pipe usage:
  //   go-gmail <account> get <id> --format=eml > message.eml
  process.stdout.write(buf);
  return undefined; // caller must not call JSON.stringify
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

  const auth = await getAuth('gmail', account);

  try {
    let result: unknown;

    switch (command) {
      case 'profile':
        result = { email: await gmail.getProfile(auth) };
        break;

      case 'search':
        result = await gmail.search(auth, {
          query: pos[0] ?? '',
          maxResults: flags.max ? parseInt(flags.max) : undefined,
          pageToken: flags['page-token'],
        });
        break;

      case 'get': {
        if (!pos[0]) usage();
        const fmt = flags.format;
        if (fmt === 'eml') {
          const buf = await gmail.getMessageRaw(auth, pos[0]);
          result = handleRawOutput(buf, 'eml', flags);
          if (result === undefined) return; // already written to stdout
        } else if (fmt === 'text' || fmt === 'html' || fmt === 'sane-html') {
          const msg = await gmail.getMessage(auth, pos[0]);
          let content: string;
          if (fmt === 'text') {
            content = msg.body.text ?? '';
          } else if (fmt === 'html') {
            content = msg.body.html ?? '';
          } else {
            // sane-html: sanitize before output
            content = gmail.sanitizeEmailHtml(msg.body.html ?? '');
          }
          result = handleRawOutput(Buffer.from(content, 'utf-8'), fmt, flags);
          if (result === undefined) return; // already written to stdout
        } else {
          result = await gmail.getMessage(auth, pos[0]);
        }
        break;
      }

      case 'thread':
        if (!pos[0]) usage();
        if (flags.format === 'mbox') {
          const fromAddress = await gmail.getProfile(auth);
          const buf = await gmail.getThreadMbox(auth, pos[0], fromAddress);
          result = handleRawOutput(buf, 'mbox', flags);
          if (result === undefined) return; // already written to stdout
        } else {
          result = await gmail.getThread(auth, pos[0]);
        }
        break;

      case 'labels':
        result = await gmail.listLabels(auth);
        break;

      case 'send':
        result = await gmail.send(auth, {
          to: flags.to ?? '',
          cc: flags.cc,
          bcc: flags.bcc,
          subject: flags.subject ?? '',
          ...readBodyFlags(flags),
          attachments: flags.attach?.split(','),
        });
        break;

      case 'reply': {
        if (!pos[0]) usage();
        const origMsg = await gmail.getMessage(auth, pos[0]);
        result = await gmail.reply(auth, {
          threadId: origMsg.threadId,
          messageId: pos[0],
          ...readBodyFlags(flags),
          replyAll: 'reply-all' in flags,
        });
        break;
      }

      case 'forward':
        if (!pos[0]) usage();
        result = await gmail.forward(auth, {
          messageId: pos[0],
          to: flags.to ?? '',
          ...readBodyFlags(flags),
          includeAttachments: flags.include ? flags.include.split(',') : true,
          excludeAttachments: flags.exclude?.split(','),
          sendNow: 'send-now' in flags,
          keepInThread: !('no-thread' in flags),
        });
        break;

      case 'draft': {
        let threadId: string | undefined;
        let extraHeaders: Record<string, string> | undefined;

        // If --in-reply-to is provided, fetch the original message to get threadId and Message-ID
        const inReplyToId = flags['in-reply-to'];
        if (inReplyToId) {
          const original = await gmail.getMessage(auth, inReplyToId);
          threadId = original.threadId;
          const messageIdRef = original.rfc822MessageId ?? `<${inReplyToId}>`;
          extraHeaders = {
            'In-Reply-To': messageIdRef,
            'References': messageIdRef,
          };
        }

        result = await gmail.createDraft(auth, {
          to: flags.to ?? '',
          cc: flags.cc,
          bcc: flags.bcc,
          subject: flags.subject ?? '',
          ...readBodyFlags(flags),
          threadId,
          extraHeaders,
        });
        break;
      }

      case 'send-draft':
        if (!pos[0]) usage();
        result = await gmail.sendDraft(auth, pos[0]);
        break;

      case 'drafts':
        result = await gmail.listDrafts(
          auth,
          flags.max ? parseInt(flags.max) : undefined,
          flags['page-token'],
        );
        break;

      case 'batch-label':
        result = await gmail.batchModifyLabels(auth, {
          messageIds: (flags.ids ?? '').split(','),
          addLabelIds: flags.add?.split(','),
          removeLabelIds: flags.remove?.split(','),
        });
        break;

      case 'attachment': {
        if (!pos[0] || !pos[1]) usage();
        const buf = await gmail.getAttachmentContent(auth, pos[0], pos[1]);
        // Output base64 for binary safety
        result = { data: buf.toString('base64'), size: buf.length };
        break;
      }

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
