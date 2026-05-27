import { describe, expect, it, afterEach } from 'vitest';
import type { UrlGeneratorFn } from './url-registry.js';
import {
  generateUrlForNamespace,
  registerUrlGenerator,
  unregisterUrlGenerator,
  resetUrlGenerationRegistry,
} from './url-registry.js';

describe('url-registry', () => {
  afterEach(() => {
    resetUrlGenerationRegistry();
  });

  it('uses existing metadata.url when present', () => {
    registerUrlGenerator('custom', () => ({
      url: 'https://override.example',
      method: 'generated.custom',
    }));
    const r = generateUrlForNamespace('custom', {
      url: 'https://example.com/custom',
      doc_id: 'ignored',
    });
    expect(r.url).toBe('https://example.com/custom');
    expect(r.method).toBe('metadata.url');
  });

  it('returns unavailable for unsupported namespace', () => {
    const r = generateUrlForNamespace('unknown-ns', { doc_id: 'x' });
    expect(r.url).toBeNull();
    expect(r.method).toBe('unavailable');
  });
});

describe('registerUrlGenerator', () => {
  const customNs = 'acme-docs';

  afterEach(() => {
    unregisterUrlGenerator(customNs);
    resetUrlGenerationRegistry();
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
});
