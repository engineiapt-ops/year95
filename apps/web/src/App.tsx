import React, { useState } from "react";
import { DEFAULT_SYMBOL, TIMEFRAMES, type Timeframe, type Side } from "@year95/contracts";
import { loadConfig } from "@year95/config";

const sampleConfig = loadConfig({
  NODE_ENV: "development",
  PORT: "3000",
  LOG_LEVEL: "info",
});

interface SignalPreview {
  symbol: string;
  timeframe: Timeframe;
  side: Side;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  riskPerTradePct: number;
  positionNotionalPct: number;
  status: "ACTIVE" | "SETTLED" | "FILTERED";
  reason: string;
}

const sampleSignals: SignalPreview[] = [
  {
    symbol: DEFAULT_SYMBOL,
    timeframe: "4h",
    side: "BUY",
    confidence: 0.84,
    entryPrice: 94250.0,
    stopLoss: 92836.25, // 1.5% stop
    takeProfit: 97077.5, // 3.0% target -> 1:2 R:R
    riskReward: 2.0,
    riskPerTradePct: 0.5,
    positionNotionalPct: 1.5,
    status: "ACTIVE",
    reason: "Deterministic breakout with verified volume and closed candle confirmation",
  },
  {
    symbol: DEFAULT_SYMBOL,
    timeframe: "1h",
    side: "WAIT",
    confidence: 0.42,
    entryPrice: 94100.0,
    stopLoss: 93159.0,
    takeProfit: 95510.0,
    riskReward: 1.5,
    riskPerTradePct: 0.5,
    positionNotionalPct: 1.5,
    status: "FILTERED",
    reason: "Filtered by Risk Engine: Risk-Reward ratio 1.5 < minimum 2.0",
  },
  {
    symbol: DEFAULT_SYMBOL,
    timeframe: "1d",
    side: "BUY",
    confidence: 0.91,
    entryPrice: 91500.0,
    stopLoss: 89670.0,
    takeProfit: 95160.0,
    riskReward: 2.0,
    riskPerTradePct: 0.5,
    positionNotionalPct: 1.5,
    status: "SETTLED",
    reason: "Target reached on closed daily bar; settled in paper portfolio",
  },
];

