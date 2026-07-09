import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    expect(ALLIANCE_INSTRUCTIONS_APPENDIX).toMatch(/suggest_query_params/);
  });

  it('CORE_SERVER_INSTRUCTIONS omits operator/install/deploy content', () => {
    expect(CORE_SERVER_INSTRUCTIONS).not.toMatch(/PINECONE_INDEX_NAME/);
    expect(CORE_SERVER_INSTRUCTIONS).not.toMatch(/Misconfiguration surfaces/);
    expect(CORE_SERVER_INSTRUCTIONS).not.toMatch(/PINECONE_RERANK_MODEL/);
    expect(CORE_SERVER_INSTRUCTIONS).not.toMatch(/PINECONE_READ_ONLY_MCP_LOG_FORMAT/);
  });

  it('ALLIANCE_INSTRUCTIONS_APPENDIX omits operator/deploy defaults', () => {
    expect(ALLIANCE_INSTRUCTIONS_APPENDIX).not.toMatch(/rag-hybrid/);
    expect(ALLIANCE_INSTRUCTIONS_APPENDIX).not.toMatch(/bge-reranker/);
    expect(ALLIANCE_INSTRUCTIONS_APPENDIX).not.toMatch(/resolveAllianceConfig/);
  });

  it('ALLIANCE_INSTRUCTIONS_APPENDIX uses unnumbered manual flow without duplicate step numbering', () => {
    expect(ALLIANCE_INSTRUCTIONS_APPENDIX).not.toMatch(/Alliance usage/);
    expect(ALLIANCE_INSTRUCTIONS_APPENDIX).not.toMatch(/^[45]\. /m);
    expect(ALLIANCE_INSTRUCTIONS_APPENDIX).toMatch(/Manual Alliance flow/);
    expect((ALLIANCE_SERVER_INSTRUCTIONS.match(/Usage:/g) ?? []).length).toBe(1);
  });

  it('ALLIANCE_INSTRUCTIONS_APPENDIX documents suggest-flow escape clause in manual flow', () => {
    expect(ALLIANCE_INSTRUCTIONS_APPENDIX).toMatch(/PINECONE_DISABLE_SUGGEST_FLOW=true/);
    const manualFlowSection = ALLIANCE_INSTRUCTIONS_APPENDIX.slice(
      ALLIANCE_INSTRUCTIONS_APPENDIX.indexOf('Manual Alliance flow')
    );
    expect(manualFlowSection).toMatch(/PINECONE_DISABLE_SUGGEST_FLOW=true/);
  });

  it('SERVER_INSTRUCTIONS aliases Alliance instructions', () => {
    expect(SERVER_INSTRUCTIONS).toBe(ALLIANCE_SERVER_INSTRUCTIONS);
  });

  it('example multi-source config uses only generic placeholder descriptions and schemas', () => {
    const examplePath = join(process.cwd(), 'examples/multi-source/pinecone-sources.json.example');
    const raw = readFileSync(examplePath, 'utf8');
    const parsed = JSON.parse(raw) as {
      sources: Record<
        string,
        {
          description?: string;
          namespaces?: Record<
            string,
            { description?: string; metadata_schema?: Record<string, string> }
          >;
        }
      >;
    };
    const corpusPlaceholder =
      '<optional: describe this corpus in your PRIVATE staff config, not here>';
    const namespacePlaceholder =
      '<optional: describe this namespace in your PRIVATE staff config, not here>';
    expect(parsed.sources.api_key_1.description).toBe(corpusPlaceholder);
    expect(parsed.sources.api_key_1.namespaces?.['example-namespace']?.description).toBe(
      namespacePlaceholder
    );
    expect(parsed.sources.api_key_1.namespaces?.['example-namespace']?.metadata_schema).toEqual({
      field_a: 'string',
      field_b: 'number',
    });
    expect(CORE_SERVER_INSTRUCTIONS).not.toContain(corpusPlaceholder);
    expect(ALLIANCE_SERVER_INSTRUCTIONS).not.toContain(corpusPlaceholder);
  });
});
