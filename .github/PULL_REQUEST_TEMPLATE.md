## Scope

- [ ] This PR matches the declared scope.
- [ ] No unrelated implementation was added.

## Contract and safety

- [ ] Paper trading only.
- [ ] Deterministic quantitative decision remains authoritative.
- [ ] Invalid/stale/unvalidated inputs fail closed.
- [ ] Risk remains <= 1% per trade and R:R remains >= 1:2.
- [ ] Only closed candles enter decisions.
- [ ] No secrets are exposed to the browser.
- [ ] No Vercel dependency was introduced.
- [ ] No destructive database migration was introduced.

## Legacy compatibility

- [ ] Legacy behavior/reference files are identified.
- [ ] Relevant behavior contracts and golden values are documented or tested.
- [ ] Any behavior change is explicitly declared.

## Architecture

- [ ] Domain/application boundaries are preserved.
- [ ] Persistence/provider concerns remain behind their boundaries.
- [ ] Configuration is injected rather than read from environment at module import.

## Validation

- [ ] Typecheck
- [ ] Lint
- [ ] Architecture
- [ ] Unit
- [ ] Contract
- [ ] Integration
- [ ] Build

## ADR

- [ ] Required ADR updated/added.
- [ ] Maintainer approval recorded where required.

## Notes

<!-- Add evidence, known limitations, and follow-up issues here. -->
