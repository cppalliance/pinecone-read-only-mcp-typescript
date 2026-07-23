/**
 * Bounded retry + timeout helpers used by `PineconeClient`.
 *
 * `withTimeout` passes an {@link AbortSignal} that becomes aborted when the
 * deadline fires so callers (and eventually HTTP stacks that honor `signal`)
 * can cooperate. The Pinecone SDK may not cancel in-flight requests yet; the
 * waiter still rejects immediately on timeout.
 */

import { warn, redactErrorMessage } from '../../logger.js';

const ERROR_CHAIN_MAX_DEPTH = 5;

const PINECONE_NAME_TO_HTTP_STATUS: Readonly<Record<string, number>> = {
  PineconeInternalServerError: 500,
  PineconeUnavailableError: 503,
};

const TRANSIENT_PINECONE_ERROR_NAMES = new Set(['PineconeConnectionError']);

const PINECONE_STATUS_MESSAGE_PATTERN = /(?:Status:|with status)\s*(\d{3})/i;

/** Matches {@link withTimeout} rejection message prefix; legacy fallback for plain Error mocks. */
export const APP_TIMEOUT_PATTERN = /^Timeout after \d+ms while waiting for /i;

/** Branded error thrown by {@link withTimeout} when the per-attempt deadline fires. */
export class AppTimeoutError extends Error {
  readonly appTimeout = true as const;
  readonly timeoutMs: number;
  readonly label: string;

  constructor(timeoutMs: number, label: string) {
    super(`Timeout after ${timeoutMs}ms while waiting for ${label}`);
    this.name = 'AppTimeoutError';
    this.timeoutMs = timeoutMs;
    this.label = label;
  }
}

function getErrorCause(error: Error): unknown {
  return (error as Error & { cause?: unknown }).cause;
}

/**
 * Walk `error` and its `cause` chain (depth-capped, cycle-safe).
 * Stops when `visit` returns a non-undefined value or the chain ends.
 */
export function forEachErrorInChain<T>(
  error: unknown,
  visit: (current: Error) => T | undefined
): T | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let depth = 0;

  while (current instanceof Error && depth < ERROR_CHAIN_MAX_DEPTH) {
    if (seen.has(current)) return undefined;
    seen.add(current);

    const result = visit(current);
    if (result !== undefined) return result;

    current = getErrorCause(current);
    depth++;
  }

  return undefined;
}

function readDirectHttpStatus(error: Error): number | undefined {
  const candidate =
    (error as Error & { status?: number; statusCode?: number }).status ??
    (error as Error & { statusCode?: number }).statusCode;
  if (typeof candidate === 'number' && candidate >= 100 && candidate <= 599) {
    return candidate;
  }
  return undefined;
}

function readPineconeNamedHttpStatus(error: Error): number | undefined {
  const mapped = PINECONE_NAME_TO_HTTP_STATUS[error.name];
  if (mapped !== undefined) return mapped;

  if (error.name === 'PineconeUnmappedHttpError' || error.name === 'PineconeRequestError') {
    const match = PINECONE_STATUS_MESSAGE_PATTERN.exec(error.message);
    if (match) {
      const status = Number(match[1]);
      if (status >= 100 && status <= 599) return status;
    }
  }

  return undefined;
}

/**
 * Extract the first HTTP status from `error` and its `cause` chain.
 * Precedence per link: direct `status`/`statusCode`, then Pinecone `error.name` mappings.
 */
export function getHttpStatus(error: unknown): number | undefined {
  return forEachErrorInChain(error, (current) => {
    return readDirectHttpStatus(current) ?? readPineconeNamedHttpStatus(current);
  });
}

/** True when `status` is a transient HTTP code (429 or 5xx). */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function hasTransientPineconeErrorName(error: unknown): boolean {
  return (
    forEachErrorInChain(error, (current) =>
      TRANSIENT_PINECONE_ERROR_NAMES.has(current.name) ? true : undefined
    ) === true
  );
}

/**
 * True for app-level {@link withTimeout} deadlines ({@link AppTimeoutError} or legacy message prefix).
 * Checks the error and its `cause` chain before falling back to {@link APP_TIMEOUT_PATTERN}.
 */
export function isAppTimeoutError(error: unknown): boolean {
  if (
    forEachErrorInChain(error, (current) =>
      current instanceof AppTimeoutError ? true : undefined
    ) === true
  ) {
    return true;
  }

  const msg = error instanceof Error ? error.message : String(error);
  return APP_TIMEOUT_PATTERN.test(msg);
}

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

/** Per-call timeout + transient retry policy for outbound Pinecone I/O. */
export interface PolicyOptions {
  timeoutMs: number;
  label: string;
  retries?: number;
  backoffMs?: number;
}

/**
 * Default retry predicate. Precedence: reject app timeouts, structured HTTP status,
 * transient Pinecone error names, then network-ish message regex as last resort.
 */
export function defaultShouldRetry(error: unknown): boolean {
  if (isAppTimeoutError(error)) return false;

  const status = getHttpStatus(error);
  if (status !== undefined && isRetryableHttpStatus(status)) return true;

  if (hasTransientPineconeErrorName(error)) return true;

  if (error instanceof Error) {
    if (/ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND/i.test(error.message)) return true;
    if (/\btimeout\b/i.test(error.message)) return true;
    if (/\b(429|502|503|504)\b/.test(error.message)) return true;
  }
  return false;
}

/** Retry 429/5xx + network errors; do NOT retry app-level {@link withTimeout} deadlines. */
export function transientShouldRetry(error: unknown): boolean {
  if (isAppTimeoutError(error)) return false;
  return defaultShouldRetry(error);
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
      reject(new AppTimeoutError(timeoutMs, label));
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

/**
 * Compose per-attempt timeout with bounded transient retry for Pinecone I/O.
 * Each retry gets a fresh timeout window.
 */
export function runWithPolicy<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: PolicyOptions
): Promise<T> {
  return withRetry(() => withTimeout(fn, { timeoutMs: options.timeoutMs, label: options.label }), {
    retries: options.retries,
    backoffMs: options.backoffMs,
    shouldRetry: transientShouldRetry,
    onRetry: (attempt, error) => {
      const msg = redactErrorMessage(error);
      warn(`Retrying ${options.label} (attempt ${attempt})`, msg);
    },
  });
}
