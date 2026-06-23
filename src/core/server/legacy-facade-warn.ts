import { getLogLevel, warn as logWarn } from '../../logger.js';

const warnedSymbols = new Set<string>();

function deprecationWarningsEnabled(): boolean {
  return process.env['PINECONE_DEPRECATION_WARNINGS'] === '1' || getLogLevel() === 'DEBUG';
}

/** Emit at most one opt-in deprecation warning per legacy facade symbol per process. */
export function warnLegacyFacade(symbol: string): void {
  if (!deprecationWarningsEnabled() || warnedSymbols.has(symbol)) {
    return;
  }
  warnedSymbols.add(symbol);
  logWarn(
    `${symbol} is deprecated (since 0.3.0) and will be removed no earlier than 0.5.0; ` +
      'use ServerContext instance methods via createServer and { context: ctx } at setup. ' +
      'See docs/MIGRATION.md#030-legacy-module-facade-deprecations.'
  );
}

/** Reset per-symbol deprecation latch. Test-only. */
export function resetLegacyFacadeWarnLatchForTests(): void {
  warnedSymbols.clear();
}
