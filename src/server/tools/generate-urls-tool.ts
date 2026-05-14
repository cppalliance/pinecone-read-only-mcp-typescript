import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { generateUrlForNamespace } from '../url-generation.js';
import { classifyToolCatchError, logToolError } from '../tool-error.js';
import { jsonErrorResponse, jsonResponse } from '../tool-response.js';

/** Get metadata from a record (either record.metadata or the record itself). */
function extractMetadata(record: Record<string, unknown>): Record<string, unknown> {
  const nested = record['metadata'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return record;
}

/** Register the generate_urls tool on the MCP server. */
export function registerGenerateUrlsTool(server: McpServer): void {
  server.registerTool(
    'generate_urls',
    {
      description:
        'Generate URLs for retrieved results when metadata does not include url and URL is needed. ' +
        'Uses the URL generator registered for the given namespace (if any); returns unavailable for namespaces without a generator.',
      inputSchema: {
        namespace: z
          .string()
          .describe(
            'Target namespace. URL generation is supported only for namespaces that have a registered generator (call list_namespaces to discover namespaces).'
          ),
        records: z
          .array(z.record(z.string(), z.unknown()))
          .max(500)
          .describe(
            'Array of records from retrieval results. Each item may be either metadata itself or an object containing a metadata field.'
          ),
      },
    },
    async (params) => {
      try {
        const { namespace, records } = params;
        const results = records.map((record, index) => {
          const metadata = extractMetadata(record);
          const generated = generateUrlForNamespace(namespace, metadata);
          return {
            index,
            url: generated.url,
            method: generated.method,
            reason: generated.reason ?? null,
            metadata,
          };
        });

        return jsonResponse({
          status: 'success',
          namespace,
          count: results.length,
          results,
        });
      } catch (error) {
        logToolError('generate_urls', error);
        return jsonErrorResponse(classifyToolCatchError(error, 'Failed to generate URLs'));
      }
    }
  );
}
