import { chmod, chown, lstat } from 'node:fs/promises';

// Railway mounts persistent volumes as root. Only initialize the fixed mount root;
// never traverse user-controlled contents or load application code with privileges.
if (process.getuid() === 0) {
  if (process.env.ARMATURE_INIT_VOLUME !== '1' || process.env.ARMATURE_DATA_ROOT !== '/data') {
    throw new Error('Root startup requires explicit initialization of the /data volume');
  }
  const mount = await lstat('/data');
  if (!mount.isDirectory() || mount.isSymbolicLink()) {
    throw new Error('The data mount must be a real directory');
  }
  await chown('/data', 1000, 1000);
  await chmod('/data', 0o700);
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
}
if (process.getuid() !== 1000 || process.getgid() !== 1000) {
  throw new Error('The MCP server must run as the node user');
}
process.stderr.write(`Armature MCP runtime UID=${process.getuid()} GID=${process.getgid()}\n`);
await import('./http.mjs');
