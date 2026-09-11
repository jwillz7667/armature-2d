import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkFormatChange, comparisonRefs } from '../format-gate.mjs';

let cwd = '',
  base = '';
const constants = 'packages/format/src/version/constants.ts';
const schema = 'packages/format/src/schema/document.ts';
function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function write(path: string, content: string) {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), content);
}
function save() {
  git('add', '.');
  git('commit', '-qm', 'test: fixture');
  return git('rev-parse', 'HEAD');
}
function versions(skeleton = '0.6.0', project = '0.1.0') {
  return `export const CURRENT_FORMAT_VERSION = '${skeleton}';\nexport const PROJECT_FORMAT_VERSION = '${project}';\n`;
}
function evidence(
  to: string,
  classification = 'patch',
  from = '0.6.0',
  line = 'CURRENT_FORMAT_VERSION',
) {
  const record = {
    constant: line,
    from,
    to,
    classification,
    reason: 'Regression correction with unchanged document meaning.',
    adr: 'docs/adr/test.md',
    tests: ['packages/format/test/example.test.ts'],
    migration: 'packages/format/src/version/migrations/example.ts',
  };
  write('docs/format-changes/test.json', JSON.stringify([record]));
  write(record.adr, `Version ${to} changes the documented contract.`);
  write(record.tests[0]!, 'test("regression", () => {});');
  return record;
}
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'armature-format-gate-'));
  git('init', '-q');
  git('config', 'user.name', 'Gate test');
  git('config', 'user.email', 'test@example.invalid');
  write(constants, versions());
  write(schema, 'export const shape = 1;');
  write('docs/adr/stale.md', 'Existing ADR for 0.6.1 and 0.7.0.');
  base = save();
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('format gate exact-commit checks', () => {
  it('fails closed for an unavailable base', () => {
    expect(() => checkFormatChange({ cwd, base: 'does-not-exist' })).toThrow();
  });
  it('treats shell metacharacters in a branch as data', () => {
    const branch = 'base;touch${IFS}injected';
    git('branch', branch);
    expect(checkFormatChange({ cwd, base: branch }).baseSha).toBe(base);
    expect(existsSync(join(cwd, 'injected'))).toBe(false);
  });
  it('rejects option-like refs', () => {
    expect(() => checkFormatChange({ cwd, base: '--help' })).toThrow(/ref/);
  });
  it('allows comment-only edits and pure public reexports without inventing a wire version', () => {
    write(schema, '// Clarification only.\nexport const shape = 1;');
    write('packages/format/src/index.ts', "export { shape } from './schema/document';");
    save();
    expect(checkFormatChange({ cwd, base }).contractFiles).toEqual([]);
  });
  it('allows PNG preflight while preserving the schema version', () => {
    write('packages/format/src/assets/png.ts', 'export function inspectPng() { return 1; }');
    save();
    expect(checkFormatChange({ cwd, base }).contractFiles).toEqual([]);
  });
  it('rejects a schema change disguised by touching the constants file', () => {
    write(schema, 'export const shape = 2;');
    write(constants, versions() + '// CURRENT_FORMAT_VERSION bump\n');
    save();
    expect(() => checkFormatChange({ cwd, base })).toThrow(/did not advance/);
  });
  it('ignores fake version declarations inside comments', () => {
    write(schema, 'export const shape = 2;');
    write(constants, "// export const CURRENT_FORMAT_VERSION = '0.6.1';\n" + versions());
    save();
    expect(() => checkFormatChange({ cwd, base })).toThrow(/did not advance/);
  });
  it('rejects invalid semver and rollbacks', () => {
    write(constants, versions('0.06.0'));
    save();
    expect(() => checkFormatChange({ cwd, base })).toThrow(/Invalid format semver/);
    write(constants, versions('0.5.0'));
    evidence('0.5.0');
    save();
    expect(() => checkFormatChange({ cwd, base })).toThrow(/never roll back/);
  });
  it('does not accept an unrelated existing ADR for a new version', () => {
    write(constants, versions('0.6.1'));
    const record = evidence('0.6.1');
    record.adr = 'docs/adr/stale.md';
    write('docs/format-changes/test.json', JSON.stringify([record]));
    save();
    expect(() => checkFormatChange({ cwd, base })).toThrow(/changed ADR/);
  });
  it('requires real version movement and changed regression evidence for a classified patch', () => {
    write(constants, versions('0.6.1'));
    write(schema, 'export const shape = 2;');
    evidence('0.6.1');
    save();
    expect(checkFormatChange({ cwd, base }).contractFiles).toEqual([schema]);
  });
  it('requires a migration when the pre-1.0 minor version changes', () => {
    write(constants, versions('0.7.0'));
    evidence('0.7.0', 'minor');
    save();
    expect(() => checkFormatChange({ cwd, base })).toThrow(/migration implementation/);
    write('packages/format/src/version/migrations/example.ts', 'export function migrate() {}');
    save();
    expect(() => checkFormatChange({ cwd, base })).not.toThrow();
  });
  it('versions project changes independently of skeletons', () => {
    write(constants, versions('0.6.0', '0.1.1'));
    write('packages/format/src/project.ts', 'export const project = 1;');
    evidence('0.1.1', 'patch', '0.1.0', 'PROJECT_FORMAT_VERSION');
    save();
    expect(() => checkFormatChange({ cwd, base })).not.toThrow();
  });
  it('does not allow declarations hidden in an index file to bypass versioning', () => {
    write('packages/format/src/index.ts', 'export const schema = 1;');
    save();
    expect(() => checkFormatChange({ cwd, base })).toThrow(/did not advance/);
  });
});

describe('CI comparison selection', () => {
  it('requires an explicit comparison in CI', () => {
    expect(() => comparisonRefs({ CI: 'true' }, [])).toThrow(/cannot be skipped/);
  });
  it('uses push before/after, including when HEAD already equals main', () => {
    const event = join(cwd, 'event.json');
    writeFileSync(event, JSON.stringify({ before: 'a'.repeat(40), after: 'b'.repeat(40) }));
    expect(
      comparisonRefs({ CI: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: event }, []),
    ).toEqual({ base: 'a'.repeat(40), head: 'b'.repeat(40) });
  });
  it('uses exact pull request commits rather than mutable branch tips', () => {
    const event = join(cwd, 'event.json');
    writeFileSync(
      event,
      JSON.stringify({
        pull_request: { base: { sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) } },
      }),
    );
    expect(
      comparisonRefs(
        { CI: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event },
        [],
      ),
    ).toEqual({ base: 'a'.repeat(40), head: 'b'.repeat(40) });
  });
});
