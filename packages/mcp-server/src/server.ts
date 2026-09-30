import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpToolError } from './errors';
import { TOOLS, type ToolDeps } from './tools';
import { PREVIEW_URI, PREVIEW_TOOL_META, previewHtml } from './preview-widget';

export interface ServerInfo {
  readonly name: string;
  readonly version: string;
}

const DEFAULT_INFO: ServerInfo = { name: 'marionette', version: '0.1.0' };

// Build an MCP server exposing the Marionette tool catalog. Every tool input is validated against its
// Zod schema (the SDK validates from the raw shape, and the handler re-validates for direct callers),
// and every mutating tool drives the SAME document-core commands the GUI uses (LAW 2). A tool failure
// is returned as a typed, structured isError result, never an uncaught throw across the transport.
export function buildMcpServer(
  deps: ToolDeps,
  info: ServerInfo = DEFAULT_INFO,
  options: { readonly redactErrors?: boolean; readonly widgetDomain?: string } = {},
): McpServer {
  const server = new McpServer(info);
  server.registerResource('armature-preview', PREVIEW_URI, {}, async () => ({
    contents: [
      {
        uri: PREVIEW_URI,
        mimeType: 'text/html;profile=mcp-app',
        text: previewHtml,
        _meta: {
          ui: {
            prefersBorder: true,
            csp: { connectDomains: [], resourceDomains: [] },
            ...(options.widgetDomain ? { domain: options.widgetDomain } : {}),
          },
          'openai/widgetDescription':
            'Displays the exact rendered PNG and whether placeholder textures were used.',
          'openai/widgetPrefersBorder': true,
          'openai/widgetCSP': { connect_domains: [], resource_domains: [] },
          ...(options.widgetDomain ? { 'openai/widgetDomain': options.widgetDomain } : {}),
        },
      },
    ],
  }));
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema.shape,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
        ...(tool.name === 'render_frame' ? { _meta: PREVIEW_TOOL_META } : {}),
      },
      async (args: unknown) => {
        try {
          const result = await tool.handler(deps, args);
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(result) },
              // Send the exact encoded pixels to image-capable clients. Reconstructing
              // base64 from model-generated text can corrupt an otherwise valid PNG.
              ...(tool.name === 'render_frame' &&
              typeof (result as Record<string, unknown>).pngBase64 === 'string'
                ? [
                    {
                      type: 'image' as const,
                      mimeType: 'image/png',
                      data: (result as { pngBase64: string }).pngBase64,
                    },
                  ]
                : []),
            ],
            structuredContent: result as Record<string, unknown>,
          };
        } catch (error) {
          const body =
            error instanceof McpToolError
              ? {
                  code: error.code,
                  message: options.redactErrors ? 'Tool operation failed' : error.message,
                  ...(options.redactErrors ? {} : { detail: error.detail }),
                }
              : {
                  code: 'INTERNAL',
                  message: options.redactErrors
                    ? 'Internal tool error'
                    : error instanceof Error
                      ? error.message
                      : 'unknown error',
                };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(body) }],
            isError: true,
          };
        }
      },
    );
  }
  return server;
}
