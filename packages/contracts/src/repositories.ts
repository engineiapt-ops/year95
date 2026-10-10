export interface Instrument {
  readonly symbol: string;
  readonly displayName: string;
  readonly assetType: "crypto_spot" | "cfd";
  readonly venue: "binance_spot" | "saxo" | "ig" | "xtb";
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  readonly enabled: boolean;
  readonly dataProvider: string;
  readonly metadataStatus: "verified" | "pending_broker_confirmation";
  readonly metadataSource: string;
  readonly minOrderSize: string | null;
  readonly maxOrderSize: string | null;
  readonly leverage: string | null;
  readonly marginPercent: string | null;
  readonly spread: string | null;
  readonly overnightFinancing: string | null;
  readonly commission: string | null;
  readonly tradingHours: string | null;
}
export interface InstrumentRepository {
  listEnabled(): Promise<readonly Instrument[]>;
  findBySymbol(symbol: string): Promise<Instrument | null>;
}
export interface AllowlistRepository {
  isAllowed(email: string): Promise<boolean>;
}
export interface HealthRepository {
  isDatabaseReady(): Promise<boolean>;
}
