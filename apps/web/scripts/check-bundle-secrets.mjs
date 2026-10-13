import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(appRoot, 'src');
const bundleRoot = path.join(appRoot, 'dist');
const allowedViteEnv = new Set([
  'DEV', 'PROD', 'MODE', 'BASE_URL', 'SSR',
  'VITE_API_BASE_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
]);
const forbiddenMarkers = [
  /DATABASE_URL/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /SUPABASE_SECRET_KEY/i,
  /service_role/i,
  /(?:GEMINI|GOOGLE|IG|SAXO|CRYPTOPANIC)_API_KEY/i,
  /SAXO_CLIENT_SECRET/i,
  /SAXO_ACCESS_TOKEN/i,
  /(?:^|[^A-Za-z0-9_])sb_secret_[A-Za-z0-9_-]+/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
];
const jwtPattern = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  }));
  return nested.flat();
}

function decodeJwtPayload(token) {
  try {
    const segment = token.split('.')[1];
    return segment ? JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) : null;
  } catch {
    return null;
  }
}

async function assertOnlyPublicViteEnv() {
  const files = await listFiles(sourceRoot);
  const violations = [];
  for (const file of files.filter((name) => /\.(?:ts|tsx|js|jsx)$/.test(name))) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/import\.meta\.env\.([A-Za-z0-9_]+)/g)) {
      if (!allowedViteEnv.has(match[1])) violations.push(`${path.relative(appRoot, file)}: import.meta.env.${match[1]}`);
    }
  }
  if (violations.length) throw new Error(`Non-public Vite environment references found:\n${violations.join('\n')}`);
}

async function assertSafeBundle() {
  const files = await listFiles(bundleRoot);
  const textFiles = files.filter((name) => /\.(?:js|html|css|json|svg|map)$/.test(name));
  if (textFiles.length === 0) throw new Error('No readable web bundle files were produced.');
  const configuredAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const violations = [];

  for (const file of textFiles) {
    const text = await readFile(file, 'utf8');
    for (const marker of forbiddenMarkers) {
      if (marker.test(text)) violations.push(`${path.relative(appRoot, file)} matched forbidden marker ${marker}`);
    }
    for (const token of text.match(jwtPattern) ?? []) {
      if (configuredAnonKey && token === configuredAnonKey) continue;
      const payload = decodeJwtPayload(token);
      if (payload?.role !== 'anon') {
        violations.push(`${path.relative(appRoot, file)} contains a JWT/key that is not confirmed as anon-role`);
      }
    }
  }
  if (violations.length) throw new Error(`Web bundle secret-scan failed:\n${violations.join('\n')}`);
}

await assertOnlyPublicViteEnv();
await assertSafeBundle();
process.stdout.write('Web bundle secret-scan passed: only allowlisted public Vite env inputs and anon-role JWTs are permitted.\n');
