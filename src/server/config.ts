import { dirname, join, resolve } from "node:path";

export type Config = {
  version: string;
  port: number;
  hostname: string;
  vaultPath: string;
  dbPath: string;
  uploadPath: string;
  lan: boolean;
  mcpToken: string | null;
};

const ROOT = resolve(import.meta.dir, "../..");

function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const vaultPath =
    overrides.vaultPath ?? process.env.HARNESS_VAULT ?? join(ROOT, "vault");
  const dbPath = overrides.dbPath ?? process.env.HARNESS_DB ?? join(ROOT, "state/app.db");

  return {
    version: "0.1.0",
    port: overrides.port ?? Number(process.env.PORT ?? 4317),
    hostname: overrides.hostname ?? process.env.HOST ?? "127.0.0.1",
    vaultPath,
    dbPath,
    uploadPath:
      overrides.uploadPath ?? process.env.HARNESS_UPLOADS ?? join(dirname(dbPath), "uploads"),
    lan: overrides.lan ?? envFlag("HARNESS_LAN"),
    mcpToken: overrides.mcpToken ?? process.env.HARNESS_MCP_TOKEN ?? null,
  };
}

export const paths = {
  root: ROOT,
  uiDist: join(ROOT, "dist/ui"),
  uiIndex: join(ROOT, "dist/ui/index.html"),
};
