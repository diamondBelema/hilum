import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/cn.ts";

const buttonVariants = cva(
  "type-body-sm inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary hover:bg-primary/90",
        primary: "bg-primary text-on-primary hover:bg-primary/90",
        destructive: "bg-incorrect text-on-primary hover:bg-incorrect/90",
        outline:
          "border border-border-strong bg-surface text-text hover:bg-surface-2",
        secondary: "bg-surface-2 text-text hover:bg-surface",
        ghost: "text-text hover:bg-surface-2",
        link: "text-primary underline underline-offset-4 hover:no-underline",
      },
      size: {
        default: "h-11 px-4 py-2 has-[>svg]:px-3",
        xs: "type-meta h-11 gap-1 px-2 has-[>svg]:px-1.5",
        sm: "h-11 gap-2 px-3 has-[>svg]:px-2",
        lg: "h-12 px-6 has-[>svg]:px-4",
        icon: "size-11",
        "icon-xs": "size-11 [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-11",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  loadingLabel = "Working…",
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    loadingLabel?: string;
  }) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading ? <span className="flex items-center gap-1">{loadingLabel}</span> : children}
    </button>
  );
}

export { Button, buttonVariants };

export function IconButton({
  label,
  className = "",
  children,
  type = "button",
  variant = "ghost",
  size = "icon-sm",
  ...rest
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
  label: string;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(buttonVariants({ variant, size, className }))}
      {...rest}
    >
      {children}
    </button>
  );
}
