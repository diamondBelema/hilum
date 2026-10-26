import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:opacity-90 active:opacity-80",
  secondary:
    "border border-border-strong bg-surface text-text hover:bg-surface-2 active:bg-surface-2",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text active:bg-surface-2",
  destructive: "bg-incorrect text-white hover:opacity-90 active:opacity-80",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
};

export function Button({
  variant = "secondary",
  loading = false,
  loadingLabel = "Working…",
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition-opacity duration-150 disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}

type IconProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
};

export function IconButton({ label, className = "", children, type = "button", ...rest }: IconProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-control text-text-muted hover:bg-surface-2 hover:text-text active:bg-surface-2 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
