import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const constantsPath = 'packages/format/src/version/constants.ts';
const lines = [
  'CURRENT_FORMAT_VERSION',
  'EFFECTS_FORMAT_VERSION',
  'SLOT_SCENE_FORMAT_VERSION',
  'PROJECT_FORMAT_VERSION',
  'FORMAT_COMMON_VERSION',
];
const printer = ts.createPrinter({ removeComments: true });

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}
function commit(cwd, ref) {
  if (typeof ref !== 'string' || !ref || ref.startsWith('-') || ref.includes('\0'))
    throw new Error('A valid base/head ref is required');
  return git(cwd, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
}
function readAt(cwd, sha, path) {
  return git(cwd, 'show', `${sha}:${path}`);
}
function existsAt(cwd, sha, path) {
  try {
    git(cwd, 'cat-file', '-e', `${sha}:${path}`);
    return true;
  } catch {
    return false;
  }
}
function parseVersion(value) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))
    throw new Error(`Invalid format semver: ${value}`);
  const parts = value.split('.').map(Number);
  if (parts.some((n) => !Number.isSafeInteger(n)))
    throw new Error('Format version component exceeds safe integer');
  return parts;
}
function versions(source) {
  const result = new Map();
  const ast = ts.createSourceFile(constantsPath, source, ts.ScriptTarget.Latest);
  if (ast.parseDiagnostics.length) throw new Error('Invalid format constants TypeScript');
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !lines.includes(declaration.name.text)) continue;
      if (
        !declaration.initializer ||
        !ts.isStringLiteral(declaration.initializer) ||
        result.has(declaration.name.text)
      )
        throw new Error('Version constants must be unique string literals');
      parseVersion(declaration.initializer.text);
      result.set(declaration.name.text, declaration.initializer.text);
    }
  }
  if (!result.has(lines[0])) throw new Error('Missing CURRENT_FORMAT_VERSION');
  return result;
}
function normalized(source, path) {
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw new Error(`Invalid TypeScript in ${path}`);
  return printer.printFile(ast);
}
function exportOnly(source, path) {
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest);
  return (
    !ast.parseDiagnostics.length && ast.statements.every((node) => ts.isExportDeclaration(node))
  );
}
function domains(path) {
  if (path.includes('/effects/')) return ['EFFECTS_FORMAT_VERSION'];
  if (path.includes('/slot/')) return ['SLOT_SCENE_FORMAT_VERSION'];
  if (path.endsWith('/project.ts')) return ['PROJECT_FORMAT_VERSION'];
  if (path.includes('/common/') || /\/schema\/(atlas|color|curve)\.ts$/.test(path))
    return ['FORMAT_COMMON_VERSION', 'CURRENT_FORMAT_VERSION', 'EFFECTS_FORMAT_VERSION'];
  return ['CURRENT_FORMAT_VERSION'];
}

export function comparisonRefs(env = process.env, args = process.argv.slice(2)) {
  const index = args.indexOf('--base');
  if (index !== -1) {
    if (!args[index + 1]) throw new Error('--base requires a ref');
    return { base: args[index + 1], head: env.FORMAT_HEAD_SHA || 'HEAD' };
  }
  if (env.FORMAT_BASE_SHA)
    return { base: env.FORMAT_BASE_SHA, head: env.FORMAT_HEAD_SHA || 'HEAD' };
  if (env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    if (
      env.GITHUB_EVENT_NAME === 'pull_request' &&
      event.pull_request?.base?.sha &&
      event.pull_request?.head?.sha
    )
      return { base: event.pull_request.base.sha, head: event.pull_request.head.sha };
    if (
      env.GITHUB_EVENT_NAME === 'push' &&
      /^[0-9a-f]{40}$/.test(event.before) &&
      !/^0+$/.test(event.before)
    )
      return { base: event.before, head: event.after };
  }
  if (env.CI)
    throw new Error('CI must supply exact base/head commits; comparison cannot be skipped');
  return { base: 'HEAD^', head: 'HEAD' };
}

