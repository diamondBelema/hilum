import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./Button.tsx";
import { cn } from "../lib/cn.ts";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  variant = "modal",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  variant?: "modal" | "sheet";
}) {
  const panelRef = useRef<HTMLDialogElement>(null);
  const previousRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const focusTrap = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null,
      );
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [],
  );

  const restoreFocus = useCallback(() => {
    const target = previousRef.current;
    if (target && typeof target.focus === "function" && document.contains(target)) {
      target.focus();
    }
    previousRef.current = null;
  }, []);

  useEffect(() => {
    const dialog = panelRef.current;
    if (!dialog) return;

    const onClosed = () => {
      closeRef.current();
      restoreFocus();
      dialog.removeEventListener("keydown", focusTrap);
    };
    const onCanceled = () => {
      closeRef.current();
      restoreFocus();
      dialog.removeEventListener("keydown", focusTrap);
    };
    const onClickBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) {
        event.preventDefault();
        closeRef.current();
        restoreFocus();
        dialog.removeEventListener("keydown", focusTrap);
      }
    };

    if (open) {
      previousRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      dialog.addEventListener("keydown", focusTrap);
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
      if (first && first.offsetParent !== null) first.focus();
    } else {
      dialog.close();
    }

    dialog.addEventListener("close", onClosed);
    dialog.addEventListener("cancel", onCanceled);
    dialog.addEventListener("click", onClickBackdrop);

    return () => {
      dialog.removeEventListener("close", onClosed);
      dialog.removeEventListener("cancel", onCanceled);
      dialog.removeEventListener("click", onClickBackdrop);
      dialog.removeEventListener("keydown", focusTrap);
      restoreFocus();
    };
  }, [open, focusTrap, restoreFocus]);

  if (!open) return null;

  return (
    <dialog
      ref={panelRef}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      className={cn(
        "rounded-dialog border border-border-subtle bg-surface p-5 shadow-popover text-text",
        variant === "sheet" ? "dialog-sheet" : undefined,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {title && <h2 id={titleId} className="type-heading text-text">{title}</h2>}
        <IconButton
          label="Close"
          onClick={() => {
            const dialog = panelRef.current;
            if (dialog) dialog.close();
          }}
          variant="ghost"
          size="icon-sm"
        >
          <X aria-hidden="true" className="size-5" />
        </IconButton>
      </div>
      {description && (
        <p id={descId} className="mt-2 type-body-sm text-text-muted reading">
          {description}
        </p>
      )}
      <div className="mt-5">{children}</div>
    </dialog>
  );
}
