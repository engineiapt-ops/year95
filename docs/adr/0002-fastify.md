# ADR 0002 — Fastify API

- Status: Approved — maintainer approval recorded 2026-10-08
- Date: 2026-10-08

## Context

YEAR95 needs a backend transport boundary that stays independent from domain logic and persistence details.

## Decision

The backend HTTP application uses Fastify.

Request and response validation belongs at the transport boundary, using zod contracts. Domain and quantitative code must not depend on Fastify, PostgreSQL clients or external HTTP libraries.

## Consequences

Fastify remains an application-layer concern while the domain stays transport-agnostic. Validation failures can be translated into safe API responses without placing business rules inside HTTP handlers.

## Rejected alternatives

Framework-specific domain code and Express-style runtime coupling were rejected because the project contract requires explicit application boundaries.
