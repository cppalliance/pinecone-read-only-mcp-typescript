#!/usr/bin/env node

/**
 * Pinecone Read-Only MCP CLI entry point.
 *
 * Thin composition root: parseCli() -> resolveAllianceConfig() -> createServer(config, composition)
 * -> setupAllianceServer({ context: ctx }) -> connect to stdio transport.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as dotenv from 'dotenv';
import { parseCli, printHelp, printVersion } from './cli.js';
import type { AllianceServerConfig } from './alliance/config.js';
import { resolveAllianceConfig } from './alliance/config.js';
import { PineconeClient } from './core/pinecone-client.js';
import { createServer } from './core/server/server-context.js';
import { buildSourceRegistry } from './core/server/source-registry.js';
import { setupAllianceServer } from './alliance/setup.js';
import { setLogFormat, setLogLevel, warn as logWarn } from './logger.js';

dotenv.config();

/**
 * Build a config from CLI argv + environment, exiting fast on
 * --help, --version, or missing API key / index name.
 */
function buildConfigOrExit(): AllianceServerConfig {
  const parsed = parseCli();
  if (parsed.kind === 'help') {
    printHelp();
    process.exit(0);
  }
  if (parsed.kind === 'version') {
    printVersion();
    process.exit(0);
  }

  try {
    return resolveAllianceConfig(parsed.overrides);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  try {
    const config = buildConfigOrExit();

    setLogLevel(config.logLevel);
    setLogFormat(config.logFormat);

    if (config.disableSuggestFlow) {
      logWarn(
        '--disable-suggest-flow is active: the suggest_query_params safety guard is bypassed for this session.'
      );
    }

    let ctx;
    if (config.sources && config.sources.length > 0) {
      const sourceRegistry = buildSourceRegistry({
        sources: config.sources,
        defaultSource: config.defaultSource ?? config.sources[0]!.name,
        cacheTtlMs: config.cacheTtlMs,
        defaultTopK: config.defaultTopK,
        requestTimeoutMs: config.requestTimeoutMs,
      });
      ctx = createServer(config, { sourceRegistry });
    } else {
      const client = new PineconeClient({
        apiKey: config.apiKey,
        indexName: config.indexName,
        sparseIndexName: config.sparseIndexName,
        rerankModel: config.rerankModel,
        defaultTopK: config.defaultTopK,
        requestTimeoutMs: config.requestTimeoutMs,
      });
      ctx = createServer(config, { client });
    }

    if (config.checkIndexes) {
      const result = await ctx.checkAllIndexes();
      if (!result.ok) {
        for (const err of result.errors) {
          process.stderr.write(`--check-indexes: ${err}\n`);
        }
        process.exit(1);
      }
      if (config.sources && config.sources.length > 0) {
        process.stderr.write(
          `--check-indexes: all ${config.sources.length} source(s) reachable.\n`
        );
      } else {
        process.stderr.write(
          `--check-indexes: dense index "${config.indexName}" and sparse index "${config.sparseIndexName}" reachable.\n`
        );
      }
    }

    process.stderr.write(`Starting Pinecone Read-Only MCP server with stdio transport\n`);
    if (config.sources && config.sources.length > 0) {
      const names = config.sources.map((s) => s.name).join(', ');
      process.stderr.write(
        `Multi-source mode: [${names}] (default: ${config.defaultSource ?? config.sources[0]!.name})\n`
      );
    } else {
      process.stderr.write(
        `Using Pinecone index: ${config.indexName} (sparse: ${config.sparseIndexName})\n`
      );
    }
    if (config.rerankModel) {
      process.stderr.write(`Rerank model: ${config.rerankModel}\n`);
    }
    process.stderr.write(`Log level: ${config.logLevel} (format: ${config.logFormat})\n`);

    const server = await setupAllianceServer({ context: ctx });
    const transport = new StdioServerTransport();
    await server.connect(transport);

    process.stderr.write('Pinecone Read-Only MCP Server running on stdio\n');

    process.on('SIGINT', () => {
      process.stderr.write('Server stopped by user\n');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      process.stderr.write('Server stopped by signal\n');
      process.exit(0);
    });
  } catch (error) {
    process.stderr.write(`Fatal error in main(): ${(error as Error)?.stack ?? String(error)}\n`);
    process.exit(1);
  }
}

main();
