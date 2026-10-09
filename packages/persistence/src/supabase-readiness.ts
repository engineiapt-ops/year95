export interface SupabaseReadinessConfig {
  readonly url: string | undefined;
  readonly serviceRoleKey: string | undefined;
}

export type ReadinessProbe = () => Promise<boolean>;

/**
 * Builds a read-only Supabase REST probe. Missing configuration and every request
 * failure return not-ready; response bodies and credentials are never logged.
 */
export function createSupabaseReadinessProbe(
  config: SupabaseReadinessConfig,
  fetcher: typeof fetch = fetch,
): ReadinessProbe {
  const baseUrl = config.url?.trim().replace(/\/+$/, "");
  const serviceRoleKey = config.serviceRoleKey?.trim();

  if (!baseUrl || !serviceRoleKey) {
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
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
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
