import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { generateUrlForNamespace } from '../core/server/url-registry.js';
import { registerBuiltinUrlGenerators } from './url-builtins.js';
import { registerUrlGenerator, unregisterUrlGenerator } from '../core/server/url-registry.js';

beforeAll(() => {
  registerBuiltinUrlGenerators();
});

describe('generateUrlForNamespace (alliance builtins)', () => {
  it('generates mailing URL from doc_id', () => {
    const r = generateUrlForNamespace('mailing', {
      doc_id: 'boost-announce@lists.boost.org/message/O5VYCDZADVDHK5Z5LAYJBHMDOAFQL7P6',
    });
    expect(r.url).toBe(
      'https://lists.boost.org/archives/list/boost-announce@lists.boost.org/message/O5VYCDZADVDHK5Z5LAYJBHMDOAFQL7P6/'
    );
    expect(r.method).toBe('generated.mailing');
  });

  it('generates slack URL from team/channel/doc_id', () => {
    const r = generateUrlForNamespace('slack-Cpplang', {
      team_id: 'T123456789',
      channel_id: 'C123456',
      doc_id: '1234567.890',
    });
    expect(r.url).toBe('https://app.slack.com/client/T123456789/C123456/p1234567890');
    expect(r.method).toBe('generated.slack');
  });
});

describe('registerBuiltinUrlGenerators', () => {
  const customNs = 'acme-docs';

  afterEach(() => {
    unregisterUrlGenerator(customNs);
    registerBuiltinUrlGenerators({ reinstallBuiltins: true });
  });

  it('allows a custom generator to override the mailing built-in', () => {
    registerUrlGenerator('mailing', () => ({
      url: 'https://override.example/mailing',
      method: 'generated.custom',
    }));
    const r = generateUrlForNamespace('mailing', {
      doc_id: 'boost-announce@lists.boost.org/message/O5VYCDZADVDHK5Z5LAYJBHMDOAFQL7P6',
    });
    expect(r.url).toBe('https://override.example/mailing');
    expect(r.method).toBe('generated.custom');
  });
});
