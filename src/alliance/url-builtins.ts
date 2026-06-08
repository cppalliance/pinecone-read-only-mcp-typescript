/**
 * C++ Alliance domain-specific URL generators (Boost mailing list, Slack).
 */

import type { ServerContext } from '../core/server/server-context.js';
import { registerUrlGenerator } from '../core/server/url-registry.js';
import type { UrlGenerationResult } from '../core/server/url-registry.js';

/** Return a trimmed non-empty string or null for empty/missing values. */
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Build a mailing-list URL (e.g. Boost archives).
 */
export function generatorMailing(metadata: Record<string, unknown>): UrlGenerationResult {
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
export function generatorSlackCpplang(metadata: Record<string, unknown>): UrlGenerationResult {
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

const builtinGeneratorsRegisteredContexts = new WeakSet<ServerContext>();
let defaultBuiltinGeneratorsRegistered = false;

/** Options for {@link registerBuiltinUrlGenerators}. */
export type RegisterBuiltinUrlGeneratorsOptions = {
  /**
   * When `true`, re-applies the built-in `mailing` and `slack-Cpplang` generators
   * even if they were already registered or were replaced by {@link registerUrlGenerator}.
   */
  reinstallBuiltins?: boolean;
};

function registerBuiltinsOnContext(ctx: ServerContext): void {
  ctx.registerUrlGenerator('mailing', generatorMailing);
  ctx.registerUrlGenerator('slack-Cpplang', generatorSlackCpplang);
}

function isServerContext(value: unknown): value is ServerContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ServerContext).getConfig === 'function' &&
    typeof (value as ServerContext).generateUrlForNamespace === 'function'
  );
}

function registerBuiltinsOnDefaultContext(options?: RegisterBuiltinUrlGeneratorsOptions): void {
  if (options?.reinstallBuiltins) {
    registerUrlGenerator('mailing', generatorMailing);
    registerUrlGenerator('slack-Cpplang', generatorSlackCpplang);
    defaultBuiltinGeneratorsRegistered = true;
    return;
  }
  if (defaultBuiltinGeneratorsRegistered) return;
  registerUrlGenerator('mailing', generatorMailing);
  registerUrlGenerator('slack-Cpplang', generatorSlackCpplang);
  defaultBuiltinGeneratorsRegistered = true;
}

/** Register built-in Alliance generators on the process-default context (legacy). */
export function registerBuiltinUrlGenerators(options?: RegisterBuiltinUrlGeneratorsOptions): void;
/** Register built-in Alliance generators on the given {@link ServerContext}. */
export function registerBuiltinUrlGenerators(
  ctx: ServerContext,
  options?: RegisterBuiltinUrlGeneratorsOptions
): void;
export function registerBuiltinUrlGenerators(
  ctxOrOptions?: ServerContext | RegisterBuiltinUrlGeneratorsOptions,
  options?: RegisterBuiltinUrlGeneratorsOptions
): void {
  if (isServerContext(ctxOrOptions)) {
    const ctx = ctxOrOptions;
    if (options?.reinstallBuiltins) {
      registerBuiltinsOnContext(ctx);
      builtinGeneratorsRegisteredContexts.add(ctx);
      return;
    }
    if (builtinGeneratorsRegisteredContexts.has(ctx)) return;
    registerBuiltinsOnContext(ctx);
    builtinGeneratorsRegisteredContexts.add(ctx);
    return;
  }

  registerBuiltinsOnDefaultContext(ctxOrOptions);
}
