# ADR 0003 — Supabase Auth

- Status: Approved — maintainer approval recorded 2026-10-08
- Date: 2026-10-08

## Context

YEAR95 is multi-user from the start and requires authenticated, owner-scoped access.

## Decision

Supabase Auth is the identity provider.

The backend validates the Supabase-issued JWT and carries the authenticated user identity into application services and owner-scoped persistence. RLS is defense in depth, not the sole authorization boundary.

The browser never receives database service-role credentials or broker secrets.

The public PostgreSQL roles `anon` and `authenticated` must not have direct application-table, sequence or function privileges.

## Consequences

Identity is standardized at the application boundary while persistence authorization remains explicit and testable.

## Rejected alternatives

Anonymous ownership, browser-side database service credentials and RLS-only authorization were rejected because they weaken application-level authorization guarantees.
