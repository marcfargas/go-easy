/**
 * Auth module — OAuth2 client factory with multi-account support.
 *
 * Phase 1 (MVP): Import tokens from existing CLI stores:
 *   ~/.gmcli/accounts.json  → Gmail tokens
 *   ~/.gdcli/accounts.json  → Drive tokens
 *   ~/.gccli/accounts.json  → Calendar tokens
 *
 * Phase 2 (post-migration): Unified token store at ~/.go-easy/
 *   with combined scopes per account (single OAuth consent).
 *
 * Each CLI token only works for its service's scopes. The library
 * routes internally — callers specify account (email), and each
 * service module gets the right OAuth2Client.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { OAuth2Client } from 'google-auth-library';
import { AuthError } from './errors.js';

/** Services we can load tokens for */
export type GoogleService = 'gmail' | 'drive' | 'calendar';

/** Shape of an account entry in CLI accounts.json */
interface CliAccountEntry {
  email: string;
  oauth2: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
}

/** Map service → CLI config directory name */
const CLI_DIRS: Record<GoogleService, string> = {
  gmail: '.gmcli',
  drive: '.gdcli',
  calendar: '.gccli',
};

/** Cache: "service:email" → OAuth2Client */
const clientCache = new Map<string, OAuth2Client>();

/**
 * Load accounts from a CLI's accounts.json file.
 */
async function loadCliAccounts(service: GoogleService): Promise<CliAccountEntry[]> {
  const dir = CLI_DIRS[service];
  const accountsPath = join(homedir(), dir, 'accounts.json');

  try {
    const raw = await readFile(accountsPath, 'utf-8');
    return JSON.parse(raw) as CliAccountEntry[];
  } catch (err) {
    throw new AuthError(
      `Cannot read ${service} accounts from ${accountsPath}. Is the CLI configured?`,
      err
    );
  }
}

/**
 * Get an OAuth2Client for a specific service and account.
 *
 * @param service - Which Google service (determines which CLI token to use)
 * @param account - Email address (defaults to first account in the store)
 * @returns Configured OAuth2Client with refresh token set
 *
 * @example
 * ```ts
 * import { getAuth } from 'go-easy/auth';
 * const auth = await getAuth('gmail', 'marc@blegal.eu');
 * ```
 */
export async function getAuth(
  service: GoogleService,
  account?: string
): Promise<OAuth2Client> {
  const accounts = await loadCliAccounts(service);

  const entry = account
    ? accounts.find((a) => a.email === account)
    : accounts[0];

  if (!entry) {
    const available = accounts.map((a) => a.email).join(', ');
    throw new AuthError(
      account
        ? `Account "${account}" not found for ${service}. Available: ${available}`
        : `No accounts configured for ${service}`
    );
  }

  const cacheKey = `${service}:${entry.email}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  const oauth2 = new OAuth2Client(
    entry.oauth2.clientId,
    entry.oauth2.clientSecret
  );

  oauth2.setCredentials({
    refresh_token: entry.oauth2.refreshToken,
  });

  clientCache.set(cacheKey, oauth2);
  return oauth2;
}

/**
 * List available accounts for a service.
 */
export async function listAccounts(service: GoogleService): Promise<string[]> {
  const accounts = await loadCliAccounts(service);
  return accounts.map((a) => a.email);
}

/**
 * Clear the client cache. Useful for tests or token rotation.
 */
export function clearAuthCache(): void {
  clientCache.clear();
}
