import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.js';

interface LoginLocationState {
  readonly from?: string;
}

export function LoginPage() {
  const { authError, clearAuthError, loading, sessionExpired, signIn, client } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as LoginLocationState | null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearAuthError();
    setFormError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      navigate(locationState?.from || '/', { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-layout">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">AI FINANCIAL INTELLIGENCE</p>
        <h1 id="login-title">YEAR95</h1>
        <p className="muted">Entre para acessar seu painel de operações em paper trading.</p>
        {sessionExpired ? (
          <p role="status" className="notice notice--warning">Sua sessão expirou. Entre novamente para continuar.</p>
        ) : null}
        {!client ? (
          <p role="alert" className="notice notice--error">
            Supabase Auth não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente local.
          </p>
        ) : null}
        {authError ? <p role="alert" className="notice notice--error">{authError}</p> : null}
        {formError ? <p role="alert" className="notice notice--error">{formError}</p> : null}

        <form onSubmit={(event) => void onSubmit(event)} className="login-form">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
          />
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
          />
          <button type="submit" disabled={loading || submitting || !client}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="login-footnote">Acesso por Supabase Auth. O cadastro público não está habilitado.</p>
      </section>
    </main>
  );
}
