/** Hybrid dense+sparse query client with optional reranking (facade over `src/pinecone/*`). */

import { error as logError, info as logInfo } from './logger.js';
import type {
  PineconeClientConfig,
  SearchResult,
  PineconeHit,
  QueryParams,
  CountParams,
  CountResult,
  KeywordSearchParams,
  KeywordIndexNamespacesResult,
  SearchableIndex,
  HybridQueryResult,
  HybridLegFailed,
} from './types.js';
import {
  DEFAULT_INDEX_NAME,
  DEFAULT_RERANK_MODEL,
  DEFAULT_TOP_K,
  MAX_TOP_K,
  COUNT_TOP_K,
  COUNT_FIELDS,
} from './constants.js';
import { PineconeIndexSession } from './pinecone/indexes.js';
import {
  countUniqueDocumentsFromHits,
  mapSparseHitsToSearchResults,
  mergeResults,
  searchIndex as searchIndexImpl,
  sliceMergedHitsToSearchResults,
} from './pinecone/search.js';
import { rerankResults as rerankResultsImpl } from './pinecone/rerank.js';

export class PineconeClient {
  private rerankModel: string;
  private defaultTopK: number;
  private readonly indexSession: PineconeIndexSession;

  /**
   * Create a client from a resolved {@link PineconeClientConfig}.
   * Index name, rerank model, and default top-k come only from this object (typically
   * built via {@link resolveConfig} / CLI); this class does not read `process.env`.
   */
  constructor(config: PineconeClientConfig) {
    const indexName = config.indexName ?? DEFAULT_INDEX_NAME;
    this.indexSession = new PineconeIndexSession(config.apiKey, indexName);
    this.rerankModel = config.rerankModel ?? DEFAULT_RERANK_MODEL;
    this.defaultTopK = config.defaultTopK ?? DEFAULT_TOP_K;
  }

  /** Sparse index name `{indexName}-sparse` (keyword / hybrid sparse). */
  getSparseIndexName(): string {
    return this.indexSession.getSparseIndexName();
  }

  private clampTopK(requested: number | undefined): number {
    if (requested !== undefined && !Number.isFinite(requested)) {
      throw new Error('topK must be a finite number >= 1');
    }
    let topK = requested !== undefined ? requested : this.defaultTopK;
    if (topK < 1) {
      throw new Error('topK must be at least 1');
    }
    if (topK > MAX_TOP_K) {
      topK = MAX_TOP_K;
    }
    return topK;
  }

  private async ensureIndexes(): Promise<{
    denseIndex: SearchableIndex;
    sparseIndex: SearchableIndex;
  }> {
    return this.indexSession.ensureIndexes();
  }

  /** Namespaces on the sparse (keyword) index with record counts. */
  async listNamespacesFromKeywordIndex(): Promise<KeywordIndexNamespacesResult> {
    return this.indexSession.listNamespacesFromKeywordIndex();
  }

  /** Dense index namespaces with sampled metadata field types. */
  async listNamespacesWithMetadata(): Promise<
    Array<{
      namespace: string;
      recordCount: number;
      metadata: Record<string, string>;
    }>
  > {
    return this.indexSession.listNamespacesWithMetadata();
  }

  /** Probe dense + sparse indexes (describeIndexStats) for startup checks. */
  async checkIndexes(): Promise<{ ok: boolean; errors: string[] }> {
    return this.indexSession.checkIndexes();
  }

  private async searchIndex(
    index: SearchableIndex,
    query: string,
    topK: number,
    namespace?: string,
    metadataFilter?: Record<string, unknown>,
    options?: { fields?: string[] }
  ): Promise<PineconeHit[]> {
    return searchIndexImpl(index, query, topK, namespace, metadataFilter, options);
  }

