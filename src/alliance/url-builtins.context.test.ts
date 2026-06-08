import { describe, expect, it } from 'vitest';
import { registerBuiltinUrlGenerators } from './url-builtins.js';
import { createTestServerContext } from '../core/server/tools/test-helpers.js';

const MAILING_DOC_ID = 'boost-announce@lists.boost.org/message/O5VYCDZADVDHK5Z5LAYJBHMDOAFQL7P6';

describe('registerBuiltinUrlGenerators (ServerContext instance path)', () => {
  it('registers builtins only on the target context', () => {
    const ctxA = createTestServerContext();
    const ctxB = createTestServerContext();
    registerBuiltinUrlGenerators(ctxA);

    const metadata = { doc_id: MAILING_DOC_ID };
    const fromA = ctxA.generateUrlForNamespace('mailing', metadata);
    const fromB = ctxB.generateUrlForNamespace('mailing', metadata);

    expect(fromA.url).toContain('lists.boost.org');
    expect(fromA.method).toBe('generated.mailing');
    expect(fromB.method).toBe('unavailable');
    expect(fromB.url).toBeNull();
  });
});
