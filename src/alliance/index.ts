/**
 * @packageDocumentation
 * **@will-cppa/pinecone-read-only-mcp/alliance** — full server including Alliance app tools.
 */

export * from '../core/index.js';
export {
  applyAllianceRerankDefault,
  DEFAULT_ALLIANCE_RERANK_MODEL,
  resolveAllianceConfig,
} from './config.js';
export { setupAllianceServer } from './setup.js';
export {
  registerBuiltinUrlGenerators,
  generatorMailing,
  generatorSlackCpplang,
} from './url-builtins.js';
export type { RegisterBuiltinUrlGeneratorsOptions } from './url-builtins.js';
