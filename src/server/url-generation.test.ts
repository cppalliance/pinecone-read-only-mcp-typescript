import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import type { UrlGeneratorFn } from './url-generation.js';
import {
  generateUrlForNamespace,
  registerBuiltinUrlGenerators,
  registerUrlGenerator,
  unregisterUrlGenerator,
} from './url-generation.js';

beforeAll(() => {
  registerBuiltinUrlGenerators();
});

describe('generateUrlForNamespace', () => {
  it('uses existing metadata.url when present', () => {
    const r = generateUrlForNamespace('mailing', {
      url: 'https://example.com/custom',
      doc_id: 'ignored',
    });
    expect(r.url).toBe('https://example.com/custom');
    expect(r.method).toBe('metadata.url');
  });

  it('generates mailing URL from doc_id', () => {
    const r = generateUrlForNamespace('mailing', {
      doc_id: 'boost-announce@lists.boost.org/message/O5VYCDZADVDHK5Z5LAYJBHMDOAFQL7P6',
    });
    expect(r.url).toBe(
      'https://lists.boost.org/archives/list/boost-announce@lists.boost.org/message/O5VYCDZADVDHK5Z5LAYJBHMDOAFQL7P6/'
    );
    expect(r.method).toBe('generated.mailing');
  });

  it('generates mailing URL from thread_id when doc_id missing', () => {
    const r = generateUrlForNamespace('mailing', {
      thread_id: 'boost@lists.boost.org/thread/ABC123',
    });
    expect(r.url).toBe(
      'https://lists.boost.org/archives/list/boost@lists.boost.org/thread/ABC123/'
    );
    expect(r.method).toBe('generated.mailing');
  });

  it('generates mailing URL as list_name/message/doc_id when list_name present and doc_id does not contain it', () => {
    const r = generateUrlForNamespace('mailing', {
      list_name: 'boost-users',
      doc_id: '12345',
    });
    expect(r.url).toBe('https://lists.boost.org/archives/list/boost-users/message/12345/');
    expect(r.method).toBe('generated.mailing');
  });

  it('uses msg_id when list_name present and doc_id missing', () => {
    const r = generateUrlForNamespace('mailing', {
      list_name: 'boost-announce',
      msg_id: '67890',
    });
    expect(r.url).toBe('https://lists.boost.org/archives/list/boost-announce/message/67890/');
    expect(r.method).toBe('generated.mailing');
  });

  it('uses single-path form when doc_id contains list_name (no list_name/message split)', () => {
    const r = generateUrlForNamespace('mailing', {
      list_name: 'boost-users',
      doc_id: 'boost-users@lists.boost.org/message/12345',
    });
    expect(r.url).toBe(
      'https://lists.boost.org/archives/list/boost-users@lists.boost.org/message/12345/'
    );
    expect(r.method).toBe('generated.mailing');
  });

  it('uses slack source when available', () => {
    const r = generateUrlForNamespace('slack-Cpplang', {
      source: 'https://app.slack.com/client/T123/C123/p123',
      team_id: 'T999',
      channel_id: 'C999',
      doc_id: '1.2',
    });
    expect(r.url).toBe('https://app.slack.com/client/T123/C123/p123');
    expect(r.method).toBe('metadata.source');
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

  it('returns unavailable for unsupported namespace', () => {
    const r = generateUrlForNamespace('wg21-papers', { doc_id: 'x' });
    expect(r.url).toBeNull();
    expect(r.method).toBe('unavailable');
  });
  it('returns unavailable for mailing when no doc_id or thread_id', () => {
    const r = generateUrlForNamespace('mailing', { author: 'someone' });
    expect(r.url).toBeNull();
    expect(r.method).toBe('unavailable');
  });

  it('returns unavailable for slack-Cpplang when required fields are missing', () => {
    const r = generateUrlForNamespace('slack-Cpplang', {
      team_id: 'T123',
      // channel_id missing, doc_id missing, no source
    });
    expect(r.url).toBeNull();
    expect(r.method).toBe('unavailable');
  });
});

describe('registerUrlGenerator', () => {
  const customNs = 'acme-docs';

  afterEach(() => {
    unregisterUrlGenerator(customNs);
    registerBuiltinUrlGenerators({ reinstallBuiltins: true });
  });

  it('registers a custom generator for a new namespace', () => {
    const fn: UrlGeneratorFn = () => ({
      url: 'https://example.com/doc/1',
      method: 'generated.custom',
    });
    registerUrlGenerator(customNs, fn);
    const r = generateUrlForNamespace(customNs, {});
    expect(r.url).toBe('https://example.com/doc/1');
    expect(r.method).toBe('generated.custom');
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
