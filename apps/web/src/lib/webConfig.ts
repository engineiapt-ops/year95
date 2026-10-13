import { loadConfig } from '@year95/config';

export const webConfig = loadConfig('web-public', {
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

export function getApiBaseUrl(): string {
  const configured = webConfig.VITE_API_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (import.meta.env.DEV) return 'http://localhost:3000';
  return '';
}
