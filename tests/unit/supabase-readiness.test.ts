import { describe, expect, it, vi } from "vitest";
import { createSupabaseReadinessProbe } from "../../packages/persistence/src/supabase-readiness.js";

describe("Supabase readiness probe", () => {
  it("fails closed without both server-side credentials and performs no request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const probe = createSupabaseReadinessProbe({ url: "https://example.supabase.co", secretKey: undefined }, fetcher);

    await expect(probe()).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the secret API key only as apikey on a read-only zero-row table check", async () => {
    const fetcher: typeof fetch = async (input, init) => {
      expect(String(input)).toBe("https://example.supabase.co/rest/v1/instruments?select=*&limit=0");
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("error");
      const headers = new Headers(init?.headers);
      expect(headers.get("apikey")).toBe("sb_secret_test");
      expect(headers.has("authorization")).toBe(false);
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const probe = createSupabaseReadinessProbe(
      { url: "https://example.supabase.co/", secretKey: "sb_secret_test" },
      fetcher,
    );

    await expect(probe()).resolves.toBe(true);
  });

  it("fails closed on unsuccessful HTTP responses", async () => {
    const fetcher: typeof fetch = async () => new Response("denied", { status: 403 });
    const probe = createSupabaseReadinessProbe(
      { url: "https://example.supabase.co", secretKey: "sb_secret_test" },
      fetcher,
    );

    await expect(probe()).resolves.toBe(false);
  });

  it("fails closed on malformed JSON or transport failure", async () => {
    const invalidJsonFetcher: typeof fetch = async () =>
      new Response("{", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const failedFetcher: typeof fetch = async () => {
      throw new Error("private diagnostic");
    };

    await expect(
      createSupabaseReadinessProbe(
        { url: "https://example.supabase.co", secretKey: "sb_secret_test" },
        invalidJsonFetcher,
      )(),
    ).resolves.toBe(false);
    await expect(
      createSupabaseReadinessProbe(
        { url: "https://example.supabase.co", secretKey: "sb_secret_test" },
        failedFetcher,
      )(),
    ).resolves.toBe(false);
  });
});
