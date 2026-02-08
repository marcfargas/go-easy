import { describe, it, expect } from 'vitest';
import {
  GoEasyError,
  AuthError,
  NotFoundError,
  QuotaError,
  SafetyError,
} from '../src/errors.js';

describe('GoEasyError', () => {
  it('stores code and message', () => {
    const err = new GoEasyError('something broke', 'TEST_CODE');
    expect(err.message).toBe('something broke');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('GoEasyError');
    expect(err).toBeInstanceOf(Error);
  });

  it('stores cause', () => {
    const cause = new Error('root cause');
    const err = new GoEasyError('wrapper', 'WRAP', cause);
    expect(err.cause).toBe(cause);
  });

  it('toJSON() returns structured output', () => {
    const err = new GoEasyError('bad thing', 'BAD');
    expect(err.toJSON()).toEqual({
      error: 'BAD',
      message: 'bad thing',
    });
  });

  it('toJSON() includes cause message when cause is Error', () => {
    const cause = new Error('root');
    const err = new GoEasyError('wrapper', 'WRAP', cause);
    expect(err.toJSON()).toEqual({
      error: 'WRAP',
      message: 'wrapper',
      cause: 'root',
    });
  });

  it('toJSON() omits cause when cause is not Error', () => {
    const err = new GoEasyError('wrapper', 'WRAP', 'string cause');
    expect(err.toJSON()).toEqual({
      error: 'WRAP',
      message: 'wrapper',
    });
  });
});

describe('AuthError', () => {
  it('has correct code and name', () => {
    const err = new AuthError('no token');
    expect(err.code).toBe('AUTH_ERROR');
    expect(err.name).toBe('AuthError');
    expect(err).toBeInstanceOf(GoEasyError);
    expect(err).toBeInstanceOf(Error);
  });

  it('stores cause', () => {
    const cause = new Error('ENOENT');
    const err = new AuthError('cannot read', cause);
    expect(err.cause).toBe(cause);
  });
});

describe('NotFoundError', () => {
  it('has correct code, name, and message', () => {
    const err = new NotFoundError('message', 'abc123');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
    expect(err.message).toBe('message not found: abc123');
    expect(err).toBeInstanceOf(GoEasyError);
  });
});

describe('QuotaError', () => {
  it('has correct code, name, and message', () => {
    const err = new QuotaError('gmail');
    expect(err.code).toBe('QUOTA_EXCEEDED');
    expect(err.name).toBe('QuotaError');
    expect(err.message).toBe('Quota exceeded for gmail');
    expect(err).toBeInstanceOf(GoEasyError);
  });
});

describe('SafetyError', () => {
  it('has correct code, name, and message', () => {
    const err = new SafetyError('gmail.send');
    expect(err.code).toBe('SAFETY_BLOCKED');
    expect(err.name).toBe('SafetyError');
    expect(err.message).toBe(
      'Destructive operation "gmail.send" blocked — no confirmation provided'
    );
    expect(err).toBeInstanceOf(GoEasyError);
  });
});
