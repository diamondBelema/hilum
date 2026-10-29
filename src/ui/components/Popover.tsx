import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "../lib/cn.ts";

export function Popover({
  open,
  onClose,
  labelledBy,
  role = "dialog",
  initialFocusRef,
  className,
  children,
}: {
  open: boolean;
  onClose: (reason: "escape" | "outside") => void;
  labelledBy: string;
  role?: "dialog" | "listbox";
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    initialFocusRef?.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) closeRef.current("outside");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current("escape");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role={role}
      aria-labelledby={labelledBy}
      className={cn(
        "absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-panel border border-border-subtle bg-surface p-3 shadow-popover",
        className,
      )}
    >
      {children}
    </div>
  );
}
