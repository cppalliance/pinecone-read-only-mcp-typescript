#!/usr/bin/env node

/**
 * Pinecone Read-Only MCP CLI entry point.
 *
 * Thin composition root: parseCli() -> resolveAllianceConfig() -> setupAllianceServer(config)
 * -> connect to stdio transport.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as dotenv from 'dotenv';
import { parseCli, printHelp, printVersion } from './cli.js';
import { resolveAllianceConfig } from './alliance/config.js';
import type { ServerConfig } from './core/config.js';
import { PineconeClient } from './core/pinecone-client.js';
import { setPineconeClient } from './core/server/client-context.js';
import { setupAllianceServer } from './alliance/setup.js';
import { setLogFormat, setLogLevel, warn as logWarn } from './logger.js';

dotenv.config();

/**
 * Build a config from CLI argv + environment, exiting fast on
 * --help, --version, or missing API key / index name.
 */
function buildConfigOrExit(): ServerConfig {
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

    const client = new PineconeClient({
      apiKey: config.apiKey,
      indexName: config.indexName,
      sparseIndexName: config.sparseIndexName,
      rerankModel: config.rerankModel,
      defaultTopK: config.defaultTopK,
      requestTimeoutMs: config.requestTimeoutMs,
    });
    setPineconeClient(client);

    if (config.checkIndexes) {
      const result = await client.checkIndexes();
      if (!result.ok) {
        for (const err of result.errors) {
          process.stderr.write(`--check-indexes: ${err}\n`);
        }
        process.exit(1);
      }
      process.stderr.write(
        `--check-indexes: dense index "${config.indexName}" and sparse index "${config.sparseIndexName}" reachable.\n`
      );
    }

    process.stderr.write(`Starting Pinecone Read-Only MCP server with stdio transport\n`);
    process.stderr.write(
      `Using Pinecone index: ${config.indexName} (sparse: ${config.sparseIndexName})\n`
    );
    if (config.rerankModel) {
      process.stderr.write(`Rerank model: ${config.rerankModel}\n`);
    }
    process.stderr.write(`Log level: ${config.logLevel} (format: ${config.logFormat})\n`);

    const server = await setupAllianceServer(config);
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
