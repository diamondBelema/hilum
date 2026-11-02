import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
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
  state: "not_configured" | "idle" | "starting" | "working" | "stopped" | "failed" | "none";
  pid: number | null;
  error: string | null;
  config: AgentConfig | null;
  runCount: number;
  consecutiveFailures: number;
  lastRunAt: number | null;
};

const DEFAULT_CONFIG: AgentConfig = {
  argv: ["kilo", "run", "{prompt}", "--auto", "--format", "json"],
  timeout_sec: 900,
  max_runs_per_hour: 12,
};

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "localhost"]);
const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 5000; // 5 seconds
const LOG_DIR_NAME = "agent-logs";

export class LauncherService {
  private child: ChildProcess | null = null;
  private status: AgentStatus = {
    state: "not_configured",
    pid: null,
    error: null,
    config: null,
    runCount: 0,
    consecutiveFailures: 0,
    lastRunAt: null,
  };
  private readonly configPath: string;
  private readonly logDir: string;
  private startLoopTimer: ReturnType<typeof setInterval> | null = null;
  private runTimestamps: number[] = [];
  private jobsCompletedThisRun = 0;
  private dbQueryOne: (sql: string) => unknown = () => ({ c: 0 });

  constructor(
    private readonly appConfig: Config,
    private readonly events: EventBus,
  ) {
    const dbDir = dirname(appConfig.dbPath);
    this.configPath = join(dbDir, "agent.json");
    this.logDir = join(dbDir, LOG_DIR_NAME);
  }

