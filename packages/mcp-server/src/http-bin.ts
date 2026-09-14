import { createHttpServer } from './http';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const port = Number(process.env['PORT'] ?? '8080');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const app = await createHttpServer({
  dataRoot: required('ARMATURE_DATA_ROOT'),
  publicUrl: required('ARMATURE_PUBLIC_URL'),
  issuer: required('ARMATURE_OAUTH_ISSUER'),
  jwksUrl: required('ARMATURE_OAUTH_JWKS_URL'),
  ...(process.env['ARMATURE_OPENAI_CHALLENGE_TOKEN'] !== undefined
    ? { openaiChallengeToken: process.env['ARMATURE_OPENAI_CHALLENGE_TOKEN'] }
    : {}),
});
app.server.listen(port, '0.0.0.0', () =>
  process.stderr.write(`Armature MCP HTTP listening on port ${port}\n`),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  });
}