export default function App() {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("4h");

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0b0f19", color: "#f3f4f6", fontFamily: "system-ui, -apple-system, sans-serif", padding: "24px" }}>
      <header style={{ borderBottom: "1px solid #1f2937", paddingBottom: "16px", marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: "700", letterSpacing: "-0.02em", color: "#ffffff" }}>
              YEAR95
            </h1>
            <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "4px", backgroundColor: "#1e3a8a", color: "#93c5fd" }}>
              AI FINANCIAL INTELLIGENCE
            </span>
            <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "4px", backgroundColor: "#064e3b", color: "#6ee7b7" }}>
              PAPER-TRADING AUTHORITATIVE
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "#9ca3af", marginTop: "4px" }}>
            Deterministic quantitative analysis, fail-closed risk governance & advisory AI context.
          </p>
        </div>

        <div style={{ textAlign: "right", fontSize: "12px", color: "#9ca3af" }}>
          <div>Environment: <strong style={{ color: "#e5e7eb" }}>{sampleConfig.nodeEnv}</strong></div>
          <div>Port: <strong style={{ color: "#e5e7eb" }}>{sampleConfig.port}</strong></div>
          <div>Provider: <strong style={{ color: "#e5e7eb" }}>{sampleConfig.binanceBaseUrl}</strong></div>
        </div>
      </header>

      {/* Main Grid */}
      <main style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
        {/* Market Scope Card */}
        <div style={{ backgroundColor: "#111827", borderRadius: "8px", border: "1px solid #1f2937", padding: "20px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#f9fafb", marginBottom: "14px", display: "flex", justifyContent: "space-between" }}>
            <span>Market Scope & Timeframe</span>
            <span style={{ color: "#3b82f6" }}>{DEFAULT_SYMBOL}</span>
          </h2>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "6px" }}>Select Timeframe:</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTimeframe(tf)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: selectedTimeframe === tf ? "1px solid #3b82f6" : "1px solid #374151",
                    backgroundColor: selectedTimeframe === tf ? "#1d4ed8" : "#1f2937",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div style={{ fontSize: "12px", color: "#9ca3af", borderTop: "1px solid #1f2937", paddingTop: "12px" }}>
            <p>• Only closed candles qualify for evaluation.</p>
            <p>• Stale threshold: &gt; 1.5x timeframe duration fails closed.</p>
            <p>• Provider: Binance public OHLCV candles.</p>
          </div>
        </div>

        {/* Behavior Contracts Card */}
        <div style={{ backgroundColor: "#111827", borderRadius: "8px", border: "1px solid #1f2937", padding: "20px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#f9fafb", marginBottom: "14px" }}>
            Normative Invariants
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", backgroundColor: "#1f2937", borderRadius: "4px" }}>
              <span>Min Risk:Reward</span>
              <strong style={{ color: "#10b981" }}>&ge; 2.0 (1:2)</strong>
            </li>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", backgroundColor: "#1f2937", borderRadius: "4px" }}>
              <span>Risk Per Trade Hard Cap</span>
              <strong style={{ color: "#f59e0b" }}>&le; 1.0%</strong>
            </li>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", backgroundColor: "#1f2937", borderRadius: "4px" }}>
              <span>Default Risk Policy</span>
              <strong style={{ color: "#e5e7eb" }}>0.5%</strong>
            </li>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", backgroundColor: "#1f2937", borderRadius: "4px" }}>
              <span>Baseline Position Notional</span>
              <strong style={{ color: "#e5e7eb" }}>1.5%</strong>
            </li>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", backgroundColor: "#1f2937", borderRadius: "4px" }}>
              <span>Execution Authority</span>
              <strong style={{ color: "#3b82f6" }}>Deterministic Core</strong>
            </li>
          </ul>
        </div>

        {/* Advisory AI Boundary Card */}
        <div style={{ backgroundColor: "#111827", borderRadius: "8px", border: "1px solid #1f2937", padding: "20px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#f9fafb", marginBottom: "14px" }}>
            AI Advisory Boundary
          </h2>
          <div style={{ fontSize: "13px", color: "#d1d5db", lineHeight: 1.5 }}>
            <p style={{ marginBottom: "8px" }}>
              AI is strictly consultative. In accordance with ADR 0001 and project governance:
            </p>
            <ul style={{ paddingLeft: "16px", color: "#9ca3af", display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
              <li>Cannot override quantitative decisions (BUY / SELL / WAIT)</li>
              <li>Cannot bypass risk controls or hard caps</li>
              <li>Cannot place live orders (paper trading only)</li>
              <li>Provides narrative explanation and research synthesis</li>
            </ul>
          </div>
        </div>
      </main>

      {/* Signal Log Table */}
      <section style={{ marginTop: "24px", backgroundColor: "#111827", borderRadius: "8px", border: "1px solid #1f2937", padding: "20px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#f9fafb", marginBottom: "16px" }}>
          Deterministic Decision Pipeline Signals ({DEFAULT_SYMBOL})
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #374151", color: "#9ca3af" }}>
                <th style={{ padding: "8px" }}>Timeframe</th>
                <th style={{ padding: "8px" }}>Side</th>
                <th style={{ padding: "8px" }}>Confidence</th>
                <th style={{ padding: "8px" }}>Entry</th>
                <th style={{ padding: "8px" }}>Stop Loss</th>
                <th style={{ padding: "8px" }}>Take Profit</th>
                <th style={{ padding: "8px" }}>R:R</th>
                <th style={{ padding: "8px" }}>Risk %</th>
                <th style={{ padding: "8px" }}>Status</th>
                <th style={{ padding: "8px" }}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {sampleSignals.map((sig, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #1f2937" }}>
                  <td style={{ padding: "10px 8px", fontWeight: "600" }}>{sig.timeframe}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: "700",
                        backgroundColor: sig.side === "BUY" ? "#065f46" : sig.side === "SELL" ? "#991b1b" : "#374151",
                        color: sig.side === "BUY" ? "#a7f3d0" : sig.side === "SELL" ? "#fca5a5" : "#e5e7eb",
                      }}
                    >
                      {sig.side}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{(sig.confidence * 100).toFixed(0)}%</td>
                  <td style={{ padding: "10px 8px" }}>${sig.entryPrice.toLocaleString()}</td>
                  <td style={{ padding: "10px 8px", color: "#ef4444" }}>${sig.stopLoss.toLocaleString()}</td>
                  <td style={{ padding: "10px 8px", color: "#10b981" }}>${sig.takeProfit.toLocaleString()}</td>
                  <td style={{ padding: "10px 8px", fontWeight: "600" }}>{sig.riskReward}:1</td>
                  <td style={{ padding: "10px 8px" }}>{sig.riskPerTradePct}%</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: sig.status === "ACTIVE" ? "#1e3a8a" : sig.status === "SETTLED" ? "#064e3b" : "#451a03",
                        color: sig.status === "ACTIVE" ? "#93c5fd" : sig.status === "SETTLED" ? "#6ee7b7" : "#fdba74",
                      }}
                    >
                      {sig.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#9ca3af", fontSize: "12px", maxWidth: "260px" }}>
                    {sig.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer style={{ marginTop: "32px", textAlign: "center", fontSize: "12px", color: "#6b7280" }}>
        YEAR95 Foundation • Node 22 • Deterministic Finance • Fail-Closed Architecture
      </footer>
    </div>
  );
}
