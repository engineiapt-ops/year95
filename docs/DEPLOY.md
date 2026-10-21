# Production deployment

## Production targets

The maintainer confirmed that the Supabase project at `https://dhvigrzfjipshubcbuaa.supabase.co` is the production database. Do not create a second Supabase project just to preserve a historical environment label.

The existing Render API service is the production target for this release:

- Service ID: `srv-db4il4ad0e5s73cg78g0`
- Existing service name: `year95-api-staging`
- Public API origin: `https://year95-api-staging.onrender.com`
- Runtime: Docker, using `apps/api/Dockerfile` from the repository root
- Branch: `main`
- Automatic Render deploys: disabled
- Health check: `/ready`
- Region: Frankfurt

The existing Cloudflare Pages target is project `year95-web` at `https://year95-web.pages.dev`. The Render service's `staging` name is historical nomenclature; for this release, its target role is production.

### Render API runtime configuration

Before the first controlled production release, inspect the existing Render service's **Environment** page. Keep the database connection server-side and do not paste or send its value in chat. Confirm these runtime settings point at the same production Supabase project:

| Render environment variable | Required value or check                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Existing PostgreSQL connection string for the confirmed production Supabase project; verify its database host/pooler project reference matches `dhvigrzfjipshubcbuaa` without copying the string elsewhere |
| `SUPABASE_URL`              | `https://dhvigrzfjipshubcbuaa.supabase.co`                                                                                                                                                                 |
| `SUPABASE_JWKS_URL`         | `https://dhvigrzfjipshubcbuaa.supabase.co/auth/v1/.well-known/jwks.json`                                                                                                                                   |
| `SUPABASE_JWT_ISSUER`       | `https://dhvigrzfjipshubcbuaa.supabase.co/auth/v1`                                                                                                                                                         |
| `CORS_ORIGINS`              | Exactly `https://year95-web.pages.dev`, with no trailing slash or extra origins unless explicitly reviewed                                                                                                 |
| `DATABASE_CA_CERT_PEM`      | Keep the full database root CA PEM only if required by the selected connection's TLS chain; follow [Database deployment and SSL](DEPLOY-DB.md)                                                             |

Also confirm the service remains on branch `main`, automatic Render deploys are disabled, and health check path is `/ready`. Do not change the database connection or other existing service variables as part of this workflow PR; correct a mismatch only under a separately reviewed operational change.

This document describes the manual production release path. It replaces the older instructions that required creating a separate staging Supabase project. It does not authorize infrastructure creation, production migrations, or database schema changes.

## Production environment configuration

Configure these under **GitHub → Settings → Environments → production**. The workflow checks that every required value is present before contacting Render or Cloudflare.

### Variables

| Variable                        | Value/source                                                   |
| ------------------------------- | -------------------------------------------------------------- |
| `PRODUCTION_API_URL`            | Existing Render API origin shown above                         |
| `PRODUCTION_WEB_URL`            | `https://year95-web.pages.dev`                                 |
| `PRODUCTION_SUPABASE_URL`       | `https://dhvigrzfjipshubcbuaa.supabase.co`                     |
| `PRODUCTION_SUPABASE_ANON_KEY`  | Public anon key from the confirmed production Supabase project |
| `PRODUCTION_AUTH_TEST_EMAIL`    | Dedicated production smoke-test account                        |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | `year95-web`                                                   |
| `CLOUDFLARE_ACCOUNT_ID`         | Account ID for the intended production Pages project           |
| `RENDER_SERVICE_ID`             | `srv-db4il4ad0e5s73cg78g0`                                     |

### Secrets

| Secret                          | Value/source                                                  |
| ------------------------------- | ------------------------------------------------------------- |
| `PRODUCTION_AUTH_TEST_PASSWORD` | Password for the dedicated production smoke-test account      |
| `CLOUDFLARE_API_TOKEN`          | Token scoped to deploy the selected Pages project             |
| `RENDER_API_KEY`                | Render API key with permission to deploy the existing service |

