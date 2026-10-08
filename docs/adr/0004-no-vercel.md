# ADR 0004 — No Vercel Runtime Dependency

- Status: Approved — maintainer approval recorded 2026-10-08
- Date: 2026-10-08

## Context

YEAR95 must remain portable across the chosen deployment boundaries and must not make product behavior depend on a specific platform's proprietary runtime services.

## Decision

YEAR95 has no runtime dependency on Vercel.

Vercel OIDC, Vercel AI Gateway, Vercel runtime APIs and Vercel cron are not part of the product architecture.

The intended deployment targets are Render for the API and Cloudflare Pages for the web application.

## Consequences

The application remains deployable without Vercel-specific credentials, runtime APIs or scheduling semantics.

## Rejected alternatives

Embedding Vercel platform services into core application behavior was rejected because it would violate infrastructure independence.
