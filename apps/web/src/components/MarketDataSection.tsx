import { useEffect, useMemo, useState } from 'react';
import type { MarketDataApiTimeframe } from '@year95/contracts';
import type { MarketCandlesResponse, MarketDataQualityResponse } from '@year95/contracts';
import type { MarketDataApi } from '../lib/apiClient.js';

const TIMEFRAMES: readonly MarketDataApiTimeframe[] = ['1h', '4h', '1d'];

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function MarketDataChart({ data }: { readonly data: MarketCandlesResponse }) {
  const points = useMemo(() => {
    const closes = data.candles.map((candle) => candle.close);
    if (closes.length < 2) return '';
    const minimum = Math.min(...closes);
    const maximum = Math.max(...closes);
    const range = maximum - minimum || 1;
    return closes
      .map((close, index) => {
        const x = (index / (closes.length - 1)) * 760 + 20;
        const y = 180 - ((close - minimum) / range) * 150 - 10;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data.candles]);

  return (
    <div className="market-data-chart">
      <div className="market-data-chart__heading">
        <span>Preço de fechamento</span>
        <strong>
          {data.candles.length ? formatPrice(data.candles[data.candles.length - 1]!.close) : '—'}{' '}
          USDT
        </strong>
      </div>
      {data.candles.length > 1 ? (
        <svg
          viewBox="0 0 800 200"
          role="img"
          aria-label={`Gráfico de fechamento BTCUSDT ${data.timeframe}`}
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <p className="muted">Candles insuficientes para desenhar o gráfico.</p>
      )}
    </div>
  );
}

export interface MarketDataSectionProps {
  readonly api: MarketDataApi;
}

export function MarketDataSection({ api }: MarketDataSectionProps) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<MarketDataApiTimeframe>('1h');
  const [instruments, setInstruments] = useState<
    readonly { symbol: string; displayName: string }[]
  >([]);
  const [candles, setCandles] = useState<MarketCandlesResponse | null>(null);
  const [quality, setQuality] = useState<MarketDataQualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api
      .getInstruments()
      .then((result) => {
        if (!active) return;
        setInstruments(result.items);
        if (result.items.length > 0 && !result.items.some((item) => item.symbol === symbol)) {
          setSymbol(result.items[0]!.symbol);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : 'Não foi possível carregar os instrumentos.',
          );
      });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setCandles(null);
    setQuality(null);
    void Promise.all([
      api.getMarketCandles(symbol, timeframe, 300),
      api.getMarketQuality(symbol, timeframe),
    ])
      .then(([candleResult, qualityResult]) => {
        if (!active) return;
        setCandles(candleResult);
        setQuality(qualityResult);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível carregar os dados de mercado.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, symbol, timeframe]);

  const blocked = quality?.blocked === true;
  const qualityLabel =
    quality?.status === 'fresh'
      ? 'Fresh'
      : quality?.status === 'stale'
        ? 'Stale'
        : quality?.status === 'no_data'
          ? 'Sem dados'
          : 'Verificando';

  return (
    <section className="market-data-section" aria-labelledby="market-data-title">
      <header className="market-data-header">
        <div>
          <p className="eyebrow">DADOS DE MERCADO</p>
          <h2 id="market-data-title">Market Data</h2>
          <p className="muted">BTCUSDT · Binance Spot · somente candles fechados</p>
        </div>
        <span className={`market-data-badge market-data-badge--${quality?.status ?? 'pending'}`}>
          {qualityLabel}
        </span>
      </header>

      <div className="market-data-controls">
        <label>
          Instrumento
          <select
            value={symbol}
            onChange={(event) => setSymbol(event.currentTarget.value)}
            disabled={instruments.length === 0}
          >
            {instruments.map((instrument) => (
              <option key={instrument.symbol} value={instrument.symbol}>
                {instrument.symbol} — {instrument.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Timeframe
          <select
            value={timeframe}
            onChange={(event) => setTimeframe(event.currentTarget.value as MarketDataApiTimeframe)}
          >
            {TIMEFRAMES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p role="status" className="muted">
          Carregando dados de mercado…
        </p>
      ) : null}
      {error ? (
        <div className="market-data-block" role="alert">
          <strong>Dados indisponíveis</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {!loading && !error && blocked ? (
        <div className="market-data-block" role="alert">
          <strong>
            {quality?.status === 'stale'
              ? 'Dados desatualizados — uso bloqueado'
              : 'Sem candles fechados — uso bloqueado'}
          </strong>
          <p>
            {quality?.status === 'stale'
              ? 'A última vela fechada ultrapassou o limite de frescor de 1,5× o timeframe. Não utilize estes dados para análise operacional.'
              : 'Ainda não existe histórico fechado validado para este instrumento e timeframe.'}
          </p>
        </div>
      ) : null}
      {!loading && !error && quality?.status === 'fresh' && candles ? (
        <>
          <div className="market-data-meta">
            <span>Último fechamento: {formatTimestamp(quality.dataAsOf)}</span>
            <span>Velas carregadas: {candles.candles.length}</span>
          </div>
          <MarketDataChart data={candles} />
          <div className="market-data-table-wrap">
            <table className="market-data-table">
              <thead>
                <tr>
                  <th>Horário UTC</th>
                  <th>Abertura</th>
                  <th>Máxima</th>
                  <th>Mínima</th>
                  <th>Fechamento</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {[...candles.candles]
                  .slice(-8)
                  .reverse()
                  .map((candle) => (
                    <tr key={candle.openTime}>
                      <td>{formatTimestamp(candle.openTime)}</td>
                      <td>{formatPrice(candle.open)}</td>
                      <td>{formatPrice(candle.high)}</td>
                      <td>{formatPrice(candle.low)}</td>
                      <td>{formatPrice(candle.close)}</td>
                      <td>
                        {new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(
                          candle.volume,
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
