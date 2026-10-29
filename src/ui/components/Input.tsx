import * as React from "react";

import { cn } from "../lib/cn.ts";

function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "type-body min-h-11 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-2 text-text transition-colors selection:bg-primary selection:text-on-primary placeholder:text-text-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-incorrect",
        className
      )}
      {...props}
    />
  );
}

export { Input };

function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "type-body min-h-24 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-2 text-text transition-colors selection:bg-primary selection:text-on-primary placeholder:text-text-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-incorrect",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };

function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "type-body min-h-11 min-w-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text transition-colors selection:bg-primary selection:text-on-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-incorrect",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
