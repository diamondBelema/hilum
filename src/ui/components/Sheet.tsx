import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./Button.tsx";
import { useDialogFocus } from "./Drawer.tsx";

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
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = "sheet-title";
  useDialogFocus(open, panelRef, onClose);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-dialog border border-border-subtle bg-surface text-text shadow-popover max-sm:mt-auto max-sm:max-h-[78dvh] max-sm:rounded-b-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2">
          <h2 id={titleId} className="type-heading text-text">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose} variant="ghost" size="icon-sm">
            <X aria-hidden="true" className="size-5" />
          </IconButton>
        </div>
        <div className="min-h-0 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
