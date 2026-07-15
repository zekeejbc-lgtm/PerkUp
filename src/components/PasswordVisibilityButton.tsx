import { Eye, EyeOff } from "lucide-react";

type PasswordVisibilityButtonProps = {
  visible: boolean;
  onToggle: () => void;
  label?: string;
  className?: string;
};

export function PasswordVisibilityButton({
  visible,
  onToggle,
  label = "password",
  className = "",
}: PasswordVisibilityButtonProps) {
  const actionLabel = `${visible ? "Hide" : "Show"} ${label}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={actionLabel}
      aria-pressed={visible}
      title={actionLabel}
      className={`absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1b1b1b] disabled:pointer-events-none disabled:opacity-50 dark:hover:text-gray-200 ${className}`}
    >
      {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
