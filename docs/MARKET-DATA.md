# Market Data — ingestão e leitura

## Fonte aprovada nesta entrega

O primeiro fluxo suporta somente o instrumento BTCUSDT Spot, com provider canónico `binance-spot` e timeframes `1h`, `4h` e `1d`. A API valida a combinação provider/instrument através de `MarketDataSourceValidator` antes de consultar os candles. Mapeamentos desconhecidos ou não validados falham fechados.

## Worker

A partir da raiz do monorepo, com `DATABASE_URL` e configuração de TLS carregadas no ambiente do processo:

```sh
pnpm --filter @year95/worker build
pnpm --filter @year95/worker ingest
```

Argumentos disponíveis:

- `--symbol BTCUSDT`
- `--timeframe 1h|4h|1d` para executar um timeframe; sem este argumento, executa os três.
- `--candles N` para substituir a quantidade histórica pedida nos timeframes selecionados.
- `--candles-1h N`, `--candles-4h N` e `--candles-1d N` para configurar cada timeframe separadamente.

Valores padrão: 5.000 candles em 1h, 5.000 em 4h e 3.000 em 1d. O backfill diário usa 3.000 em vez do padrão isolado de 5.000 do backfill legado; esta configuração é explícita e pode ser substituída pelo operador. Cada backfill exige que o provider retorne exatamente a quantidade solicitada.

Quando não existem candles persistidos para um timeframe, a primeira execução faz o backfill completo. Nas execuções seguintes, o último candle persistido é o checkpoint: o worker consulta candles a partir do próximo open time esperado, com limite de até 1.000 candles por execução incremental. Assim, uma interrupção não faz o worker saltar diretamente para as duas velas mais recentes. Se houver mais de 1.000 candles em atraso, execuções seguintes continuam a partir do último candle persistido; durante a recuperação, a qualidade continua stale e a API/dashboard bloqueiam o uso dos dados até alcançar o candle atual. Se a resposta contiver uma lacuna, OHLC inválido ou duplicados conflitantes, a normalização falha e nada desse lote é persistido.

A execução usa um `Clock` injetado, paginação histórica de até 1.000 candles por pedido e intervalo de 150 ms entre páginas de backfill. A normalização rejeita OHLC inválido, lacunas e duplicados conflitantes. A persistência usa a chave natural existente para permitir reexecução sem duplicar candles.

## API autenticada

As três rotas abaixo ficam sob o prefixo `/v1` e usam o mesmo JWT + allowlist do restante da API:

| Método e rota                                    | Descrição                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `GET /v1/instruments`                            | Lista instrumentos habilitados com mapeamento de market data validado. |
| `GET /v1/market/:symbol/candles?tf=1h&limit=300` | Lê candles fechados por timeframe; `limit` entre 1 e 1.000.            |
| `GET /v1/market/:symbol/quality?tf=1h`           | Retorna `fresh`, `stale` ou `no_data`, com bloqueio explícito.         |

O limite de frescor é 1,5× a duração do timeframe, mantendo a regra de qualidade aprovada no contrato de market data. `stale` e `no_data` são respostas de qualidade válidas, mas ambas têm `blocked: true`. Uma vela futura ou um relógio inválido resulta em falha de serviço; não é convertida em dado fresco.

## Dashboard

A seção Market Data exibe a qualidade, o último fechamento, um gráfico de linha simples e as últimas oito velas. Quando a qualidade for `stale` ou `no_data`, o painel mostra um bloqueio explícito e não apresenta os candles como utilizáveis.

Esta entrega não calcula indicadores, não cria decisões, não envia ordens e não executa paper trades.

## Banco de dados

O código usa as colunas `close_time` e `data_provider` adicionadas pela migration aditiva 030. Esta entrega não executa migrations. Antes de ativar a ingestão ou as rotas num ambiente, confirme separadamente que a migration 030 foi aplicada e registada nesse banco.
