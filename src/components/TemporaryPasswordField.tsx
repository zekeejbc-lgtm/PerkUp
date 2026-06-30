import { Check, Copy, Eye, EyeOff, RefreshCw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { generateStrongPassword, validateStrongPassword } from "../lib/passwordStrength";

type Props = {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  email?: string;
  className?: string;
};

export function TemporaryPasswordField({ value, onChange, name, email, className = "" }: Props) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const validation = useMemo(
    () => validateStrongPassword(value, { name, email }),
    [value, name, email],
  );

  const generate = () => {
    onChange(generateStrongPassword());
    setVisible(true);
    setCopied(false);
  };

  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            type={visible ? "text" : "password"}
            required
            minLength={12}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 pr-11 font-mono text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            placeholder="12+ characters"
            aria-describedby="temporary-password-requirements"
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <button
          type="button"
          onClick={generate}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
        >
          <RefreshCw className="h-4 w-4" />
          Generate
        </button>
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          className="flex w-10 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          aria-label="Copy password"
          title={copied ? "Copied" : "Copy password"}
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      {value && (
        <div id="temporary-password-requirements" className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full transition-all ${validation.strength.tone}`}
                style={{ width: `${validation.strength.percent}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              {validation.valid ? "Strong" : validation.strength.label}
            </span>
          </div>
          <div className="grid gap-1 sm:grid-cols-2">
            {validation.requirements.map((requirement) => (
              <span
                key={requirement.label}
                className={`flex items-center gap-1.5 text-[11px] ${
                  requirement.met ? "text-green-700 dark:text-green-400" : "text-gray-500"
                }`}
              >
                {requirement.met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {requirement.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
