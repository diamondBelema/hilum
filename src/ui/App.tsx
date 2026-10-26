import { useEffect, useState } from "react";

type Health = {
  status: string;
  version: string;
  mcp: string;
  vault: string;
  db: string;
};

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <main className="mx-auto min-h-full w-full max-w-3xl px-5 py-10 sm:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-border pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Exam Harness</h1>
          <p className="mt-1 max-w-prose text-pretty text-sm text-muted">
            Local-first study and exam simulation. Markdown is the source of truth.
          </p>
        </div>
        <span className="rounded border border-border px-2 py-0.5 font-mono text-xs text-muted">
          v{health?.version ?? "0.1.0"}
        </span>
      </header>

      <section aria-labelledby="system-heading" className="mt-8">
        <h2 id="system-heading" className="text-sm font-medium text-ink">
          System
        </h2>

        <div className="mt-3 rounded-panel border border-border bg-surface p-4 sm:p-5">
          {error && (
            <p role="alert" className="text-sm text-danger">
              Could not reach the server: {error}
            </p>
          )}

          {!health && !error && (
            <div role="status" className="space-y-2" aria-label="Loading server status">
              <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-64 animate-pulse rounded bg-surface-2" />
            </div>
          )}

          {health && (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="text-muted">Status</dt>
              <dd className="flex items-center gap-2">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
                <span className="text-success">ok</span>
              </dd>

              <dt className="text-muted">MCP endpoint</dt>
              <dd className="break-all font-mono text-xs leading-5 text-ink">{health.mcp}</dd>

              <dt className="text-muted">Vault</dt>
              <dd className="break-all font-mono text-xs leading-5 text-ink">{health.vault}</dd>

              <dt className="text-muted">Database</dt>
              <dd className="break-all font-mono text-xs leading-5 text-ink">{health.db}</dd>
            </dl>
          )}
        </div>
      </section>

      <footer className="mt-8 border-t border-border pt-4 text-xs text-muted">
        Milestone M0 complete — scaffold, API and MCP endpoint running. Next: the ken audit.
      </footer>
    </main>
  );
}
