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
    expect(result).toEqual({ ok: true, source: 'public' });
  });

  it('isolates compound suggest-flow keys per source', () => {
    const { ctx } = createMultiSourceTestContext();
    ctx.markSuggested(
      'shared',
      { recommended_tool: 'fast', suggested_fields: ['title'], user_query: 'q1' },
      'public'
    );
    ctx.markSuggested(
      'shared',
      { recommended_tool: 'count', suggested_fields: [], user_query: 'q2' },
      'private'
    );
    expect(ctx.requireSuggested('shared', 'public').ok).toBe(true);
    expect(ctx.requireSuggested('shared', 'private').ok).toBe(true);
    expect(ctx.requireSuggested('shared', 'public').flow?.user_query).toBe('q1');
    expect(ctx.requireSuggested('shared', 'private').flow?.user_query).toBe('q2');
  });

  it('registers URL generators per source without collision', () => {
    const { ctx } = createMultiSourceTestContext();
    ctx.registerUrlGenerator(
      'shared',
      () => ({ url: 'https://public.example', method: 'generated' }),
      'public'
    );
    ctx.registerUrlGenerator(
      'shared',
      () => ({ url: 'https://private.example', method: 'generated' }),
      'private'
    );
    expect(ctx.generateUrlForNamespace('shared', {}, 'public').url).toBe('https://public.example');
    expect(ctx.generateUrlForNamespace('shared', {}, 'private').url).toBe(
      'https://private.example'
    );
  });
});
