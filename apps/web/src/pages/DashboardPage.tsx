import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { StatusCard, type StatusTone } from '../components/StatusCard.js';
import { WebApiClient, type ApiClientOptions } from '../lib/apiClient.js';
import { getApiBaseUrl } from '../lib/webConfig.js';

export interface DashboardApi {
  getHealth(): ReturnType<WebApiClient['getHealth']>;
  getReadiness(): ReturnType<WebApiClient['getReadiness']>;
  getMe(): ReturnType<WebApiClient['getMe']>;
}

export interface DashboardPageProps {
  readonly apiClient?: DashboardApi;
}

interface CardState {
  readonly tone: StatusTone;
  readonly value: string;
  readonly detail?: string;
}

const pendingState: CardState = { tone: 'loading', value: 'Carregando…' };

export function DashboardPage({ apiClient }: DashboardPageProps) {
  const { user, session, signOut, expireSession } = useAuth();
  const client = useMemo<DashboardApi>(() => {
    if (apiClient) return apiClient;
    const options: ApiClientOptions = {
      baseUrl: getApiBaseUrl(),
      getAccessToken: () => session?.access_token ?? null,
      onUnauthorized: expireSession,
    };
    return new WebApiClient(options);
  }, [apiClient, session?.access_token, expireSession]);

  const [health, setHealth] = useState<CardState>(pendingState);
  const [readiness, setReadiness] = useState<CardState>(pendingState);
  const [identity, setIdentity] = useState<CardState>(pendingState);

  useEffect(() => {
    let active = true;
    setHealth(pendingState);
    setReadiness(pendingState);
    setIdentity(pendingState);

    void client.getHealth()
      .then((result) => {
        if (active) setHealth({ tone: 'ok', value: 'Online', detail: `${result.service} · v${result.version}` });
      })
      .catch((error: unknown) => {
        if (active) setHealth({ tone: 'error', value: 'Indisponível', detail: error instanceof Error ? error.message : 'Falha de conexão' });
      });

    void client.getReadiness()
      .then((result) => {
        if (!active) return;
        setReadiness(
          result.ready
            ? { tone: 'ok', value: 'Pronto', detail: 'PostgreSQL respondeu à verificação de readiness.' }
            : { tone: 'warning', value: 'Não pronto', detail: 'A API está acessível, mas o banco não está pronto.' },
        );
      })
      .catch((error: unknown) => {
        if (active) setReadiness({ tone: 'error', value: 'Indisponível', detail: error instanceof Error ? error.message : 'Falha de conexão' });
      });

    void client.getMe()
      .then((result) => {
        if (active) setIdentity({ tone: 'ok', value: result.email, detail: `ID: ${result.id}` });
      })
      .catch((error: unknown) => {
        if (active) setIdentity({ tone: 'error', value: 'Não verificado pela API', detail: error instanceof Error ? error.message : 'Falha na validação da identidade' });
      });

    return () => {
      active = false;
    };
  }, [client]);

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">PAINEL DE CONTROLE</p>
          <h1>Visão geral</h1>
          <p className="muted">Estado dos serviços YEAR95 e da sessão autenticada.</p>
        </div>
        <button className="button-secondary" type="button" onClick={() => void signOut()}>
          Sair
        </button>
      </header>
      <div className="status-grid">
        <StatusCard title="Saúde da API" value={health.value} tone={health.tone} detail={health.detail} />
        <StatusCard title="Readiness do banco" value={readiness.value} tone={readiness.tone} detail={readiness.detail} />
        <StatusCard title="Usuário autenticado" value={identity.value} tone={identity.tone} detail={identity.detail ?? user?.email} />
      </div>
      <p className="dashboard-note">
        A API valida o JWT e a allowlist no backend. Este painel não envia ordens nem executa operações financeiras reais.
      </p>
    </main>
  );
}
