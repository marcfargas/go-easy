import { gmail } from '@googleapis/gmail';
import type { OAuth2Client } from 'google-auth-library';
import { GoEasyError, NotFoundError, QuotaError } from '../errors.js';

/** Get a Gmail API client instance */
export function gmailApi(auth: OAuth2Client) {
  return gmail({ version: 'v1', auth });
}

/** Wrap Google API errors into our error types */
export function handleApiError(err: unknown, context: string): never {
  if (err instanceof GoEasyError) throw err;
  const gErr = err as { code?: number; message?: string };
  if (gErr.code === 404) throw new NotFoundError('message', context, err);
  if (gErr.code === 429) throw new QuotaError('gmail', err);
  throw new GoEasyError(
    `Gmail ${context}: ${gErr.message ?? 'Unknown error'}`,
    'GMAIL_ERROR',
    err
  );
}
