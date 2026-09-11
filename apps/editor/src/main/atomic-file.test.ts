import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { atomicWriteFile } from './atomic-file';

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
describe('atomic project replacement', () => {
  it('preserves the previous project and removes staging files when commit fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'armature-save-'));
    directories.push(dir);
    const path = join(dir, 'project.json');
    await writeFile(path, 'previous valid project');
    await expect(
      atomicWriteFile(path, 'new project', async () => {
        throw new Error('simulated commit failure');
      }),
    ).rejects.toThrow('simulated');
    expect(await readFile(path, 'utf8')).toBe('previous valid project');
    expect(await readdir(dir)).toEqual(['project.json']);
  });
  it('replaces the complete file on success', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'armature-save-'));
    directories.push(dir);
    const path = join(dir, 'project.json');
    await atomicWriteFile(path, 'old');
    await atomicWriteFile(path, 'complete new project');
    expect(await readFile(path, 'utf8')).toBe('complete new project');
    expect(await readdir(dir)).toEqual(['project.json']);
  });
});
