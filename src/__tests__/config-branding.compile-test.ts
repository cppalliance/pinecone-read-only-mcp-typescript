/**
 * Compile-time assertions for ServerConfig branding (Issue #172).
 *
 * Included in `tsc` / `npm run typecheck` (not `*.test.ts`). Misuse cases use
 * `@ts-expect-error` so brand regressions fail CI when the guard stops working.
 */

import { resolveAllianceConfig } from '../alliance/config.js';
import { resolveConfig } from '../core/config.js';
import { createServer } from '../core/server/server-context.js';
import { setupCoreServer } from '../core/setup.js';
import { setupAllianceServer } from '../alliance/setup.js';

const coreCfg = resolveConfig({ apiKey: 'k', indexName: 'idx' });
const allianceCfg = resolveAllianceConfig({ apiKey: 'k' });

void setupCoreServer(coreCfg);
void setupAllianceServer(allianceCfg);

// @ts-expect-error Alliance config must not be passed to core setup
void setupCoreServer(allianceCfg);

// @ts-expect-error Core config must not be passed to Alliance setup
void setupAllianceServer(coreCfg);

const allianceCtx = createServer(allianceCfg);
// @ts-expect-error Alliance context must not be passed to core setup
void setupCoreServer({ context: allianceCtx });

const coreCtx = createServer(coreCfg);
// @ts-expect-error Core context must not be passed to Alliance setup
void setupAllianceServer({ context: coreCtx });
