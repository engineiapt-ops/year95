import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import type { DashboardApi } from '../src/pages/DashboardPage.js';
import { createMockAuthClient, createMockSession } from './auth-test-utils.js';

afterEach(() => {
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

function makeApiClient(overrides: Partial<DashboardApi> = {}): DashboardApi {
  return {
    getHealth: vi.fn().mockResolvedValue({ status: 'ok', service: 'year95-api', version: '0.1.0' }),
    getReadiness: vi
      .fn()
      .mockResolvedValue({
        status: 'ok',
        ready: true,
        version: '0.1.0',
        checks: { database: 'ok' },
      }),
    getMe: vi
      .fn()
      .mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000123',
        email: 'trader@example.test',
      }),
    ...overrides,
  };
}

describe('web shell route protection and states', () => {
  it('redirects an unauthenticated visitor to login', async () => {
    render(<App authClient={createMockAuthClient(null)} apiClient={makeApiClient()} />);
    expect(await screen.findByRole('heading', { name: 'YEAR95' })).toBeTruthy();
    expect(screen.getByLabelText('E-mail')).toBeTruthy();
  });

  it('shows an auth loading state while session recovery is pending', () => {
    const authClient = createMockAuthClient(null);
    vi.spyOn(authClient.auth, 'getSession').mockReturnValue(new Promise(() => undefined));
    render(<App authClient={authClient} apiClient={makeApiClient()} />);
    expect(screen.getByRole('status').textContent).toContain('Verificando sessão');
  });

  it('renders API health, database readiness, and API-verified user', async () => {
    render(
      <App authClient={createMockAuthClient(createMockSession())} apiClient={makeApiClient()} />,
    );
    expect(await screen.findByText('Online')).toBeTruthy();
    expect(screen.getByText('Pronto')).toBeTruthy();
    expect(screen.getByText('trader@example.test')).toBeTruthy();
  });

  it('shows a database-not-ready state separately from API health', async () => {
    const api = makeApiClient({
      getReadiness: vi.fn().mockResolvedValue({
        status: 'not_ready',
        ready: false,
        version: '0.1.0',
        checks: { database: 'not_ready' },
      }),
    });
    render(<App authClient={createMockAuthClient(createMockSession())} apiClient={api} />);
    expect(await screen.findByText('Online')).toBeTruthy();
    expect(await screen.findByText('Não pronto')).toBeTruthy();
  });

  it('shows login errors without exposing the protected dashboard', async () => {
    render(<App authClient={createMockAuthClient(null)} apiClient={makeApiClient()} />);
    await screen.findByRole('heading', { name: 'YEAR95' });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'bad@example.test' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Visão geral')).toBeNull();
  });

  it('shows a clear failure state when the API cannot be reached', async () => {
    const api = makeApiClient({
      getHealth: vi.fn().mockRejectedValue(new Error('API indisponível')),
    });
    render(<App authClient={createMockAuthClient(createMockSession())} apiClient={api} />);
    expect(await screen.findByText('Indisponível')).toBeTruthy();
    expect(screen.getByText('API indisponível')).toBeTruthy();
  });
});
