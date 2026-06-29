import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../server-context.js';
import {
  classifyToolCatchError,
  lifecycleToolError,
  logToolError,
} from '../tool-error.js';
import {
  listSourcesResponseSchema,
  type ListSourcesResponse,
} from '../response-schemas.js';
import { jsonErrorResponse, validatedJsonResponse } from '../tool-response.js';

/** Register list_sources when multiple Pinecone projects are configured. */
export function registerListSourcesTool(server: McpServer, ctx?: ServerContext): void {
  server.registerTool(
    'list_sources',
    {
      description:
        'List configured Pinecone source names when multiple API keys/projects are active. ' +
        'Returns source ids and the default source.',
      inputSchema: {},
    },
    async () => {
      try {
        if (ctx?.disposed) {
          return jsonErrorResponse(lifecycleToolError('ServerContext has been disposed'));
        }
        if (!ctx?.isMultiSource()) {
          return jsonErrorResponse(
            lifecycleToolError('list_sources is only available in multi-source mode.')
          );
        }
        const response: ListSourcesResponse = {
          status: 'success',
          sources: ctx.listSources(),
          default: ctx.getDefaultSourceName(),
        };
        return validatedJsonResponse(listSourcesResponseSchema, response);
      } catch (error) {
        logToolError('list_sources', error);
        return jsonErrorResponse(classifyToolCatchError(error, 'Failed to list sources'));
      }
    }
  );
}
