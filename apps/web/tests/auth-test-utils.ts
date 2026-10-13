import type { AuthClient } from '../src/auth/AuthProvider.js';
import type { Session, User } from '@supabase/supabase-js';

export function createMockSession(email = 'trader@example.test'): Session {
  const user = {
    id: '00000000-0000-4000-8000-000000000123',
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  } satisfies User;
  return {
    access_token: 'test-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'test-refresh-token',
    user,
  };
}

export function createMockAuthClient(session: Session | null = null): AuthClient {
  let currentSession = session;
  const listeners = new Set<(event: string, session: Session | null) => void>();
  return {
    auth: {
      getSession: async () => ({ data: { session: currentSession }, error: null }),
      onAuthStateChange: (callback) => {
        const listener = callback as (event: string, session: Session | null) => void;
        listeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => listeners.delete(listener),
            },
          },
        };
      },
      signInWithPassword: async ({ email }) => {
        if (email === 'bad@example.test') {
          return { data: { user: null, session: null }, error: { message: 'Credenciais inválidas' } };
        }
        currentSession = createMockSession(email);
        for (const listener of listeners) listener('SIGNED_IN', currentSession);
        return { data: { user: currentSession.user, session: currentSession }, error: null };
      },
      signOut: async () => {
        currentSession = null;
        for (const listener of listeners) listener('SIGNED_OUT', null);
        return { error: null };
      },
    },
  } as unknown as AuthClient;
}
