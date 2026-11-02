import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { Config } from "../config.ts";
import type { EventBus } from "../events.ts";

export type AgentConfig = {
  argv: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout_sec?: number;
  max_runs_per_hour?: number;
};

export type AgentStatus = {
  state: "not_configured" | "idle" | "starting" | "working" | "stopped" | "failed";
  pid: number | null;
  error: string | null;
  config: AgentConfig | null;
};

const DEFAULT_CONFIG: AgentConfig = {
  argv: ["kilo", "run", "{prompt}", "--auto", "--format", "json"],
  timeout_sec: 900,
  max_runs_per_hour: 12,
};

export class LauncherService {
  private child: ChildProcess | null = null;
  private status: AgentStatus = { state: "not_configured", pid: null, error: null, config: null };
  private readonly configPath: string;

  constructor(
    private readonly appConfig: Config,
    private readonly events: EventBus,
  ) {
    this.configPath = join(dirname(appConfig.dbPath), "agent.json");
  }

  async load(): Promise<AgentConfig | null> {
    try {
      const parsed = JSON.parse(await readFile(this.configPath, "utf8")) as unknown;
      const config = validateConfig(parsed);
      this.status = { ...this.status, config, state: "idle" };
      return config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      this.status = { ...this.status, state: "failed", error: error instanceof Error ? error.message : String(error) };
      return null;
    }
  }

  getStatus(): AgentStatus {
    return { ...this.status, config: this.status.config ? { ...this.status.config, argv: [...this.status.config.argv] } : null };
  }

  async saveConfig(input: unknown, requestOrigin: string | null): Promise<AgentStatus> {
    if (!isLoopbackOrigin(requestOrigin)) throw new Error("agent configuration can only be changed from loopback");
    const config = validateConfig(input);
    await mkdir(dirname(this.configPath), { recursive: true });
    await writeFile(this.configPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    this.status = { ...this.status, config, state: "idle", error: null };
    return this.getStatus();
  }

  async start(): Promise<AgentStatus> {
    if (this.child) return this.getStatus();
    const config = this.status.config ?? await this.load();
    if (!config) {
      this.status = { ...this.status, state: "not_configured", error: "agent configuration is missing" };
      return this.getStatus();
    }
    const prompt = "Work through Hilum MCP jobs. Student actions take priority. Stop when await_work returns idle or retire.";
    const args = config.argv.map((arg) => arg === "{prompt}" ? prompt : arg);
    this.status = { ...this.status, state: "starting", error: null };
    const child = spawn(args[0]!, args.slice(1), {
      cwd: config.cwd,
      env: { ...process.env, ...config.env, HILUM_MCP_URL: `http://${this.appConfig.hostname}:${this.appConfig.port}/mcp` },
      detached: true,
      stdio: "ignore",
    });
    this.child = child;
    this.status = { ...this.status, state: "working", pid: child.pid ?? null };
    this.events.publish({ type: "launcher", state: "working", at: Date.now() });
    child.once("error", (error) => {
      this.status = { ...this.status, state: "failed", pid: null, error: error.message };
      this.child = null;
      this.events.publish({ type: "launcher", state: "failed", at: Date.now() });
    });
    child.once("exit", () => {
      this.child = null;
      if (this.status.state !== "failed") this.status = { ...this.status, state: "idle", pid: null };
      this.events.publish({ type: "launcher", state: this.status.state, at: Date.now() });
    });
    return this.getStatus();
  }

  async stop(): Promise<AgentStatus> {
    if (this.child?.pid) {
      try {
        process.kill(-this.child.pid, "SIGTERM");
      } catch {
        this.child.kill("SIGTERM");
      }
    }
    this.child = null;
    this.status = { ...this.status, state: "stopped", pid: null };
    this.events.publish({ type: "launcher", state: "stopped", at: Date.now() });
    return this.getStatus();
  }
}

function validateConfig(value: unknown): AgentConfig {
  if (!value || typeof value !== "object") throw new Error("agent config must be an object");
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.argv) || record.argv.length === 0 || record.argv.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error("agent config argv must be a non-empty argument array");
  }
  return {
    argv: record.argv as string[],
    cwd: typeof record.cwd === "string" ? record.cwd : undefined,
    env: record.env && typeof record.env === "object" ? record.env as Record<string, string> : undefined,
    timeout_sec: typeof record.timeout_sec === "number" ? record.timeout_sec : DEFAULT_CONFIG.timeout_sec,
    max_runs_per_hour: typeof record.max_runs_per_hour === "number" ? record.max_runs_per_hour : DEFAULT_CONFIG.max_runs_per_hour,
  };
}

function isLoopbackOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}
