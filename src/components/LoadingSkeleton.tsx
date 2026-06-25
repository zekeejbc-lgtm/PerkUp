import { Key, ReactNode } from "react";
import { clsx } from "clsx";

export function SkeletonBlock({ className }: { className?: string; key?: Key }) {
  return <div className={clsx("skeleton-shimmer", className)} aria-hidden="true" />;
}

export function PageSkeleton({ variant = "dashboard" }: { variant?: "dashboard" | "auth" | "store" | "table" }) {
  if (variant === "auth") {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1b1b1b] flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <SkeletonBlock className="mb-6 h-12 w-12 rounded-2xl" />
          <SkeletonBlock className="mb-3 h-6 w-2/3 rounded-lg" />
          <SkeletonBlock className="mb-8 h-4 w-full rounded-lg" />
          <SkeletonBlock className="mb-3 h-12 w-full rounded-xl" />
          <SkeletonBlock className="h-12 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (variant === "store") {
    return (
      <div className="min-h-screen bg-white px-4 pt-24 dark:bg-[#1b1b1b]">
        <div className="mx-auto max-w-3xl">
          <SkeletonBlock className="mx-auto mb-6 h-24 w-24 rounded-full" />
          <SkeletonBlock className="mx-auto mb-4 h-10 w-72 max-w-full rounded-xl" />
          <SkeletonBlock className="mx-auto mb-10 h-5 w-full max-w-xl rounded-lg" />
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonBlock className="h-36 rounded-3xl" />
            <SkeletonBlock className="h-36 rounded-3xl" />
          </div>
          <SkeletonBlock className="mt-4 h-48 rounded-3xl" />
        </div>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="space-y-4 p-6">
        <SkeletonBlock className="h-8 w-56 rounded-xl" />
        {[0, 1, 2, 3].map((item) => (
          <SkeletonBlock key={item} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonBlock className="h-28 rounded-3xl" />
        <SkeletonBlock className="h-28 rounded-3xl" />
        <SkeletonBlock className="h-28 rounded-3xl" />
      </div>
      <div className="rounded-4xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <SkeletonBlock className="mb-5 h-7 w-48 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonBlock className="h-40 rounded-3xl" />
          <SkeletonBlock className="h-40 rounded-3xl" />
        </div>
      </div>
    </div>
  );
}

export function DashboardShellSkeleton({ children }: { children?: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-8 pb-24 md:flex-row md:pb-0">
      <aside className="hidden w-64 shrink-0 space-y-4 md:block">
        <SkeletonBlock className="h-5 w-24 rounded-lg" />
        {[0, 1, 2, 3, 4].map((item) => (
          <SkeletonBlock key={item} className="h-12 rounded-2xl" />
        ))}
      </aside>
      <div className="min-w-0 flex-1">{children ?? <PageSkeleton />}</div>
    </div>
  );
}
