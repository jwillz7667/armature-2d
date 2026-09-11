import { describe, expect, it } from 'vitest';
import { assertReleaseIdentity, assertSuccessfulRun } from '../release-check.mjs';

const sha = 'a'.repeat(40),
  path = '.github/workflows/ci.yml';
const run = {
  id: 10,
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  path,
  status: 'completed',
  conclusion: 'success',
};
describe('release proof', () => {
  it('accepts a matching prerelease identity and exact successful main commit', () => {
    expect(() => assertReleaseIdentity('v0.2.0-rc.1', '0.2.0-rc.1', '0.2.0-rc.1')).not.toThrow();
    expect(assertSuccessfulRun([run], sha, path)).toBe(10);
  });
  it.each(['v0.0.0', 'v01.2.3', 'v1.2.3-01', 'v1.2', '1.2.3'])(
    'rejects invalid release identity %s',
    (tag) => {
      expect(() => assertReleaseIdentity(tag, tag.slice(1), tag.slice(1))).toThrow();
    },
  );
  it('rejects an app version that differs from its tag', () => {
    expect(() => assertReleaseIdentity('v0.1.3', '0.1.3', '0.0.0')).toThrow(/does not match/);
  });
  it.each([
    { head_sha: 'b'.repeat(40) },
    { head_branch: 'feature' },
    { event: 'pull_request' },
    { path: '.github/workflows/other.yml' },
    { conclusion: 'skipped' },
    { status: 'in_progress' },
  ])('rejects unrelated or incomplete success evidence %j', (override) => {
    expect(() => assertSuccessfulRun([{ ...run, ...override }], sha, path)).toThrow();
  });
  it('rejects a newer failed run even when an older success exists', () => {
    expect(() =>
      assertSuccessfulRun([run, { ...run, id: 11, conclusion: 'failure' }], sha, path),
    ).toThrow();
  });
});