export function checkFormatChange({ cwd = root, base, head = 'HEAD' }) {
  const baseSha = commit(cwd, base),
    headSha = commit(cwd, head);
  const changed = git(cwd, 'diff', '--name-only', '-z', baseSha, headSha, '--')
    .split('\0')
    .filter(Boolean);
  const oldVersions = versions(readAt(cwd, baseSha, constantsPath));
  const newVersions = versions(readAt(cwd, headSha, constantsPath));
  for (const name of oldVersions.keys())
    if (!newVersions.has(name)) throw new Error(`Removed format version line ${name}`);
  const required = new Set();
  const contractFiles = [];
  for (const path of changed.filter((p) => p.startsWith('packages/format/src/'))) {
    if (path === constantsPath) continue;
    const before = existsAt(cwd, baseSha, path) ? readAt(cwd, baseSha, path) : '';
    const after = existsAt(cwd, headSha, path) ? readAt(cwd, headSha, path) : '';
    if (normalized(before, path) === normalized(after, path)) continue;
    // API wiring and PNG allocation preflight do not define serialized schema or interpretation
    // (format-contract 10.1). All other implementation changes conservatively require classification.
    if (path.endsWith('/index.ts') && exportOnly(before, path) && exportOnly(after, path)) continue;
    if (path === 'packages/format/src/assets/png.ts') continue;
    contractFiles.push(path);
    for (const line of domains(path)) required.add(line);
  }
  const records = changed
    .filter((p) => /^docs\/format-changes\/[^/]+\.json$/.test(p) && existsAt(cwd, headSha, p))
    .flatMap((p) => {
      const value = JSON.parse(readAt(cwd, headSha, p));
      if (!Array.isArray(value)) throw new Error(`${p} must contain a change-record array`);
      return value;
    });
  for (const name of lines) {
    const from = oldVersions.get(name),
      to = newVersions.get(name);
    if (from === to) {
      if (required.has(name))
        throw new Error(
          `${name} did not advance for contract changes: ${contractFiles.join(', ')}`,
        );
      continue;
    }
    const record = records.find(
      (r) => r.constant === name && r.from === (from ?? null) && r.to === to,
    );
    if (!record || typeof record.reason !== 'string' || record.reason.trim().length < 20)
      throw new Error(
        `${name} ${from ?? 'new'} -> ${to} requires a changed, classified docs/format-changes record`,
      );
    const next = parseVersion(to);
    const old = from === undefined ? null : parseVersion(from);
    let breaking = false;
    if (old === null) {
      if (record.classification !== 'new')
        throw new Error('A new version line requires classification new');
    } else {
      const greater =
        next[0] > old[0] ||
        (next[0] === old[0] && (next[1] > old[1] || (next[1] === old[1] && next[2] > old[2])));
      if (!greater) throw new Error(`${name} must increase, never roll back`);
      breaking = next[0] !== old[0] || (old[0] === 0 && next[1] !== old[1]);
      const kind = record.classification;
      if (kind === 'patch' && !(next[0] === old[0] && next[1] === old[1]))
        throw new Error('Patch classification must only increase PATCH');
      if (kind === 'minor' && !(next[0] === old[0] && next[1] > old[1] && next[2] === 0))
        throw new Error('Minor classification must increase MINOR and reset PATCH');
      if (kind === 'major' && !(breaking && next[2] === 0 && (old[0] === 0 || next[1] === 0)))
        throw new Error(
          'Major classification requires the breaking version digit and reset lower digits',
        );
      if (!['patch', 'minor', 'major'].includes(kind))
        throw new Error('Expected patch/minor/major classification');
    }
    const evidence = (path, pattern) =>
      typeof path === 'string' &&
      pattern.test(path) &&
      changed.includes(path) &&
      existsAt(cwd, headSha, path);
    if (
      !evidence(record.adr, /^docs\/adr\/[^/]+\.md$/) ||
      !readAt(cwd, headSha, record.adr).includes(to)
    )
      throw new Error(`${name} requires a changed ADR naming ${to}`);
    if (
      !Array.isArray(record.tests) ||
      record.tests.length === 0 ||
      !record.tests.every((p) =>
        evidence(
          p,
          name === 'PROJECT_FORMAT_VERSION'
            ? /^packages\/(?:format|document-core)\/test\/.+\.test\.ts$/
            : /^packages\/format\/test\/.+\.test\.ts$/,
        ),
      )
    )
      throw new Error(`${name} requires changed format regression tests`);
    if (
      breaking &&
      !evidence(
        record.migration,
        /^packages\/format\/src\/(?:version\/migrat|effects\/.*migrat|slot\/.*migrat|project)/,
      )
    )
      throw new Error(`${name} requires a changed migration implementation`);
  }
  return { baseSha, headSha, contractFiles };
}

export function runFormatGate() {
  const result = checkFormatChange(comparisonRefs());
  console.log(
    `format-semver OK: checked ${result.baseSha.slice(0, 12)} -> ${result.headSha.slice(0, 12)}; ${result.contractFiles.length} contract files.`,
  );
}
