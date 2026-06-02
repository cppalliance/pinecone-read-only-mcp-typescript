import { describe, expect, it } from 'vitest';
import {
  ALLIANCE_SERVER_INSTRUCTIONS,
  CORE_SERVER_INSTRUCTIONS,
  SERVER_INSTRUCTIONS,
} from './constants.js';

describe('server instructions', () => {
  it('CORE_SERVER_INSTRUCTIONS does not reference Alliance-only tools', () => {
    expect(CORE_SERVER_INSTRUCTIONS).not.toMatch(/guided_query/);
    expect(CORE_SERVER_INSTRUCTIONS).not.toMatch(/suggest_query_params/);
  });

  it('ALLIANCE_SERVER_INSTRUCTIONS includes guided_query and suggest_query_params', () => {
    expect(ALLIANCE_SERVER_INSTRUCTIONS).toMatch(/guided_query/);
    expect(ALLIANCE_SERVER_INSTRUCTIONS).toMatch(/suggest_query_params/);
  });

  it('SERVER_INSTRUCTIONS aliases Alliance instructions', () => {
    expect(SERVER_INSTRUCTIONS).toBe(ALLIANCE_SERVER_INSTRUCTIONS);
  });
});
