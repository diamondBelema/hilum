import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button.tsx";
import { cn } from "../lib/cn.ts";

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            className={cn(
              "relative z-50 w-full max-w-lg rounded-dialog border border-border-subtle bg-surface p-0 text-text shadow-popover",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2">
              <h2 id="sheet-title" className="text-sm font-medium text-text">{title}</h2>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Close"
                onClick={onClose}
              >
                <X aria-hidden="true" className="size-5" />
              </Button>
            </div>
            <div className="max-h-[70dvh] overflow-y-auto p-4">{children}</div>
          </div>
        </>
      );
}