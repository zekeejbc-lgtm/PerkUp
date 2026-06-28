import { Key, ReactNode } from "react";
import { clsx } from "clsx";

export function SkeletonBlock({ className }: { className?: string; key?: Key }) {
  return <div className={clsx("skeleton-shimmer", className)} aria-hidden="true" />;
}

type PageSkeletonVariant =
  | "dashboard"
  | "auth"
  | "store"
  | "table"
  | "landing"
  | "content"
  | "marketing"
  | "pricing"
  | "cards"
  | "promotions"
  | "products"
  | "form"
  | "feedback"
  | "scanner"
  | "homepage"
  | "subscriptions";

const Lines = ({ widths = ["w-full", "w-5/6", "w-2/3"] }: { widths?: string[] }) => (
  <div className="space-y-3">
    {widths.map((width, index) => <SkeletonBlock key={index} className={clsx("h-4 rounded-lg", width)} />)}
  </div>
);

const PageHeading = () => (
  <div className="space-y-3">
    <SkeletonBlock className="h-8 w-64 max-w-full rounded-xl" />
    <SkeletonBlock className="h-4 w-96 max-w-full rounded-lg" />
  </div>
);

const RowList = ({ rows = 4, height = "h-20" }: { rows?: number; height?: string }) => (
  <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
    <SkeletonBlock className="h-16 rounded-none" />
    <div className="space-y-px">
      {Array.from({ length: rows }, (_, item) => <SkeletonBlock key={item} className={clsx(height, "rounded-none")} />)}
    </div>
  </div>
);

