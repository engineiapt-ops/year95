# Staging deployment

## Scope and safety

The first staging deploy uses a Docker web service on Render for the YEAR95 API and Cloudflare Pages for `apps/web`. The Render service has automatic deploys disabled. The `.github/workflows/deploy.yml` workflow is triggered only after the `CI` workflow completes successfully for a push to `main`; it checks that the tested SHA is still the current `main` SHA **and** that GitHub associates that exact commit with a closed, merged PR into `main`. Direct pushes to `main` are not deployed to staging, even when CI passes. The workflow deploys only the verified merge SHA, waits for deployment state `live` and API readiness, deploys the web bundle, and runs a public browser-login smoke test.

Database migrations are deliberately separate. They are only applied by manual dispatch of `.github/workflows/staging-migrations.yml` from `main`, after the GitHub Environment `staging-migrations` has been configured to require approval from a maintainer. A Render service startup and a normal deploy never apply migrations.

No environment-specific values or secrets belong in this repository. Do not add production database URLs, Supabase service-role keys, Render API keys, Cloudflare tokens, or test-account passwords to source control or to `VITE_*` variables.

The old Vercel configuration and `docs/DEPLOYMENT.md` are not part of this deployment path; the minimum staging setup does not port them.

## One-time infrastructure setup

### 1. Create a dedicated staging Supabase project

Use a separate staging project, never the production project. Obtain the project's URL, public anon key, and a PostgreSQL connection string that is reachable from GitHub-hosted runners. Prefer the direct endpoint or the Supabase session pooler on port 5432; do not use the transaction pooler on port 6543 for migrations.

Create one dedicated, confirmed email/password test user in staging Auth. Public signup remains disabled; the user is a pre-created test account. After the staging migrations have created `public.allowed_emails`, insert the same lowercase email into that table using the staging Supabase SQL Editor. Do not do this in production.

### 2. Configure GitHub Environments

In **Settings → Environments**, create two environments.

**Environment `staging`** — used by the automated deploy workflow. Add these _variables_:

| Variable                        | Meaning                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `STAGING_API_URL`               | Public Render API origin, e.g. `https://<service>.onrender.com`, with no trailing path |
| `STAGING_WEB_URL`               | Cloudflare Pages production origin, exactly `https://<project>.pages.dev`              |
| `STAGING_SUPABASE_URL`          | Dedicated staging Supabase URL                                                         |
| `STAGING_SUPABASE_ANON_KEY`     | Public staging anon key (it is intentionally included in the browser build)            |
| `STAGING_AUTH_TEST_EMAIL`       | Email of the pre-created, allowlisted staging test user                                |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Existing Cloudflare Pages project name; use lowercase letters, numbers, and hyphens    |
| `CLOUDFLARE_ACCOUNT_ID`         | Cloudflare account ID                                                                  |
| `RENDER_SERVICE_ID`             | Existing Render service ID: `srv-db4il4ad0e5s73cg78g0`                                 |

Add these _secrets_ to the same environment:

| Secret                       | Meaning                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| `RENDER_API_KEY`             | Render API key with permission to deploy the staging service                |
| `CLOUDFLARE_API_TOKEN`       | Cloudflare token with Pages edit/deploy permission for the selected account |
| `STAGING_AUTH_TEST_PASSWORD` | Password for the dedicated test account                                     |

The configured web URL must exactly match `CORS_ORIGINS` on Render. Keep the Pages project URL on `pages.dev` for this phase; a final custom domain is out of scope.

**Environment `staging-migrations`** — because this repository is public, GitHub's required-reviewer protection for environments is available on GitHub Free. In **Settings → Environments → staging-migrations**, add the repository owner as a required reviewer and require approval before the migration job can access its secret. With only one person who can approve, do not enable the option that prevents the workflow initiator from approving their own run; otherwise the migration job can become impossible to approve. This provides an explicit second confirmation, not independent two-person review.

Add this secret:

| Secret                         | Meaning                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `STAGING_DATABASE_URL_MIGRATE` | PostgreSQL connection string for the staging database only |

