import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, Plug, RotateCw, X, AlertCircle } from "lucide-react";
import { api, type AgentConfig, type AgentStatus } from "../api.ts";
import { Button } from "./Button.tsx";
import { cn } from "../lib/cn.ts";

function messageOfLocal(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AgentLauncher() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [argvText, setArgvText] = useState("");
  const [cwd, setCwd] = useState("");
  const [timeoutSec, setTimeoutSec] = useState("900");
  const [maxRunsPerHour, setMaxRunsPerHour] = useState("12");
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setStatus(await api.agentStatus());
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    const config = status?.config;
    if (config) {
      setArgvText(config.argv.join("\n"));
      setCwd(config.cwd ?? "");
      setTimeoutSec(String(config.timeout_sec ?? 900));
      setMaxRunsPerHour(String(config.max_runs_per_hour ?? 12));
    }
  }, [status?.config]);

  const parseConfig = (): AgentConfig => {
    const argv = argvText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return {
      argv,
      cwd: cwd.trim() || undefined,
      timeout_sec: Number(timeoutSec) || 900,
      max_runs_per_hour: Number(maxRunsPerHour) || 12,
    };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await api.saveAgentConfig(parseConfig());
      setStatus(next);
      setNotice("Agent configuration saved.");
    } catch (err) {
      setError(messageOfLocal(err));
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    setNotice(null);
    try {
      const next = await api.startAgent();
      setStatus(next);
      setNotice(next.state === "working" ? "Agent started." : `Agent state: ${next.state}.`);
    } catch (err) {
      setError(messageOfLocal(err));
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    setStarting(true);
    setError(null);
    setNotice(null);
    try {
      const next = await api.stopAgent();
      setStatus(next);
      setNotice("Agent stopped.");
    } catch (err) {
      setError(messageOfLocal(err));
    } finally {
      setStarting(false);
    }
  };

  const presetOpencode = () => {
    setArgvText("opencode\nrun\n{prompt}\n--auto\n--format\njson");
  };

  const presetKilo = () => {
    setArgvText("kilo\nrun\n{prompt}\n--auto\n--format\njson");
  };

  const state = status?.state ?? "none";
  const errorText = status?.error ?? null;

  return (
    <section className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="type-heading text-text">Agent launcher</h2>
          <p className="type-body-sm mt-1 text-text-muted">
            Configure the background agent command, start it, and inspect its last run.
          </p>
        </div>
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono type-meta",
            state === "working"
              ? "border-warning/50 bg-warning-soft text-warning"
              : state === "idle"
                ? "border-correct/50 bg-correct-soft text-correct"
                : state === "failed"
                  ? "border-incorrect/50 bg-incorrect-soft text-incorrect"
                  : "border-border-strong text-text-muted",
          )}
        >
          {state === "working" ? (
            <RotateCw aria-hidden="true" className="size-4 animate-spin" />
          ) : state === "failed" ? (
            <AlertCircle aria-hidden="true" className="size-4" />
          ) : (
            state === "idle" ? <Check aria-hidden="true" className="size-4" /> : <Plug aria-hidden="true" className="size-4" />
          )}
        </span>
      </div>

      {error && (
        <div className="mt-3 rounded-control border border-incorrect/40 bg-incorrect-soft p-3 type-body-sm text-incorrect">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-3 rounded-control border border-correct/40 bg-correct-soft p-3 type-body-sm text-correct">
          {notice}
        </div>
      )}

      <form onSubmit={handleSave} className="mt-4 space-y-3">
        <div className="rounded-control border border-border-subtle bg-surface-2 p-3">
          <p className="type-label text-text-muted">Command (one argument per line)</p>
          <textarea
            value={argvText}
            onChange={(e) => setArgvText(e.target.value)}
            rows={5}
            className="type-code block w-full rounded-control border border-border-subtle bg-surface px-3 py-2 text-text font-mono text-sm"
            placeholder={`opencode\nrun\n{prompt}\n--auto\n--format\njson`}
          />
          <p className="type-meta mt-1 text-text-muted">
            Use {"{prompt}"} as a placeholder for the fixed system prompt; Hilum substitutes it at start.
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={presetOpencode}>
              Preset: opencode
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={presetKilo}>
              Preset: kilo
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="type-label text-text-muted">Working directory</p>
            <input
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="Defaults to project root"
              className="type-body-sm min-h-11 shrink-0 rounded-control border border-border-subtle bg-surface px-3 text-text w-full"
            />
          </div>
          <div>
            <p className="type-label text-text-muted">Timeout (seconds)</p>
            <input
              type="number"
              value={timeoutSec}
              onChange={(e) => setTimeoutSec(e.target.value)}
              min="60"
              className="type-body-sm min-h-11 shrink-0 rounded-control border border-border-subtle bg-surface px-3 text-text w-full"
            />
          </div>
          <div>
            <p className="type-label text-text-muted">Max runs per hour</p>
            <input
              type="number"
              value={maxRunsPerHour}
              onChange={(e) => setMaxRunsPerHour(e.target.value)}
              min="1"
              className="type-body-sm min-h-11 shrink-0 rounded-control border border-border-subtle bg-surface px-3 text-text w-full"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save configuration"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={starting} onClick={handleStart}>
            {starting ? "Starting…" : "Start agent"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={starting} onClick={handleStop}>
            Pause
          </Button>
        </div>
      </form>

      {status && (
        <section className="mt-4 rounded-control border border-border-subtle bg-surface-2 p-3">
          <p className="type-label text-text-muted">Status</p>
          <dl className="mt-1 grid gap-1 sm:grid-cols-3 type-body-sm text-text-muted">
            <div>
              <dt className="type-meta">State</dt>
              <dd className={cn("font-medium", state === "failed" ? "text-incorrect" : "text-text")}>
                {state}
              </dd>
            </div>
            <div>
              <dt className="type-meta">PID</dt>
              <dd>{status.pid ?? "—"}</dd>
            </div>
            <div>
              <dt className="type-meta">Run count</dt>
              <dd>{status.runCount}</dd>
            </div>
            <div>
              <dt className="type-meta">Consecutive failures</dt>
              <dd className={cn("font-medium", status.consecutiveFailures > 0 ? "text-warning" : "text-text")}>
                {status.consecutiveFailures}
              </dd>
            </div>
            <div>
              <dt className="type-meta">Last run</dt>
              <dd>{status.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : "—"}</dd>
            </div>
            <div>
              <dt className="type-meta">Client</dt>
              <dd>{status.clientName ?? "—"}</dd>
            </div>
          </dl>
          {status.config && (
            <div className="mt-3">
              <p className="type-label text-text-muted">Command</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="type-code break-all text-text truncated">{status.config.argv.join(" ")}</code>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  onClick={() => {
                    const config = status.config;
                    if (config) void navigator.clipboard.writeText(config.argv.join(" "));
                  }}
                >
                  <Copy aria-hidden="true" className="size-4" />
                </Button>
              </div>
              {status.config.cwd && (
                <p className="type-meta mt-1 text-text-muted">cwd: {status.config.cwd}</p>
              )}
            </div>
          )}
          {errorText && (
            <p className="mt-2 type-body-sm text-text">{`Last error: ${errorText}`}</p>
          )}
        </section>
      )}
    </section>
  );
}