  async query(params: QueryParams): Promise<HybridQueryResult> {
    const {
      query,
      topK: requestedTopK,
      namespace,
      metadataFilter,
      useReranking = true,
      fields: requestedFields,
    } = params;

    if (!query || !query.trim()) {
      throw new Error('Query cannot be empty');
    }

    const topK = this.clampTopK(requestedTopK);

    const searchFields =
      requestedFields?.length && useReranking && !requestedFields.includes('chunk_text')
        ? [...requestedFields, 'chunk_text']
        : requestedFields;

    const { denseIndex, sparseIndex } = await this.ensureIndexes();

    const searchOptions = searchFields?.length ? { fields: searchFields } : undefined;

    const [denseResult, sparseResult] = await Promise.allSettled([
      this.searchIndex(denseIndex, query, topK, namespace, metadataFilter, searchOptions),
      this.searchIndex(sparseIndex, query, topK, namespace, metadataFilter, searchOptions),
    ]);

    const denseHits = denseResult.status === 'fulfilled' ? denseResult.value : [];
    const sparseHits = sparseResult.status === 'fulfilled' ? sparseResult.value : [];

    if (denseResult.status === 'rejected') {
      logError('Dense index search failed', denseResult.reason);
    }
    if (sparseResult.status === 'rejected') {
      logError('Sparse index search failed', sparseResult.reason);
    }
    if (denseResult.status === 'rejected' && sparseResult.status === 'rejected') {
      throw new Error('Hybrid search failed: both dense and sparse index searches failed.');
    }

    let hybridLegFailed: HybridLegFailed = null;
    if (
      denseResult.status === 'rejected' &&
      sparseResult.status === 'fulfilled' &&
      sparseHits.length > 0
    ) {
      hybridLegFailed = 'dense';
    } else if (
      sparseResult.status === 'rejected' &&
      denseResult.status === 'fulfilled' &&
      denseHits.length > 0
    ) {
      hybridLegFailed = 'sparse';
    }

    const mergedResults = mergeResults(denseHits, sparseHits);

    let degraded = false;
    let degradation_reason: string | undefined;
    let documents: SearchResult[];
    if (useReranking) {
      const rerankOut = await rerankResultsImpl(
        this.indexSession.ensureClient(),
        this.rerankModel,
        query,
        mergedResults,
        topK
      );
      documents = rerankOut.results;
      degraded = rerankOut.degraded;
      degradation_reason = rerankOut.degradation_reason;
    } else {
      documents = sliceMergedHitsToSearchResults(mergedResults, topK);
    }

    logInfo(
      `Retrieved ${documents.length} documents from hybrid search (dense: ${denseHits.length}, sparse: ${sparseHits.length})`
    );

    return {
      results: documents,
      degraded,
      ...(degradation_reason !== undefined ? { degradation_reason } : {}),
      hybrid_leg_failed: hybridLegFailed,
    };
  }

  async keywordSearch(params: KeywordSearchParams): Promise<SearchResult[]> {
    const {
      query,
      namespace,
      topK: requestedTopK,
      metadataFilter,
      fields: requestedFields,
    } = params;

    if (!query || !query.trim()) {
      throw new Error('Query cannot be empty');
    }

    const topK = this.clampTopK(requestedTopK);

    const { sparseIndex } = await this.ensureIndexes();
    const searchOptions = requestedFields?.length ? { fields: requestedFields } : undefined;

    const hits = await this.searchIndex(
      sparseIndex,
      query.trim(),
      topK,
      namespace,
      metadataFilter,
      searchOptions
    );

    const documents = mapSparseHitsToSearchResults(hits);

    logInfo(
      `Keyword search returned ${documents.length} results from ${this.getSparseIndexName()}`
    );
    return documents;
  }

  async count(params: CountParams): Promise<CountResult> {
    if (!params.query || !params.query.trim()) {
      throw new Error('Query cannot be empty');
    }
    const { denseIndex } = await this.ensureIndexes();

    const hits = await this.searchIndex(
      denseIndex,
      params.query,
      COUNT_TOP_K,
      params.namespace,
      params.metadataFilter,
      { fields: [...COUNT_FIELDS] }
    );

    return countUniqueDocumentsFromHits(hits, params.namespace);
  }
}
