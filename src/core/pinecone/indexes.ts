/**
 * Lazy Pinecone client and index handles; namespace discovery on dense/sparse indexes.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { error as logError, info as logInfo } from '../../logger.js';
import type {
  KeywordIndexNamespacesResult,
  NamespaceHandle,
  SearchableIndex,
} from '../../types.js';

/**
 * Infers a human-readable metadata field type for namespace discovery.
 * Distinguishes Pinecone-supported list type (string[]) from other arrays.
 */
function inferMetadataFieldType(value: unknown): string {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'array';
    if (value.every((item) => typeof item === 'string')) return 'string[]';
    return 'array';
  }
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  return 'object';
}

/** Holds lazy Pinecone SDK client and dense/sparse index references. */
export class PineconeIndexSession {
  private pc: Pinecone | null = null;
  private denseIndex: SearchableIndex | null = null;
  private sparseIndex: SearchableIndex | null = null;
  private initialized = false;

  constructor(
    private readonly apiKey: string,
    private readonly indexName: string
  ) {}

  /** Same as hybrid sparse index name: `{indexName}-sparse`. */
  getSparseIndexName(): string {
    return `${this.indexName}-sparse`;
  }

  /** Ensure Pinecone client is initialized */
  ensureClient(): Pinecone {
    if (!this.pc) {
      if (!this.apiKey) {
        throw new Error(
          'Pinecone API key is required. Set PINECONE_API_KEY environment variable or pass apiKey parameter.'
        );
      }
      this.pc = new Pinecone({ apiKey: this.apiKey });
      logInfo('Pinecone client initialized');
    }
    return this.pc;
  }

  /**
   * Ensure Pinecone indexes are initialized and return them
   */
  async ensureIndexes(): Promise<{
    denseIndex: SearchableIndex;
    sparseIndex: SearchableIndex;
  }> {
    if (this.initialized && this.denseIndex !== null && this.sparseIndex !== null) {
      return { denseIndex: this.denseIndex, sparseIndex: this.sparseIndex };
    }

    const pc = this.ensureClient();
    const denseName = this.indexName;
    const sparseName = this.getSparseIndexName();

    const dense = pc.index(denseName) as unknown as SearchableIndex;
    const sparse = pc.index(sparseName) as unknown as SearchableIndex;
    this.denseIndex = dense;
    this.sparseIndex = sparse;
    this.initialized = true;

    logInfo(`Connected to indexes: ${denseName} and ${sparseName}`);
    return { denseIndex: dense, sparseIndex: sparse };
  }

  /**
   * List namespaces present on the sparse index (same index used for hybrid sparse and keyword_search).
   * Use this to choose a namespace for sparse-only queries instead of the dense index list.
   */
  async listNamespacesFromKeywordIndex(): Promise<KeywordIndexNamespacesResult> {
    try {
      const { sparseIndex } = await this.ensureIndexes();
      const stats = sparseIndex.describeIndexStats
        ? await sparseIndex.describeIndexStats()
        : undefined;
      const namespaces = stats?.namespaces ?? {};
      const rows = Object.entries(namespaces).map(([namespace, info]) => ({
        namespace,
        recordCount: info?.recordCount ?? 0,
      }));
      return { ok: true, namespaces: rows };
    } catch (error) {
      logError('Error listing namespaces from keyword index', error);
      const msg = error instanceof Error ? error.message : String(error);
      return { ok: false, error: msg };
    }
  }

  /**
   * List all available namespaces with their metadata information
   *
   * Fetches namespaces from the index stats and samples records to discover
   * available metadata fields and their types.
   */
  async listNamespacesWithMetadata(): Promise<
    Array<{
      namespace: string;
      recordCount: number;
      metadata: Record<string, string>;
    }>
  > {
    try {
      const { denseIndex } = await this.ensureIndexes();

      // Get index stats to find namespaces
      const stats = denseIndex.describeIndexStats
        ? await denseIndex.describeIndexStats()
        : undefined;
      const namespaces = stats?.namespaces ? Object.keys(stats.namespaces) : [];

      logInfo(`Found ${namespaces.length} namespace(s)`);

      // Get metadata info for each namespace by sampling records
      const namespacesInfo = await Promise.all(
        namespaces.map(async (ns: string) => {
          try {
            const recordCount = stats?.namespaces?.[ns]?.recordCount || 0;
            const metadataFields: Record<string, string> = {};

            // Sample a few records to discover metadata fields
            if (recordCount > 0 && denseIndex.namespace) {
              try {
                const nsObj: NamespaceHandle = denseIndex.namespace(ns);
                const sampleQuery =
                  typeof nsObj.query === 'function'
                    ? await nsObj.query({
                        topK: 5,
                        vector: Array(stats?.dimension ?? 1536).fill(0),
                        includeMetadata: true,
                      })
                    : { matches: undefined };

                // Collect unique metadata fields and infer types (including string[])
                if (sampleQuery?.matches) {
                  sampleQuery.matches.forEach((match: { metadata?: Record<string, unknown> }) => {
                    if (match.metadata) {
                      Object.entries(match.metadata).forEach(([key, value]) => {
                        const inferredType = inferMetadataFieldType(value);
                        if (!(key in metadataFields)) {
                          metadataFields[key] = inferredType;
                        } else if (
                          (metadataFields[key] === 'object' || metadataFields[key] === 'array') &&
                          inferredType === 'string[]'
                        ) {
                          // Prefer array type over generic object when we see it in another sample
                          metadataFields[key] = inferredType;
                        }
                      });
                    }
                  });
                }
              } catch (queryError) {
                logError(`Error sampling records for namespace ${ns}`, queryError);
              }
            }

            return {
              namespace: ns,
              recordCount,
              metadata: metadataFields,
            };
          } catch (error) {
            logError(`Error processing namespace ${ns}`, error);
            return {
              namespace: ns,
              recordCount: 0,
              metadata: {},
            };
          }
        })
      );

      return namespacesInfo;
    } catch (error) {
      logError('Error listing namespaces', error);
      return [];
    }
  }

  /**
   * Verify dense and sparse indexes are reachable (describeIndexStats).
   * Used by `--check-indexes` / `PINECONE_CHECK_INDEXES` before the server starts.
   */
  async checkIndexes(): Promise<{ ok: boolean; errors: string[] }> {
    const errors: string[] = [];
    const denseName = this.indexName;
    const sparseName = this.getSparseIndexName();
    try {
      const { denseIndex, sparseIndex } = await this.ensureIndexes();

      if (typeof denseIndex.describeIndexStats !== 'function') {
        errors.push(
          `Dense index "${denseName}": describeIndexStats is not available on this SDK surface`
        );
      } else {
        try {
          await denseIndex.describeIndexStats();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Dense index "${denseName}": ${msg}`);
        }
      }

      if (typeof sparseIndex.describeIndexStats !== 'function') {
        errors.push(
          `Sparse index "${sparseName}": describeIndexStats is not available on this SDK surface`
        );
      } else {
        try {
          await sparseIndex.describeIndexStats();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Sparse index "${sparseName}": ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to connect to Pinecone indexes: ${msg}`);
    }

    return { ok: errors.length === 0, errors };
  }
}
