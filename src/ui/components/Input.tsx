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
        "h-9 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-on-primary placeholder:text-text-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/50",
        "aria-invalid:border-incorrect aria-invalid:ring-incorrect/20",
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
        "min-h-[90px] w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-1.5 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-on-primary placeholder:text-text-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/50",
        "aria-invalid:border-incorrect aria-invalid:ring-incorrect/20",
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
        "min-h-11 min-w-[44px] w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-on-primary placeholder:text-text-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/50",
        "aria-invalid:border-incorrect aria-invalid:ring-incorrect/20",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
