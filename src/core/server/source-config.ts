/**
 * Multi-source Pinecone configuration parsing (inline PINECONE_SOURCES and JSON config file).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { trimOptional } from '../config.js';

/** Per-namespace declaration loaded from private JSON config (config-file only). */
export interface NamespaceDeclaration {
  description?: string;
  metadata_schema?: Record<string, string>;
}

/** Named Pinecone project connection (one API key + index pair). */
export interface SourceDefinition {
  name: string;
  apiKey: string;
  indexName: string;
  sparseIndexName?: string;
  rerankModel?: string;
  /** Optional corpus-level description (config-file only; never from inline PINECONE_SOURCES). */
  description?: string;
  /** Optional per-namespace declarations (config-file only). */
  namespaces?: Record<string, NamespaceDeclaration>;
}

export type ParseSourcesOptions = {
  /** Apply Alliance defaults for indexName / rerankModel when omitted per entry. */
  allianceDefaults?: {
    indexName?: string;
    rerankModel?: string;
  };
};

const SOURCE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Resolve `${ENV_VAR}` references in a string value. */
export function resolveEnvIndirection(value: string, env: NodeJS.ProcessEnv): string {
  const trimmed = value.trim();
  const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(trimmed);
  if (!match) {
    return trimmed;
  }
  const envKey = match[1]!;
  const resolved = env[envKey]?.trim();
  if (!resolved) {
    throw new Error(`Environment variable ${envKey} is not set (referenced as ${trimmed}).`);
  }
  return resolved;
}

function validateSourceName(name: string): void {
  if (!name || !SOURCE_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid source name "${name}": use alphanumeric characters, hyphens, or underscores only.`
    );
  }
}

function validateNamespaces(
  sourceName: string,
  raw: unknown
): Record<string, NamespaceDeclaration> | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Source "${sourceName}": namespaces must be an object.`);
  }
  const result: Record<string, NamespaceDeclaration> = {};
  for (const [nsName, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Source "${sourceName}": namespaces["${nsName}"] must be an object.`);
    }
    const obj = entry as Record<string, unknown>;
    const declaration: NamespaceDeclaration = {};
    if (obj['description'] != null) {
      if (typeof obj['description'] !== 'string') {
        throw new Error(
          `Source "${sourceName}": namespaces["${nsName}"].description must be a string.`
        );
      }
      const trimmed = obj['description'].trim();
      if (trimmed) {
        declaration.description = trimmed;
      }
    }
    if (obj['metadata_schema'] != null) {
      if (typeof obj['metadata_schema'] !== 'object' || Array.isArray(obj['metadata_schema'])) {
        throw new Error(
          `Source "${sourceName}": namespaces["${nsName}"].metadata_schema must be a flat object.`
        );
      }
      const schema: Record<string, string> = {};
      for (const [field, type] of Object.entries(
        obj['metadata_schema'] as Record<string, unknown>
      )) {
        if (typeof type !== 'string' || !type.trim()) {
          throw new Error(
            `Source "${sourceName}": namespaces["${nsName}"].metadata_schema["${field}"] must be a non-empty string type.`
          );
        }
        schema[field] = type.trim();
      }
      if (Object.keys(schema).length > 0) {
        declaration.metadata_schema = schema;
      }
    }
    result[nsName] = declaration;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeSourceEntry(
  name: string,
  raw: {
    apiKey: string;
    indexName: string;
    sparseIndexName?: string;
    rerankModel?: string;
    description?: string;
    namespaces?: Record<string, NamespaceDeclaration>;
  },
  env: NodeJS.ProcessEnv,
  allianceDefaults?: ParseSourcesOptions['allianceDefaults']
): SourceDefinition {
  validateSourceName(name);
  const apiKey = resolveEnvIndirection(raw.apiKey, env);
  if (!apiKey) {
    throw new Error(`Source "${name}": apiKey is required.`);
  }
  const indexName =
    trimOptional(resolveEnvIndirection(raw.indexName, env)) ??
    trimOptional(allianceDefaults?.indexName);
  if (!indexName) {
    throw new Error(`Source "${name}": indexName is required.`);
  }
  const sparseRaw = raw.sparseIndexName
    ? resolveEnvIndirection(raw.sparseIndexName, env)
    : undefined;
  const sparseIndexName = trimOptional(sparseRaw) ?? `${indexName}-sparse`;
  const rerankRaw = raw.rerankModel ? resolveEnvIndirection(raw.rerankModel, env) : undefined;
  const rerankModel = trimOptional(rerankRaw) ?? trimOptional(allianceDefaults?.rerankModel);
  return {
    name,
    apiKey,
    indexName,
    sparseIndexName,
    ...(rerankModel !== undefined ? { rerankModel } : {}),
    ...(raw.description !== undefined ? { description: raw.description } : {}),
    ...(raw.namespaces !== undefined ? { namespaces: raw.namespaces } : {}),
  };
}

/** Extract declared metadata schemas per namespace for Pinecone discovery. */
export function extractDeclaredSchemas(
  namespaces?: Record<string, NamespaceDeclaration>
): Record<string, Record<string, string>> | undefined {
  if (!namespaces) {
    return undefined;
  }
  const result: Record<string, Record<string, string>> = {};
  for (const [nsName, decl] of Object.entries(namespaces)) {
    if (decl.metadata_schema && Object.keys(decl.metadata_schema).length > 0) {
      result[nsName] = { ...decl.metadata_schema };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Parse inline `name:apiKey:indexName[;name2:...]` format. */
export function parseInlineSources(
  inline: string,
  env: NodeJS.ProcessEnv = process.env,
  options?: ParseSourcesOptions
): SourceDefinition[] {
  const segments = inline
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    throw new Error('PINECONE_SOURCES is empty.');
  }
  const sources: SourceDefinition[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    const parts = segment.split(':');
    if (parts.length < 3) {
      throw new Error(
        `Invalid PINECONE_SOURCES segment "${segment}": expected name:apiKey:indexName (optional fields after index not supported in inline format).`
      );
    }
    const name = parts[0]?.trim() ?? '';
    const apiKey = parts.slice(1, -1).join(':').trim();
    const indexName = parts[parts.length - 1]?.trim() ?? '';
    if (!name || !apiKey || !indexName) {
      throw new Error(
        `Invalid PINECONE_SOURCES segment "${segment}": name, apiKey, and indexName are required.`
      );
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate source name "${name}" in PINECONE_SOURCES.`);
    }
    seen.add(name);
    sources.push(normalizeSourceEntry(name, { apiKey, indexName }, env, options?.allianceDefaults));
  }
  return sources;
}

