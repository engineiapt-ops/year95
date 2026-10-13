export interface WebPublicConfig {
  readonly VITE_API_BASE_URL: string | undefined;
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_ANON_KEY: string | undefined;
}

function normalizePublicOrigin(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    const localHost =
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
    const validProtocol = url.protocol === 'https:' || (url.protocol === 'http:' && localHost);

    if (
      !validProtocol ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      return undefined;
    }

    return url.origin;
  } catch {
    return undefined;
  }
}

export const webConfig: WebPublicConfig = {
  VITE_API_BASE_URL: normalizePublicOrigin(import.meta.env.VITE_API_BASE_URL),
  VITE_SUPABASE_URL: normalizePublicOrigin(import.meta.env.VITE_SUPABASE_URL),
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || undefined,
};

export function getApiBaseUrl(): string {
  if (webConfig.VITE_API_BASE_URL) return webConfig.VITE_API_BASE_URL;
  if (import.meta.env.DEV) return 'http://localhost:3000';
  return '';
}
