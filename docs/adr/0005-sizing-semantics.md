# ADR 0005 — Sizing Semantics

- Status: Proposed — maintainer approval required
- Date: 2026-10-08

## Context

Legacy code distinguishes risk percentage from position notional, but its persistence vocabulary is Portuguese and contains ambiguous naming.

YEAR95 must establish unambiguous domain terminology before implementation begins.

## Decision

The mandatory domain names are:
- `riskPerTradePct`
- `stopDistancePct`
- `positionNotionalPct`

The hard maximum `riskPerTradePct` is 1%.

The baseline policy is:
- `riskPerTradePct`: 0.5% default;
- `positionNotionalPct`: 1.5% baseline;
- minimum risk/reward: 1:2.

Risk percentage and position notional percentage are not interchangeable.

The new domain must not introduce `sizePct` or equivalent ambiguous field names. Legacy Portuguese columns are translated only in `packages/persistence`.

## Consequences

Quantitative and risk contracts can express intent without relying on persistence vocabulary. Future persistence mappings can retain legacy column names without leaking them into the domain.

## Rejected alternatives

Using a single generic size field was rejected because it conflates capital exposure with loss risk and obscures the 1% hard cap.
