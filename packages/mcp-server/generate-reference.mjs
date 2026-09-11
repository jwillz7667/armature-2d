import { build } from 'esbuild';
import { format } from 'prettier';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'armature-catalog-'));
try {
  const script = join(directory, 'catalog.cjs');
  await build({
    stdin: {
      contents:
        "import { toolCatalog, toolReference } from './src/catalog'; process.stdout.write(JSON.stringify({ catalog: toolCatalog(), reference: toolReference() }));",
      resolveDir: process.cwd(),
    },
    outfile: script,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
  });
  const result = JSON.parse(
    execFileSync(process.execPath, [script], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }),
  );
  const files = [
    [
      '../../docs/manual/09-tool-reference.md',
      await format(result.reference, {
        parser: 'markdown',
        printWidth: 100,
        proseWrap: 'preserve',
      }),
    ],
    [
      '../../docs/manual/mcp-tools.json',
      await format(JSON.stringify(result.catalog), { parser: 'json', printWidth: 100 }),
    ],
  ];
  for (const [path, content] of files) {
    if (process.argv.includes('--check')) {
      if ((await readFile(path, 'utf8')) !== content)
        throw new Error(`Generated MCP reference is stale: ${path}`);
    } else await writeFile(path, content);
  }
  console.log(`MCP catalog: ${result.catalog.length} tools verified`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