type JsonSourceFile = {
  defaultSource?: string;
  sources: Record<
    string,
    {
      apiKey: string;
      indexName: string;
      sparseIndexName?: string;
      rerankModel?: string;
      description?: string;
      namespaces?: Record<string, NamespaceDeclaration>;
    }
  >;
};

/** Parse JSON config file for multi-source setup. */
export function parseSourcesConfigFile(
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
  options?: ParseSourcesOptions
): { sources: SourceDefinition[]; defaultSource: string } {
  const absolute = resolve(filePath);
  let parsed: JsonSourceFile;
  try {
    const raw = readFileSync(absolute, 'utf8');
    parsed = JSON.parse(raw) as JsonSourceFile;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read PINECONE config file "${filePath}": ${message}`);
  }
  if (!parsed.sources || typeof parsed.sources !== 'object') {
    throw new Error(`PINECONE config file "${filePath}" must contain a "sources" object.`);
  }
  const entries = Object.entries(parsed.sources);
  if (entries.length === 0) {
    throw new Error(`PINECONE config file "${filePath}" has no sources.`);
  }
  const sources: SourceDefinition[] = [];
  const seen = new Set<string>();
  for (const [name, cfg] of entries) {
    if (seen.has(name)) {
      throw new Error(`Duplicate source name "${name}" in config file.`);
    }
    seen.add(name);
    if (!cfg || typeof cfg !== 'object') {
      throw new Error(`Source "${name}" in config file must be an object.`);
    }
    let description: string | undefined;
    if (cfg.description != null) {
      if (typeof cfg.description !== 'string') {
        throw new Error(`Source "${name}": description must be a string.`);
      }
      description = trimOptional(cfg.description);
    }
    const namespaces = validateNamespaces(name, cfg.namespaces);
    sources.push(
      normalizeSourceEntry(
        name,
        {
          apiKey: String(cfg.apiKey ?? ''),
          indexName: String(cfg.indexName ?? ''),
          ...(cfg.sparseIndexName != null ? { sparseIndexName: String(cfg.sparseIndexName) } : {}),
          ...(cfg.rerankModel != null ? { rerankModel: String(cfg.rerankModel) } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(namespaces !== undefined ? { namespaces } : {}),
        },
        env,
        options?.allianceDefaults
      )
    );
  }
  const defaultSource = trimOptional(parsed.defaultSource) ?? sources[0]?.name;
  if (!defaultSource || !seen.has(defaultSource)) {
    throw new Error(
      `defaultSource "${parsed.defaultSource ?? ''}" is not a configured source name.`
    );
  }
  return { sources, defaultSource };
}

/** Resolve sources from overrides/env/file; config file wins over inline when both are set. */
export function resolveSourceDefinitions(
  overrides: { sources?: string; configFile?: string },
  env: NodeJS.ProcessEnv = process.env,
  options?: ParseSourcesOptions
): { sources: SourceDefinition[]; defaultSource: string } | null {
  const inline = trimOptional(overrides.sources) ?? trimOptional(env['PINECONE_SOURCES']);
  const configFile =
    trimOptional(overrides.configFile) ?? trimOptional(env['PINECONE_CONFIG_FILE']);

  if (configFile) {
    return parseSourcesConfigFile(configFile, env, options);
  }
  if (inline) {
    const sources = parseInlineSources(inline, env, options);
    return { sources, defaultSource: sources[0]!.name };
  }
  return null;
}
