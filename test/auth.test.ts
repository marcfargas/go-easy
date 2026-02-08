import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthError } from '../src/errors.js';

// ─── Mocks ─────────────────────────────────────────────────

// Mock fs/promises before importing auth
const mockReadFile = vi.fn();
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

// Track OAuth2 instances
const mockSetCredentials = vi.fn();
const mockOAuth2Instances: Array<{ clientId: string; clientSecret: string }> = [];

vi.mock('google-auth-library', () => ({
  OAuth2Client: class MockOAuth2 {
    constructor(clientId: string, clientSecret: string) {
      mockOAuth2Instances.push({ clientId, clientSecret });
    }
    setCredentials = mockSetCredentials;
  },
}));

// Import after mocks
import { getAuth, listAccounts, clearAuthCache } from '../src/auth.js';

// ─── Fixtures ──────────────────────────────────────────────

const fakeAccounts = [
  {
    email: 'alice@example.com',
    oauth2: {
      clientId: 'client-id-1',
      clientSecret: 'client-secret-1',
      refreshToken: 'refresh-alice',
    },
  },
  {
    email: 'bob@example.com',
    oauth2: {
      clientId: 'client-id-1',
      clientSecret: 'client-secret-1',
      refreshToken: 'refresh-bob',
    },
  },
];

// ─── Tests ─────────────────────────────────────────────────

describe('getAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOAuth2Instances.length = 0;
    clearAuthCache();
    mockReadFile.mockResolvedValue(JSON.stringify(fakeAccounts));
  });

  it('loads token and returns an OAuth2Client', async () => {
    const client = await getAuth('gmail', 'alice@example.com');
    expect(client).toBeDefined();
    expect(mockOAuth2Instances).toHaveLength(1);
    expect(mockOAuth2Instances[0].clientId).toBe('client-id-1');
    expect(mockSetCredentials).toHaveBeenCalledWith({
      refresh_token: 'refresh-alice',
    });
  });

  it('reads from the correct CLI directory per service', async () => {
    await getAuth('gmail', 'alice@example.com');
    expect(mockReadFile.mock.calls[0][0]).toContain('.gmcli');

    clearAuthCache();
    await getAuth('drive', 'alice@example.com');
    expect(mockReadFile.mock.calls[1][0]).toContain('.gdcli');

    clearAuthCache();
    await getAuth('calendar', 'alice@example.com');
    expect(mockReadFile.mock.calls[2][0]).toContain('.gccli');
  });

  it('defaults to first account when no email specified', async () => {
    const client = await getAuth('gmail');
    expect(client).toBeDefined();
    expect(mockSetCredentials).toHaveBeenCalledWith({
      refresh_token: 'refresh-alice',
    });
  });

  it('caches clients by service:email', async () => {
    const client1 = await getAuth('gmail', 'alice@example.com');
    const client2 = await getAuth('gmail', 'alice@example.com');
    expect(client1).toBe(client2); // same reference
    expect(mockOAuth2Instances).toHaveLength(1); // only created once
  });

  it('creates separate clients for different accounts', async () => {
    await getAuth('gmail', 'alice@example.com');
    await getAuth('gmail', 'bob@example.com');
    expect(mockOAuth2Instances).toHaveLength(2);
  });

  it('creates separate clients for different services', async () => {
    await getAuth('gmail', 'alice@example.com');
    await getAuth('drive', 'alice@example.com');
    expect(mockOAuth2Instances).toHaveLength(2);
  });

  it('throws AuthError for unknown account', async () => {
    await expect(getAuth('gmail', 'nobody@example.com')).rejects.toThrow(AuthError);
    await expect(getAuth('gmail', 'nobody@example.com')).rejects.toThrow(
      /not found/i
    );
  });

  it('throws AuthError when accounts.json is missing', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    await expect(getAuth('gmail')).rejects.toThrow(AuthError);
    await expect(getAuth('gmail')).rejects.toThrow(/Cannot read/);
  });

  it('throws AuthError when accounts.json has no entries', async () => {
    mockReadFile.mockResolvedValue('[]');
    await expect(getAuth('gmail')).rejects.toThrow(AuthError);
  });
});

describe('listAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(JSON.stringify(fakeAccounts));
  });

  it('returns email list from accounts.json', async () => {
    const emails = await listAccounts('gmail');
    expect(emails).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('throws AuthError when accounts.json is missing', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    await expect(listAccounts('gmail')).rejects.toThrow(AuthError);
  });
});

describe('clearAuthCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOAuth2Instances.length = 0;
    clearAuthCache();
    mockReadFile.mockResolvedValue(JSON.stringify(fakeAccounts));
  });

  it('forces re-creation of clients after clearing', async () => {
    await getAuth('gmail', 'alice@example.com');
    expect(mockOAuth2Instances).toHaveLength(1);

    clearAuthCache();

    await getAuth('gmail', 'alice@example.com');
    expect(mockOAuth2Instances).toHaveLength(2); // new instance created
  });
});
