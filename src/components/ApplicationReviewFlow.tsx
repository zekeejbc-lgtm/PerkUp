import { Check, Clock3 } from "lucide-react";

interface ApplicationReviewFlowProps {
  status?: string;
}

const stages = [
  { label: "Submitted", state: "Completed" },
  { label: "Under Review", state: "Current" },
  { label: "Decision", state: "Upcoming" },
] as const;

export function ApplicationReviewFlow({ status }: ApplicationReviewFlowProps) {
  if (status && status.trim().toLowerCase() !== "pending") return null;

  return (
    <div className="mx-auto mt-6 w-full max-w-md rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left dark:border-gray-700 dark:bg-gray-800">
      <ol
        aria-label="Application review process"
        className="grid grid-cols-3"
      >
        {stages.map((stage, index) => {
          const isComplete = stage.state === "Completed";
          const isCurrent = stage.state === "Current";

          return (
            <li
              key={stage.label}
              aria-current={isCurrent ? "step" : undefined}
              className="relative flex min-w-0 flex-col items-center text-center"
            >
              {index < stages.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`absolute left-1/2 top-4 h-0.5 w-full ${
                    isComplete
                      ? "bg-emerald-300 dark:bg-emerald-700"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                />
              )}
              <span
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-gray-50 dark:ring-gray-800 ${
                  isComplete
                    ? "bg-emerald-600 text-white"
                    : isCurrent
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200"
                      : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                {isComplete ? (
                  <Check aria-hidden="true" className="h-4 w-4" />
                ) : isCurrent ? (
                  <Clock3 aria-hidden="true" className="h-4 w-4" />
                ) : (
                  "3"
                )}
              </span>
              <span className="mt-2 text-xs font-semibold text-gray-900 dark:text-white">
                {stage.label}
              </span>
              <span className="sr-only"> ({stage.state})</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-center text-sm leading-6 text-gray-600 dark:text-gray-300">
        Your submission will be reviewed and decided within the day.
      </p>
    </div>
  );
}
