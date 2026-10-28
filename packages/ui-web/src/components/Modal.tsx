"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  /** Called when Escape is pressed (defaults to onClose). */
  onEscape?: () => void;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className = "",
  onEscape,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }

    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      (onEscape ?? onClose)();
    };

    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose, onEscape]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={[
        "fixed inset-0 m-auto max-h-[90vh] w-[min(100%-2rem,28rem)]",
        "rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)]",
        "bg-[var(--rw-bg-elevated)] text-[var(--rw-ink)] p-0 shadow-xl",
        "backdrop:bg-black/40",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--rw-border)] px-4 py-3">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="rounded-md p-1 text-[var(--rw-ink-muted)] hover:bg-[var(--rw-accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)]"
        >
          <span aria-hidden>×</span>
        </button>
      </div>
      <div className="overflow-auto p-4">{children}</div>
    </dialog>
  );
}
