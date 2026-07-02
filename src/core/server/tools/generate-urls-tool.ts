import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { normalizeNamespace } from '../namespace-utils.js';
import type { ServerContext } from '../server-context.js';
import { generateUrlForNamespace } from '../url-registry.js';
import {
  rejectSourceWithoutContext,
  resolveSourceForTool,
  sourceParamSchema,
  sourceValidationError,
} from '../source-tool-utils.js';
import {
  classifyToolCatchError,
  lifecycleToolError,
  logToolError,
  validationToolError,
} from '../tool-error.js';
import { generateUrlsResponseSchema, type GenerateUrlsResponse } from '../response-schemas.js';
import { jsonErrorResponse, validatedJsonResponse } from '../tool-response.js';

/** Get metadata from a record (either record.metadata or the record itself). */
function extractMetadata(record: Record<string, unknown>): Record<string, unknown> {
  const nested = record['metadata'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return record;
}

/** Register the generate_urls tool on the MCP server. */
export function registerGenerateUrlsTool(server: McpServer, ctx?: ServerContext): void {
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
        source: sourceParamSchema,
      },
    },
    async (params) => {
      try {
        if (ctx?.disposed) {
          return jsonErrorResponse(lifecycleToolError('ServerContext has been disposed'));
        }
        const { namespace, records, source } = params;
        const nsNorm = normalizeNamespace(namespace);
        if (!nsNorm) {
          return jsonErrorResponse(
            validationToolError('namespace cannot be empty', 'namespace', {
              suggestion: 'Use a namespace name from list_namespaces (trimmed).',
            })
          );
        }
        const sourceError = rejectSourceWithoutContext(source, ctx);
        if (sourceError) {
          return jsonErrorResponse(sourceError);
        }
        let activeCtx = ctx;
        let activeSource: string | undefined;
        if (ctx) {
          const resolved = await resolveSourceForTool(ctx, source, nsNorm);
          if (!resolved.ok) {
            return jsonErrorResponse(sourceValidationError(resolved.code, resolved.message));
          }
          activeCtx = resolved.ctx;
          activeSource = resolved.source;
        }

        const results = records.map((record, index) => {
          const metadata = extractMetadata(record);
          const generated = activeCtx
            ? activeCtx.generateUrlForNamespace(nsNorm, metadata, activeSource)
            : generateUrlForNamespace(nsNorm, metadata);
          return {
            index,
            url: generated.url,
            method: generated.method,
            reason: generated.reason ?? null,
            metadata,
          };
        });

        const response: GenerateUrlsResponse = {
          status: 'success',
          namespace: nsNorm,
          count: results.length,
          results,
        };
        return validatedJsonResponse(generateUrlsResponseSchema, response);
      } catch (error) {
        logToolError('generate_urls', error);
        return jsonErrorResponse(classifyToolCatchError(error, 'Failed to generate URLs'));
      }
    }
  );
}
