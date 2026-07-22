/**
 * Registry of named Pinecone sources (one client + namespace cache per source).
 */

import { PineconeClient } from '../pinecone-client.js';
import { redactErrorMessage } from '../../logger.js';
import type { NamespaceInfo } from './server-context.js';
import { fetchNamespacesWithDeclaredConfig, type NamespacesCacheEntry } from './namespace-cache.js';
import type { SourceDefinition } from './source-config.js';

export type { NamespacesCacheEntry };

export type PerSourceCacheResult = {
  data: NamespaceInfo[];
  cache_hit: boolean;
  expires_at: number;
  warnings?: string[];
};

export type AggregatedCacheResult = {
  data: NamespaceInfo[];
  cache_hit: boolean;
  expires_at: number;
  source_errors?: Record<string, string>;
  warnings?: string[];
};

export type BuildSourceRegistryOptions = {
  sources: SourceDefinition[];
  defaultSource: string;
  cacheTtlMs: number;
  defaultTopK: number;
  requestTimeoutMs: number;
  clients?: Map<string, PineconeClient>;
};

export class SourceRegistry {
  private readonly entries: Map<
    string,
    { client: PineconeClient; cache: NamespacesCacheEntry | null; definition: SourceDefinition }
  >;
  private readonly defaultSourceName: string;
  private readonly cacheTtlMs: number;

  constructor(options: BuildSourceRegistryOptions) {
    this.cacheTtlMs = options.cacheTtlMs;
    this.defaultSourceName = options.defaultSource;
    this.entries = new Map();
    for (const def of options.sources) {
      const client =
        options.clients?.get(def.name) ??
        new PineconeClient({
          apiKey: def.apiKey,
          indexName: def.indexName,
          sparseIndexName: def.sparseIndexName,
          rerankModel: def.rerankModel,
          defaultTopK: options.defaultTopK,
          requestTimeoutMs: options.requestTimeoutMs,
        });
      this.entries.set(def.name, { client, cache: null, definition: def });
    }
    if (!this.entries.has(this.defaultSourceName)) {
      throw new Error(`Default source "${this.defaultSourceName}" is not configured.`);
    }
  }

  isMultiSource(): boolean {
    return this.entries.size > 1;
  }

  listSources(): string[] {
    return [...this.entries.keys()];
  }

  getDefaultName(): string {
    return this.defaultSourceName;
  }

  getDefinition(name: string): SourceDefinition {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new Error(`Unknown Pinecone source "${name}".`);
    }
    return entry.definition;
  }

  get(name: string): PineconeClient {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new Error(`Unknown Pinecone source "${name}".`);
    }
    return entry.client;
  }

  getDefault(): PineconeClient {
    return this.get(this.defaultSourceName);
  }

  async getNamespacesWithCache(source: string): Promise<PerSourceCacheResult> {
    const entry = this.entries.get(source);
    if (!entry) {
      throw new Error(`Unknown Pinecone source "${source}".`);
    }
    const now = Date.now();
    if (entry.cache && now < entry.cache.expiresAt) {
      return {
        data: entry.cache.data,
        cache_hit: true,
        expires_at: entry.cache.expiresAt,
        ...(entry.cache.warnings.length > 0 ? { warnings: [...entry.cache.warnings] } : {}),
      };
    }
    const { data, warnings } = await fetchNamespacesWithDeclaredConfig(
      entry.client,
      entry.definition.namespaces,
      source
    );
    const expiresAt = now + this.cacheTtlMs;
    entry.cache = { data, expiresAt, warnings };
    return {
      data,
      cache_hit: false,
      expires_at: expiresAt,
      ...(warnings.length > 0 ? { warnings: [...warnings] } : {}),
    };
  }

  async getAllNamespacesWithCache(): Promise<AggregatedCacheResult> {
    const names = this.listSources();
    const settled = await Promise.allSettled(
      names.map(async (name) => {
        const result = await this.getNamespacesWithCache(name);
        return { name, result };
      })
    );
    const data: NamespaceInfo[] = [];
    const source_errors: Record<string, string> = {};
    const warnings: string[] = [];
    let cache_hit = true;
    let maxExpires = 0;
    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i]!;
      const name = names[i]!;
      if (outcome.status === 'fulfilled') {
        data.push(...outcome.value.result.data);
        if (!outcome.value.result.cache_hit) {
          cache_hit = false;
        }
        if (outcome.value.result.warnings?.length) {
          warnings.push(...outcome.value.result.warnings);
        }
        maxExpires = Math.max(maxExpires, outcome.value.result.expires_at);
      } else {
        cache_hit = false;
        source_errors[name] = redactErrorMessage(outcome.reason);
      }
    }
    const expires_at = maxExpires > 0 ? maxExpires : Date.now() + this.cacheTtlMs;
    return {
      data,
      cache_hit,
      expires_at,
      ...(Object.keys(source_errors).length > 0 ? { source_errors } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  invalidateNamespacesCache(source?: string): void {
    if (source !== undefined) {
      const entry = this.entries.get(source);
      if (entry) {
        entry.cache = null;
      }
      return;
    }
    for (const entry of this.entries.values()) {
      entry.cache = null;
    }
  }

  async checkAllIndexes(): Promise<{ ok: boolean; errors: string[] }> {
    const errors: string[] = [];
    for (const name of this.listSources()) {
      const result = await this.get(name).checkIndexes();
      if (!result.ok) {
        for (const err of result.errors) {
          errors.push(`[${name}] ${err}`);
        }
      }
    }
    return { ok: errors.length === 0, errors };
  }
}

export function buildSourceRegistry(options: BuildSourceRegistryOptions): SourceRegistry {
  return new SourceRegistry(options);
}
