import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  guardOperation,
  setSafetyContext,
  resetSafetyContext,
  getSafetyContext,
} from '../src/safety.js';
import type { OperationInfo } from '../src/safety.js';
import { SafetyError } from '../src/errors.js';

const readOp: OperationInfo = {
  name: 'gmail.search',
  level: 'READ',
  description: 'Search messages',
};

const writeOp: OperationInfo = {
  name: 'gmail.createDraft',
  level: 'WRITE',
  description: 'Create a draft',
};

const destructiveOp: OperationInfo = {
  name: 'gmail.send',
  level: 'DESTRUCTIVE',
  description: 'Send email to test@example.com',
  details: { to: 'test@example.com' },
};

describe('guardOperation', () => {
  beforeEach(() => {
    resetSafetyContext();
  });

  it('allows READ operations without calling confirm', async () => {
    const confirm = vi.fn();
    setSafetyContext({ confirm });

    await guardOperation(readOp);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('allows WRITE operations without calling confirm', async () => {
    const confirm = vi.fn();
    setSafetyContext({ confirm });

    await guardOperation(writeOp);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('calls confirm for DESTRUCTIVE operations', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    setSafetyContext({ confirm });

    await guardOperation(destructiveOp);
    expect(confirm).toHaveBeenCalledWith(destructiveOp);
  });

  it('allows DESTRUCTIVE when confirm returns true', async () => {
    setSafetyContext({ confirm: async () => true });

    // Should not throw
    await expect(guardOperation(destructiveOp)).resolves.toBeUndefined();
  });

  it('throws SafetyError when confirm returns false', async () => {
    setSafetyContext({ confirm: async () => false });

    await expect(guardOperation(destructiveOp)).rejects.toThrow(SafetyError);
  });

  it('default context blocks all DESTRUCTIVE operations', async () => {
    // Default context (after resetSafetyContext) blocks everything
    await expect(guardOperation(destructiveOp)).rejects.toThrow(SafetyError);
  });
});

describe('setSafetyContext / resetSafetyContext', () => {
  beforeEach(() => {
    resetSafetyContext();
  });

  it('setSafetyContext replaces the context', async () => {
    setSafetyContext({ confirm: async () => true });
    // DESTRUCTIVE should now pass
    await expect(guardOperation(destructiveOp)).resolves.toBeUndefined();
  });

  it('resetSafetyContext restores block-all default', async () => {
    setSafetyContext({ confirm: async () => true });
    resetSafetyContext();

    await expect(guardOperation(destructiveOp)).rejects.toThrow(SafetyError);
  });

  it('getSafetyContext returns the current context', () => {
    const ctx = { confirm: async () => true };
    setSafetyContext(ctx);
    expect(getSafetyContext()).toBe(ctx);
  });
});
