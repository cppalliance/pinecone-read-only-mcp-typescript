/**
 * Mock PineconeClient for examples: no network; returns canned namespaces and hits.
 * Namespace `mailing` matches built-in URL generator demos in the README.
 */

import {
  PineconeClient,
  type CountParams,
  type CountResult,
  type HybridQueryResult,
  type KeywordIndexNamespacesResult,
  type KeywordSearchParams,
  type PineconeMetadataValue,
  type QueryParams,
  type SearchResult,
} from '@will-cppa/pinecone-read-only-mcp';

export const DEMO_NAMESPACE = 'mailing';

const demoMetadata: Record<string, PineconeMetadataValue> = {
  document_number: 'D-100',
  title: 'Demo document',
  chunk_text: 'This is synthetic chunk text for the week-3 examples.',
};

const demoHit: SearchResult = {
  id: 'demo-hit-1',
  content: String(demoMetadata['chunk_text']),
  score: 0.95,
  metadata: demoMetadata,
  reranked: true,
};

export class DemoMockPineconeClient extends PineconeClient {
  constructor() {
    super({ apiKey: '00000000-0000-0000-0000-000000000000' });
  }

  override async listNamespacesWithMetadata(): Promise<
    Array<{ namespace: string; recordCount: number; metadata: Record<string, string> }>
  > {
    return [
      {
        namespace: DEMO_NAMESPACE,
        recordCount: 42,
        metadata: {
          document_number: 'string',
          title: 'string',
          chunk_text: 'string',
          url: 'string',
        },
      },
    ];
  }

  override async listNamespacesFromKeywordIndex(): Promise<KeywordIndexNamespacesResult> {
    return {
      ok: true,
      namespaces: [{ namespace: DEMO_NAMESPACE, recordCount: 42 }],
    };
  }

  override async checkIndexes(): Promise<{ ok: boolean; errors: string[] }> {
    return { ok: true, errors: [] };
  }

  override async query(params: QueryParams): Promise<HybridQueryResult> {
    const reranked = params.useReranking !== false;
    const row: SearchResult = {
      ...demoHit,
      reranked,
      metadata: { ...demoMetadata },
    };
    return {
      results: [row],
      degraded: false,
      hybrid_leg_failed: null,
    };
  }

  override async count(_params: CountParams): Promise<CountResult> {
    return { count: 7, truncated: false };
  }

  override async keywordSearch(_params: KeywordSearchParams): Promise<SearchResult[]> {
    return [];
  }
}
