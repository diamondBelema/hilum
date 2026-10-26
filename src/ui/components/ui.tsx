import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip border border-border-subtle bg-surface px-2.5 py-1 text-xs text-text-muted ${className}`}
    >
      {children}
    </span>
  );
}

type Tone = "info" | "warning" | "error" | "success";

const tones: Record<Tone, { wrap: string; icon: ReactNode }> = {
  info: {
    wrap: "border-border-subtle bg-surface-2 text-text",
    icon: <Info aria-hidden="true" className="size-4 shrink-0" />,
  },
  warning: {
    wrap: "border-warning/40 bg-warning-soft text-warning",
    icon: <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />,
  },
  error: {
    wrap: "border-incorrect/40 bg-incorrect-soft text-incorrect",
    icon: <XCircle aria-hidden="true" className="size-4 shrink-0" />,
  },
  success: {
    wrap: "border-correct/40 bg-correct-soft text-correct",
    icon: <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />,
  },
};

export function Banner({
  tone = "info",
  children,
  action,
  role,
}: {
  tone?: Tone;
  children: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={`flex items-start gap-2 rounded-control border px-3 py-2 text-sm ${tones[tone].wrap}`}
    >
      {tones[tone].icon}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-panel border border-border-subtle bg-surface px-5 py-8">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      <p className="reading mt-2 text-sm text-text-muted">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProgressBar({
  label,
  value,
  max = 100,
}: {
  label: string;
  value: number;
  max?: number;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-text-muted">{label}</span>
        <span className="font-mono tabular-nums text-text">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="mt-1.5 h-1.5 overflow-hidden rounded-chip bg-surface-2"
      >
        <div className="h-full rounded-chip bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="mt-3 space-y-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="h-4 animate-pulse rounded bg-surface-2" />
      ))}
    </div>
  );
}
