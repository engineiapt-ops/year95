import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type ConfigEnv } from "@year95/config";
import { createApiApp } from "./app.js";

export async function startApi(env: ConfigEnv): Promise<void> {
  const config = loadConfig("api", env);
  const app = createApiApp({ config });
  await app.listen({ host: "0.0.0.0", port: config.PORT });
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  void startApi({ ...process.env }).catch(() => {
    process.stderr.write("YEAR95 API startup failed. Check runtime configuration.\n");
    process.exitCode = 1;
  });
}
