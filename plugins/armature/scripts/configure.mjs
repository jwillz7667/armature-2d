import { realpath, stat, writeFile, access } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Emit configuration only inside this extracted bundle. Never modify host permissions/config.
try {
  const requested = process.argv[2];
  if (!requested || !isAbsolute(requested))
    throw new Error('Usage: node scripts/configure.mjs /absolute/project-directory');
  const project = await realpath(requested);
  if (!(await stat(project)).isDirectory()) throw new Error('Project root must be a directory.');
  const root = fileURLToPath(new URL('../', import.meta.url));
  await access(join(root, 'server/cli.mjs'));
  const args = [join(root, 'scripts/launch.mjs'), project];
  const config = { mcpServers: { armature: { command: process.execPath, args } } };
  await writeFile(join(root, '.mcp.json'), `${JSON.stringify(config, null, 2)}\n`);
  // JSON basic strings are compatible with TOML for these paths (including Windows backslashes).
  const toml = `[mcp_servers.armature]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${args.map((value) => JSON.stringify(value)).join(', ')}]\n`;
  await writeFile(join(root, 'codex-config.toml'), toml);
  console.log(
    `Configured Armature for ${project}.\nClaude/MCP: ${join(root, '.mcp.json')}\nCodex: ${join(root, 'codex-config.toml')}\nReconfigure if you move the bundle or change the project folder.`,
  );
} catch (error) {
  console.error(`Armature setup: ${error.message}`);
  process.exitCode = 1;
}
