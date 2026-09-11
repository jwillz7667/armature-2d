import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_LIMITS = { maxBytes: 2 * 1024 * 1024 * 1024, maxProjects: 20 };
const PROJECT_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.armature\.json(?:\.bak)?$/i;

// This directory is app-owned. Budget both retained copies and the temporary overlap required
// by atomic replacement. Never evict unsaved work automatically to make room for another project.
export async function checkRecoveryStorage(
  directory: string,
  fileName: string,
  incomingBytes: number,
  limits = DEFAULT_LIMITS,
): Promise<void> {
  const sizes = new Map<string, number>();
  const projects = new Set<string>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const info = await lstat(join(directory, entry.name));
    if (!info.isFile()) continue;
    sizes.set(entry.name, info.size);
    if (PROJECT_NAME.test(entry.name)) projects.add(entry.name.replace(/\.bak$/, ''));
  }
  projects.add(fileName);
  let total = 0;
  for (const size of sizes.values()) total += size;
  const previous = sizes.get(fileName) ?? 0;
  const backup = sizes.get(`${fileName}.bak`) ?? 0;
  // First stage the previous primary as the new backup, then stage the new primary.
  const peak = sizes.has(fileName)
    ? Math.max(total + previous, total - backup + previous + incomingBytes)
    : total + incomingBytes;
  if (projects.size > limits.maxProjects || peak > limits.maxBytes) {
    throw new Error(
      'Recovery storage is full (20 projects or 2 GiB, including backups and staging). Existing copies were preserved. Save your project, then remove recovery copies you no longer need from the recovery folder.',
    );
  }
}
