import { describe, expect, it } from 'vitest';
import {
  ALLIANCE_INSTRUCTIONS_APPENDIX,
  ALLIANCE_SERVER_INSTRUCTIONS,
  CORE_SERVER_INSTRUCTIONS,
  SERVER_INSTRUCTIONS,
} from './constants.js';

describe('server instructions', () => {
  it('CORE_SERVER_INSTRUCTIONS includes guided_query but not suggest_query_params', () => {
    expect(CORE_SERVER_INSTRUCTIONS).toMatch(/guided_query/);
    expect(CORE_SERVER_INSTRUCTIONS).not.toMatch(/suggest_query_params/);
  });

  it('ALLIANCE_SERVER_INSTRUCTIONS includes guided_query and suggest_query_params', () => {
    expect(ALLIANCE_SERVER_INSTRUCTIONS).toMatch(/guided_query/);
    expect(ALLIANCE_SERVER_INSTRUCTIONS).toMatch(/suggest_query_params/);
  });

  it('ALLIANCE_INSTRUCTIONS_APPENDIX does not duplicate core guided_query quickstart', () => {
    expect(ALLIANCE_INSTRUCTIONS_APPENDIX).not.toMatch(
      /Alliance quickstart: for most user questions, call `guided_query`/
    );
    expect(ALLIANCE_INSTRUCTIONS_APPENDIX).toMatch(/rag-hybrid/);
    expect(ALLIANCE_INSTRUCTIONS_APPENDIX).toMatch(/suggest_query_params/);
  });

  it('SERVER_INSTRUCTIONS aliases Alliance instructions', () => {
    expect(SERVER_INSTRUCTIONS).toBe(ALLIANCE_SERVER_INSTRUCTIONS);
  });
});