  async load(): Promise<AgentConfig | null> {
    try {
      const parsed = JSON.parse(await readFile(this.configPath, "utf8")) as unknown;
      const config = validateConfig(parsed);
      this.status = {
        ...this.status,
        config,
        state: "idle",
        error: null,
      };
      return config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      this.status = {
        ...this.status,
        state: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
      return null;
    }
  }

  getStatus(): AgentStatus {
    return {
      ...this.status,
      config: this.status.config ? { ...this.status.config, argv: [...this.status.config.argv] } : null,
    };
  }

  async saveConfig(input: unknown, remoteAddress: string | null): Promise<AgentStatus> {
    if (this.appConfig.lan) throw new Error("agent configuration cannot be changed in LAN mode");
    if (!isLoopbackAddress(remoteAddress)) {
      throw new Error("agent configuration can only be changed from loopback");
    }
    const config = validateConfig(input);
    await mkdir(dirname(this.configPath), { recursive: true });
    await writeFile(this.configPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    this.status = { ...this.status, config, state: "idle", error: null };
    return this.getStatus();
  }

  async start(remoteAddress: string | null): Promise<AgentStatus> {
    if (this.appConfig.lan) throw new Error("agent cannot be started in LAN mode");
    if (!isLoopbackAddress(remoteAddress)) {
      throw new Error("agent can only be started from loopback");
    }
    if (this.child) return this.getStatus();

    const config = this.status.config ?? (await this.load());
    if (!config) {
      this.status = { ...this.status, state: "not_configured", error: "agent configuration is missing" };
      return this.getStatus();
    }

    // Enforce max_runs_per_hour
    const now = Date.now();
    this.runTimestamps = this.runTimestamps.filter((ts) => now - ts < 3_600_000);
    if (this.runTimestamps.length >= (config.max_runs_per_hour ?? DEFAULT_CONFIG.max_runs_per_hour!)) {
      this.status = {
        ...this.status,
        state: "failed",
        error: `max_runs_per_hour (${config.max_runs_per_hour}) exceeded`,
      };
      return this.getStatus();
    }

    const prompt =
      "Work through Hilum MCP jobs. Student actions take priority. Stop when await_work returns idle or retire.";
    const args = config.argv.map((arg) => (arg === "{prompt}" ? prompt : arg));
    this.status = { ...this.status, state: "starting", error: null };
    this.events.publish({ type: "launcher", state: "starting", at: now });

    await mkdir(this.logDir, { recursive: true });
    const logPath = join(this.logDir, `run-${now}.log`);
    const logStream = this.openLogStream(logPath);

    const child = spawn(args[0]!, args.slice(1), {
      cwd: config.cwd,
      env: {
        ...process.env,
        ...config.env,
        HILUM_MCP_URL: `http://${this.appConfig.hostname}:${this.appConfig.port}/mcp`,
        ...(this.appConfig.mcpToken ? { HILUM_MCP_TOKEN: this.appConfig.mcpToken } : {}),
      },
      detached: true,
      stdio: ["ignore", logStream, logStream],
    });

    this.child = child;
    this.runTimestamps.push(now);
    this.status = { ...this.status, state: "working", pid: child.pid ?? null, runCount: this.status.runCount + 1, lastRunAt: now };
    this.jobsCompletedThisRun = 0;
    this.events.publish({ type: "launcher", state: "working", at: Date.now() });

    let exitResolved = false;
    const exitPromise = new Promise<void>((resolve, reject) => {
      child.once("error", (error) => {
        exitResolved = true;
        this.handleExit(error.message, 1);
        reject(error);
      });
      child.once("exit", (code) => {
        exitResolved = true;
        this.handleExit(null, code ?? 0);
        resolve();
      });
    });

    // Hard timeout
    const timeoutSec = config.timeout_sec ?? DEFAULT_CONFIG.timeout_sec!;
    const timeoutTimer = setTimeout(() => {
      if (!exitResolved) {
        try {
          process.kill(-(child.pid ?? 0), "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
        this.handleExit("timeout", 124);
      }
    }, timeoutSec * 1000);
    timeoutTimer.unref?.();

    await exitPromise;
    clearTimeout(timeoutTimer);
    return this.getStatus();
  }

  private openLogStream(logPath: string): ReturnType<typeof createWriteStream> {
    return createWriteStream(logPath, { flags: "a" });
  }

  private handleExit(errorMessage: string | null, code: number): void {
    const now = Date.now();
    this.child = null;

    const succeeded = code === 0 && this.jobsCompletedThisRun > 0;
    if (succeeded) {
      this.status = { ...this.status, state: "idle", pid: null, error: null, consecutiveFailures: 0 };
      this.events.publish({ type: "launcher", state: "idle", at: now });
    } else {
      const consecutiveFailures = this.status.consecutiveFailures + 1;
      const state = consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? "failed" : "starting";
      const error = errorMessage ?? `exit code ${code} with no completed jobs`;
      this.status = {
        ...this.status,
        state,
        pid: null,
        error,
        consecutiveFailures,
      };
      this.events.publish({ type: "launcher", state, at: now });

      if (state !== "failed") {
        const backoffMs = Math.min(1000 * Math.pow(2, consecutiveFailures - 1), MAX_BACKOFF_MS);
        setTimeout(() => {
          this.attemptStartLoop();
        }, backoffMs).unref?.();
      }
    }
  }

  async attemptStartLoop(): Promise<void> {
    if (!this.appConfig.lan && this.child) return;

    const config = this.status.config ?? (await this.load());
    if (!config) return;

    const hasQueuedJobs = this.hasQueuedAgentJobs();
    const hasPendingStudentAction = this.hasPendingStudentAction();
    const noConnectedAgent = this.status.state !== "working";

    if ((hasQueuedJobs || hasPendingStudentAction) && noConnectedAgent) {
      // This would be called by the 5-second poll loop
      void this.start("127.0.0.1");
    }
  }

  private hasQueuedAgentJobs(): boolean {
    try {
      const row = this.dbQueryOne(
        "SELECT COUNT(*) AS c FROM jobs WHERE status='queued' AND executor='agent'",
      );
      return (row as { c: number }).c > 0;
    } catch {
      return false;
    }
  }

  private hasPendingStudentAction(): boolean {
    try {
      const row = this.dbQueryOne(
        "SELECT COUNT(*) AS c FROM agent_requests WHERE status='sent'",
      );
      return (row as { c: number }).c > 0;
    } catch {
      return false;
    }
  }

  setDbQuery(fn: (sql: string) => unknown): void {
    this.dbQueryOne = fn;
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
    if (this.startLoopTimer) {
      clearInterval(this.startLoopTimer);
      this.startLoopTimer = null;
    }
    this.status = { ...this.status, state: "stopped", pid: null };
    this.events.publish({ type: "launcher", state: "stopped", at: Date.now() });
    return this.getStatus();
  }

  startPollLoop(pollMs = POLL_INTERVAL_MS): void {
    if (this.startLoopTimer) return;
    this.startLoopTimer = setInterval(() => {
      void this.attemptStartLoop();
    }, pollMs);
    this.startLoopTimer.unref?.();
  }

  stopPollLoop(): void {
    if (this.startLoopTimer) {
      clearInterval(this.startLoopTimer);
      this.startLoopTimer = null;
    }
  }

  recordJobCompleted(): void {
    this.jobsCompletedThisRun += 1;
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

function isLoopbackAddress(address: string | null): boolean {
  if (!address) return true; // Direct connection, no proxy; app binds to localhost by default
  const host = address.split(":")[0];
  return LOOPBACK_ADDRESSES.has(host) || host.startsWith("127.");
}
