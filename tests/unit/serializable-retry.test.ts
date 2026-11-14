import { describe, expect, it, vi } from 'vitest';

import { retrySerializable } from '@/lib/serializableRetry';

function errorWithCode(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('retrySerializable', () => {
  it('returns the first result without retrying', async () => {
    const work = vi.fn<() => Promise<string>>().mockResolvedValue('first');

    await expect(retrySerializable(work)).resolves.toBe('first');

    expect(work).toHaveBeenCalledTimes(1);
  });

  it('retries after a conflict and returns the later result', async () => {
    const work = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(errorWithCode('P2034', 'conflict'))
      .mockResolvedValueOnce('second');

    await expect(retrySerializable(work)).resolves.toBe('second');

    expect(work).toHaveBeenCalledTimes(2);
  });

  it('gives up after three conflicts and rethrows the last conflict error', async () => {
    const conflicts = ['first', 'second', 'third'].map((name) => errorWithCode('P2034', `${name} conflict`));
    const work = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(conflicts[0])
      .mockRejectedValueOnce(conflicts[1])
      .mockRejectedValueOnce(conflicts[2]);

    await expect(retrySerializable(work)).rejects.toBe(conflicts[2]);

    expect(work).toHaveBeenCalledTimes(3);
  });

  it('throws a non-conflict error at once', async () => {
    const failure = errorWithCode('P2028', 'transaction timeout');
    const work = vi.fn<() => Promise<string>>().mockRejectedValue(failure);

    await expect(retrySerializable(work)).rejects.toBe(failure);

    expect(work).toHaveBeenCalledTimes(1);
  });
});
