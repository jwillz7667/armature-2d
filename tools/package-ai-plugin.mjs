import { cp, mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))
  throw new Error('Invalid package version');
await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(output, 'ai-stage-'));
try {
  const plugin = join(staging, 'armature');
  // Explicit source inventory prevents accidentally distributing local configuration or assets.
  for (const path of [
    '.codex-plugin/plugin.json',
    '.claude-plugin/plugin.json',
    'README.md',
    'scripts/launch.mjs',
    'scripts/configure.mjs',
  ]) {
    await mkdir(join(plugin, path, '..'), { recursive: true });
    await cp(join(root, 'plugins/armature', path), join(plugin, path));
  }
  await mkdir(join(plugin, 'server'), { recursive: true });
  await cp(join(root, 'packages/mcp-server/dist/cli.js'), join(plugin, 'server/cli.mjs'));
  await cp(join(root, 'LICENSE'), join(plugin, 'LICENSE'));
  await cp(join(root, 'docs/manual/mcp-tools.json'), join(plugin, 'mcp-tools.json'));
  await cp(join(root, 'docs/manual/09-tool-reference.md'), join(plugin, 'tool-reference.md'));
  for (const path of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) {
    const manifest = JSON.parse(await readFile(join(plugin, path), 'utf8'));
    manifest.version = version;
    await writeFile(join(plugin, path), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  // Never distribute developer-specific project grants or generated machine paths.
  await writeFile(join(plugin, '.mcp.json'), '{"mcpServers":{}}\n');
  await rm(join(plugin, 'codex-config.toml'), { force: true });
  const filename = `armature-mcp-${version}.tar.gz`;
  execFileSync('tar', ['-czf', join(output, filename), '-C', staging, 'armature']);
  const sha256 = createHash('sha256')
    .update(await readFile(join(output, filename)))
    .digest('hex');
  await writeFile(join(output, `${filename}.sha256`), `${sha256}  ${filename}\n`);
  console.log(join(output, filename));
} finally {
  await rm(staging, { recursive: true, force: true });
}
