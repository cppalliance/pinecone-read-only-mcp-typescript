import { describe, expect, it, vi, afterEach } from 'vitest';
import { withRetry, withTimeout, defaultShouldRetry } from './retry.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('defaultShouldRetry', () => {
  it('retries on 502 in message', () => {
    expect(defaultShouldRetry(new Error('HTTP 502'))).toBe(true);
  });
  it('does not retry on 400', () => {
    expect(defaultShouldRetry(new Error('HTTP 400'))).toBe(false);
  });
});

describe('withTimeout', () => {
  it('aborts signal when deadline passes', async () => {
    vi.useFakeTimers();
    const p = withTimeout(
      (signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      { timeoutMs: 100, label: 'test' }
    );
    const assertion = expect(p).rejects.toThrow(/Timeout after 100ms/);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('resolves when fn finishes before deadline', async () => {
    const v = await withTimeout(
      async (signal) => {
        void signal;
        return 42;
      },
      { timeoutMs: 1000, label: 'ok' }
    );
    expect(v).toBe(42);
  });
});

describe('withRetry', () => {
  it('retries then succeeds', async () => {
    let n = 0;
    const v = await withRetry(
      async () => {
        n++;
        if (n < 2) throw new Error('HTTP 503');
        return 'done';
      },
      { retries: 2, backoffMs: 1 }
    );
    expect(v).toBe('done');
    expect(n).toBe(2);
  });
});
