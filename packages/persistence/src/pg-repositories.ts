import type {
  AllowlistRepository, HealthRepository, Instrument, InstrumentRepository,
} from "@year95/contracts";
import type { PgQueryable } from "./pg-pool.js";

interface InstrumentRow {
  symbol: string;
  display_name: string;
  asset_class: Instrument["assetType"];
  venue: Instrument["venue"];
  base_currency: string;
  quote_currency: string;
  enabled: boolean;
  data_provider: string;
  metadata_status: Instrument["metadataStatus"];
  metadata_source: string;
  min_order_size: string | null;
  max_order_size: string | null;
  leverage: string | null;
  margin_percent: string | null;
  spread: string | null;
  overnight_financing: string | null;
  commission: string | null;
  trading_hours: string | null;
}
function mapInstrument(row: InstrumentRow): Instrument {
  return {
    symbol: row.symbol, displayName: row.display_name, assetType: row.asset_class,
    venue: row.venue, baseCurrency: row.base_currency, quoteCurrency: row.quote_currency,
    enabled: row.enabled, dataProvider: row.data_provider, metadataStatus: row.metadata_status,
    metadataSource: row.metadata_source, minOrderSize: row.min_order_size,
    maxOrderSize: row.max_order_size, leverage: row.leverage, marginPercent: row.margin_percent,
    spread: row.spread, overnightFinancing: row.overnight_financing,
    commission: row.commission, tradingHours: row.trading_hours,
  };
}
const instrumentColumns = `symbol, display_name, asset_class, venue, base_currency, quote_currency,
 enabled, data_provider, metadata_status, metadata_source, min_order_size, max_order_size,
 leverage, margin_percent, spread, overnight_financing, commission, trading_hours`;

export class PgInstrumentRepository implements InstrumentRepository {
  constructor(private readonly db: PgQueryable) {}
  async listEnabled(): Promise<readonly Instrument[]> {
    const result = await this.db.query<InstrumentRow>(
      `SELECT ${instrumentColumns} FROM public.instruments WHERE enabled = TRUE ORDER BY symbol`,
    );
    return result.rows.map(mapInstrument);
  }
  async findBySymbol(symbol: string): Promise<Instrument | null> {
    const result = await this.db.query<InstrumentRow>(
      `SELECT ${instrumentColumns} FROM public.instruments WHERE symbol = $1 LIMIT 1`, [symbol],
    );
    const row = result.rows[0];
    return row ? mapInstrument(row) : null;
  }
}

export class PgAllowlistRepository implements AllowlistRepository {
  constructor(private readonly db: PgQueryable) {}
  async isAllowed(email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    const result = await this.db.query<{ allowed: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM public.allowed_emails WHERE email = $1) AS allowed",
      [normalized],
    );
    return result.rows[0]?.allowed === true;
  }
}

export class PgHealthRepository implements HealthRepository {
  constructor(private readonly db: PgQueryable) {}
  async isDatabaseReady(): Promise<boolean> {
    try {
      await this.db.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
}
