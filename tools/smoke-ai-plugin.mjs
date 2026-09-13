import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const archive = join(root, 'dist', `armature-mcp-${version}.tar.gz`);
const expected = (await readFile(`${archive}.sha256`, 'utf8')).split(' ')[0];
assert.equal(
  createHash('sha256')
    .update(await readFile(archive))
    .digest('hex'),
  expected,
);
const temp = await mkdtemp(join(tmpdir(), 'armature portable '));
try {
  execFileSync('tar', ['-xzf', archive, '-C', temp]);
  const plugin = join(temp, 'armature');
  const launcher = join(plugin, 'scripts/launch.mjs');
  const setup = join(plugin, 'scripts/configure.mjs');
  const env = { ...process.env };
  delete env.ARMATURE_PROJECT_ROOT;
  for (const args of [[], ['relative'], [join(temp, 'missing')]]) {
    const result = spawnSync(process.execPath, [launcher, ...args], {
      env,
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Armature MCP:/);
  }
  const project = join(temp, 'project with spaces');
  await mkdir(project);
  execFileSync(process.execPath, [setup, project], { cwd: temp });
  const config = JSON.parse(await readFile(join(plugin, '.mcp.json'), 'utf8'));
  assert.equal(config.mcpServers.armature.command, process.execPath);
  assert.deepEqual(config.mcpServers.armature.args, [
    await realpath(launcher),
    await realpath(project),
  ]);
  assert.match(
    await readFile(join(plugin, 'codex-config.toml'), 'utf8'),
    /\[mcp_servers.armature\]/,
  );
  for (const manifest of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) {
    assert.equal(JSON.parse(await readFile(join(plugin, manifest), 'utf8')).version, version);
  }
  execFileSync(process.execPath, [join(root, 'tools/smoke-mcp-cli.mjs'), launcher], {
    cwd: temp,
    stdio: 'inherit',
    timeout: 60000,
  });
  console.log(
    'Portable archive checksum, manifests, explicit-root failures, configuration and isolated MCP workflow pass.',
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
