/**
 * Per-namespace URL generation registry.
 *
 * Built-in generators cover `mailing` (Boost archive style) and
 * `slack-Cpplang`. Library consumers can plug in their own with
 * `registerUrlGenerator(namespace, generator)`.
 */

/** Outcome of a URL-generation attempt. */
export type UrlGenerationResult = {
  url: string | null;
  method:
    | 'metadata.url'
    | 'metadata.source'
    | 'generated.mailing'
    | 'generated.slack'
    | 'generated.custom'
    | 'unavailable';
  reason?: string;
};

/**
 * Function that builds a URL for a record's metadata.
 *
 * Custom generators may return any of the standard `method` values, plus
 * `'generated.custom'` for namespace-specific generators registered by
 * library consumers.
 */
export type UrlGenerator = (metadata: Record<string, unknown>) => UrlGenerationResult;

/**
 * Alias for {@link UrlGenerator} (issue / API naming: `UrlGeneratorFn`).
 * Use either type when implementing custom URL synthesis.
 */
export type UrlGeneratorFn = UrlGenerator;

/** Registry of namespace -> URL generator. Built-ins register via {@link registerBuiltinUrlGenerators}. */
const urlGenerators = new Map<string, UrlGeneratorFn>();

/** Return a trimmed non-empty string or null for empty/missing values. */
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Build a mailing-list URL (e.g. Boost archives).
 * Two cases:
 * 1. If metadata has list_name and doc_id (or msg_id) and the message id does not contain list_name,
 *    URL is https://lists.boost.org/archives/list/{list_name}/message/{doc_id}/
 * 2. Otherwise use doc_id or thread_id as the list path: .../list/{doc_id_or_thread_id}/
 */
function generatorMailing(metadata: Record<string, unknown>): UrlGenerationResult {
  const listName = asString(metadata['list_name']);
  const docId = asString(metadata['doc_id']) ?? asString(metadata['msg_id']);
  const threadId = asString(metadata['thread_id']);

  if (listName && docId && !docId.includes(listName)) {
    return {
      url: `https://lists.boost.org/archives/list/${listName}/message/${docId}/`,
      method: 'generated.mailing',
    };
  }

  const docIdOrThread = docId ?? threadId;
  if (!docIdOrThread) {
    return {
      url: null,
      method: 'unavailable',
      reason: 'mailing requires doc_id, msg_id, or thread_id to generate URL',
    };
  }
  return {
    url: `https://lists.boost.org/archives/list/${docIdOrThread}/`,
    method: 'generated.mailing',
  };
}

/** Build a Slack message URL from source or team_id/channel_id/doc_id. */
function generatorSlackCpplang(metadata: Record<string, unknown>): UrlGenerationResult {
  const source = asString(metadata['source']);
  if (source) {
    return { url: source, method: 'metadata.source' };
  }
  const teamId = asString(metadata['team_id']);
  const channelId = asString(metadata['channel_id']);
  const docId = asString(metadata['doc_id']);
  if (!teamId || !channelId || !docId) {
    return {
      url: null,
      method: 'unavailable',
      reason: 'slack-Cpplang requires team_id, channel_id, and doc_id (or source)',
    };
  }
  const messageId = docId.replace(/\./g, '');
  return {
    url: `https://app.slack.com/client/${teamId}/${channelId}/p${messageId}`,
    method: 'generated.slack',
  };
}

let builtinGeneratorsRegistered = false;

/** Options for {@link registerBuiltinUrlGenerators}. */
export type RegisterBuiltinUrlGeneratorsOptions = {
  /**
   * When `true`, re-applies the built-in `mailing` and `slack-Cpplang` generators
   * even if they were already registered or were replaced by {@link registerUrlGenerator}.
   * Use to restore defaults after an override (e.g. in tests).
   */
  reinstallBuiltins?: boolean;
};

/**
 * Register built-in generators (`mailing`, `slack-Cpplang`).
 *
 * With no options (or `reinstallBuiltins` omitted / `false`), the call is idempotent:
 * only the first invocation in the process installs the two built-ins.
 *
 * With `{ reinstallBuiltins: true }`, always resets `mailing` and `slack-Cpplang` to
 * the library implementations (does not remove other custom namespaces).
 *
 * Invoked from {@link setupServer} so embedders get the same defaults as the CLI;
 * pure library use without calling `setupServer` should register explicitly if needed.
 */
export function registerBuiltinUrlGenerators(options?: RegisterBuiltinUrlGeneratorsOptions): void {
  if (options?.reinstallBuiltins) {
    urlGenerators.set('mailing', generatorMailing);
    urlGenerators.set('slack-Cpplang', generatorSlackCpplang);
    builtinGeneratorsRegistered = true;
    return;
  }
  if (builtinGeneratorsRegistered) return;
  urlGenerators.set('mailing', generatorMailing);
  urlGenerators.set('slack-Cpplang', generatorSlackCpplang);
  builtinGeneratorsRegistered = true;
}

/**
 * Clear all URL generators and the built-in registration latch.
 * Used by {@link teardownServer} so a subsequent `setupServer()` can reinstall built-ins.
 */
export function resetUrlGenerationRegistry(): void {
  urlGenerators.clear();
  builtinGeneratorsRegistered = false;
}

/**
 * Register a URL generator for a namespace, replacing any existing entry.
 *
 * @param namespace exact namespace name (matches the value returned by `list_namespaces`).
 * @param generator function that turns a record's metadata into a URL ({@link UrlGeneratorFn}).
 *
 * @example
 * ```ts
 * import { registerUrlGenerator } from '@will-cppa/pinecone-read-only-mcp';
 *
 * registerUrlGenerator('my-docs', (metadata) => {
 *   const id = typeof metadata.doc_id === 'string' ? metadata.doc_id : null;
 *   return id
 *     ? { url: `https://docs.example.com/${id}`, method: 'generated.custom' }
 *     : { url: null, method: 'unavailable', reason: 'doc_id missing' };
 * });
 * ```
 */
export function registerUrlGenerator(namespace: string, generator: UrlGeneratorFn): void {
  const normalizedNamespace = namespace.trim();
  if (normalizedNamespace.length === 0) {
    throw new TypeError('namespace must be a non-empty string');
  }
  if (typeof generator !== 'function') {
    throw new TypeError('generator must be a function');
  }
  urlGenerators.set(normalizedNamespace, generator);
}

/** Remove a namespace's URL generator. Returns true if a generator was removed. */
export function unregisterUrlGenerator(namespace: string): boolean {
  return urlGenerators.delete(namespace);
}

/** True when the namespace has a registered URL generator (does not consider `metadata.url`). */
export function hasUrlGenerator(namespace: string): boolean {
  return urlGenerators.has(namespace);
}

/**
 * Generate a URL for a record in the given namespace when metadata.url is missing.
 * Uses the registry of URL generators; returns unavailable for namespaces without a generator.
 */
export function generateUrlForNamespace(
  namespace: string,
  metadata: Record<string, unknown>
): UrlGenerationResult {
  const existingUrl = asString(metadata['url']);
  if (existingUrl) {
    return { url: existingUrl, method: 'metadata.url' };
  }

  const generator = urlGenerators.get(namespace);
  if (generator) {
    return generator(metadata);
  }

  return {
    url: null,
    method: 'unavailable',
    reason: `URL generation is not supported for namespace "${namespace}"`,
  };
}
