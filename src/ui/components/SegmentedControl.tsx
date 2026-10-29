import { cn } from "../lib/cn.ts";

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex min-w-max items-center rounded-control border border-border-strong bg-surface p-0",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "type-meta min-h-11 min-w-fit flex-1 whitespace-nowrap rounded-control px-2 font-medium",
              selected ? "bg-primary-soft text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
