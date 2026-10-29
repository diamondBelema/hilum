import { useEffect, useState } from "react";
import { FileText, Globe, Palette, Zap } from "lucide-react";
import { api, type Health, type ServerSettings } from "../api.ts";
import { cn } from "../lib/cn.ts";
import { Button } from "../components/Button.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { Input } from "../components/Input.tsx";

type SettingsProps = {
  open: boolean;
  onClose: () => void;
};

export function Settings({ open, onClose }: SettingsProps) {
  const [health, setHealth] = useState<Health | null>(null);
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [lan, setLan] = useState(false);
  const [lanBusy, setLanBusy] = useState(false);
  const [token, setToken] = useState("");
  const [tokenMasked, setTokenMasked] = useState("");
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.health(), api.settings()])
      .then(([h, s]) => {
        if (cancelled) return;
        setHealth(h);
        setSettings(s);
        setLan(!!(s?.lan));
        setToken(s?.mcpToken ?? "");
        setTokenMasked(s?.mcpToken ? "••••••••" : "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleLan() {
    if (!settings) return;
    setLanBusy(true);
    setError(null);
    try {
      const next = await api.updateSettings({ lan: !lan });
      setLan(!!next.lan);
      setNotice(next.lan ? "LAN access enabled" : "LAN access disabled");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLanBusy(false);
    }
  }

  async function regenerateToken() {
    if (!settings) return;
    setError(null);
    try {
      const next = await api.updateSettings({ regenerateToken: true });
      setToken(next.mcpToken ?? "");
      setTokenMasked(next.mcpToken ? "••••••••" : "");
      setNotice("Token regenerated");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Sheet open={open} title="Settings" onClose={onClose}>
      <div className="flex flex-col gap-6 p-4">
        {/* Vault */}
        <section>
          <div className="flex items-center gap-2">
            <FileText className="size-5" aria-hidden="true" />
            <h2 className="text-sm font-medium text-text">Vault</h2>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Where your notes, courses and sessions live on disk.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="flex-1 min-w-0 truncate text-sm text-text-muted">
              {health?.vault ?? "—"}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-text-muted">Free disk space</span>
            <span className="ml-auto font-mono text-xs text-text-muted">
              {(health?.disk?.freePercent ?? 0).toFixed(1)}% free
            </span>
          </div>
        </section>

        {/* LAN */}
        <section>
          <div className="flex items-center gap-2">
            <Globe className="size-5" aria-hidden="true" />
            <h2 className="text-sm font-medium text-text">LAN access</h2>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Let other devices on your network reach this app at its LAN IP.
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-text-muted">{lan ? "Enabled" : "Disabled"}</span>
            <Button variant={lan ? "default" : "secondary"} size="sm" onClick={toggleLan} loading={lanBusy} disabled={lanBusy}>
              {lan ? "Disable" : "Enable"}
            </Button>
          </div>
        </section>

        {/* MCP */}
        <section>
          <div className="flex items-center gap-2">
            <Zap className="size-5" aria-hidden="true" />
            <h2 className="text-sm font-medium text-text">MCP agent token</h2>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Token clients send to connect an external agent over MCP.
          </p>
          <div className="mt-2 flex items-end gap-2">
            <span className="flex-1 min-w-0 font-mono text-xs text-text-muted truncate">
              {tokenMasked}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-xs" onClick={() => setTokenMasked(token ? token : "")}>
                <span className="font-mono text-[10px]" aria-hidden="true">{token ? "show" : "hide"}</span>
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={regenerateToken}>Regenerate</Button>
            </div>
          </div>
        </section>

        {/* Theme */}
        <section>
          <div className="flex items-center gap-2">
            <Palette className="size-5" aria-hidden="true" />
            <h2 className="text-sm font-medium text-text">Appearance</h2>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">System follows your OS dark/light preference.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setTheme("system");
              }}
              className={cn(
                "min-h-9 shrink-0 rounded-control border px-3 py-1 text-xs transition-colors",
                theme === "system"
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border-subtle text-text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              System
            </button>
            <button
              type="button"
              onClick={() => {
                setTheme("light");
              }}
              className={cn(
                "min-h-9 shrink-0 rounded-control border px-3 py-1 text-xs transition-colors",
                theme === "light"
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border-subtle text-text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              Light
            </button>
            <button
              type="button"
              onClick={() => {
                setTheme("dark");
              }}
              className={cn(
                "min-h-9 shrink-0 rounded-control border px-3 py-1 text-xs transition-colors",
                theme === "dark"
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border-subtle text-text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              Black
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-control border border-incorrect/40 bg-incorrect-soft p-3 text-sm text-incorrect">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-control border border-correct/40 bg-correct-soft p-3 text-sm text-correct">
            {notice}
          </div>
        )}
      </div>
    </Sheet>
  );
}
