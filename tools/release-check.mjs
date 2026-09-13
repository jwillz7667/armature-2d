import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function assertReleaseIdentity(tag, rootVersion, appVersion) {
  const version = tag?.startsWith('v') ? tag.slice(1) : '';
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      version,
    ) ||
    version === '0.0.0'
  )
    throw new Error('Release requires a valid non-placeholder vMAJOR.MINOR.PATCH tag');
  const suffix = version.split('-').slice(1).join('-');
  if (suffix.split('.').some((part) => /^\d+$/.test(part) && part.length > 1 && part[0] === '0'))
    throw new Error('Prerelease numeric identifiers cannot have leading zeroes');
  if (version !== rootVersion || version !== appVersion)
    throw new Error(`Tag ${tag} does not match root/app versions ${rootVersion}/${appVersion}`);
}

export function assertSuccessfulRun(runs, sha, path) {
  const matching = runs
    .filter(
      (run) =>
        run.head_sha === sha &&
        run.head_branch === 'main' &&
        run.event === 'push' &&
        run.path === path,
    )
    .sort((a, b) => b.id - a.id);
  const latest = matching[0];
  if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success')
    throw new Error(`Release requires the latest main push run of ${path} to succeed on ${sha}`);
  return latest.id;
}

async function main() {
  const root = JSON.parse(readFileSync('package.json', 'utf8'));
  const app = JSON.parse(readFileSync('apps/editor/package.json', 'utf8'));
  const tag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
  assertReleaseIdentity(tag, root.version, app.version);
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const tagSha = execFileSync(
    'git',
    ['rev-parse', '--verify', '--end-of-options', `refs/tags/${tag}^{commit}`],
    { encoding: 'utf8' },
  ).trim();
  if (sha !== tagSha || sha !== process.env.GITHUB_SHA)
    throw new Error('Checkout does not match the release tag commit');
  execFileSync('git', ['merge-base', '--is-ancestor', sha, 'refs/remotes/origin/main']);
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') || !process.env.GH_TOKEN)
    throw new Error('Release proof requires repository identity and a read-scoped GitHub token');
  for (const workflow of ['ci.yml', 'conformance-native.yml']) {
    const url = `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/runs?head_sha=${sha}&branch=main&event=push&per_page=100`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Could not verify ${workflow}: HTTP ${response.status}`);
    const result = await response.json();
    if (!Array.isArray(result.workflow_runs)) throw new Error('Malformed workflow proof response');
    const id = assertSuccessfulRun(result.workflow_runs, sha, `.github/workflows/${workflow}`);
    console.log(`Release proof: ${workflow} run ${id} passed on ${sha}.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Release blocked: ${error.message}`);
    process.exitCode = 1;
  });
}
