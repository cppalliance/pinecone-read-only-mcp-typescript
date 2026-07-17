import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  withRetry,
  withTimeout,
  defaultShouldRetry,
  transientShouldRetry,
  isAppTimeoutError,
  runWithPolicy,
} from './retry.js';

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

describe('transientShouldRetry', () => {
  it('retries on 503 in message', () => {
    expect(transientShouldRetry(new Error('HTTP 503'))).toBe(true);
  });

  it('does not retry on 401', () => {
    expect(transientShouldRetry(new Error('HTTP 401'))).toBe(false);
  });

  it('does not retry app-level withTimeout deadlines', () => {
    expect(transientShouldRetry(new Error('Timeout after 50ms while waiting for search'))).toBe(
      false
    );
  });
});

describe('isAppTimeoutError', () => {
  it('matches withTimeout rejection messages', () => {
    expect(isAppTimeoutError(new Error('Timeout after 50ms while waiting for search'))).toBe(true);
  });
});

describe('runWithPolicy', () => {
  it('retries then succeeds on transient 503', async () => {
    let n = 0;
    const v = await runWithPolicy(
      async () => {
        n++;
        if (n < 2) throw new Error('HTTP 503');
        return 'done';
      },
      { timeoutMs: 1000, label: 'test', retries: 2, backoffMs: 1 }
    );
    expect(v).toBe('done');
    expect(n).toBe(2);
  });

  it('fails fast on non-retryable 401', async () => {
    let n = 0;
    await expect(
      runWithPolicy(
        async () => {
          n++;
          throw new Error('HTTP 401');
        },
        { timeoutMs: 1000, label: 'test', retries: 2, backoffMs: 1 }
      )
    ).rejects.toThrow('HTTP 401');
    expect(n).toBe(1);
  });

  it('does not retry when the per-attempt timeout fires', async () => {
    vi.useFakeTimers();
    let n = 0;
    const p = runWithPolicy(
      async () => {
        n++;
        return new Promise<string>(() => {});
      },
      { timeoutMs: 50, label: 'test', retries: 2, backoffMs: 1 }
    );
    const assertion = expect(p).rejects.toThrow(/Timeout after 50ms/);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(n).toBe(1);
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
