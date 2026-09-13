import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// Never infer an agent's filesystem grant from its working directory.
try {
  const requested = process.argv[2] ?? process.env.ARMATURE_PROJECT_ROOT;
  if (!requested || !isAbsolute(requested)) {
    throw new Error('Pass an absolute project directory or set ARMATURE_PROJECT_ROOT.');
  }
  const project = await realpath(requested);
  if (!(await stat(project)).isDirectory()) throw new Error('Project root must be a directory.');
  process.argv = [
    process.execPath,
    fileURLToPath(new URL('../server/cli.mjs', import.meta.url)),
    project,
  ];
  await import('../server/cli.mjs');
} catch (error) {
  console.error(`Armature MCP: ${error.message}`);
  process.exitCode = 1;
}
