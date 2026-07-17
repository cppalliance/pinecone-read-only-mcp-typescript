/**
 * Lazy Pinecone client and index handles; namespace discovery on dense/sparse indexes.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../config.js';
import { runWithPolicy, type PolicyOptions } from '../server/retry.js';
import { error as logError, info as logInfo } from '../../logger.js';
import type {
  KeywordIndexNamespacesResult,
  NamespaceHandle,
  SearchableIndex,
} from '../../types.js';

/** Startup probe: fail fast on unreachable indexes instead of retrying. */
const CHECK_INDEXES_IO_POLICY = { retries: 0 } as const satisfies Pick<PolicyOptions, 'retries'>;

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

export type NamespaceWithMetadataRow = {
  namespace: string;
  recordCount: number;
  metadata: Record<string, string>;
  schema_source: 'declared' | 'sampled';
};

export type NamespacesWithMetadataResult = {
  namespaces: NamespaceWithMetadataRow[];
  warnings: string[];
};

/** Holds lazy Pinecone SDK client and dense/sparse index references. */
export class PineconeIndexSession {
  private pc: Pinecone | null = null;
  private denseIndex: SearchableIndex | null = null;
  private sparseIndex: SearchableIndex | null = null;
  private initialized = false;

  constructor(
    private readonly apiKey: string,
    private readonly indexName: string,
    private readonly sparseIndexName?: string,
    private readonly requestTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
  ) {}

  /** Sparse index name; defaults to `{indexName}-sparse`. */
  getSparseIndexName(): string {
    return this.sparseIndexName ?? `${this.indexName}-sparse`;
  }

  getRequestTimeoutMs(): number {
    return this.requestTimeoutMs;
  }

  private runIo<T>(
    label: string,
    fn: () => Promise<T>,
    policy?: Pick<PolicyOptions, 'retries' | 'backoffMs'>
  ): Promise<T> {
    return runWithPolicy(() => fn(), { timeoutMs: this.requestTimeoutMs, label, ...policy });
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
      // SDK methods must be invoked on the index receiver inside runIo, not detached.
      const stats =
        typeof sparseIndex.describeIndexStats === 'function'
          ? await this.runIo('describeIndexStats-sparse', () => sparseIndex.describeIndexStats!())
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
   * available metadata fields and their types. When `declaredSchemas` provides
   * a schema for a live namespace, sampling is skipped for that namespace.
   */
  async listNamespacesWithMetadata(
    declaredSchemas?: Record<string, Record<string, string>>,
    declaredNamespaceNames?: string[]
  ): Promise<NamespacesWithMetadataResult> {
    try {
      const { denseIndex } = await this.ensureIndexes();

      // Get index stats to find namespaces
      const stats =
        typeof denseIndex.describeIndexStats === 'function'
          ? await this.runIo('describeIndexStats-dense', () => denseIndex.describeIndexStats!())
          : undefined;
      const namespaces = stats?.namespaces ? Object.keys(stats.namespaces) : [];
      const liveSet = new Set(namespaces);

      logInfo(`Found ${namespaces.length} namespace(s)`);

      const warnings: string[] = [];
      const namesToVerify =
        declaredNamespaceNames ?? (declaredSchemas ? Object.keys(declaredSchemas) : []);
      for (const declaredNs of namesToVerify) {
        if (!liveSet.has(declaredNs)) {
          warnings.push(
            `Declared namespace "${declaredNs}" not found in Pinecone index "${this.indexName}" — schema declaration is stale.`
          );
        }
      }

      // Get metadata info for each namespace by sampling records (or use declared schema)
      const namespacesInfo = await Promise.all(
        namespaces.map(async (ns: string) => {
          try {
            const recordCount = stats?.namespaces?.[ns]?.recordCount || 0;
            const declared = declaredSchemas?.[ns];
            if (declared) {
              return {
                namespace: ns,
                recordCount,
                metadata: { ...declared },
                schema_source: 'declared' as const,
              };
            }

            const metadataFields: Record<string, string> = {};

            // Sample a few records to discover metadata fields
            if (recordCount > 0 && denseIndex.namespace) {
              try {
                const nsObj: NamespaceHandle = denseIndex.namespace(ns);
                const sampleQuery =
                  typeof nsObj.query === 'function'
                    ? await this.runIo('sampleNamespaceMetadata', () =>
                        nsObj.query!({
                          topK: 5,
                          vector: Array(stats?.dimension ?? 1536).fill(0),
                          includeMetadata: true,
                        })
                      )
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
              schema_source: 'sampled' as const,
            };
          } catch (error) {
            logError(`Error processing namespace ${ns}`, error);
            return {
              namespace: ns,
              recordCount: 0,
              metadata: {},
              schema_source: 'sampled' as const,
            };
          }
        })
      );

      return { namespaces: namespacesInfo, warnings };
    } catch (error) {
      logError('Error listing namespaces', error);
      return { namespaces: [], warnings: [] };
    }
  }

  /**
   * Fetch a record by id and return a flat field bag (metadata merged with top-level scalar fields).
   * Mirrors Python `_extract_record_fields` for integrated-embedding indexes where `chunk_text`
   * may appear on the record or inside metadata.
   */
  async fetchRecordFields(namespace: string, id: string): Promise<Record<string, unknown> | null> {
    return this.runIo('fetchRecordFields', async () => {
      const pc = this.ensureClient();
      const response = await pc.index(this.indexName).fetch({ ids: [id], namespace });
      const record = response.records?.[id] as
        (Record<string, unknown> & { metadata?: Record<string, unknown> }) | undefined;
      if (!record) {
        return null;
      }
      const metadata = record.metadata ?? {};
      const merged: Record<string, unknown> = { ...metadata };
      for (const [k, v] of Object.entries(record)) {
        if (k !== 'metadata' && k !== 'values' && k !== 'sparseValues' && !(k in merged)) {
          merged[k] = v;
        }
      }
      return merged;
    });
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
          await this.runIo(
            'describeIndexStats-dense',
            () => denseIndex.describeIndexStats!(),
            CHECK_INDEXES_IO_POLICY
          );
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
          await this.runIo(
            'describeIndexStats-sparse',
            () => sparseIndex.describeIndexStats!(),
            CHECK_INDEXES_IO_POLICY
          );
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
