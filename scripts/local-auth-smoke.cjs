/* global process, console */
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_DIR);

const requiredEnvironment = [
  'WEB_ORIGIN',
  'API_ORIGIN',
  'SUPABASE_LOCAL_URL',
  'SUPABASE_LOCAL_ANON_KEY',
  'SMOKE_EMAIL',
  'SMOKE_PASSWORD',
];

for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`Missing required smoke-test environment variable: ${name}`);
  }
}

const {
  WEB_ORIGIN,
  API_ORIGIN,
  SUPABASE_LOCAL_URL,
  SUPABASE_LOCAL_ANON_KEY,
  SMOKE_EMAIL,
  SMOKE_PASSWORD,
} = process.env;

async function waitForVisible(locator, description, timeout = 20_000) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
  } catch {
    throw new Error(`Timed out waiting for UI evidence: ${description}`);
  }
}

async function signIn(page) {
  await page.getByLabel('E-mail').fill(SMOKE_EMAIL);
  await page.getByLabel('Senha').fill(SMOKE_PASSWORD);
  const authResponsePromise = page.waitForResponse(
    (response) =>
      response.url().startsWith(`${SUPABASE_LOCAL_URL}/auth/v1/token?`) &&
      response.request().method() === 'POST',
    { timeout: 20_000 },
  );
  await page.getByRole('button', { name: 'Entrar' }).click();
  const authResponse = await authResponsePromise;
  if (authResponse.status() !== 200) {
    throw new Error(`Local Supabase password sign-in failed with HTTP ${authResponse.status()}`);
  }
  return authResponse;
}

async function main() {
  if (!WEB_ORIGIN || !API_ORIGIN || !SUPABASE_LOCAL_URL || !SUPABASE_LOCAL_ANON_KEY) {
    throw new Error('Local service URLs and the public anon key must be present.');
  }

  let rejectCurrentUserRequest = false;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.route(`${API_ORIGIN}/v1/me`, async (route) => {
      if (!rejectCurrentUserRequest || route.request().method() !== 'GET') {
        await route.continue();
        return;
      }

      // Simulate the API rejecting an expired/invalidated session. The first sign-in
      // below reaches the real API with the real Supabase-issued access token.
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': WEB_ORIGIN,
          'access-control-allow-methods': 'GET, HEAD, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
        },
        body: JSON.stringify({
          error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' },
        }),
      });
    });

    await page.goto(`${WEB_ORIGIN}/`);
    await page.waitForURL(/\/login\/?$/);
    await waitForVisible(page.getByRole('heading', { name: 'YEAR95' }), 'login page');

    await signIn(page);
    await page.waitForURL(`${WEB_ORIGIN}/`, { timeout: 20_000 });
    await waitForVisible(page.getByRole('heading', { name: 'Visão geral' }), 'protected dashboard');
    await waitForVisible(page.getByText('Saúde da API', { exact: true }), 'API health card');
    await waitForVisible(page.getByText('Online', { exact: true }), 'API reports online');
    await waitForVisible(
      page.getByText('Readiness do banco', { exact: true }),
      'database readiness card',
    );
    await waitForVisible(page.getByText('Pronto', { exact: true }), 'database reports ready');
    await waitForVisible(
      page.getByText('Usuário autenticado', { exact: true }),
      'API-verified user card',
    );
    await waitForVisible(page.getByText(SMOKE_EMAIL, { exact: true }), 'API-verified user email');
    console.log('PASS: real local Supabase password sign-in returned HTTP 200.');
    console.log('PASS: protected dashboard verified API health, PostgreSQL readiness and /v1/me.');

    await page.getByRole('button', { name: 'Sair' }).click();
    await page.waitForURL(/\/login\/?$/);
    await waitForVisible(page.getByRole('heading', { name: 'YEAR95' }), 'post-logout login');
    await page.goto(`${WEB_ORIGIN}/`);
    await page.waitForURL(/\/login\/?$/);
    console.log('PASS: logout clears the browser session and the protected route redirects to login.');

    rejectCurrentUserRequest = true;
    await signIn(page);
    await page.waitForURL(/\/login\/?$/, { timeout: 20_000 });
    await waitForVisible(
      page.getByRole('status').filter({ hasText: 'Sua sessão expirou. Entre novamente' }),
      'session-expired banner after API rejects the authenticated request',
    );
    await waitForVisible(page.getByLabel('E-mail'), 'login form after rejected session');
    console.log(
      'PASS: an API 401 clears the Auth session and returns the user to login with the expiry notice.',
    );
    console.log(
      'NOTE: expiry UI is tested using an explicit API 401; the test does not wait for a wall-clock JWT expiration.',
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Local Auth smoke test failed.');
  process.exitCode = 1;
});