Merely declaring an environment in YAML does not enable an approval gate. Verify the required-reviewer rule in GitHub Settings before using the workflow. Do not put the production connection string into this environment.

### 3. Reconcile the existing Render API staging service

The connected Render workspace already contains a service named `year95-api-staging` at `https://year95-api-staging.onrender.com` (service ID `srv-db4il4ad0e5s73cg78g0`). At the time this PR was prepared, its Render configuration still used the Node runtime, branch `feat/api-runtime-render`, automatic commit deploys, and no `/ready` health check. **Do not create a duplicate service and do not treat that existing service as compliant yet.**

After the PR is merged, open the existing service in Render and reconcile it with this repository's `render.yaml` through Render Blueprint sync. Confirm that the existing resource is updated rather than duplicated, and verify the result explicitly:

- Runtime is Docker, using `apps/api/Dockerfile` with the repository root as Docker context.
- Connected branch is `main`.
- Automatic deploys are disabled (`autoDeployTrigger: off`).
- Health check path is `/ready`.
- Region remains Frankfurt and the existing public URL is retained.
- Plan and any cost-affecting change are reviewed before applying the sync.

If Render proposes creating a second service or cannot reconcile the existing service safely, stop and resolve that mismatch in the dashboard instead of applying it blindly.

Provide the requested `sync: false` values in Render's dashboard. Set:

- `DATABASE_URL`: staging PostgreSQL connection string.
- `SUPABASE_URL`: staging Supabase URL.
- `SUPABASE_JWKS_URL`: `<STAGING_SUPABASE_URL>/auth/v1/.well-known/jwks.json`.
- `SUPABASE_JWT_ISSUER`: `<STAGING_SUPABASE_URL>/auth/v1`.
- `CORS_ORIGINS`: the exact `STAGING_WEB_URL` origin, with no trailing slash.

The Blueprint also declares `DATABASE_CA_CERT_PEM` with `sync: false`. Fill it with the full certificate PEM only if the staging database requires a custom root CA; otherwise leave it empty. Keep the CA and database connection string server-side only.

The public staging database must be migrated before API readiness can pass. After the workflow files are on `main`, run the manual migration workflow as described below, with approval, before relying on the first deployment.

### 4. Provision Cloudflare Pages

Create an empty Cloudflare Pages project using the value selected for `CLOUDFLARE_PAGES_PROJECT_NAME`. The workflow builds `apps/web` from the repository root and uploads `apps/web/dist` using Wrangler. The frontend receives only the three public Vite inputs:

- `VITE_API_BASE_URL` = `STAGING_API_URL`
- `VITE_SUPABASE_URL` = `STAGING_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` = `STAGING_SUPABASE_ANON_KEY`

Never provide `DATABASE_URL`, a service-role key, Render credentials, or any private key as a `VITE_*` value.

## Manually applying staging migrations

1. Confirm that the workflow has been merged to `main`. Copy the exact 40-character HEAD SHA shown for `main` in GitHub after reviewing that commit.
2. Open **Actions → Staging database migrations → Run workflow**, select `main`, paste the SHA into `confirmed_sha`, enter the exact expected pending migration numbers (for a brand-new database, the current full set is `024,025,026,027,028,029`), and leave `dry_run` set to `true`. Enter `none` only if the staging database is already current.
3. Approve the `staging-migrations` environment and confirm the dry-run summary reports a matching SHA, successful PostgreSQL connectivity, and the expected pending set. A dry-run only performs connection and read-only ledger checks; it does not apply migration SQL.
4. Only after the dry-run passes, dispatch a **new run** with the same SHA and pending set, and explicitly set `dry_run` to `false` to apply migrations. The workflow rechecks that the SHA is still the current `main` HEAD; approve this run separately.
5. A maintainer must configure required reviewers for the `staging-migrations` environment before using either mode. In a public repository, verify the setting in GitHub **Settings → Environments**; merely declaring `environment:` in YAML does not enable approval. The SHA confirmation is an additional guard, not a substitute for environment approval.
6. The workflow validates forward-only migration files, checks the expected pending set read-only, runs the official repository migration runner only when `dry_run=false`, and verifies the migration ledger after an actual run. A mismatch fails closed before the runner starts. On failure, inspect the staging ledger before retrying.

