import { describe, expect, it } from 'vitest';
import { parseCli } from './cli.js';

describe('parseCli', () => {
  it('does not treat a following flag as a value for --api-key', () => {
    const r = parseCli(['--api-key', '--index-name', 'my-index']);
    expect(r.kind).toBe('config');
    if (r.kind === 'config') {
      expect(r.overrides.apiKey).toBeUndefined();
      expect(r.overrides.indexName).toBe('my-index');
    }
  });

  it('parses --api-key with a real value', () => {
    const r = parseCli(['--api-key', 'sk-test', '--index-name', 'idx']);
    expect(r.kind).toBe('config');
    if (r.kind === 'config') {
      expect(r.overrides.apiKey).toBe('sk-test');
      expect(r.overrides.indexName).toBe('idx');
    }
  });

  it('does not consume --top-k when the next token is another flag', () => {
    const r = parseCli(['--top-k', '--log-level', 'DEBUG']);
    expect(r.kind).toBe('config');
    if (r.kind === 'config') {
      expect(r.overrides.defaultTopK).toBeUndefined();
      expect(r.overrides.logLevel).toBe('DEBUG');
    }
  });

  it('parses numeric --top-k when value is valid', () => {
    const r = parseCli(['--top-k', '25']);
    expect(r.kind).toBe('config');
    if (r.kind === 'config') {
      expect(r.overrides.defaultTopK).toBe(25);
    }
  });
});
