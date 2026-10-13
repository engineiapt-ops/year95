import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const SUPABASE_URL = requiredEnv('SUPABASE_URL');
const SUPABASE_ANON_KEY = requiredEnv('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const API_BASE_URL = requiredEnv('API_BASE_URL');
const WEB_BASE_URL = requiredEnv('WEB_BASE_URL');
const PLAYWRIGHT_MODULE = requiredEnv('PLAYWRIGHT_MODULE');
const email = process.env.AUTH_SMOKE_EMAIL ?? 'year95-auth-smoke@example.test';
const password = process.env.AUTH_SMOKE_PASSWORD ?? 'Year95-local-smoke-2026!';

assertLoopback(SUPABASE_URL, 'SUPABASE_URL');
assertLoopback(API_BASE_URL, 'API_BASE_URL');
assertLoopback(WEB_BASE_URL, 'WEB_BASE_URL');
assert.match(email, /@example\.test$/i, 'Auth smoke test must use a non-production .test address');

const serviceRoleKey = SUPABASE_SERVICE_ROLE_KEY;
const anonKey = SUPABASE_ANON_KEY;
const authClient = createClient(SUPABASE_URL, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

let browser;
try {
  // This privileged call targets the freshly started local Supabase stack only.
  const createUserResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'YEAR95 local Auth smoke test' },
    }),
  });
  assert.ok(
    createUserResponse.ok,
    `Local Auth admin user creation failed (HTTP ${createUserResponse.status})`,
  );

  // Validate real Supabase Auth sign-in and obtain a JWT from the public anon client.
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });
  assert.equal(signInError, null, 'Real Supabase Auth sign-in must succeed');
  assert.ok(signInData.session?.access_token, 'Supabase Auth must return an access token');
  assert.equal(signInData.user.email?.toLowerCase(), email.toLowerCase());

  const healthResponse = await fetch(`${API_BASE_URL}/health`);
  assert.equal(healthResponse.status, 200, 'API /health must be healthy');
  const health = await healthResponse.json();
  assert.equal(health.status, 'ok');

  const readinessResponse = await fetch(`${API_BASE_URL}/ready`);
  assert.equal(readinessResponse.status, 200, 'API /ready must report HTTP 200');
  const readiness = await readinessResponse.json();
  assert.equal(readiness.ready, true, 'API /ready must confirm PostgreSQL is ready');

  const meResponse = await fetch(`${API_BASE_URL}/v1/me`, {
    headers: { authorization: `Bearer ${signInData.session.access_token}` },
  });
  assert.equal(meResponse.status, 200, 'API must accept the real local Supabase JWT');
  const me = await meResponse.json();
  assert.equal(me.id, signInData.user.id, 'API identity must match the signed-in Auth user');
  assert.equal(me.email?.toLowerCase(), email.toLowerCase(), 'API must return the authenticated email');
  console.log('PASS: real local Supabase Auth sign-in, JWT verification, allowlist, /health, /ready and /v1/me');

  const playwright = await import(pathToFileURL(PLAYWRIGHT_MODULE).href);
  browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(20_000);

  await page.goto(`${WEB_BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  await page.getByRole('heading', { name: 'Visão geral' }).waitFor({ state: 'visible' });
  await page.getByText('Online', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Pronto', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText(email, { exact: true }).waitFor({ state: 'visible' });
  console.log('PASS: browser login reaches dashboard and renders live API, database and API-verified user state');

  // Exercise the UI response to a 401 from the API. The successful login and API/JWT
  // checks above use the real local services; only this controlled expiry response is intercepted.
  await page.route('**/v1/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' },
      }),
    });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('status').filter({ hasText: 'Sua sessão expirou. Entre novamente' }).waitFor({
    state: 'visible',
  });
  await page.getByLabel('E-mail').waitFor({ state: 'visible' });
  console.log('PASS: API 401 clears the UI session and returns the user to login with the expiry notice');

  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('heading', { name: 'Visão geral' }).waitFor({ state: 'visible' });
  await page.unroute('**/v1/me');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.getByRole('heading', { name: 'YEAR95', exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('E-mail').waitFor({ state: 'visible' });
  console.log('PASS: logout returns the browser to login');
} finally {
  if (browser) await browser.close();
  await authClient.auth.signOut().catch(() => undefined);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required environment variable is missing: ${name}`);
  return value;
}

function assertLoopback(value, name) {
  const url = new URL(value);
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  assert.ok(loopbackHosts.has(url.hostname), `${name} must point to a local loopback host`);
  assert.ok(url.protocol === 'http:' || url.protocol === 'https:', `${name} must use HTTP(S)`);
}
