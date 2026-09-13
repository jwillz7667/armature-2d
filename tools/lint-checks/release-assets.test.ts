import { describe, expect, it } from 'vitest';
import { assertInstallerSet } from '../release-assets.mjs';

const installers = [
  'Armature-0.2.0-rc.1-arm64.dmg',
  'Armature-0.2.0-rc.1.dmg',
  'Armature-0.2.0-rc.1-arm64.zip',
  'Armature-0.2.0-rc.1.zip',
  'Armature-0.2.0-rc.1.exe',
  'Armature-0.2.0-rc.1.AppImage',
  'armature_0.2.0-rc.1.deb',
  'armature-0.2.0-rc.1.rpm',
];
describe('release installer inventory', () => {
  it('accepts the full platform set with optional sidecars', () => {
    expect(() =>
      assertInstallerSet([...installers, 'Armature-0.2.0-rc.1.exe.blockmap']),
    ).not.toThrow();
  });
  it.each(installers)('rejects a missing %s', (missing) => {
    expect(() => assertInstallerSet(installers.filter((name) => name !== missing))).toThrow();
  });
  it('rejects two Intel mac builds masquerading as both architectures', () => {
    expect(() =>
      assertInstallerSet(installers.map((name) => name.replace('arm64', 'intel'))),
    ).toThrow('architectures');
  });
});
