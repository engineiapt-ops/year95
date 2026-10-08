# YEAR95 — AI Financial Intelligence

YEAR95 is a multi-user financial intelligence platform built around deterministic quantitative analysis and paper-trading signals.

## Repository structure

- apps/api — Fastify API
- apps/web — React/Vite web application
- apps/worker — background processing
- packages/contracts — shared contracts and DTOs
- packages/domain — pure domain model
- packages/quant — deterministic quantitative features
- packages/risk — risk and sizing
- packages/market-data — market-data contracts and adapters
- packages/decision — deterministic decision engine
- packages/paper-trading — paper signal lifecycle
- packages/ai — advisory AI boundary
- packages/persistence — persistence ports and implementations
- packages/evaluation — evaluation and validation
- packages/backtest — backtesting
- packages/research — research services
- packages/portfolio — portfolio logic
- packages/providers — external provider mappings
- packages/config — application configuration

## Project contract

The normative project contract is documented before runtime implementation:

- [Project Contract](docs/PROJECT-CONTRACT.md)
- [Migration Matrix](docs/MIGRATION-MATRIX.md)
- [Behavior Contracts](docs/BEHAVIOR-CONTRACTS.md)
- [Architecture Decision Records](docs/adr/)

These documents define the non-negotiable guardrails for subsequent implementation PRs.

## Foundation

YEAR95 is a pnpm monorepo targeting Node 22 with TypeScript strict mode. Domain logic remains independent of HTTP, PostgreSQL and external provider details.

The foundation milestone formalizes contracts and governance only. Runtime services, database repositories and provider adapters are introduced in later milestones.

## Configuration

Runtime configuration is injected at application boundaries. Secrets are never committed. The configuration boundary must remain deterministic and testable.

## Legacy

The legacy `ai-financial-analyst` repository is reference-only. Its behavior and schema are used to recover contracts and golden values; legacy code is not copied in bulk into YEAR95.

## Current status

The repository is being rebuilt incrementally from the approved project contract. Each PR is limited to its declared scope.
