#!/usr/bin/env python3
"""Package the hosted plugin without including credentials or local grants."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=root / 'dist')
args = parser.parse_args()
source = root / 'plugins' / 'armature-hosted'
manifest = json.loads((source / 'plugin.json').read_text())
files = [
    'plugin.json', 'mcp.json', '.codex-plugin/plugin.json', '.mcp.json',
    'LICENSE', 'README.md', 'assets/icon.png',
    'skills/armature-authoring/SKILL.md',
]
# Explicit allowlist excludes local credentials and incidental working files.
for name in files:
    path = source / name
    if not path.is_file() or path.is_symlink():
        raise SystemExit(f'Missing or unsafe package file: {name}')
args.output.mkdir(parents=True, exist_ok=True)
archive = args.output / f"armature-hosted-{manifest['version']}.zip"
with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
    for name in files:
        bundle.write(source / name, name)
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n')
print(archive)
