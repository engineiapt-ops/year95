import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const scannerPath = fileURLToPath(
  new URL('../../apps/web/scripts/check-bundle-secrets.mjs', import.meta.url),
);
const temporaryRoots: string[] = [];

function jwtForRole(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role, sub: 'year95-test-user' })).toString(
    'base64url',
  );
  const signature = Buffer.from('non-secret-test-signature').toString('base64url');
  return `${header}.${payload}.${signature}`;
}

async function scanBundle(
  content: string,
  configuredAnonKey?: string,
): Promise<ReturnType<typeof spawnSync>> {
  const root = await mkdtemp(path.join(tmpdir(), 'year95-web-bundle-'));
  temporaryRoots.push(root);
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'assets', 'index.js'), content, 'utf8');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    YEAR95_WEB_BUNDLE_ROOT: root,
  };
  if (configuredAnonKey === undefined) {
    delete env.VITE_SUPABASE_ANON_KEY;
  } else {
    env.VITE_SUPABASE_ANON_KEY = configuredAnonKey;
  }

  return spawnSync(process.execPath, [scannerPath], {
    encoding: 'utf8',
    env,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('web bundle secret scan', () => {
  it.each(['DATABASE_URL', 'service_role', 'SUPABASE_SERVICE_ROLE_KEY', 'SAXO_CLIENT_SECRET'])(
    'fails if the bundle contains the forbidden marker %s',
    async (marker) => {
      const result = await scanBundle(`const forbiddenMarker = '${marker}';`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Web bundle secret-scan failed');
    },
  );

  it('fails when the configured Supabase key has a service_role JWT role', async () => {
    const serviceRoleKey = jwtForRole('service_role');
    const result = await scanBundle(`const key = '${serviceRoleKey}';`, serviceRoleKey);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('VITE_SUPABASE_ANON_KEY is a JWT with a non-anon role');
  });

  it('accepts a configured anon-role JWT and rejects any other JWT in the bundle', async () => {
    const anonKey = jwtForRole('anon');
    const valid = await scanBundle(`const supabaseKey = '${anonKey}';`, anonKey);
    expect(valid.status).toBe(0);

    const serviceRoleKey = jwtForRole('service_role');
    const invalid = await scanBundle(`const unrelatedToken = '${serviceRoleKey}';`, anonKey);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('not confirmed as anon-role');
  });

  it('accepts a configured Supabase publishable key', async () => {
    const publishableKey = 'sb_publishable_year95_local_test_key';
    const result = await scanBundle(`const supabaseKey = '${publishableKey}';`, publishableKey);

    expect(result.status).toBe(0);
  });
});
