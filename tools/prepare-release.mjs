import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { assertReleaseIdentity, assertSuccessfulRun } from './release-check.mjs';

// Explicit version requests merged to main use the repository's normal Actions token.
// A token-created tag does not start another workflow, so this run also builds the release.
const repository = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
if (
  !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') ||
  !/^[a-f0-9]{40}$/.test(sha ?? '') ||
  !process.env.GH_TOKEN
)
  throw new Error('Missing release repository, commit, or Actions token');
if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== sha)
  throw new Error('Release checkout does not match the triggering commit');
const root = JSON.parse(readFileSync('package.json', 'utf8'));
const app = JSON.parse(readFileSync('apps/editor/package.json', 'utf8'));
const fromMain = process.env.GITHUB_REF === 'refs/heads/main';
if (
  process.env.GITHUB_EVENT_NAME !== 'push' ||
  (!fromMain && !process.env.GITHUB_REF?.startsWith('refs/tags/v'))
)
  throw new Error('Release requires a main request or version tag push');
const request = fromMain ? JSON.parse(readFileSync('.github/release-request.json', 'utf8')) : null;
const tag = fromMain ? `v${request.version}` : process.env.GITHUB_REF_NAME;
assertReleaseIdentity(tag, root.version, app.version);

async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
  return response.json();
}

const deadline = Date.now() + 20 * 60 * 1000;
for (;;) {
  let ready = true;
  for (const workflow of ['ci.yml', 'conformance-native.yml']) {
    const result = await api(
      `actions/workflows/${workflow}/runs?head_sha=${sha}&branch=main&event=push&per_page=100`,
    );
    if (!Array.isArray(result?.workflow_runs)) throw new Error('Missing main CI proof');
    const path = `.github/workflows/${workflow}`;
    const latest = result.workflow_runs
      .filter(
        (run) =>
          run.head_sha === sha &&
          run.head_branch === 'main' &&
          run.event === 'push' &&
          run.path === path,
      )
      .sort((a, b) => b.id - a.id)[0];
    if (latest?.status === 'completed' && latest.conclusion !== 'success')
      throw new Error(`${workflow} failed on the release commit`);
    if (!latest || latest.status !== 'completed') ready = false;
    else assertSuccessfulRun(result.workflow_runs, sha, path);
  }
  if (ready) break;
  if (Date.now() >= deadline)
    throw new Error('Timed out waiting for main CI and native conformance');
  console.log('Waiting for CI and native conformance on the exact release commit...');
  await setTimeout(15000);
}

const existing = await api(`git/ref/tags/${tag}`);
if (existing) {
  // Accept annotated tags as long as the peeled commit is exactly this checked-out commit.
  execFileSync('git', ['fetch', 'origin', `refs/tags/${tag}:refs/tags/${tag}`]);
  const tagged = execFileSync('git', ['rev-parse', `refs/tags/${tag}^{commit}`], {
    encoding: 'utf8',
  }).trim();
  if (tagged !== sha) throw new Error('Release tag already points to a different commit');
} else {
  if (!fromMain) throw new Error('Triggering release tag is missing');
  await api('git/refs', 'POST', { ref: `refs/tags/${tag}`, sha });
  execFileSync('git', ['fetch', 'origin', `refs/tags/${tag}:refs/tags/${tag}`]);
}
appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
console.log(`Prepared ${tag} at verified main commit ${sha}`);
