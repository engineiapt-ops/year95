import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { browserSupabaseClient } from '../lib/supabase.js';

export type AuthClient = Pick<SupabaseClient, 'auth'>;

interface AuthContextValue {
  readonly client: AuthClient | null;
  readonly session: Session | null;
  readonly user: User | null;
  readonly loading: boolean;
  readonly authError: string | null;
  readonly sessionExpired: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  expireSession(): Promise<void>;
  clearAuthError(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  readonly children: ReactNode;
  readonly client?: AuthClient | null;
}

export function AuthProvider({ children, client = browserSupabaseClient }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(client !== null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const expirationInProgress = useRef(false);

  useEffect(() => {
    if (!client) {
      setSession(null);
      setLoading(false);
      return;
    }

    let active = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      if (expirationInProgress.current && nextSession) {
        setLoading(false);
        return;
      }

      setSession(nextSession);
      setLoading(false);
      if (nextSession) {
        setSessionExpired(false);
        setAuthError(null);
      }
    });

    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (expirationInProgress.current && data.session) {
          setSession(null);
          return;
        }
        if (error) {
          setAuthError(error.message);
          setSession(null);
        } else {
          setSession(data.session);
        }
      })
      .catch(() => {
        if (active) {
          setSession(null);
          setAuthError('Não foi possível recuperar a sessão. Tente entrar novamente.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      expirationInProgress.current = false;
      setAuthError(null);
      setSessionExpired(false);
      if (!client) {
        throw new Error(
          'Supabase Auth não está configurado. Confira VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
        );
      }
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    [client],
  );

  const signOut = useCallback(async (): Promise<void> => {
    expirationInProgress.current = false;
    setSession(null);
    setSessionExpired(false);
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) {
      setAuthError(
        'A sessão foi removida deste app, mas o servidor de autenticação não confirmou o logout.',
      );
    }
  }, [client]);

  const expireSession = useCallback(async (): Promise<void> => {
    if (expirationInProgress.current) return;
    expirationInProgress.current = true;
    setSession(null);
    setSessionExpired(true);
    setAuthError(null);
    if (!client) return;
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch {
      // The local UI session is cleared even if the Auth endpoint is unavailable.
    }
  }, [client]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      client,
      session,
      user: session?.user ?? null,
      loading,
      authError,
      sessionExpired,
      signIn,
      signOut,
      expireSession,
      clearAuthError,
    }),
    [
      client,
      session,
      loading,
      authError,
      sessionExpired,
      signIn,
      signOut,
      expireSession,
      clearAuthError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
