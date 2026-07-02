/**
 * Multi-source Pinecone configuration parsing (inline PINECONE_SOURCES and JSON config file).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { trimOptional } from '../config.js';

/** Named Pinecone project connection (one API key + index pair). */
export interface SourceDefinition {
  name: string;
  apiKey: string;
  indexName: string;
  sparseIndexName?: string;
  rerankModel?: string;
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

function normalizeSourceEntry(
  name: string,
  raw: {
    apiKey: string;
    indexName: string;
    sparseIndexName?: string;
    rerankModel?: string;
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
  };
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
    sources.push(
      normalizeSourceEntry(
        name,
        {
          apiKey: String(cfg.apiKey ?? ''),
          indexName: String(cfg.indexName ?? ''),
          ...(cfg.sparseIndexName != null ? { sparseIndexName: String(cfg.sparseIndexName) } : {}),
          ...(cfg.rerankModel != null ? { rerankModel: String(cfg.rerankModel) } : {}),
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