export function PageSkeleton({ variant = "dashboard" }: { variant?: PageSkeletonVariant }) {
  if (variant === "auth") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4 dark:bg-[#1b1b1b]">
        <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <SkeletonBlock className="mb-6 h-12 w-12 rounded-2xl" />
          <SkeletonBlock className="mb-3 h-7 w-2/3 rounded-lg" />
          <SkeletonBlock className="mb-8 h-4 w-full rounded-lg" />
          <div className="space-y-4">
            <SkeletonBlock className="h-12 w-full rounded-xl" />
            <SkeletonBlock className="h-12 w-full rounded-xl" />
            <SkeletonBlock className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "landing") {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1b1b1b]">
        <div className="flex h-16 items-center justify-between border-b px-6 dark:border-white/10">
          <SkeletonBlock className="h-9 w-28 rounded-xl" />
          <div className="flex gap-3"><SkeletonBlock className="h-9 w-9 rounded-full" /><SkeletonBlock className="h-9 w-24 rounded-full" /></div>
        </div>
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
          <div className="space-y-6">
            <SkeletonBlock className="h-7 w-52 rounded-full" />
            <SkeletonBlock className="h-16 w-full rounded-2xl" />
            <Lines widths={["w-full", "w-4/5"]} />
            <SkeletonBlock className="h-13 w-36 rounded-full" />
          </div>
          <SkeletonBlock className="h-96 rounded-[2rem]" />
        </div>
        <div className="mx-auto max-w-7xl space-y-6 px-6 pb-20"><PageHeading /><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(i => <SkeletonBlock key={i} className="h-56 rounded-3xl" />)}</div></div>
      </div>
    );
  }

  if (variant === "store") {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1b1b1b]">
        <div className="flex h-16 items-center justify-between border-b px-6 dark:border-white/10"><SkeletonBlock className="h-9 w-28 rounded-xl" /><SkeletonBlock className="h-9 w-24 rounded-full" /></div>
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="mb-8 flex justify-between"><SkeletonBlock className="h-9 w-20 rounded-xl" /><SkeletonBlock className="h-9 w-20 rounded-xl" /></div>
          <SkeletonBlock className="mx-auto mb-6 h-24 w-24 rounded-full" />
          <SkeletonBlock className="mx-auto mb-4 h-10 w-72 max-w-full rounded-xl" />
          <SkeletonBlock className="mx-auto mb-10 h-5 w-full max-w-xl rounded-lg" />
          <div className="mb-10 grid gap-4 sm:grid-cols-2"><SkeletonBlock className="h-36 rounded-3xl" /><SkeletonBlock className="h-36 rounded-3xl" /></div>
          <RowList rows={3} height="h-16" />
          <SkeletonBlock className="mt-10 h-80 rounded-3xl" />
        </div>
      </div>
    );
  }

  if (variant === "content" || variant === "marketing") {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1b1b1b]">
        <div className="flex h-16 items-center justify-between border-b px-6 dark:border-white/10"><SkeletonBlock className="h-9 w-28 rounded-xl" /><SkeletonBlock className="h-9 w-24 rounded-full" /></div>
        <main className="mx-auto max-w-5xl space-y-10 px-6 py-16">
          <div className="mx-auto max-w-2xl space-y-5 text-center"><SkeletonBlock className="mx-auto h-10 w-3/4 rounded-xl" /><SkeletonBlock className="h-5 w-full rounded-lg" /><SkeletonBlock className="mx-auto h-5 w-5/6 rounded-lg" /></div>
          {variant === "marketing" ? <div className="grid gap-6 md:grid-cols-3">{[0, 1, 2].map(i => <SkeletonBlock key={i} className="h-64 rounded-3xl" />)}</div> : <div className="space-y-8 rounded-3xl border p-8 dark:border-gray-800"><Lines /><Lines /><Lines /></div>}
        </main>
      </div>
    );
  }

  if (variant === "pricing") {
    return <div className="space-y-10 p-6"><div className="mx-auto max-w-xl"><PageHeading /></div><div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">{[0, 1, 2].map(i => <SkeletonBlock key={i} className="h-[430px] rounded-3xl" />)}</div></div>;
  }

  if (variant === "table") return <div className="space-y-6"><PageHeading /><RowList /></div>;

  if (variant === "cards" || variant === "promotions" || variant === "products") {
    const height = variant === "promotions" ? "h-[420px]" : variant === "products" ? "h-72" : "h-44";
    return (
      <div className="space-y-6">
        <PageHeading />
        <div className="grid gap-6 sm:grid-cols-2">
          {[0, 1, 2, 3].map(item => <SkeletonBlock key={item} className={clsx(height, "rounded-3xl")} />)}
        </div>
      </div>
    );
  }

  if (variant === "form" || variant === "homepage" || variant === "subscriptions") {
    return (
      <div className="space-y-6">
        <PageHeading />
        <div className="rounded-[2rem] border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          {variant === "subscriptions" && <div className="mb-6 grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(i => <SkeletonBlock key={i} className="h-28 rounded-2xl" />)}</div>}
          {variant === "homepage" && <SkeletonBlock className="mb-6 h-52 rounded-2xl" />}
          <div className="space-y-5">{[0, 1, 2, 3].map(i => <div key={i} className="space-y-2"><SkeletonBlock className="h-4 w-28 rounded-lg" /><SkeletonBlock className="h-12 rounded-xl" /></div>)}</div>
        </div>
      </div>
    );
  }

  if (variant === "feedback") return <div className="space-y-6"><PageHeading /><div className="grid gap-6 lg:grid-cols-3">{[0, 1, 2].map(i => <SkeletonBlock key={i} className="h-56 rounded-3xl" />)}</div></div>;
  if (variant === "scanner") return <div className="mx-auto max-w-3xl space-y-6"><PageHeading /><SkeletonBlock className="aspect-square max-h-[520px] w-full rounded-[2rem]" /><SkeletonBlock className="h-16 rounded-2xl" /></div>;

  return (
    <div className="w-full space-y-8">
      <PageHeading />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(item => <SkeletonBlock key={item} className="h-28 rounded-[2rem]" />)}</div>
      <div className="grid gap-8 lg:grid-cols-2"><SkeletonBlock className="h-[520px] rounded-[2rem]" /><SkeletonBlock className="h-[420px] rounded-[2rem]" /></div>
    </div>
  );
}

export function DashboardShellSkeleton({ children, navigationItems = 5 }: { children?: ReactNode; navigationItems?: number }) {
  return (
    <div className="flex w-full flex-col gap-8 pb-24 md:flex-row md:pb-0">
      <aside className="hidden w-64 shrink-0 space-y-4 md:block">
        <div className="flex items-center justify-between"><SkeletonBlock className="h-5 w-24 rounded-lg" /><SkeletonBlock className="h-9 w-9 rounded-xl" /></div>
        <SkeletonBlock className="h-16 rounded-2xl" />
        {Array.from({ length: navigationItems }, (_, item) => <SkeletonBlock key={item} className="h-12 rounded-2xl" />)}
      </aside>
      <div className="min-w-0 flex-1">{children ?? <PageSkeleton />}</div>
    </div>
  );
}
