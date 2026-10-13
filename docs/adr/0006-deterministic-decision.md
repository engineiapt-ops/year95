# ADR-0006 — Deterministic Decision (D1)

- **Status:** Accepted
- **Date:** 2026-10-13
- **Scope:** deterministic decision authority; no new runtime feature is introduced by this ADR.

## Decision

YEAR95's quantitative decision path is authoritative and deterministic. The engine consumes explicit, validated inputs and injected threshold policy. The decision engine must not hide tunable decision thresholds in global configuration or rely on a fixed legacy probability toggle: thresholds are validated and injected at the decision boundary in the decision-engine implementation work (#022).

JEV is excluded from the MVP decision authority. Any future JEV integration can only be an optional, audited signal source. It cannot override quantitative eligibility, change the side, bypass risk, alter sizing, or authorize execution.

AI is advisory only. It may explain a deterministic outcome or supply contextual research, but it cannot modify the quantitative decision, thresholds, risk limits, position sizing, or permission to execute.

## Consequences

- Decision inputs and threshold policy are explicit and testable.
- Threshold validation and out-of-sample freezing remain required contracts.
- Risk controls and a failed/invalid data state always win over advisory information.
- Static legacy controls such as `DECISION_MIN_PROBABILIDADE` and `DECISION_BLOQUEAR_RISCO_ELEVADO` do not belong in shared runtime configuration.
- Later changes to threshold semantics must update the relevant contract tests and ADR rather than silently changing global defaults.

## Related references

- [Project Contract](../PROJECT-CONTRACT.md)
- [Behavior Contracts](../BEHAVIOR-CONTRACTS.md)
- [ADR-0005 — Sizing Semantics](0005-sizing-semantics.md)
