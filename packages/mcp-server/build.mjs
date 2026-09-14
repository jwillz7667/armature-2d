import { build } from 'esbuild';

// The monorepo uses bundler-style module resolution and the workspace packages export TypeScript
// source (their `exports` point at ./src/index.ts), so `node dist/bin.js` cannot run on its own. The
// headless CLI is therefore bundled into one self-contained file: esbuild inlines our workspace deps,
// the MCP SDK, and zod, leaving only node: builtins external. The result is a portable cross-platform
// executable (macOS + Windows) that an AI host can launch directly.
await build({
  entryPoints: {
    cli: 'src/bin.ts',
    http: 'src/http-bin.ts',
    'billing-setup': 'src/billing/setup-bin.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Bundled CommonJS dependencies (pngjs) still require Node built-ins. ESM needs an explicit
  // createRequire bridge; a successful esbuild run alone does not prove the executable starts.
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  logLevel: 'info',
});
