import { describe, expect, it } from 'vitest';
import * as core from '../index.js';
import * as alliance from '../../alliance/index.js';

/**
 * Guards the public runtime export surface of both barrels (#203). Types are
 * erased at runtime, so only value exports appear here; this catches an internal
 * symbol accidentally leaking into a barrel and growing the blast radius. When a
 * genuinely public symbol is added, add it to the allow-list in the same change.
 */
const CORE_PUBLIC_EXPORTS = [
  'PineconeClient',
  'ServerContext',
  'SourceRegistry',
  'buildSourceRegistry',
  'countResponseSchema',
  'createIsolatedContext',
  'createServer',
  'generateUrlForNamespace',
  'generateUrlsResponseSchema',
  'getDefaultServerContext',
  'guidedQueryResponseSchema',
  'hasUrlGenerator',
  'keywordSearchResponseSchema',
  'keywordSearchSuccessResponseSchema',
  'listNamespacesResponseSchema',
  'namespaceRouterResponseSchema',
  'queryDocumentsResponseSchema',
  'queryResponseSchema',
  'queryResultRowSchema',
  'querySuccessResponseSchema',
  'registerUrlGenerator',
  'resolveConfig',
  'setPineconeClient',
  'setupCoreServer',
  'suggestQueryParams',
  'suggestQueryParamsResponseSchema',
  'teardownServer',
  'toolErrorSchema',
  'unregisterUrlGenerator',
  'validateMetadataFilter',
  'validateMetadataFilterDetailed',
];

const ALLIANCE_PUBLIC_EXPORTS = [
  ...CORE_PUBLIC_EXPORTS,
  'ALLIANCE_DEFAULT_INDEX_NAME',
  'ALLIANCE_DEFAULT_RERANK_MODEL',
  'DEFAULT_ALLIANCE_RERANK_MODEL',
  'registerBuiltinUrlGenerators',
  'resolveAllianceConfig',
  'setupAllianceServer',
].sort();

describe('public export surface', () => {
  it('does not export internal experimental block builders', () => {
    expect('buildQueryExperimental' in core).toBe(false);
    expect('buildGuidedQueryExperimental' in core).toBe(false);
  });

  it('does not export the internal-only symbols trimmed in #203', () => {
    for (const name of ['trimOptional', 'createUnconfiguredAllianceContext']) {
      expect(name in core).toBe(false);
    }
    for (const name of ['generatorMailing', 'generatorSlackCpplang']) {
      expect(name in alliance).toBe(false);
    }
  });

  it('core barrel value exports match the allow-list', () => {
    expect(Object.keys(core).sort()).toEqual([...CORE_PUBLIC_EXPORTS].sort());
  });

  it('alliance barrel value exports match the allow-list', () => {
    expect(Object.keys(alliance).sort()).toEqual(ALLIANCE_PUBLIC_EXPORTS);
  });
});
