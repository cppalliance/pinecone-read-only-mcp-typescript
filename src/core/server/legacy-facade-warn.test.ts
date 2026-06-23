import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLogLevel } from '../../logger.js';
import { setPineconeClient } from './client-context.js';
import { resetLegacyFacadeWarnLatchForTests, warnLegacyFacade } from './legacy-facade-warn.js';
import { teardownDefaultServerContext } from './server-context.js';

describe('legacy-facade-warn', () => {
  const originalEnv = process.env['PINECONE_DEPRECATION_WARNINGS'];

  beforeEach(() => {
    resetLegacyFacadeWarnLatchForTests();
    setLogLevel('INFO');
    delete process.env['PINECONE_DEPRECATION_WARNINGS'];
    teardownDefaultServerContext();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['PINECONE_DEPRECATION_WARNINGS'];
    } else {
      process.env['PINECONE_DEPRECATION_WARNINGS'] = originalEnv;
    }
    resetLegacyFacadeWarnLatchForTests();
    setLogLevel('INFO');
    teardownDefaultServerContext();
  });

  it('does not warn by default', () => {
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnLegacyFacade('getPineconeClient');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('warns once per symbol when PINECONE_DEPRECATION_WARNINGS=1', () => {
    process.env['PINECONE_DEPRECATION_WARNINGS'] = '1';
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    warnLegacyFacade('setPineconeClient');
    warnLegacyFacade('setPineconeClient');

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(/setPineconeClient is deprecated/);
    warnSpy.mockRestore();
  });

  it('warns when log level is DEBUG', () => {
    setLogLevel('DEBUG');
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    warnLegacyFacade('getDefaultServerContext');

    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('setPineconeClient warns once through facade when env enabled', () => {
    process.env['PINECONE_DEPRECATION_WARNINGS'] = '1';
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    setPineconeClient({ query: vi.fn() } as never);
    setPineconeClient({ query: vi.fn() } as never);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(/setPineconeClient is deprecated/);
    warnSpy.mockRestore();
  });
});