Never commit values for these entries to the repository or send them in chat. The API's database connection configuration remains server-side in Render; this workflow must not receive a PostgreSQL connection string, a Supabase service-role key, or any other database credential.

The only Supabase values passed to the frontend build are the public URL and anon key. The web bundle scan validates that only the allowlisted public Vite inputs and anon-role JWTs are present.

### Required approval protection

In **Settings → Environments → production**, configure a required reviewer before using the publication workflow. GitHub does not create an approval gate merely because a job declares `environment: production`.

Only the `publish` job references the protected environment, so validation does not ask for production credentials or create a second approval prompt. After the single publication approval, the job validates all 11 required configuration values and checks the pinned production destinations before making any provider API call. If the repository owner is the only person able to approve, do not enable the option that prevents the workflow initiator from approving their own run; otherwise publication can become impossible to approve. This is an explicit approval gate, not independent two-person review.

Use a dedicated production test account, not a real user's credentials. The account must already be able to authenticate and access the dashboard. The smoke test does not create users or change the database.

Before enabling manual-only releases, also verify in the Cloudflare dashboard that Pages is not independently auto-publishing `main` through a provider-side Git integration. The GitHub workflow cannot turn off a separate Cloudflare deployment mechanism.

## Manual release procedure

The workflow in `.github/workflows/deploy.yml` is manual-only. It must not be triggered by `push`, `pull_request`, or `workflow_run`.

1. Merge the reviewed release PR into `main` after its structural test and full CI both pass.
2. Wait for the `.github/workflows/ci.yml` run for the resulting exact `main` commit to finish successfully.
3. Open **Actions → Production deploy → Run workflow**, select `main`, and copy the full 40-character lowercase SHA currently at the head of `main` into `confirmed_sha`.
4. Enter exactly `publish-production` in `confirm_production`.
5. The `validate` job checks the confirmation, SHA format and equality, current `main` HEAD, the latest successful CI push run for that SHA, and the workflow's structural guard.
6. After validation succeeds, approve the protected `production` environment when GitHub prompts for approval. The `publish` job then rechecks the SHA and CI, validates all required configuration values, and rechecks freshness again immediately before requesting the Render deploy.
7. The workflow deploys the validated commit to Render, waits for Render status `live`, requires `GET /ready` to return HTTP 200 with `ready: true`, deploys `apps/web/dist` to Cloudflare Pages, and runs the browser smoke test.

Any missing value, incorrect destination, stale SHA, unsuccessful or missing CI run, failed deployment, or failed readiness check blocks subsequent steps. Do not bypass a gate or manually deploy an older SHA.

## Database and migration boundaries

This release workflow never applies database migrations, changes the schema, or writes to the migration ledger. The API deployment does not run a migration command as part of container startup. No database URL secret may be referenced from `.github/workflows/deploy.yml`.

The existing `.github/workflows/staging-migrations.yml` workflow remains unchanged and is outside this release path. Do not infer its database target from its filename or run it as part of a production deploy. Before any future migration, explicitly verify the environment's configured connection target, review the proposed additive migration, and obtain separate approval. Database baseline files `001–023` remain immutable; future migrations `024+` are forward-only and additive under the project contract.

## Post-deploy smoke and recovery

The smoke script `scripts/deployment-smoke.mjs` verifies that the production login page is reachable, `GET /ready` returns HTTP 200 with `ready: true`, the dedicated test account can sign in, the dashboard health/readiness cards appear, and the authenticated `/v1/me` route returns HTTP 200. It does not print the test password or access token.

Render and Cloudflare publication is sequential rather than transactional. If Render deployment succeeds but the Cloudflare publication or browser smoke test fails, stop and inspect the deployed versions before taking a separately reviewed recovery action. Do not use a database migration as an automatic recovery step.

## Costs and limits

The current Render service reports the free plan. Free services can spin down while idle and delay readiness. The workflow waits up to 30 minutes for the Render deployment. API readiness retries run for about 10 minutes when responses return quickly and can take up to 20 minutes when each request reaches its 15-second timeout. Review provider dashboards for current limits and account-specific billing before changing service plans or enabling paid infrastructure.
