/**
 * @packageDocumentation
 * **@will-cppa/pinecone-read-only-mcp/alliance** — full server including Alliance app tools.
 */

export * from '../core/index.js';
export {
  ALLIANCE_DEFAULT_INDEX_NAME,
  ALLIANCE_DEFAULT_RERANK_MODEL,
  DEFAULT_ALLIANCE_RERANK_MODEL,
  resolveAllianceConfig,
} from './config.js';
export type { AllianceServerConfig } from './config.js';
export { setupAllianceServer, type SetupAllianceServerOptions } from './setup.js';
export {
  registerBuiltinUrlGenerators,
  generatorMailing,
  generatorSlackCpplang,
} from './url-builtins.js';
export type { RegisterBuiltinUrlGeneratorsOptions } from './url-builtins.js';
