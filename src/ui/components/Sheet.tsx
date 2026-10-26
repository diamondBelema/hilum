import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./Button.tsx";

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
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="top-auto bottom-0 mb-0 max-h-[85dvh] w-full max-w-none rounded-t-dialog border border-border-subtle bg-surface p-0 text-text shadow-popover backdrop:bg-black/40 sm:inset-0 sm:m-auto sm:max-w-lg sm:rounded-dialog"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <IconButton label="Close" onClick={onClose}>
          <X aria-hidden="true" className="size-5" />
        </IconButton>
      </div>
      <div className="max-h-[70dvh] overflow-y-auto p-4">{children}</div>
    </dialog>
  );
}
