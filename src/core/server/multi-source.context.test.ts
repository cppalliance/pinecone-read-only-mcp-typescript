import { describe, expect, it } from 'vitest';
import { createMultiSourceTestContext } from './tools/test-helpers.js';

describe('multi-source ServerContext', () => {
  it('resolveSource returns AMBIGUOUS_NAMESPACE when namespace exists on multiple sources', async () => {
    const { ctx } = createMultiSourceTestContext();
    const result = await ctx.resolveSource(undefined, 'shared');
    expect(result).toEqual({
      ok: false,
      code: 'AMBIGUOUS_NAMESPACE',
      message: 'Namespace "shared" exists on multiple sources. Pass source explicitly.',
    });
  });

  it('resolveSource infers source when namespace is unique', async () => {
    const { ctx } = createMultiSourceTestContext();
    const result = await ctx.resolveSource(undefined, 'wg21');
    expect(result).toEqual({ ok: true, source: 'api_key_1' });
  });

  it('isolates compound suggest-flow keys per source', () => {
    const { ctx } = createMultiSourceTestContext();
    ctx.markSuggested(
      'shared',
      { recommended_tool: 'fast', suggested_fields: ['title'], user_query: 'q1' },
      'api_key_1'
    );
    ctx.markSuggested(
      'shared',
      { recommended_tool: 'count', suggested_fields: [], user_query: 'q2' },
      'api_key_2'
    );
    expect(ctx.requireSuggested('shared', 'api_key_1').ok).toBe(true);
    expect(ctx.requireSuggested('shared', 'api_key_2').ok).toBe(true);
    expect(ctx.requireSuggested('shared', 'api_key_1').flow?.user_query).toBe('q1');
    expect(ctx.requireSuggested('shared', 'api_key_2').flow?.user_query).toBe('q2');
  });

  it('registers URL generators per source without collision', () => {
    const { ctx } = createMultiSourceTestContext();
    ctx.registerUrlGenerator(
      'shared',
      () => ({ url: 'https://api-key-1.example', method: 'generated' }),
      'api_key_1'
    );
    ctx.registerUrlGenerator(
      'shared',
      () => ({ url: 'https://api-key-2.example', method: 'generated' }),
      'api_key_2'
    );
    expect(ctx.generateUrlForNamespace('shared', {}, 'api_key_1').url).toBe(
      'https://api-key-1.example'
    );
    expect(ctx.generateUrlForNamespace('shared', {}, 'api_key_2').url).toBe(
      'https://api-key-2.example'
    );
  });
});
