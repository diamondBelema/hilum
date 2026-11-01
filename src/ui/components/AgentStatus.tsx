import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Plug } from "lucide-react";
import { api, type SessionDetail } from "../api.ts";
import { apiUrl } from "../lib/desktop.ts";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { Button } from "./Button.tsx";
import { Popover } from "./Popover.tsx";
import { cn } from "../lib/cn.ts";

export function AgentStatus({ sessionId }: { sessionId: string | null }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const endpoint = apiUrl("/mcp");

  useEffect(() => {
    setDetail(null);
    if (!sessionId) return;
    let cancelled = false;
    const load = () => {
      api
        .session(sessionId)
        .then((next) => {
          if (!cancelled) setDetail(next);
        })
        .catch(() => {});
    };
    load();
    const unsubscribe = subscribeHarnessEvents((event) => {
      if ((event.type === "activity" || event.type === "session") && event.sessionId === sessionId) load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId]);

  const connected = Boolean(detail?.agentConnected);
  const preparing = Boolean(connected && detail?.agentPreparing);
  const text = !connected
    ? "Agent not connected"
    : preparing
      ? "Agent is preparing"
      : "Agent connected";

  async function copy() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? labelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "type-meta inline-flex min-h-11 items-center gap-2 rounded-chip border px-3",
          connected
            ? preparing
              ? "border-warning/40 bg-warning-soft text-warning"
              : "border-correct/40 bg-correct-soft text-correct"
            : "border-border-subtle bg-surface-2 text-text-muted",
        )}
      >
        <Plug aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">{text}</span>
        <span className="sm:hidden">{connected ? (preparing ? "Preparing" : "Connected") : "No agent"}</span>
      </button>
      <Popover
        open={open}
        onClose={(reason) => {
          setOpen(false);
          if (reason === "escape") triggerRef.current?.focus();
        }}
        labelledBy={labelId}
        initialFocusRef={copyRef}
      >
        <h2 id={labelId} className="type-heading text-text">
          Agent connection
        </h2>
        <p className="type-body-sm mt-1 text-text-muted">
          {connected
            ? "An agent has checked in recently. Keep teaching in this session."
            : "No agent is connected. Messages wait in the queue until one connects."}
        </p>
        <p className="type-label mt-3 text-text-muted">MCP endpoint</p>
        <code className="type-code mt-1 block break-all rounded-control border border-border-subtle bg-surface-2 px-2 py-2 text-text">
          {endpoint}
        </code>
        <Button
          ref={copyRef}
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={() => void copy()}
        >
          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
          {copied ? "Copied" : "Copy endpoint"}
        </Button>
      </Popover>
    </div>
  );
}