Do not run migrations from the deploy workflow or as part of the API container startup. The production migration workflow remains separate and unchanged.

## Automated deployment and post-deploy smoke

After a push to `main`, the existing `CI` workflow must conclude with `success`. Only then can `Deploy staging` run. It verifies the SHA is still current and queries GitHub for a closed, merged PR whose base is `main` and whose `merge_commit_sha` exactly equals the CI SHA. Use squash merge for this PR; a regular merge commit should also satisfy the exact-SHA check. Avoid rebase merge, which may produce an SHA that does not match and block deployment. A direct push fails this check even if CI passes; stale workflow runs are skipped rather than deploying older code.

For the validated SHA, the workflow builds and secret-scans the web bundle, triggers the Render API deploy through the Render API, waits for Render's deploy status to become `live`, and requires `GET /ready` to return HTTP 200 with `ready: true`. It then deploys the web bundle to Cloudflare Pages and runs `scripts/staging-smoke.mjs` in Chromium.

The post-deploy smoke requires the public web URL to reach the login form, a successful login using the dedicated staging test account, the dashboard health/readiness cards, and an authenticated `/v1/me` response with HTTP 200. It never prints the test password or access token.

## Direct-push exceptions register

The repository is public and the repository owner has confirmed that they are currently the only person with write access. That reduces the number of actors but does not prevent an accidental direct push or enforce review on `main`. A CODEOWNERS file alone does not block a merge or push.

The free-plan deploy guard enforces a narrower guarantee: **a CI-green direct push still cannot deploy to staging**, because the exact commit must be the merge SHA of a closed, merged PR whose base is `main`. It does not stop a direct push from changing `main`, and it does not replace repository-level branch rules.

If a direct push to `main` occurs, do not bypass the deploy guard or manually deploy that SHA. Record it here with the date, full SHA, reason, and follow-up action; then restore the normal reviewed-PR path. The guard's failed workflow run and step summary also provide an audit trail.

| Date (UTC) | Direct-push SHA        | Reason and follow-up |
| ---------- | ---------------------- | -------------------- |
| —          | No exceptions recorded | —                    |

## Costs and limits

Cloudflare Pages has a free tier; Render's free service may spin down when idle, delaying readiness. The API readiness loop makes up to 40 requests, each with a 15-second request timeout and a 15-second delay between attempts. Its total duration can approach 20 minutes if every request times out (roughly 10 minutes when responses return quickly). The Render Blueprint uses the free plan for this minimal staging target. Confirm current plan limits and any account-specific billing terms in the providers' dashboards before provisioning. No final domain, worker, cron, WAF, or observability stack is included.

## Cloudflare Pages GitHub status check

Cloudflare Pages preview deployments are intentionally disabled for this project. As a result, GitHub push events for non-production branches can appear in Cloudflare's deployment list as skipped with reason `preview_deployments_disabled`. The associated “Cloudflare Pages” check may remain pending or appear non-successful even though no preview build is expected.

Treat this check as **informational, not a merge gate**. Do not re-enable automatic preview or production deployments just to make the check green. Review the actual required GitHub Actions checks instead: CI (typecheck, lint, architecture, unit, contract, integration, build), API Docker, and Local Supabase Auth Smoke. The Pages status does not replace any of these tests.

The Docker Hub login mitigates anonymous pull limits, but recent smoke logs still contain `toomanyrequests` responses even though `supabase start` and the browser smoke completed successfully. Do not treat the rate-limit warnings as resolved; if a future smoke fails on image pulls, investigate an image mirror or explicit cache rather than adding retries.

The only valid publication is a successful run of the `Deploy staging` workflow in `.github/workflows/deploy.yml`. That workflow uploads `apps/web/dist` using Wrangler only after successful CI for the exact current main merge commit and after the staging API readiness gate. A green or skipped Cloudflare Pages Git check does not mean that anything was published. Consider the controlled deployment path operationally proven only after a complete successful `Deploy staging` run, including the Cloudflare upload and post-deploy browser smoke test.

