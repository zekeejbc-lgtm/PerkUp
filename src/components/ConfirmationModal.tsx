import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  tone?: "danger" | "default";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmationModal({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isLoading = false,
  tone = "danger",
  onConfirm,
  onClose,
}: ConfirmationModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoading) onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => cancelButtonRef.current?.focus());

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      previousActiveElement?.focus();
    };
  }, [isLoading, isOpen, onClose]);

  if (!isOpen) return null;

  const isDanger = tone === "danger";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/55 px-4 py-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isLoading) onClose();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        aria-describedby="confirmation-modal-description"
        className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
      >
        <div className="flex items-start gap-4 p-6">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${isDanger ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirmation-modal-title" className="text-lg font-bold text-gray-950 dark:text-white">
              {title}
            </h2>
            <p id="confirmation-modal-description" className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
              {description}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close confirmation"
            disabled={isLoading}
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-950/30 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${isDanger ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 hover:bg-black dark:bg-white dark:text-gray-900"}`}
          >
            {isLoading ? "Please wait..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
