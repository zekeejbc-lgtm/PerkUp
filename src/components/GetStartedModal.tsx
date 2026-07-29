import { ArrowRight, Store, UserRound, X } from "lucide-react";

interface GetStartedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerSelect: () => void;
  onBusinessSelect: () => void;
}

export function GetStartedModal({
  isOpen,
  onClose,
  onCustomerSelect,
  onBusinessSelect,
}: GetStartedModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm dark:bg-black/60"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="get-started-title"
        aria-describedby="get-started-description"
        className="relative w-full max-w-2xl rounded-[2rem] border border-gray-100 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900 sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-gray-50 p-2 text-gray-400 transition-colors hover:text-gray-700 dark:bg-gray-800 dark:hover:text-gray-200"
          aria-label="Close get started options"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="pr-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
            Get Started
          </p>
          <h2 id="get-started-title" className="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
            How would you like to use Perk?
          </h2>
          <p id="get-started-description" className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Choose the option that best fits you.
          </p>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={onCustomerSelect}
            className="group flex min-h-52 flex-col rounded-3xl border border-gray-200 bg-gray-50 p-6 text-left transition-all hover:-translate-y-0.5 hover:border-[#1b1b1b] hover:bg-white hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#1b1b1b] focus:ring-offset-2 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-white dark:hover:bg-gray-800 dark:focus:ring-white dark:focus:ring-offset-gray-900"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1b1b1b] text-white dark:bg-white dark:text-[#1b1b1b]">
              <UserRound className="h-6 w-6" />
            </span>
            <span className="mt-5 text-lg font-bold text-gray-900 dark:text-white">Join as a Customer</span>
            <span className="mt-2 flex-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Create a free account to earn points and enjoy rewards from participating businesses.
            </span>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              Create customer account
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </button>

          <button
            type="button"
            onClick={onBusinessSelect}
            className="group flex min-h-52 flex-col rounded-3xl border border-gray-200 bg-gray-50 p-6 text-left transition-all hover:-translate-y-0.5 hover:border-[#1b1b1b] hover:bg-white hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#1b1b1b] focus:ring-offset-2 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-white dark:hover:bg-gray-800 dark:focus:ring-white dark:focus:ring-offset-gray-900"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200 bg-white text-[#1b1b1b] dark:border-gray-700 dark:bg-gray-900 dark:text-white">
              <Store className="h-6 w-6" />
            </span>
            <span className="mt-5 text-lg font-bold text-gray-900 dark:text-white">Apply as a Business</span>
            <span className="mt-2 flex-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Apply to become a Perk partner and build lasting customer loyalty.
            </span>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              Start business application
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
