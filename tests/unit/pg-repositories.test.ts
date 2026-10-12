import { describe, expect, it, vi } from "vitest";
import { PgAllowlistRepository, PgHealthRepository, PgInstrumentRepository } from "../../packages/persistence/src/pg-repositories.js";
import type { PgQueryable } from "../../packages/persistence/src/pg-pool.js";

function database(rows: readonly Record<string, unknown>[], reject = false): PgQueryable {
  return { query: vi.fn(async () => {
    if (reject) throw new Error("database unavailable");
    return { rows, rowCount: rows.length };
  }) } as unknown as PgQueryable;
}
describe("PgInstrumentRepository", () => {
  it("maps Portuguese storage columns to English contract fields", async () => {
    const db = database([{
      symbol: "BTCUSDT", display_name: "Bitcoin / Tether", asset_class: "crypto_spot",
      venue: "binance_spot", base_currency: "BTC", quote_currency: "USDT", enabled: true,
      data_provider: "Binance Spot", metadata_status: "verified", metadata_source: "exchangeInfo",
      min_order_size: null, max_order_size: null, leverage: null, margin_percent: null,
      spread: null, overnight_financing: null, commission: null, trading_hours: "24/7",
    }]);
    const repository = new PgInstrumentRepository(db);
    const instrument = await repository.findBySymbol("BTCUSDT");
    expect(instrument).toMatchObject({ symbol: "BTCUSDT", assetType: "crypto_spot", displayName: "Bitcoin / Tether", dataProvider: "Binance Spot" });
    expect(instrument).not.toHaveProperty("asset_class");
  });
  it("returns null when symbol does not exist", async () => {
    expect(await new PgInstrumentRepository(database([])).findBySymbol("MISSING")).toBeNull();
  });
});
describe("PgAllowlistRepository", () => {
  it("normalizes email and fails closed for blank input", async () => {
    const db = database([{ allowed: true }]);
    const repo = new PgAllowlistRepository(db);
    await expect(repo.isAllowed(" USER@EXAMPLE.COM ")).resolves.toBe(true);
    expect((db.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toEqual(["user@example.com"]);
    await expect(repo.isAllowed(" ")).resolves.toBe(false);
    expect(db.query).toHaveBeenCalledOnce();
  });
  it("does not authorize if query fails", async () => {
    await expect(new PgAllowlistRepository(database([], true)).isAllowed("user@example.com")).rejects.toThrow();
  });
});
describe("PgHealthRepository", () => {
  it("returns false if database check fails", async () => {
    await expect(new PgHealthRepository(database([], true)).isDatabaseReady()).resolves.toBe(false);
  });
});
