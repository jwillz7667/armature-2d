import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseDocument } from '../../../packages/format/src/index';
import { Author } from './rig-author.mts';

// The desktop loader accepts plain atlas basenames in a sibling .textures
// directory. Keep the render documents untouched and save portable editor
// copies through the normal atlas command and validated document exporter.
const root = process.env.ARMATURE_PILOT_DIR;
if (!root) throw new Error('Set ARMATURE_PILOT_DIR');
let count = 0;
for (const kind of ['scenes', 'rigs']) {
  const output = join(root, 'editor', kind);
  mkdirSync(output, { recursive: true });
  for (const file of readdirSync(join(root, kind)).filter((f) => f.endsWith('.armature.json'))) {
    const input = join(kind, file);
    const doc = parseDocument(JSON.parse(readFileSync(join(root, input), 'utf8')), {
      verifyHash: true,
    });
    const textureDir = join(output, file.slice(0, -5) + '.textures');
    mkdirSync(textureDir, { recursive: true });
    const pages = doc.atlas.pages.map((page, index) => {
      const name = `${index}-${basename(dirname(page.file))}-${basename(page.file)}`;
      copyFileSync(join(root, page.file), join(textureDir, name));
      return { ...page, file: name };
    });
    const a = new Author(root);
    a.id = (await a.call<{ documentId: string }>('document.open', { path: input })).documentId;
    await a.call('atlas.set', { documentId: a.id, atlas: { pages } });
    await a.save(join('editor', kind, file));
    await a.close();
    const exported = parseDocument(JSON.parse(readFileSync(join(output, file), 'utf8')), {
      verifyHash: true,
    });
    for (const page of exported.atlas.pages) {
      if (basename(page.file) !== page.file) throw new Error('Nonportable atlas path');
      if (!readFileSync(join(textureDir, page.file)).length) throw new Error('Missing texture');
    }
    count++;
  }
}
console.log(`Packaged and validated ${count} editor documents with their texture sidecars`);
