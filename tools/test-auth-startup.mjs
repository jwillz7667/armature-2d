import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const source = await readFile(new URL('../deploy/auth/railway-start.sh', import.meta.url), 'utf8');
const openai = await readFile(
  new URL('../deploy/auth/openai-client.json', import.meta.url),
  'utf8',
);
const billing = await readFile(
  new URL('../deploy/auth/billing-client.json', import.meta.url),
  'utf8',
);
const fakeKey = 're_test_fixture_only';

async function runStartup({ mode, key = fakeKey, failure = '', clients = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'armature-auth-test-'));
  try {
    const cli = path.join(root, 'kcadm');
    const server = path.join(root, 'keycloak');
    await writeFile(
      cli,
      `#!${process.execPath}
import { appendFileSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const root = process.env.TEST_ROOT;
appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(args) + '\\n');
const output = (value) => process.stdout.write(JSON.stringify(value));
if (args[0] === 'config') {
  if (process.env.KC_CLI_PASSWORD !== 'fixture-admin-password') process.exit(1);
  process.exit(0);
}
if (args[0] === 'create') process.exit(0);
if (args[0] === 'get' && args[1] === 'clients') {
  const kind = args.some((arg) => arg === 'clientId=armature-openai') ? 'OPENAI' : 'BILLING';
  output(JSON.parse(process.env['ARMATURE_' + kind + '_CLIENT_JSON']).clients);
  process.exit(0);
}
if (args[0] === 'update') {
  if (process.env.TEST_FAILURE === 'update') {
    console.error('private diagnostic re_test_fixture_only');
    process.exit(1);
  }
  const file = args[args.indexOf('-f') + 1];
  const patch = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(path.join(root, 'observed.json'), JSON.stringify({
    patch,
    fileMode: statSync(file).mode & 0o777,
    directoryMode: statSync(path.dirname(file)).mode & 0o777,
  }));
  process.exit(0);
}
if (args[0] === 'get' && args[1] === 'realms/armature') {
  if (process.env.TEST_FAILURE === 'read') {
    console.error('private diagnostic re_test_fixture_only');
    process.exit(1);
  }
  const { patch } = JSON.parse(readFileSync(path.join(root, 'observed.json'), 'utf8'));
  const realm = { registrationAllowed: false, verifyEmail: false, resetPasswordAllowed: false, ...patch };
  if (process.env.TEST_FAILURE === 'tls') realm.smtpServer.ssl = 'false';
  if (process.env.TEST_FAILURE === 'verification') realm.verifyEmail = false;
  output(realm);
  process.exit(0);
}
process.exit(2);
`,
      { mode: 0o700 },
    );
    await writeFile(
      server,
      '#!/usr/bin/env bash\n[[ -z "${ARMATURE_RESEND_API_KEY:-}" ]] || exit 55\n',
      { mode: 0o700 },
    );
    const startup = path.join(root, 'startup.sh');
    await writeFile(
      startup,
      source
        .replaceAll('/opt/keycloak/data/import', path.join(root, 'import'))
        .replaceAll('/opt/keycloak/bin/kcadm.sh', cli)
        .replaceAll('/opt/keycloak/bin/kc.sh', server)
        .replaceAll('/tmp/armature-oauth.XXXXXX', path.join(root, 'private.XXXXXX')),
    );
    const result = spawnSync('bash', [startup], {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        PATH: process.env.PATH,
        TEST_ROOT: root,
        TEST_FAILURE: failure,
        ARMATURE_REALM_JSON: '{"realm":"armature"}',
        ARMATURE_EMAIL_MODE: mode ?? 'off',
        ARMATURE_RESEND_API_KEY: key,
        ARMATURE_OPENAI_CLIENT_JSON: clients ? openai : '',
        ARMATURE_BILLING_CLIENT_JSON: clients ? billing : '',
        KC_BOOTSTRAP_ADMIN_USERNAME: 'fixture-admin',
        KC_BOOTSTRAP_ADMIN_PASSWORD: 'fixture-admin-password',
      },
    });
    assert.ifError(result.error);
    const output = result.stdout + result.stderr;
    assert.ok(!output.includes(fakeKey), 'sending key must not appear in logs');
    assert.ok(!output.includes('fixture-admin-password'), 'admin secret must not appear in logs');
    const files = await readdir(root);
    assert.ok(
      !files.some((name) => name.startsWith('private.')),
      'private bootstrap files are removed',
    );
    const calls = files.includes('calls.jsonl')
      ? (await readFile(path.join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
      : [];
    assert.ok(!JSON.stringify(calls).includes(fakeKey), 'sending key must not appear in argv');
    assert.ok(
      !JSON.stringify(calls).includes('fixture-admin-password'),
      'admin secret must not appear in argv',
    );
    const observed = files.includes('observed.json')
      ? JSON.parse(await readFile(path.join(root, 'observed.json'), 'utf8'))
      : undefined;
    return { status: result.status, output, calls, observed };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('default mode leaves the realm and account flows untouched', async () => {
  const result = await runStartup();
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls, []);
});

test('prepared mode configures private TLS SMTP without changing onboarding or existing clients', async () => {
  const result = await runStartup({ mode: 'prepared', clients: true });
  assert.equal(result.status, 0);
  assert.equal(result.observed.fileMode, 0o600);
  assert.equal(result.observed.directoryMode, 0o700);
  assert.deepEqual(Object.keys(result.observed.patch), ['smtpServer']);
  assert.equal(result.observed.patch.smtpServer.password, fakeKey);
  assert.equal(result.observed.patch.smtpServer.ssl, 'true');
  assert.equal(result.calls.filter((args) => args[0] === 'create').length, 2);
  assert.match(result.output, /OAuth verified: armature-openai/);
  assert.match(result.output, /OAuth verified: armature-billing/);
  assert.match(result.output, /configuration verified: mode=prepared/);
});

test('enabled mode requires verified email and allows recovery while preserving the registration gate', async () => {
  const result = await runStartup({ mode: 'enabled' });
  assert.equal(result.observed.patch.verifyEmail, true);
  assert.equal(result.observed.patch.resetPasswordAllowed, true);
  assert.equal(result.observed.patch.registrationAllowed, undefined);
  assert.equal(result.observed.patch.users, undefined);
  assert.match(result.output, /configuration verified: mode=enabled/);
});

for (const [name, options] of [
  ['invalid mode', { mode: 'unexpected' }],
  ['missing sending credential', { mode: 'prepared', key: '' }],
  ['JSON injection in a credential', { mode: 'prepared', key: 're_invalid","ssl":"false' }],
]) {
  test(`rejects ${name} before contacting Keycloak`, async () => {
    const result = await runStartup(options);
    assert.equal(result.status, 1);
    assert.deepEqual(result.calls, []);
    assert.match(result.output, /email setup failed/);
  });
}

for (const failure of ['update', 'read', 'tls', 'verification']) {
  test(`reports ${failure} failure without claiming readiness or leaking private diagnostics`, async () => {
    const result = await runStartup({ mode: 'enabled', failure });
    assert.match(result.output, /email (setup|verification) failed/);
    assert.doesNotMatch(result.output, /configuration verified/);
    assert.doesNotMatch(result.output, /private diagnostic/);
  });
}
