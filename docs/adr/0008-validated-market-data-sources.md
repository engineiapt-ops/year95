# ADR-0008 — Explicit Validation of Market-Data Sources

- **Status:** Accepted
- **Date:** 2026-10-28
- **Scope:** shared provider/instrument validation, market-data persistence and future quantitative decision entrypoints.

## Context

A provider adapter having an identifier or being registered does not prove that the provider or its instrument mapping has been validated. The project contract requires invalid data, stale data, an unvalidated provider, or an unvalidated provider/instrument mapping to produce no executable signal. Persistence must not infer approval from a non-empty provider string or couple its behavior to a particular vendor.

## Decision

- Provider identity and instrument mapping are separate from vendor-specific adapter implementations.
- A provider/instrument pair is usable only when an injected shared `MarketDataSourceValidator` explicitly approves it. Unknown and disabled pairs fail closed; there is no default trust.
- Persistence validates the provider/instrument pair before database access and scopes reads to the requested approved provider. It remains provider-neutral and contains no Binance- or Saxo-specific branching.
- Provider adapters report their stable provider identity and normalize source responses. They do not self-authorize a mapping merely by existing or being registered.
- The canonical provider identity for the currently approved Binance Spot BTCUSDT source is `binance-spot`, matching the existing validation and persistence approval. `BinancePriceProvider.id` must use this exact value; the alias `binance` is not an approved mapping and must not be used.
- Every future quantitative decision entrypoint must enforce this same validation contract before calculating or emitting a decision. The current repository does not yet contain a decision workflow to wire; this is a mandatory acceptance criterion for that workflow, not a claim that such integration already exists.
- New providers, including Saxo, require separately reviewed provider and instrument approvals and tests. A Saxo adapter being present in the legacy repository is not approval for YEAR95.

## Consequences

- Tests must reject unknown, disabled and mismatched provider/instrument pairs before persistence queries or writes.
- Adding a provider requires an explicit approval configuration and mapping validation; no silent fallback to another provider is allowed.
- This ADR does not authorize live trading, order routing, production database migration, or broker secrets in the browser.

## Related references

- [Project Contract](../PROJECT-CONTRACT.md)
- [Behavior Contracts](../BEHAVIOR-CONTRACTS.md)
- [Delivery Tracking](../DELIVERY-TRACKING.md)
