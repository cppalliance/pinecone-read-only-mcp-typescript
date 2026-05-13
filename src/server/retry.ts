/**
 * Bounded retry + timeout helpers used by `PineconeClient`.
 *
 * `withTimeout` passes an {@link AbortSignal} that becomes aborted when the
 * deadline fires so callers (and eventually HTTP stacks that honor `signal`)
 * can cooperate. The Pinecone SDK may not cancel in-flight requests yet; the
 * waiter still rejects immediately on timeout.
 */

/** Retry policy. */
export interface RetryOptions {
  /** Total number of attempts after the first try. Default 2. */
  retries?: number;
  /** Base backoff in ms (doubled per attempt). Default 250. */
  backoffMs?: number;
  /** Predicate that decides whether an error is retryable. */
  shouldRetry?: (error: unknown) => boolean;
  /** Logger called once per retry with attempt number and error. */
  onRetry?: (attempt: number, error: unknown) => void;
}

/** Timeout policy applied around any async call. */
export interface TimeoutOptions {
  /** Hard timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Label included in the timeout error message. */
  label?: string;
}

/** Default predicate: retry on common transient HTTP statuses (429/5xx) and network-ish messages. */
export function defaultShouldRetry(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message;
    if (/\b(429|502|503|504)\b/.test(msg)) return true;
    if (/timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND/i.test(msg)) return true;
  }
  const status =
    (error as { status?: number; statusCode?: number })?.status ??
    (error as { statusCode?: number })?.statusCode;
  if (typeof status === 'number' && (status === 429 || (status >= 500 && status < 600))) {
    return true;
  }
  return false;
}

/**
 * Run `fn` and retry on transient failures.
 *
 * Total worst-case wait for retries alone is roughly `backoffMs * (2^retries - 1)`
 * (plus request latency); each attempt may also hit `withTimeout` in the caller.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 2;
  const baseBackoff = options.backoffMs ?? 250;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) {
        throw error;
      }
      options.onRetry?.(attempt + 1, error);
      const wait = baseBackoff * Math.pow(2, attempt);
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}

/**
 * Race `fn(signal)` against a timeout. Aborts `signal` when the deadline fires
 * so cooperative/async stacks can tear down work early.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: TimeoutOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const label = options.label ?? 'pinecone';

  const controller = new AbortController();
  const fnPromise = fn(controller.signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Reject before abort so `Promise.race` observes the timeout error first;
      // abort still notifies cooperative callers.
      reject(new Error(`Timeout after ${timeoutMs}ms while waiting for ${label}`));
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([fnPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    // When the deadline wins, `fnPromise` may still reject from abort listeners.
    void fnPromise.catch(() => {});
  }
}
