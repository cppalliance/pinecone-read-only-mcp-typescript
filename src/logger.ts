/**
 * Simple level-based logger for the MCP server.
 *
 * Logs to stderr; never logs secrets. Supports two output formats:
 * - `text` (default): human-readable single-line output suitable for tail/grep.
 * - `json`: one JSON object per line, ready for log aggregation pipelines
 *   (`{ ts, level, msg, data? }`).
 *
 * `redactApiKey` strips Pinecone-style API keys from any string before
 * formatting, so a future SDK upgrade that includes them in error payloads
 * cannot leak through `error()`.
 */

import type { LogFormat, LogLevel } from './config.js';

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

let currentLevel: LogLevel = 'INFO';
let currentFormat: LogFormat = 'text';

/** Set the minimum log level (DEBUG, INFO, WARN, ERROR). Messages below this level are dropped. */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/** Return the current minimum log level. */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

/** Set the log output format (text or json). */
export function setLogFormat(format: LogFormat): void {
  currentFormat = format;
}

/** Return the current log format. */
export function getLogFormat(): LogFormat {
  return currentFormat;
}

/** True if the given level is at or above the current minimum. */
function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

/**
 * Pinecone API keys are typically UUID-like strings. We mask anything that
 * looks like a key (`xxxxxxxx-xxxx-...`) plus tokens marked with `apiKey`,
 * `api_key`, or `Authorization: Bearer ...`.
 */
/** Replace API-key-shaped substrings in `s` with `***`. Idempotent and safe to call on any string. */
export function redactApiKey(s: string): string {
  let out = s.replace(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
    '***'
  );
  out = out.replace(/(api[_-]?key["':\s=]+)([^\s"',}]+)/gi, '$1***');
  out = out.replace(/(Authorization:\s*Bearer\s+)([^\s"',}]+)/gi, '$1***');
  return out;
}

/** Recursively redact API keys from a serializable value. Returns a deep copy. */
function redactValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'string') return redactApiKey(value);
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v, seen));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v, seen);
    }
    return out;
  }
  return value;
}

/** Format a single log line in the active format. */
function formatMessage(level: LogLevel, msg: string, data?: unknown): string {
  const ts = new Date().toISOString();
  const safeMsg = redactApiKey(msg);
  const safeData = data === undefined ? undefined : redactValue(data);

  if (currentFormat === 'json') {
    const payload: Record<string, unknown> = { ts, level, msg: safeMsg };
    if (safeData !== undefined) {
      payload['data'] = safeData;
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return JSON.stringify({ ts, level, msg: safeMsg, data: '[unserializable]' });
    }
  }

  const prefix = `[${ts}] [${level}]`;
  if (safeData !== undefined) {
    let serialized: string;
    try {
      serialized = JSON.stringify(safeData);
    } catch {
      serialized = String(safeData);
    }
    return `${prefix} ${safeMsg} ${serialized}`;
  }
  return `${prefix} ${safeMsg}`;
}

/** Log a DEBUG-level message to stderr when the log level allows. */
export function debug(msg: string, data?: unknown): void {
  if (shouldLog('DEBUG')) {
    console.error(formatMessage('DEBUG', msg, data));
  }
}

/** Log an INFO-level message to stderr when the log level allows. */
export function info(msg: string, data?: unknown): void {
  if (shouldLog('INFO')) {
    console.error(formatMessage('INFO', msg, data));
  }
}

/** Log a WARN-level message to stderr when the log level allows. */
export function warn(msg: string, data?: unknown): void {
  if (shouldLog('WARN')) {
    console.error(formatMessage('WARN', msg, data));
  }
}

/** Log an ERROR-level message to stderr with optional error (message and stack). */
export function error(msg: string, err?: unknown): void {
  if (shouldLog('ERROR')) {
    const detail =
      err instanceof Error
        ? { message: err.message, stack: err.stack }
        : err !== undefined
          ? String(err)
          : undefined;
    console.error(
      formatMessage('ERROR', msg, detail !== undefined ? { error: detail } : undefined)
    );
  }
}
