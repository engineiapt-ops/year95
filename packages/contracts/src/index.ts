export const DEFAULT_SYMBOL = "BTCUSDT" as const;

export const TIMEFRAMES = ["1h", "4h", "1d"] as const;

export type Symbol = typeof DEFAULT_SYMBOL;
export type Timeframe = (typeof TIMEFRAMES)[number];

export type Side = "BUY" | "SELL" | "WAIT";

export interface OhlcvCandle {
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface MarketDataProvenance {
  readonly provider: string;
  readonly instrument: Symbol;
  readonly timeframe: Timeframe;
  readonly retrievedAt: number;
  readonly sourceTimestamp: number;
  readonly verified: boolean;
}

export interface MarketSnapshot {
  readonly instrument: Symbol;
  readonly timeframe: Timeframe;
  readonly candles: readonly OhlcvCandle[];
  readonly dataAsOf: number;
  readonly provenance: MarketDataProvenance;
}

export interface DecisionEvidence {
  readonly code: string;
  readonly message: string;
  readonly value?: number;
}

export interface DecisionSnapshot {
  readonly side: Side;
  readonly confidence: number;
  readonly timestamp: number;
  readonly dataAsOf: number;
  readonly engineVersion: string;
  readonly evidence: readonly DecisionEvidence[];
}

export interface RiskPolicy {
  readonly positionNotionalPct: number;
  readonly riskPerTradePct: number;
  readonly hardMaxRiskPct: number;
  readonly minRiskReward: number;
}
