export interface SupabaseReadinessConfig {
  readonly url: string | undefined;
  readonly secretKey: string | undefined;
}

export type ReadinessProbe = () => Promise<boolean>;

/**
 * Builds a read-only Supabase REST probe. Missing configuration and every request
 * failure return not-ready; response bodies and credentials are never logged.
 * Supabase publishable/secret API keys belong in the apikey header, not Bearer.
 */
export function createSupabaseReadinessProbe(
  config: SupabaseReadinessConfig,
  fetcher: typeof fetch = fetch,
): ReadinessProbe {
  const baseUrl = config.url?.trim().replace(/\/+$/, "");
  const secretKey = config.secretKey?.trim();

  if (!baseUrl || !secretKey) {
    return async () => false;
  }

  let endpoint: URL;
  try {
    endpoint = new URL("/rest/v1/instruments?select=*&limit=0", baseUrl);
  } catch {
    return async () => false;
  }

  return async () => {
    try {
      const response = await fetcher(endpoint, {
        method: "GET",
        headers: {
          apikey: secretKey,
          accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(2500),
      });

      if (!response.ok) return false;

      const payload: unknown = await response.json();
      return Array.isArray(payload);
    } catch {
      return false;
    }
  };
}
