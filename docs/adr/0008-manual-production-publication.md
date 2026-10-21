# ADR-0008 — Manual Production Publication

- **Status:** Accepted
- **Date:** 2026-10-21
- **Scope:** release workflow and deployment targets; no application-domain or database-schema behavior changes.

## Context

The maintainer confirmed that the Supabase project at `https://dhvigrzfjipshubcbuaa.supabase.co` is the existing production database. Recreating a separate Supabase project or treating the current project as staging would add delay and would not reflect the deployed reality.

The existing Render API service is `year95-api-staging` at `https://year95-api-staging.onrender.com`, service ID `srv-db4il4ad0e5s73cg78g0`. Its historical name is not the environment designation for this release. The existing Cloudflare Pages target is project `year95-web`, served at `https://year95-web.pages.dev`.

## Decision

1. Treat the confirmed Supabase URL and the existing Render and Cloudflare Pages targets above as the production targets for the release workflow. Do not create duplicate infrastructure merely to remove historical staging names.
2. Production publication is manual only. The workflow is triggered by `workflow_dispatch`, requires the full SHA of current `main` and the exact confirmation `publish-production`, and validates the latest successful `.github/workflows/ci.yml` push run for that SHA.
3. Keep `validate` and `publish` as separate jobs. The `publish` job depends on successful validation and references the protected GitHub Environment `production`. Environment approval settings must be configured in GitHub; declaring an environment in YAML alone does not require review.
4. After approval, recheck the release SHA and CI, validate all required production variables and secrets before provider calls, deploy the exact commit to the existing Render service, wait for the service to be live and `/ready` to report readiness, then deploy the web bundle to the existing Cloudflare Pages project and run the production smoke test.
5. The production publication workflow must not run or call database migrations, reference `STAGING_DATABASE_URL_MIGRATE`, or read any `DATABASE_URL` secret. The existing `.github/workflows/staging-migrations.yml` workflow remains unchanged and is outside this ADR's release path; its actual target must be verified from environment configuration before anyone runs it.
6. Keep all private database connection strings, Supabase service-role keys, Render API keys and Cloudflare API tokens out of source control and out of the browser. Only the public Supabase URL and anon key may be used in the web build.

## Consequences and safeguards

- Production deployment no longer follows automatically from a successful CI run. A maintainer must explicitly dispatch a reviewed release.
- The existing resources and production database are preserved; this decision authorizes no migration, schema change, or infrastructure creation.
- Use a dedicated production smoke-test account, not a real user's credentials. The post-deploy smoke checks API readiness and authenticated dashboard access.
- Before enabling the release path, confirm Cloudflare Pages is not independently auto-publishing `main`; this workflow alone cannot disable provider-side Git integration deployments.
- Render and Cloudflare publication is sequential rather than transactional. If Render succeeds but Pages publication or smoke testing fails, stop and review the deployed versions before taking a separately approved recovery action. Do not run migrations as an automatic recovery step.

## Alternatives rejected

- **Create a new staging Supabase project:** rejected because the maintainer confirmed the existing project is production and requested continuity.
- **Deploy automatically after CI:** rejected in favor of an explicit manual release with SHA freshness and environment approval.
- **Run migrations as part of publishing:** rejected to preserve the existing database and keep schema changes independently reviewed.
