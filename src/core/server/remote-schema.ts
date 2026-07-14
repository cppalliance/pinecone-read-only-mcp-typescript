/**
 * Load per-source description and namespace declarations from the reserved
 * `_mcp_config` Pinecone namespace (schema manifest record).
 */

import type { PineconeClient } from '../pinecone-client.js';
import { trimOptional } from '../config.js';
import type { SourceDefinition } from './source-config.js';
import { validateNamespaces } from './source-config.js';

export const SCHEMA_MANIFEST_NAMESPACE = '_mcp_config';
export const SCHEMA_MANIFEST_RECORD_ID = 'schema_manifest';

type SchemaManifest = {
  description?: string;
  namespaces?: Record<string, unknown>;
};

type ManifestParseResult = { ok: true; manifest: SchemaManifest } | { ok: false; reason: string };

function parseManifestChunkText(chunkText: string): ManifestParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(chunkText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `invalid JSON: ${message}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'manifest must be a JSON object' };
  }
  const obj = parsed as Record<string, unknown>;
  const description =
    typeof obj['description'] === 'string' ? trimOptional(obj['description']) : undefined;
  const namespacesRaw = obj['namespaces'];
  if (
    namespacesRaw != null &&
    (typeof namespacesRaw !== 'object' || Array.isArray(namespacesRaw))
  ) {
    return { ok: false, reason: 'manifest "namespaces" must be an object' };
  }
  return {
    ok: true,
    manifest: {
      ...(description !== undefined ? { description } : {}),
      ...(namespacesRaw != null ? { namespaces: namespacesRaw as Record<string, unknown> } : {}),
    },
  };
}

/** Fetch and merge `_mcp_config` manifest into a source when local `namespaces` are unset; failures are non-fatal warnings. */
export async function loadRemoteSchemaForSource(
  client: PineconeClient,
  definition: SourceDefinition
): Promise<{ definition: SourceDefinition; warning?: string }> {
  if (definition.namespaces && Object.keys(definition.namespaces).length > 0) {
    return { definition };
  }

  let fields: Record<string, unknown> | null;
  try {
    fields = await client.fetchRecordFields(SCHEMA_MANIFEST_NAMESPACE, SCHEMA_MANIFEST_RECORD_ID);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      definition,
      warning: `Source "${definition.name}": failed to fetch _mcp_config schema manifest: ${message}`,
    };
  }

  if (!fields) {
    return { definition };
  }

  const chunkText = fields['chunk_text'];
  if (typeof chunkText !== 'string' || !chunkText.trim()) {
    return { definition };
  }

  const parseResult = parseManifestChunkText(chunkText);
  if (!parseResult.ok) {
    return {
      definition,
      warning: `Source "${definition.name}": _mcp_config schema manifest in chunk_text is malformed (${parseResult.reason}).`,
    };
  }
  const manifest = parseResult.manifest;

  let namespaces: SourceDefinition['namespaces'];
  if (manifest.namespaces != null) {
    try {
      namespaces = validateNamespaces(definition.name, manifest.namespaces);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        definition,
        warning: `Source "${definition.name}": _mcp_config schema manifest namespaces invalid: ${message}`,
      };
    }
  }

  const description =
    definition.description !== undefined ? definition.description : manifest.description;

  const enriched: SourceDefinition = {
    ...definition,
    ...(description !== undefined ? { description } : {}),
    ...(namespaces !== undefined ? { namespaces } : {}),
  };

  return { definition: enriched };
}

/** Load remote schema manifests for multiple sources in parallel, collecting per-source warnings. */
export async function loadRemoteSchemaForSources(
  entries: { definition: SourceDefinition; client: PineconeClient }[]
): Promise<{ definitions: SourceDefinition[]; warnings: string[] }> {
  const results = await Promise.all(
    entries.map(async ({ definition, client }) => loadRemoteSchemaForSource(client, definition))
  );
  const warnings: string[] = [];
  const definitions: SourceDefinition[] = [];
  for (const result of results) {
    definitions.push(result.definition);
    if (result.warning) {
      warnings.push(result.warning);
    }
  }
  return { definitions, warnings };
}
