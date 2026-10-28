import { useEffect, useState } from "react";
import { api, type Health } from "../api.ts";
import { Sheet } from "../components/Sheet.tsx";
import { ThemeChoice } from "./Reader.tsx";
import { useTheme } from "../theme.ts";

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .health()
      .then((value) => !cancelled && setHealth(value))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Sheet open={open} title="Settings" onClose={onClose}>
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold">Theme</h3>
          <p className="mt-0.5 text-xs text-text-muted">Follows your device unless you pick one.</p>
          <ThemeChoice theme={theme} setTheme={setTheme} />
        </section>

        <section>
          <h3 className="text-sm font-semibold">Server</h3>
          {error && <p className="mt-1 text-sm text-incorrect">{error}</p>}
          {health ? (
            <dl className="mt-2 space-y-2 font-mono text-xs text-text-muted">
              <div>
                <dt className="text-text">Vault</dt>
                <dd className="break-all">{health.vault}</dd>
              </div>
              <div>
                <dt className="text-text">Database</dt>
                <dd className="break-all">{health.db}</dd>
              </div>
              <div>
                <dt className="text-text">Version</dt>
                <dd>{health.version}</dd>
              </div>
              {health.disk && (
                <div>
                  <dt className="text-text">Free space</dt>
                  <dd>
                    {formatBytes(health.disk.freeBytes)} of {formatBytes(health.disk.totalBytes)} (
                    {health.disk.freePercent}%)
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            !error && <p className="mt-1 text-sm text-text-muted">Reading server info…</p>
          )}
          {health?.disk && health.disk.freePercent < 10 && (
            <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
              Only {formatBytes(health.disk.freeBytes)} free ({health.disk.freePercent}%). Delete old
              backups or free space before recording exams.
            </p>
          )}
          <p className="mt-3 text-xs text-text-muted">
            The vault path, LAN access and MCP token come from the server environment. This build does not
            edit them from the browser.
          </p>
        </section>
      </div>
    </Sheet>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
