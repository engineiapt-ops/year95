# YEAR95 — Project Contract

## 1. Product vision

YEAR95 — AI Financial Intelligence is a multiuser financial intelligence platform with closed registration (allowlist) for deterministic market analysis and paper-trading decisions.

The quantitative decision path is authoritative. AI can add explanation, research context and advisory narrative, but it can never change the quantitative decision, risk controls or execution permission.

## 2. Non-negotiable invariants

### 2.1 Paper trading only

YEAR95 is paper-trading only.

The platform must not:

- place real orders;
- route orders to live brokers or exchanges;
- promote a paper strategy to live automatically;
- expose broker secrets or privileged credentials to the browser.

### 2.2 Deterministic decision authority

The deterministic quantitative decision is authoritative.

AI is consultative only and must not:

- change side;
- change thresholds;
- change position sizing;
- authorize execution;
- bypass a risk block.

### 2.3 Fail closed

Invalid market data, stale market data, an unvalidated provider, or an unvalidated provider/instrument mapping must result in no executable signal.

A failure in an advisory component must never convert an invalid quantitative state into an executable decision.

### 2.4 Risk and sizing semantics

Risk per trade must be no greater than 1% of equity.

The mandatory domain names are:

- `riskPerTradePct`
- `stopDistancePct`
- `positionNotionalPct`

`sizePct` and other ambiguous sizing names are prohibited.

The minimum risk/reward ratio is 1:2.

Risk percentage and position notional percentage are separate concepts. The baseline sizing contract uses a 1.5% position-notional baseline and a 0.5% default risk-per-trade policy, while 1% remains a hard risk ceiling.

### 2.5 Closed candles only

Only closed candles may enter a trading decision.

Partial or still-forming candles must not influence an executable signal, risk decision or settlement result.

### 2.6 Idempotent paper decision identity

Paper decision persistence is idempotent on:

`(asset, timeframe, data_as_of, origin)`

The corresponding legacy database columns are `ativo`, `timeframe`, `data_as_of` and `origem`. Translation between the domain contract and legacy Portuguese column names belongs only in persistence.

### 2.7 Threshold governance

Thresholds used by out-of-sample validation must be frozen before OOS evaluation.

Frozen thresholds must be attributable to the validation run and must not be silently changed during OOS evaluation.

### 2.8 Audit history is append-only

Audit and evidence records are historical records.

They must be append-only from the application perspective and protected against UPDATE/DELETE mutation at the database boundary where the schema requires immutability.

### 2.9 Authentication and database public-role revocation

Supabase Auth is the identity provider.

The backend validates the authenticated JWT and carries the authenticated user identity into owner-scoped application services and repositories.

The PostgreSQL public roles `anon` and `authenticated` must not receive direct application-table, sequence or function privileges. Public execution privileges are revoked and future default privileges remain revoked.

### 2.10 No Vercel dependency

YEAR95 has no runtime dependency on Vercel.

Vercel OIDC, AI Gateway, Vercel runtime features and Vercel cron are not architectural requirements.

The intended deployment boundaries are:

- API: Render
- web: Cloudflare Pages

### 2.11 Database preservation and migration safety

Supabase PostgreSQL is preserved.

The database baseline `001–023` is immutable.

Future migrations `024+` are forward-only and additive. They must not use:

- `DROP` (except for the narrowly scoped CHECK replacement allowed by §2.11.1)
- `TRUNCATE`
- `RENAME`

Any required schema evolution must preserve existing data and semantics.

#### 2.11.1 Narrow exception: widening a CHECK constraint

A migration may use `DROP CONSTRAINT IF EXISTS` only to replace a constraint whose PostgreSQL type is `CHECK`, and only when all of the following conditions are met:

- The existing constraint is verified to be of type `CHECK`.
- The replacement definition widens or preserves the permitted value set; it must not restrict the existing set.
- The migration is verified not to invalidate any existing row.
- The migration includes an explicit justification and a reference to the divergence report that requires the replacement.

This exception authorizes no other `DROP` operation, object type, table, or constraint change. All other prohibitions on `DROP`, `TRUNCATE` and `RENAME` remain in force. The exception is proposed for human review in PR “Ampliar constraint de estratégia em benchmark_results (exceção ao contrato)” in response to the live-schema divergence documented by GitHub Actions run `38335232604`; it does not authorize applying that migration to Supabase before human approval.

### 2.12 Layer boundaries

The dependency direction is:

`domain <- quant/risk/decision <- application <- apps`

Only persistence and provider adapters may touch PostgreSQL or external HTTP.

The domain and quantitative layers must not depend on database clients, HTTP transports or broker SDKs.

### 2.13 Configuration injection

Configuration is explicit and injected.

Application code must use `loadConfig(env)` or an equivalent explicit configuration boundary. Modules must not read `process.env` during import evaluation, and mutable global configuration state is prohibited.

## 3. Initial scope

The first product milestones cover:

1. authentication;
2. API and web shells;
3. BTCUSDT market data;
4. 1h, 4h and 1d timeframes;
5. deterministic quantitative features and decision logic;
6. risk and sizing;
7. paper signal lifecycle and outcomes;
8. advisory AI after the deterministic core is stable.

The first market-data source is public Binance market data. Provider-specific contracts remain behind provider adapters.

## 4. Prohibitions

The following are explicitly outside the product contract:

- real-money order execution;
- live order routing;
- automatic paper-to-live promotion;
- AI override of quantitative decisions;
- executable signals from stale, invalid or unvalidated data;
- use of open candles for decisions;
- browser-held database service-role credentials;
- browser-held broker secrets;
- destructive database migrations, except for the narrowly scoped CHECK replacement allowed by §2.11.1;
- Vercel-specific runtime dependencies;
- ambiguous sizing fields such as `sizePct`.

## 5. Legacy policy

The legacy `ai-financial-analyst` repository is a behavioral and schema reference.

Legacy source is consulted to extract:

- contracts;
- invariants;
- golden values;
- persistence semantics;
- compatibility requirements.

Legacy implementation is not copied as a bulk migration source.

## 6. Governance

Every implementation PR must:

- state its exact scope;
- preserve these invariants unless a behavior change is explicitly approved;
- add or update the relevant ADR when a material architecture decision is made;
- keep the repository quality gates green before advancing.

The detailed legacy evidence is recorded in [BEHAVIOR-CONTRACTS.md](BEHAVIOR-CONTRACTS.md).
