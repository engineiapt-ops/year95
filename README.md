# YEAR95 — AI Financial Intelligence

YEAR95 is a multi-user financial intelligence platform focused on deterministic market analysis and paper-trading signals.

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

## Foundation

The repository uses npm workspaces with Node 22. TypeScript is compiled per workspace and the domain remains independent of infrastructure.

The current implementation contains only contracts and configuration foundations. Runtime services, database access and provider adapters are introduced in later milestones.

## Configuration

Runtime configuration is read at the application boundary. Secrets are never committed; use .env.example as the variable reference.

The configuration package does not perform I/O and accepts an explicit environment map, which keeps configuration deterministic and testable.

## Current status

This repository starts from a clean foundation. The legacy ai-financial-analyst repository is reference-only.
