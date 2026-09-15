import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { TOOLS } from './tools';

// A generated capability contract, using the same schema converter as the MCP SDK transport.
export function toolCatalog() {
  return [...TOOLS]
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      annotations: tool.annotations,
      inputSchema: toJsonSchemaCompat(tool.inputSchema),
      outputSchema: toJsonSchemaCompat(tool.outputSchema, {
        strictUnions: true,
        pipeStrategy: 'output',
      }),
    }));
}

export function toolReference(): string {
  const tools = toolCatalog();
  const lines = [
    '# MCP tool reference',
    '',
    'Generated from the live registry. Run `pnpm --filter @marionette/mcp-server reference` to update.',
    '',
    `${tools.length} tools. All inputs are validated before execution. Document mutations use command history.`,
    'The machine-readable companion is `mcp-tools.json`. The artist UI exposes its own documented subset.',
    '',
  ];
  for (const tool of tools) {
    const properties = tool.inputSchema.properties ?? {};
    lines.push(
      `## ${tool.name}`,
      '',
      tool.description,
      '',
      `Inputs: ${Object.keys(properties)
        .map((name) => '`' + name + '`')
        .join(', ')}.`,
      '',
      `Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry ${tools.indexOf(tool)}.`,
      '',
    );
  }
  return lines.join('\n');
}
