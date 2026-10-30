import {
  healthResponseSchema,
  httpErrorResponseSchema,
  marketCandlesResponseSchema,
  marketDataQualityResponseSchema,
  marketInstrumentsResponseSchema,
  meResponseSchema,
  readyResponseSchema,
  type HealthResponse,
  type MarketDataApiTimeframe,
  type MarketCandlesResponse,
  type MarketDataQualityResponse,
  type MarketInstrumentsResponse,
  type MeResponse,
  type ReadyResponse,
} from '@year95/contracts';

type SafeParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: unknown };

interface ResponseSchema<T> {
  safeParse(input: unknown): SafeParseResult<T>;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ApiClientError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.status = options.status;
    this.code = options.code;
  }
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly getAccessToken: () => string | null;
  readonly onUnauthorized: () => void | Promise<void>;
  readonly fetchImpl?: FetchLike;
}

export class WebApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => string | null;
  private readonly onUnauthorized: () => void | Promise<void>;
  private readonly fetchImpl: FetchLike;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getAccessToken = options.getAccessToken;
    this.onUnauthorized = options.onUnauthorized;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    if (import.meta.env.DEV) {
      console.debug(`[YEAR95] Resolved API base URL: ${JSON.stringify(this.baseUrl)}`);
    }
  }

  getHealth(): Promise<HealthResponse> {
    return this.get('/health', healthResponseSchema);
  }

  getReadiness(): Promise<ReadyResponse> {
    return this.get('/ready', readyResponseSchema, { allowServiceUnavailable: true });
  }

  getMe(): Promise<MeResponse> {
    return this.get('/v1/me', meResponseSchema);
  }

  getInstruments(): Promise<MarketInstrumentsResponse> {
    return this.get('/v1/instruments', marketInstrumentsResponseSchema);
  }

  getMarketCandles(
    symbol: string,
    timeframe: MarketDataApiTimeframe,
    limit = 300,
  ): Promise<MarketCandlesResponse> {
    const query = new URLSearchParams({ tf: timeframe, limit: String(limit) });
    return this.get(
      `/v1/market/${encodeURIComponent(symbol)}/candles?${query.toString()}`,
      marketCandlesResponseSchema,
    );
  }

  getMarketQuality(
    symbol: string,
    timeframe: MarketDataApiTimeframe,
  ): Promise<MarketDataQualityResponse> {
    const query = new URLSearchParams({ tf: timeframe });
    return this.get(
      `/v1/market/${encodeURIComponent(symbol)}/quality?${query.toString()}`,
      marketDataQualityResponseSchema,
    );
  }

  private async get<T>(
    path: string,
    schema: ResponseSchema<T>,
    options: { readonly allowServiceUnavailable?: boolean } = {},
  ): Promise<T> {
    if (!this.baseUrl) throw new ApiClientError('VITE_API_BASE_URL não está configurada.');

    const accessToken = this.getAccessToken();
    const headers = new Headers({ accept: 'application/json' });
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

    let url: URL;
    try {
      url = new URL(path, `${this.baseUrl}/`);
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw new ApiClientError(
        import.meta.env.DEV
          ? `URL da API inválido: baseUrl=${JSON.stringify(this.baseUrl)} path=${path} (${detail})`
          : 'Configuração inválida para conexão com a API YEAR95.',
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ApiClientError(
        import.meta.env.DEV
          ? `Falha no fetch para ${url.href}: ${detail}`
          : 'Não foi possível conectar à API YEAR95.',
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiClientError('A API retornou uma resposta inválida.', {
        status: response.status,
      });
    }

    const parsed = schema.safeParse(payload);
    if (response.status === 401 && accessToken) {
      await this.onUnauthorized();
      throw new ApiClientError('Sessão expirada. Entre novamente.', {
        status: 401,
        code: 'SESSION_EXPIRED',
      });
    }

    if (
      !response.ok &&
      !(options.allowServiceUnavailable && response.status === 503 && parsed.success)
    ) {
      const apiError = httpErrorResponseSchema.safeParse(payload);
      throw new ApiClientError(
        apiError.success
          ? apiError.data.error.message
          : 'A API não conseguiu concluir a solicitação.',
        {
          status: response.status,
          ...(apiError.success ? { code: apiError.data.error.code } : {}),
        },
      );
    }

    if (!parsed.success) {
      throw new ApiClientError('A API retornou dados fora do contrato esperado.', {
        status: response.status,
        code: 'INVALID_API_RESPONSE',
      });
    }
    return parsed.data;
  }
}

export type MarketDataApi = Pick<
  WebApiClient,
  'getInstruments' | 'getMarketCandles' | 'getMarketQuality'
>;
