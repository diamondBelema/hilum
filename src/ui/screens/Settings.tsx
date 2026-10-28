import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { api, type Course, type Health, type ServerSettings } from "../api.ts";
import { Button } from "../components/Button.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { ThemeChoice } from "./Reader.tsx";
import { Config } from "./Config.tsx";
import { useTheme } from "../theme.ts";

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  const [health, setHealth] = useState<Health | null>(null);
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [configCourses, setConfigCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"lan" | "token" | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configCourse, setConfigCourse] = useState<Course | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([api.health(), api.settings(), api.courses()])
      .then(([nextHealth, nextSettings, nextCourses]) => {
        if (cancelled) return;
        setHealth(nextHealth);
        setSettings(nextSettings);
        setConfigCourses(nextCourses);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      if (!open) {
        setConfigCourse(null);
        setConfigOpen(false);
      }
    };
  }, [open]);

  async function toggleLan() {
    if (!settings || busy) return;
    setBusy("lan");
    setNotice(null);
    try {
      const next = await api.updateSettings({ lan: !settings.lan });
      setSettings(next);
      setNotice(
        next.restartRequired
          ? "LAN setting saved. Restart the server to change the binding."
          : "LAN setting unchanged.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function regenerateToken() {
    if (busy) return;
    setBusy("token");
    setNotice(null);
    try {
      const next = await api.updateSettings({ regenerateToken: true });
      setSettings(next);
      setNotice("New token generated. Update any MCP client that uses the old one.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function copyToken() {
    if (!settings?.mcpToken) return;
    try {
      await navigator.clipboard.writeText(settings.mcpToken);
      setNotice("Token copied.");
    } catch {
      setError("Could not copy the token. Select and copy it from the field.");
    }
  }

  return (
    <Sheet open={open} title="Settings" onClose={onClose}>
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold">Theme</h3>
          <p className="mt-0.5 text-xs text-text-muted">Follows your device unless you pick one.</p>
          <ThemeChoice theme={theme} setTheme={setTheme} />
        </section>

        <section>
          <h3 className="text-sm font-semibold">Access</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            Localhost only by default. LAN mode exposes the app to your network and requires a token for
            MCP clients.
          </p>
          {error && <p className="mt-1 text-sm text-incorrect">{error}</p>}
          {settings ? (
            <div className="mt-3 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-text">LAN access</p>
                  <p className="text-xs text-text-muted">
                    {settings.lan ? "On. MCP needs the bearer token." : "Off. This device only."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.lan}
                  aria-label="LAN access"
                  onClick={() => void toggleLan()}
                  disabled={busy !== null}
                  className={`relative inline-flex min-h-11 w-[4.5rem] shrink-0 items-center rounded-full border px-1 text-xs font-semibold transition-colors ${
                    settings.lan
                      ? "border-primary bg-primary text-on-primary"
                      : "border-border-strong bg-surface-2 text-text-muted"
                  }`}
                >
                  <span
                    className={`inline-flex size-9 items-center justify-center rounded-full bg-surface text-text shadow-sm transition-transform ${
                      settings.lan ? "translate-x-7" : "translate-x-0"
                    }`}
                  >
                    {settings.lan ? "On" : "Off"}
                  </span>
                </button>
              </div>

              <div>
                <p className="text-sm text-text">MCP token</p>
                <p className="text-xs text-text-muted">
                  Shown masked. Copy it into your MCP client when LAN access is on.
                </p>
                <code className="mt-2 block min-h-11 break-all rounded-control border border-border-strong bg-surface-2 px-3 py-2 font-mono text-sm text-text">
                  {maskToken(settings.mcpToken)}
                </code>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button onClick={() => void copyToken()} disabled={!settings.mcpToken || busy !== null}>
                    Copy token
                  </Button>
                  <Button
                    onClick={() => void regenerateToken()}
                    disabled={busy !== null}
                    loading={busy === "token"}
                    loadingLabel="Generating…"
                  >
                    Regenerate
                  </Button>
                </div>
              </div>
              {notice && <p className="text-sm text-text-muted">{notice}</p>}
            </div>
          ) : (
            !error && <p className="mt-1 text-sm text-text-muted">Reading server info…</p>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold">Course config</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            Edit course settings, answer style, rubrics and mastery thresholds. Files stay the source of truth.
          </p>
          {settings ? (
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="block text-xs font-medium text-text-muted mb-1">Course</span>
                <select
                  value={configCourse?.code ?? ""}
                  onChange={(event) => {
                    const next = configCourses.find((c) => c.code === event.target.value);
                    setConfigCourse(next ?? null);
                  }}
                  className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Select a course</option>
                  {configCourses.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.title} ({item.code})
                    </option>
                  ))}
                </select>
              </label>
              {configCourse && (
                <Button variant="secondary" onClick={() => setConfigOpen(true)}>
                  <SlidersHorizontal aria-hidden="true" className="size-4" />
                  Open course config
                </Button>
              )}
            </div>
          ) : (
            !error && <p className="mt-1 text-sm text-text-muted">Reading server info…</p>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold">Server</h3>
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
        </section>
        {configOpen && configCourse && (
          <Config course={configCourse} onClose={() => setConfigOpen(false)} open={configOpen} />
        )}
      </div>
    </Sheet>
  );
}

function maskToken(token: string | null): string {
  if (!token) return "Not set";
  if (token.length <= 12) return "•".repeat(token.length);
  return `${token.slice(0, 7)}${"•".repeat(8)}${token.slice(-4)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
