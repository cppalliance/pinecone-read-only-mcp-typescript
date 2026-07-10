import type { PineconeClient } from '../pinecone-client.js';
import type { NamespaceWithMetadataRow } from '../pinecone/indexes.js';
import { extractDeclaredSchemas, type NamespaceDeclaration } from './source-config.js';
import type { NamespaceInfo } from './server-context.js';

export type NamespacesCacheEntry = {
  data: NamespaceInfo[];
  expiresAt: number;
  warnings: string[];
};

export function mapNamespaceRowsToInfo(
  rows: NamespaceWithMetadataRow[],
  options?: {
    declaredNamespaces?: Record<string, NamespaceDeclaration>;
    source?: string;
  }
): NamespaceInfo[] {
  const { declaredNamespaces, source } = options ?? {};
  return rows.map((ns) => {
    const description = declaredNamespaces?.[ns.namespace]?.description;
    return {
      namespace: ns.namespace,
      recordCount: ns.recordCount,
      metadata: ns.metadata,
      schema_source: ns.schema_source,
      ...(source !== undefined ? { source } : {}),
      ...(description !== undefined ? { description } : {}),
    };
  });
}

export async function fetchNamespacesWithDeclaredConfig(
  client: PineconeClient,
  declaredNamespaces?: Record<string, NamespaceDeclaration>,
  source?: string
): Promise<{ data: NamespaceInfo[]; warnings: string[] }> {
  const declaredSchemas = extractDeclaredSchemas(declaredNamespaces);
  const declaredNamespaceNames = declaredNamespaces ? Object.keys(declaredNamespaces) : undefined;
  const raw = await client.listNamespacesWithMetadata(declaredSchemas, declaredNamespaceNames);
  return {
    data: mapNamespaceRowsToInfo(raw.namespaces, { declaredNamespaces, source }),
    warnings: raw.warnings,
  };
}
