# Staging deployment

## Scope and safety

The first staging deploy uses a Docker web service on Render for the YEAR95 API and Cloudflare Pages for `apps/web`. The Render service has automatic deploys disabled. The `.github/workflows/deploy.yml` workflow is triggered only after the `CI` workflow completes successfully for a push to `main`; it checks that the tested SHA is still the current `main` SHA, deploys that exact commit to Render, waits for deployment state `live` and API readiness, deploys the web bundle, and runs a public browser-login smoke test.

Database migrations are deliberately separate. They are only applied by manual dispatch of `.github/workflows/staging-migrations.yml` from `main`, after the GitHub Environment `staging-migrations` has been configured to require approval from a maintainer. A Render service startup and a normal deploy never apply migrations.

No environment-specific values or secrets belong in this repository. Do not add production database URLs, Supabase service-role keys, Render API keys, Cloudflare tokens, or test-account passwords to source control or to `VITE_*` variables.

The old Vercel configuration and `docs/DEPLOYMENT.md` are not part of this deployment path; the minimum staging setup does not port them.

## One-time infrastructure setup

### 1. Create a dedicated staging Supabase project

Use a separate staging project, never the production project. Obtain the project's URL, public anon key, and a PostgreSQL connection string that is reachable from GitHub-hosted runners. Prefer the direct endpoint or the Supabase session pooler on port 5432; do not use the transaction pooler on port 6543 for migrations.

Create one dedicated, confirmed email/password test user in staging Auth. Insert the same lowercase email into `public.allowed_emails` in the staging database. Do this only in staging. Public signup remains disabled; the user is a pre-created test account.

### 2. Configure GitHub Environments

In **Settings → Environments**, create two environments.

**Environment `staging`** — used by the automated deploy workflow. Add these *variables*:

| Variable | Meaning |
|---|---|
| `STAGING_API_URL` | Public Render API origin, e.g. `https://<service>.onrender.com`, with no trailing path |
| `STAGING_WEB_URL` | Cloudflare Pages production origin, exactly `https://<project>.pages.dev` |
| `STAGING_SUPABASE_URL` | Dedicated staging Supabase URL |
| `STAGING_SUPABASE_ANON_KEY` | Public staging anon key (it is intentionally included in the browser build) |
| `STAGING_AUTH_TEST_EMAIL` | Email of the pre-created, allowlisted staging test user |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Existing Cloudflare Pages project name; use lowercase letters, numbers, and hyphens |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `RENDER_SERVICE_ID` | Render service ID for `year95-api-staging` |

Add these *secrets* to the same environment:

| Secret | Meaning |
|---|---|
| `RENDER_API_KEY` | Render API key with permission to deploy the staging service |
| `CLOUDFLARE_API_TOKEN` | Cloudflare token with Pages edit/deploy permission for the selected account |
| `STAGING_AUTH_TEST_PASSWORD` | Password for the dedicated test account |

The configured web URL must exactly match `CORS_ORIGINS` on Render. Keep the Pages project URL on `pages.dev` for this phase; a final custom domain is out of scope.

**Environment `staging-migrations`** — configure **required reviewers** in GitHub Settings. Add the secret:

| Secret | Meaning |
|---|---|
| `STAGING_DATABASE_URL_MIGRATE` | PostgreSQL connection string for the staging database only |

Merely declaring an environment in YAML does not enable an approval gate. The maintainer must configure required reviewers on `staging-migrations` in GitHub. Do not put the production connection string into this environment.

### 3. Provision the Render API service

Create a Render Blueprint from the repository's `render.yaml`. It defines `year95-api-staging` using `apps/api/Dockerfile`, a free web-service plan, and a health check on `/ready`; `autoDeployTrigger: off` prevents Render from deploying automatically on Git commits.

Provide the requested `sync: false` values in Render's dashboard. Set:

- `DATABASE_URL`: staging PostgreSQL connection string.
- `SUPABASE_URL`: staging Supabase URL.
- `SUPABASE_JWKS_URL`: `<STAGING_SUPABASE_URL>/auth/v1/.well-known/jwks.json`.
- `SUPABASE_JWT_ISSUER`: `<STAGING_SUPABASE_URL>/auth/v1`.
- `CORS_ORIGINS`: the exact `STAGING_WEB_URL` origin, with no trailing slash.

If the remote database requires a custom root CA, also set `DATABASE_CA_CERT_PEM` in Render to the certificate PEM contents. Keep the CA and database connection string server-side only.

The public staging database must be migrated before API readiness can pass. After the workflow files are on `main`, run the manual migration workflow as described below, with approval, before relying on the first deployment.

### 4. Provision Cloudflare Pages

Create an empty Cloudflare Pages project using the value selected for `CLOUDFLARE_PAGES_PROJECT_NAME`. The workflow builds `apps/web` from the repository root and uploads `apps/web/dist` using Wrangler. The frontend receives only the three public Vite inputs:

- `VITE_API_BASE_URL` = `STAGING_API_URL`
- `VITE_SUPABASE_URL` = `STAGING_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` = `STAGING_SUPABASE_ANON_KEY`

Never provide `DATABASE_URL`, a service-role key, Render credentials, or any private key as a `VITE_*` value.

## Manually applying staging migrations

1. Confirm that the workflow has been merged to `main` and that `staging-migrations` has required reviewers configured.
2. Open **Actions → Staging database migrations → Run workflow**, select `main`, and enter the exact expected pending migration numbers (e.g. `024,025,026`). Enter `none` only if the staging database is already current.
3. A maintainer must approve the protected environment before the job can access `STAGING_DATABASE_URL_MIGRATE`.
4. The workflow validates the forward-only migration files, checks the expected pending set read-only, runs the official repository migration runner once, and verifies the migration ledger afterward. A mismatch fails closed before the runner starts. On failure, inspect the staging ledger before retrying.

Do not run migrations from the deploy workflow or as part of the API container startup. The production migration workflow remains separate and unchanged.

## Automated deployment and post-deploy smoke

After a push to `main`, the existing `CI` workflow must conclude with `success`. Only then can `Deploy staging` run. It also verifies that the successful CI SHA is still the current `main` SHA; stale workflow runs are skipped rather than deploying older code.

For the validated SHA, the workflow builds and secret-scans the web bundle, triggers the Render API deploy through the Render API, waits for Render's deploy status to become `live`, and requires `GET /ready` to return HTTP 200 with `ready: true`. It then deploys the web bundle to Cloudflare Pages and runs `scripts/staging-smoke.mjs` in Chromium.

The post-deploy smoke requires the public web URL to reach the login form, a successful login using the dedicated staging test account, the dashboard health/readiness cards, and an authenticated `/v1/me` response with HTTP 200. It never prints the test password or access token.

## Costs and limits

Cloudflare Pages has a free tier; Render's free service may spin down when idle, delaying readiness. The Render Blueprint uses the free plan for this minimal staging target. Confirm current plan limits and any account-specific billing terms in the providers' dashboards before provisioning. No final domain, worker, cron, WAF, or observability stack is included.
