/** A provider/instrument pair explicitly approved for application use. */
export interface MarketDataSourceApproval {
  readonly providerId: string;
  readonly symbol: string;
  readonly status: 'validated' | 'disabled';
}

export interface MarketDataSourceValidator {
  assertValidated(providerId: string, symbol: string): void;
}

/**
 * Explicit allowlist for provider/instrument pairs. Registration alone is not
 * approval; only entries marked validated can pass. No source is trusted by default.
 */
export class MarketDataSourceRegistry implements MarketDataSourceValidator {
  private readonly approvals = new Map<string, MarketDataSourceApproval['status']>();

  constructor(approvals: readonly MarketDataSourceApproval[]) {
    for (const approval of approvals) {
      const providerId = approval.providerId.trim();
      const symbol = approval.symbol.trim().toUpperCase();
      if (!providerId || providerId.length > 100 || !symbol || symbol.length > 100) {
        throw new Error('Market-data approval requires a valid providerId and symbol');
      }
      const key = MarketDataSourceRegistry.key(providerId, symbol);
      if (this.approvals.has(key)) {
        throw new Error(`Duplicate market-data approval: ${providerId}/${symbol}`);
      }
      this.approvals.set(key, approval.status);
    }
  }

  assertValidated(providerId: string, symbol: string): void {
    const normalizedProvider = providerId.trim();
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedProvider || !normalizedSymbol) {
      throw new Error('Market-data provider and symbol are required for validation');
    }
    const status = this.approvals.get(MarketDataSourceRegistry.key(normalizedProvider, normalizedSymbol));
    if (status !== 'validated') {
      throw new Error(`Market-data source is not validated: ${normalizedProvider}/${normalizedSymbol}`);
    }
  }

  private static key(providerId: string, symbol: string): string {
    return `${providerId}\u0000${symbol}`;
  }
}
