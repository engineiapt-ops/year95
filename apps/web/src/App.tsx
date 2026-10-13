import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AuthClient } from './auth/AuthProvider.js';
import { AuthProvider } from './auth/AuthProvider.js';
import { ProtectedRoute } from './auth/ProtectedRoute.js';
import type { DashboardApi } from './pages/DashboardPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { LoginPage } from './pages/LoginPage.js';

export interface AppProps {
  readonly authClient?: AuthClient | null;
  readonly apiClient?: DashboardApi;
}

export function App({ authClient, apiClient }: AppProps) {
  return (
    <BrowserRouter>
      <AuthProvider {...(authClient !== undefined ? { client: authClient } : {})}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage {...(apiClient ? { apiClient } : {})} />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
