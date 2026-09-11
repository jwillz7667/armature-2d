import { runFormatGate } from './format-gate.mjs';

try {
  runFormatGate();
} catch (error) {
  console.error(`format-semver FAILED: ${error.message}`);
  process.exitCode = 1;
}
