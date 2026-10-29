import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/cn.ts";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary hover:bg-primary/90",
        primary: "bg-primary text-on-primary hover:bg-primary/90",
        destructive:
          "bg-incorrect text-white hover:bg-incorrect/90 focus-visible:ring-incorrect/20",
        outline:
          "border bg-bg shadow-xs hover:bg-surface-2 hover:text-text dark:border-border-strong dark:bg-surface/30 dark:hover:bg-surface-2",
        secondary:
          "bg-surface-2 text-text hover:bg-surface-2/80",
        ghost:
          "hover:bg-surface-2 hover:text-text dark:hover:bg-surface-2/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2 has-[>svg]:px-3",
        xs: "h-11 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-5",
        sm: "h-11 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-12 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-11",
        "icon-xs": "size-11 rounded-md [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-10",
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
