import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, FolderOpen } from "lucide-react";
import { api, type Health, type ServerSettings } from "../api.ts";
import { Button } from "../components/Button.tsx";
import { AgentLauncher } from "../components/AgentLauncher.tsx";
import { SegmentedControl } from "../components/SegmentedControl.tsx";
import { Link } from "../lib/router.ts";
import { cn } from "../lib/cn.ts";
import { apiUrl, isDesktopApp, openVaultFolder, pickVaultDirectory } from "../lib/desktop.ts";
import { useTheme, type Theme, useReaderPrefs, useLanguage } from "../theme.ts";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const { prefs, setPrefs, size, lineHeight } = useReaderPrefs();
  const { language, setLanguage } = useLanguage();
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [rescanBusy, setRescanBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [vaultPickerBusy, setVaultPickerBusy] = useState(false);
  const [manualVaultPath, setManualVaultPath] = useState("");
  const [backups, setBackups] = useState<Array<{
    name: string;
    path: string;
    createdAt: number;
    format: number | null;
    stats: { notes?: number; courses?: number; tokens?: number } | null;
    hasDatabase: boolean;
  }>>([]);
  const [copied, setCopied] = useState<"endpoint" | "token" | false>(false);
  const [tokenShown, setTokenShown] = useState(false);
  const endpoint = apiUrl("/mcp");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.health(), api.settings()])
      .then(([nextHealth, nextSettings]) => {
        if (cancelled) return;
        setHealth(nextHealth);
        setSettings(nextSettings);
      })
      .catch((err: unknown) => {
        if (!cancelled) setSettingsError(messageOf(err));
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    api.vaultBackups().then((result) => {
      if (!cancelled) setBackups(result.backups);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy(text: string, kind: "endpoint" | "token") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function updateLan(enabled: boolean) {
    setSettingsBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const next = await api.updateSettings({ lan: enabled });
      setSettings(next);
      setSettingsNotice(
        next.restartRequired
          ? "LAN setting saved. Restart Hilum to apply the new bind address."
          : enabled
            ? "LAN access enabled."
            : "LAN access disabled.",
      );
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setSettingsBusy(false);
    }
  }

  async function regenerateToken() {
    setSettingsBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const next = await api.updateSettings({ regenerateToken: true });
      setSettings(next);
      setTokenShown(true);
      setSettingsNotice("MCP token regenerated. Update connected agents.");
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setSettingsBusy(false);
    }
  }

  async function rescanVault() {
    setRescanBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const result = await api.rescanVault();
      setSettingsNotice(
        `Vault rescanned: ${result.stats.notes} notes across ${result.stats.courses} courses.`,
      );
      const nextHealth = await api.health();
      setHealth(nextHealth);
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setRescanBusy(false);
    }
  }

  async function chooseVault() {
    setVaultPickerBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const selected = await pickVaultDirectory();
      if (!selected) return;
      const next = await api.updateSettings({ vaultPath: selected });
      setSettings(next);
      setSettingsNotice("Vault saved. Restart Hilum to use the selected folder.");
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setVaultPickerBusy(false);
    }
  }

  async function setVaultPath() {
    const path = manualVaultPath.trim();
    if (!path) return;
    setVaultPickerBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const next = await api.updateSettings({ vaultPath: path });
      setSettings(next);
      setManualVaultPath("");
      setSettingsNotice("Vault saved. Restart Hilum to use the selected folder.");
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setVaultPickerBusy(false);
    }
  }

  async function backupVault() {
    setBackupBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const result = await api.backupVault();
      setSettingsNotice(`Vault backup created at ${result.destination}.`);
      const latest = await api.vaultBackups();
      setBackups(latest.backups);
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setBackupBusy(false);
    }
  }

  async function exportDiagnostics() {
    setDiagnosticsBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const report = await api.diagnostics();
      const blob = new Blob([JSON.stringify(report, null, 2) + "\n"], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hilum-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setSettingsNotice("Diagnostics report exported without study content or MCP tokens.");
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setDiagnosticsBusy(false);
    }
  }

  async function createDemoCourse() {
    setDemoBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const result = await api.createDemoCourse();
      setSettingsNotice(
        result.created ? "Demo course created. Open Notes to explore it." : result.message ?? "Demo course already exists.",
      );
      const [nextHealth, nextSettings] = await Promise.all([api.health(), api.settings()]);
      setHealth(nextHealth);
      setSettings(nextSettings);
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setDemoBusy(false);
    }
  }

  const displayToken = settings?.mcpToken ?? null;
  const tokenBody = tokenShown || !displayToken ? (displayToken ?? "") : "••••••••";
  const readiness = health?.readiness;
  const mcpUrls = settings?.mcpUrls ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <h1 className="type-title text-text">Settings</h1>
      <p className="type-body mt-2 text-text-muted">
        Appearance applies immediately. Connection and readiness controls are persisted by Hilum.
      </p>

      {(settingsError || settingsNotice) && (
        <div className={cn(
          "mt-4 rounded-control border p-3 type-body-sm",
          settingsError
            ? "border-incorrect/40 bg-incorrect-soft text-incorrect"
            : "border-correct/40 bg-correct-soft text-correct",
        )}>
          {settingsError ?? settingsNotice}
        </div>
      )}
      {settingsLoading && (
        <p className="mt-4 type-body-sm text-text-muted" role="status">
          Loading connection details…
        </p>
      )}

      <section className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
        <div className="flex items-start gap-3">
          {readiness?.setupComplete ? (
            <Check aria-hidden="true" className="mt-0.5 size-5 text-correct" />
          ) : (
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 text-warning" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="type-heading text-text">
              {readiness?.setupComplete ? "Hilum is ready" : "Finish setup"}
            </h2>
            <p className="type-body-sm mt-1 text-text-muted">
              {readiness?.setupComplete
                ? "Vault, database and course content are available."
                : "Choose a writable vault, add a course, and connect an agent to get the full experience."}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid gap-2 sm:grid-cols-3">
          {([
            ["Vault", readiness?.vault],
            ["Database", readiness?.database],
            ["Agent", readiness ? readiness.agent !== "none" : false],
          ] as [string, boolean | undefined][]).map(([label, ready]) => (
            <div key={label} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2">
              <dt className="type-meta text-text-muted">{label}</dt>
              <dd className={cn("type-body-sm mt-1 font-medium", ready ? "text-correct" : "text-warning")}>
                {ready ? "Ready" : label === "Agent" ? "Not connected" : "Needs attention"}
              </dd>
            </div>
          ))}
        </dl>
        {!readiness?.setupComplete && (
          <ol className="mt-4 space-y-2 border-t border-border-subtle pt-4">
            {[
              {
                label: "Check the vault",
                done: Boolean(readiness?.vault),
                action: (
                  <Button variant="ghost" size="sm" onClick={() => void rescanVault()} disabled={rescanBusy}>
                    {rescanBusy ? "Checking…" : "Rescan"}
                  </Button>
                ),
              },
              {
                label: "Add course material",
                done: Boolean(health?.stats?.courses),
                action: (
                  <span className="flex flex-wrap gap-1">
                    <Link
                      to="/library/notes"
                      className="type-body-sm inline-flex min-h-11 items-center rounded-control px-3 font-medium text-primary hover:bg-primary-soft"
                    >
                      Open Notes
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => void createDemoCourse()} disabled={demoBusy}>
                      {demoBusy ? "Creating…" : "Try demo"}
                    </Button>
                  </span>
                ),
              },
              {
                label: "Connect an MCP agent",
                done: readiness ? readiness.agent !== "none" : false,
                action: (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => displayToken && void copy(displayToken, "token")}
                    disabled={!displayToken}
                  >
                    Copy token
                  </Button>
                ),
              },
            ].map((step, index) => (
              <li key={step.label} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono type-meta",
                    step.done
                      ? "border-correct/50 bg-correct-soft text-correct"
                      : "border-border-strong text-text-muted",
                  )}
                >
                  {step.done ? <Check aria-hidden="true" className="size-4" /> : index + 1}
                </span>
                <span className={cn("min-w-0 flex-1 type-body-sm", step.done && "text-text-muted line-through")}>
                  {step.label}
                </span>
                {!step.done && step.action}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
        <h2 className="type-heading text-text">Appearance</h2>
        <p className="type-body-sm mt-1 text-text-muted">
          Follow the system or pin a theme for late study.
        </p>
        <SegmentedControl<Theme>
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          className="mt-3 w-full sm:w-auto"
        />
        <p className="type-label mt-4 text-text-muted">Reader text size</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {[0, 1, 2].map((index) => (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={prefs.size === index}
              onClick={() => setPrefs({ ...prefs, size: index })}
              className={cn(
                "type-body-sm min-h-11 shrink-0 rounded-control border px-3 font-medium transition-colors",
                prefs.size === index
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border-subtle text-text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              {index === 0 ? "Smaller" : index === 1 ? "Default" : "Larger"}
            </button>
          ))}
        </div>
        <p className="type-label mt-4 text-text-muted">Reader line spacing</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {[0, 1, 2].map((index) => (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={prefs.spacing === index}
              onClick={() => setPrefs({ ...prefs, spacing: index })}
              className={cn(
                "type-body-sm min-h-11 shrink-0 rounded-control border px-3 font-medium transition-colors",
                prefs.spacing === index
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border-subtle text-text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              {index === 0 ? "Tight" : index === 1 ? "Default" : "Loose"}
            </button>
          ))}
        </div>
        <p className="mt-3 type-body-sm text-text-muted" style={{ fontSize: size, lineHeight }}>
          Example: reader text at your chosen size and spacing.
        </p>
      </section>

      <section className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
        <h2 className="type-heading text-text">Speech & language</h2>
        <p className="type-body-sm mt-1 text-text-muted">
          Dictation language used when you speak into text areas or the message composer.
        </p>
        <p className="type-label mt-4 text-text-muted">Dictation language</p>
        <input
          type="text"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          placeholder="e.g. en-US, fr-FR, de-DE"
          className="type-body-sm min-h-11 shrink-0 rounded-control border border-border-subtle bg-surface px-3 text-text w-full sm:w-[200px]"
        />
        <p className="type-meta mt-1 text-text-muted">
          Uses your browser's built-in speech recognition. If your browser doesn't support it, no microphone buttons appear.
        </p>
      </section>

      <section className="mt-4 rounded-panel border border-border-subtle bg-surface p-4">
        <h2 className="type-heading text-text">Connection</h2>
        <p className="type-body-sm mt-1 text-text-muted">The MCP endpoint is how an external agent connects.</p>
        <p className="type-label mt-4 text-text-muted">MCP endpoint</p>
        <div className="mt-2 flex items-end gap-2">
          <code
            className="flex-1 min-w-0 type-code block break-all rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-text"
          >
            {endpoint}
          </code>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void copy(endpoint, "endpoint")}
          >
            {copied === "endpoint" ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
            {copied === "endpoint" ? "Copied" : "Copy endpoint"}
          </Button>
        </div>
        {settings && (
          <div className="mt-4">
            <p className="type-label text-text-muted">
              {settings.lan ? "LAN addresses" : "Local address"}
            </p>
            <ul className="mt-1 space-y-1">
              {mcpUrls.length > 0 ? mcpUrls.map((url) => (
                <li key={url} className="break-all type-code text-text">
                  {url}
                </li>
              )) : (
                <li className="break-all type-code text-text">{endpoint}</li>
              )}
            </ul>
            <p className="mt-2 type-meta text-text-muted">
              Bound to <span className="font-mono">{settings.bindHost}</span>. MCP clients use the address above.
            </p>
            <p className="mt-2 type-body-sm text-text">
              Agent: <span className="font-medium">{settings.agent?.clientName ?? "No client identified"}</span>
              <span className="ml-2 text-text-muted">
                ({settings.agent?.state === "none" || !settings.agent ? "not connected" : settings.agent.state})
              </span>
            </p>
          </div>
        )}
        {settings && (
          <>
            <p className="type-label mt-4 text-text-muted">Vault path</p>
            <p className="type-code mt-1 break-all text-text">{settings.vault}</p>
            {settings.configuredVault !== settings.vault && (
              <p className="mt-1 type-meta text-warning">
                Pending restart: {settings.configuredVault}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={vaultPickerBusy}
                  onClick={() => void chooseVault()}
                >
                  <FolderOpen aria-hidden="true" className="size-4" />
                  {vaultPickerBusy ? "Choosing…" : "Choose vault"}
                </Button>
                <input
                  type="text"
                  placeholder="Or paste vault path…"
                  value={manualVaultPath}
                  onChange={(event) => setManualVaultPath(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void setVaultPath();
                  }}
                  className="type-body-sm min-h-11 shrink-0 rounded-control border border-border-subtle bg-surface px-3 text-text w-[220px]"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={vaultPickerBusy || !manualVaultPath.trim()}
                  onClick={() => void setVaultPath()}
                >
                  Set
                </Button>
              </div>
              {isDesktopApp() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void openVaultFolder(settings.vault)}
                >
                  Open folder
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={rescanBusy}
                onClick={() => void rescanVault()}
              >
                {rescanBusy ? "Rescanning…" : "Rescan vault"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={backupBusy}
                onClick={() => void backupVault()}
              >
                {backupBusy ? "Backing up…" : "Create backup"}
              </Button>
              <span className="type-meta text-text-muted">
                Backups are copied beside the database. Native folder actions will be available in the desktop app.
              </span>
            </div>
            {backups.length > 0 && (
              <div className="mt-4 border-t border-border-subtle pt-3">
                <p className="type-label text-text-muted">Recent backups</p>
                <ul className="mt-2 space-y-2">
                  {backups.slice(0, 3).map((backup) => (
                    <li key={backup.name} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2">
                      <p className="type-body-sm font-medium text-text">
                        {new Date(backup.createdAt).toLocaleString()}
                      </p>
                      <p className="mt-0.5 break-all type-meta text-text-muted">
                        {backup.name} · {backup.hasDatabase ? "vault + database" : "vault only"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={diagnosticsBusy}
                onClick={() => void exportDiagnostics()}
              >
                {diagnosticsBusy ? "Preparing report…" : "Export diagnostics"}
              </Button>
            </div>
            <p className="type-label mt-4 text-text-muted">LAN access</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="type-body-sm text-text">{settings.lan ? "Enabled" : "Disabled"}</p>
              <Button
                variant={settings.lan ? "secondary" : "outline"}
                size="sm"
                disabled={settingsBusy}
                onClick={() => void updateLan(!settings.lan)}
              >
                {settings.lan ? "Disable LAN" : "Enable LAN"}
              </Button>
            </div>
            {settings.lan && (
              <p className="mt-2 type-meta text-warning">
                LAN mode exposes this app and its study data to devices on your local network.
              </p>
            )}
          </>
        )}
        <AgentLauncher />
        <p className="type-label mt-4 text-text-muted">MCP agent token</p>
        <p className="type-body-sm mt-1 text-text-muted">
          Shown masked by default. Reveal to copy it into an MCP client.
        </p>
        <div className="mt-2 flex items-end gap-2">
          <span className="flex-1 min-w-0 font-mono text-sm text-text break-all truncate">
            {tokenBody}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => setTokenShown((v) => !v)}>
            <span className="font-mono text-xs" aria-hidden="true">
              {tokenShown ? "hide" : "reveal"}
            </span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => displayToken && copy(displayToken, "token")}
            disabled={!displayToken}
          >
            {copied === "token" ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
            {copied === "token" ? "Copied" : "Copy token"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={settingsBusy}
            onClick={() => void regenerateToken()}
          >
            Rotate token
          </Button>
        </div>
      </section>
    </div>
  );
}
