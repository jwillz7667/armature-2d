import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function assertInstallerSet(names) {
  for (const [extension, required] of [
    ['.dmg', 2],
    ['.zip', 2],
    ['.exe', 1],
    ['.AppImage', 1],
    ['.deb', 1],
    ['.rpm', 1],
  ]) {
    if (names.filter((name) => name.endsWith(extension)).length !== required)
      throw new Error(`Release needs exactly ${required} ${extension} installer(s)`);
  }
  for (const extension of ['.dmg', '.zip']) {
    const mac = names.filter((name) => name.endsWith(extension));
    if (mac.filter((name) => /arm64/i.test(name)).length !== 1)
      throw new Error(`Release needs both macOS architectures for ${extension}`);
  }
}

async function main(directory) {
  const names = (await readdir(directory)).filter((name) => name !== 'SHA256SUMS').sort();
  assertInstallerSet(names);
  const sums = [];
  for (const name of names) {
    if (/[\r\n\\]/.test(name)) throw new Error('Unsafe checksum filename');
    const path = join(directory, name);
    const info = await stat(path);
    if (!info.isFile() || info.size === 0)
      throw new Error(`Empty or invalid release asset: ${name}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    sums.push(`${hash.digest('hex')}  ${name}`);
  }
  await writeFile(join(directory, 'SHA256SUMS'), `${sums.join('\n')}\n`);
  console.log(`Verified ${names.length} release assets and wrote SHA256SUMS`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
