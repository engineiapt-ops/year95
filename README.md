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

## Architecture boundary

The domain package must remain independent of infrastructure. Database drivers and HTTP clients belong in adapters, not in the domain or deterministic decision core.

## Current status

This repository starts from a clean foundation. The legacy ai-financial-analyst repository is reference-only.

The initial foundation gate validates repository structure and package boundaries without introducing runtime features.
