# ADR 0001 — Monorepo

- Status: Approved — maintainer approval recorded 2026-10-08
- Date: 2026-10-08

## Context

YEAR95 is rebuilt as a single repository containing deployable applications and independently testable packages.

The project contract requires pnpm, Node 22 and TypeScript strict mode.

## Decision

YEAR95 uses a pnpm monorepo with clear application/package boundaries. Domain code remains independent from infrastructure.

The repository structure is organized around:
- `apps/` for deployable applications;
- `packages/` for reusable domain, application and infrastructure contracts.

No runtime implementation is introduced by this ADR.

## Consequences

The monorepo supports shared contracts while making dependency direction explicit. Package-level boundaries can be enforced by architecture tooling in later implementation milestones.

## Rejected alternatives

A single application directory or a provider-driven code layout was rejected because it obscures domain boundaries and makes later extraction harder.
