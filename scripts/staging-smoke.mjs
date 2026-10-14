import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const WEB_URL = requiredHttpsOrigin('STAGING_WEB_URL');
const API_URL = requiredHttpsOrigin('STAGING_API_URL');
const SUPABASE_URL = requiredHttpsOrigin('STAGING_SUPABASE_URL');
const SUPABASE_ANON_KEY = requiredEnv('STAGING_SUPABASE_ANON_KEY');
const TEST_EMAIL = requiredEnv('STAGING_AUTH_TEST_EMAIL');
const TEST_PASSWORD = requiredEnv('STAGING_AUTH_TEST_PASSWORD');
const PLAYWRIGHT_MODULE = requiredEnv('PLAYWRIGHT_MODULE');

async function main() {
  await verifyReadiness();

  const { chromium } = await import(pathToFileURL(PLAYWRIGHT_MODULE).href);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);

    const currentUserStatuses = [];
    page.on('response', (response) => {
      try {
        const url = new URL(response.url());
        if (url.origin === API_URL && url.pathname === '/v1/me') {
          currentUserStatuses.push(response.status());
        }
      } catch {
        // Ignore non-HTTP response URLs in diagnostics.
      }
    });

    page.on('requestfailed', (request) => {
      try {
        const url = new URL(request.url());
        if (url.origin === API_URL) {
          console.error(
            `Staging browser request failed: ${request.method()} ${url.pathname} (${request.failure()?.errorText ?? 'unknown'})`,
          );
        }
      } catch {
        // Do not print unparsed or potentially credential-bearing URLs.
      }
    });

    await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('E-mail').fill(TEST_EMAIL);
    await page.getByLabel('Senha').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await page.getByRole('heading', { name: 'Visão geral' }).waitFor({ state: 'visible' });
    await page.getByText('Online', { exact: true }).waitFor({ state: 'visible' });
    await page.getByText('Pronto', { exact: true }).waitFor({ state: 'visible' });
    await page.getByText(TEST_EMAIL, { exact: true }).waitFor({ state: 'visible' });

    assert.ok(
      currentUserStatuses.includes(200),
      'Dashboard must successfully call the staging API authenticated /v1/me route',
    );

    console.log('PASS: public staging GET /ready reports ready=true');
    console.log('PASS: public staging browser login reaches dashboard with live API and identity cards');
  } finally {
    await browser.close();
  }
}

async function verifyReadiness() {
  let response;
  try {
    response = await fetch(`${API_URL}/ready`, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error('Staging API /ready could not be reached');
  }

  assert.equal(response.status, 200, 'Staging API /ready must return HTTP 200');
  const body = await response.json();
  assert.equal(body.ready, true, 'Staging API /ready must report ready=true');
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required deployment smoke variable is missing: ${name}`);
  return value;
}

function requiredHttpsOrigin(name) {
  const value = requiredEnv(name);
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', `${name} must use HTTPS`);
  assert.equal(url.username, '', `${name} must not contain URL credentials`);
  assert.equal(url.password, '', `${name} must not contain URL credentials`);
  assert.equal(url.pathname, '/', `${name} must be an origin without a path`);
  assert.equal(url.search, '', `${name} must not contain a query string`);
  assert.equal(url.hash, '', `${name} must not contain a fragment`);
  return url.origin;
}

main().catch((error) => {
  console.error(`STAGING SMOKE FAILED: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
