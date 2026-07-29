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
  | "directory"
  | "content"
  | "marketing"
  | "pricing"
  | "cards"
  | "promotions"
  | "products"
  | "public-promotions"
  | "public-products"
  | "reviews"
  | "qr-landing"
  | "form"
  | "feedback"
  | "scanner"
  | "homepage"
  | "subscriptions"
  | "overview"
  | "map-list"
  | "tickets";

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

const PublicHeaderSkeleton = () => (
  <div className="border-b border-gray-200 bg-white px-6 dark:border-white/10 dark:bg-[#1b1b1b]">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between">
      <SkeletonBlock className="h-9 w-28 rounded-xl" />
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-9 w-9 rounded-full" />
        <SkeletonBlock className="hidden h-9 w-24 rounded-full sm:block" />
      </div>
    </div>
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

  if (variant === "directory") {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1b1b1b]">
        <div className="flex h-16 items-center justify-between border-b px-6 dark:border-white/10">
          <SkeletonBlock className="h-9 w-28 rounded-xl" />
          <div className="flex gap-3"><SkeletonBlock className="h-9 w-16 rounded-full" /><SkeletonBlock className="h-9 w-24 rounded-full" /></div>
        </div>
        <main>
          <div className="border-b border-gray-100 px-6 py-14 dark:border-white/10">
            <div className="mx-auto max-w-3xl space-y-5 text-center">
              <SkeletonBlock className="mx-auto h-10 w-80 max-w-full rounded-xl" />
              <SkeletonBlock className="mx-auto h-5 w-[34rem] max-w-full rounded-lg" />
              <SkeletonBlock className="h-14 w-full rounded-2xl" />
              <div className="mx-auto flex max-w-md gap-3"><SkeletonBlock className="h-10 flex-1 rounded-xl" /><SkeletonBlock className="h-10 flex-1 rounded-xl" /></div>
            </div>
          </div>
          <div className="mx-auto grid max-w-7xl gap-5 px-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, item) => (
              <div key={item} className="overflow-hidden rounded-[1.75rem] border border-gray-200 p-5 dark:border-gray-800">
                <div className="flex items-start gap-4"><SkeletonBlock className="h-16 w-16 shrink-0 rounded-2xl" /><div className="min-w-0 flex-1 space-y-3"><SkeletonBlock className="h-5 w-3/4 rounded-lg" /><SkeletonBlock className="h-4 w-1/2 rounded-lg" /></div></div>
                <div className="mt-6 space-y-3"><SkeletonBlock className="h-4 w-full rounded-lg" /><SkeletonBlock className="h-4 w-5/6 rounded-lg" /></div>
                <div className="mt-6 flex gap-3"><SkeletonBlock className="h-10 flex-1 rounded-xl" /><SkeletonBlock className="h-10 w-10 rounded-xl" /></div>
              </div>
            ))}
          </div>
        </main>
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

  if (variant === "table") {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <PageHeading />
          <SkeletonBlock className="h-10 w-28 shrink-0 rounded-xl" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map(item => (
            <div key={item} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <SkeletonBlock className="h-4 w-24 rounded-lg" />
              <SkeletonBlock className="mt-4 h-8 w-16 rounded-lg" />
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="grid gap-3 border-b border-gray-100 p-4 dark:border-gray-800 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <SkeletonBlock className="h-11 rounded-xl" />
            <SkeletonBlock className="h-11 rounded-xl" />
            <SkeletonBlock className="h-11 rounded-xl" />
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {[0, 1, 2, 3].map(item => (
              <div key={item} className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center">
                <div className="flex items-center gap-3">
                  <SkeletonBlock className="h-12 w-12 shrink-0 rounded-2xl" />
                  <div className="flex-1 space-y-2"><SkeletonBlock className="h-5 w-2/3 rounded-lg" /><SkeletonBlock className="h-4 w-1/2 rounded-lg" /></div>
                </div>
                <SkeletonBlock className="h-7 w-24 rounded-full" />
                <SkeletonBlock className="h-9 w-20 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "public-products" || variant === "public-promotions") {
    const promotion = variant === "public-promotions";
    return (
      <div className="min-h-screen bg-white dark:bg-[#1b1b1b]">
        <PublicHeaderSkeleton />
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
          <SkeletonBlock className="h-10 w-36 rounded-xl" />
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <PageHeading />
            <SkeletonBlock className="h-11 w-full rounded-xl sm:w-64" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map(item => (
              <div key={item} className="overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <SkeletonBlock className={clsx(promotion ? "h-44" : "h-48", "rounded-none")} />
                <div className="space-y-4 p-5">
                  <div className="flex justify-between gap-4"><SkeletonBlock className="h-6 w-2/3 rounded-lg" /><SkeletonBlock className="h-6 w-16 rounded-lg" /></div>
                  <Lines widths={["w-full", "w-4/5"]} />
                  <SkeletonBlock className="h-10 w-full rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (variant === "reviews") {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1b1b1b]">
        <PublicHeaderSkeleton />
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <SkeletonBlock className="h-10 w-44 rounded-xl" />
          <div className="rounded-[2rem] border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900 sm:p-8">
            <SkeletonBlock className="h-3 w-28 rounded-lg" />
            <div className="mt-4 flex items-end justify-between gap-6"><div className="space-y-3"><SkeletonBlock className="h-10 w-72 max-w-full rounded-xl" /><SkeletonBlock className="h-4 w-44 rounded-lg" /></div><SkeletonBlock className="hidden h-5 w-32 rounded-lg sm:block" /></div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map(item => (
              <div key={item} className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center gap-3"><SkeletonBlock className="h-11 w-11 rounded-full" /><div className="flex-1 space-y-2"><SkeletonBlock className="h-4 w-1/2 rounded-lg" /><SkeletonBlock className="h-3 w-24 rounded-lg" /></div></div>
                <SkeletonBlock className="h-4 w-28 rounded-lg" />
                <Lines widths={["w-full", "w-full", "w-3/4"]} />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (variant === "qr-landing") {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8 dark:bg-[#121212] sm:py-14">
        <div className="mx-auto max-w-xl overflow-hidden rounded-[2rem] border border-gray-200 bg-white dark:border-white/10 dark:bg-[#1f1f1f]">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5 dark:border-white/10"><SkeletonBlock className="h-9 w-28 rounded-xl" /><SkeletonBlock className="h-6 w-24 rounded-full" /></div>
          <div className="px-6 py-10 text-center sm:px-10 sm:py-12">
            <SkeletonBlock className="mx-auto h-20 w-20 rounded-3xl" />
            <SkeletonBlock className="mx-auto mt-6 h-9 w-72 max-w-full rounded-xl" />
            <div className="mx-auto mt-4 max-w-md"><Lines widths={["w-full", "w-11/12", "w-3/4"]} /></div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2"><SkeletonBlock className="h-40 rounded-2xl" /><SkeletonBlock className="h-40 rounded-2xl" /></div>
            <SkeletonBlock className="mt-8 h-14 w-full rounded-2xl" />
            <SkeletonBlock className="mx-auto mt-5 h-4 w-48 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "cards" || variant === "promotions" || variant === "products") {
    if (variant === "cards") {
      return (
        <div className="space-y-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><PageHeading /><SkeletonBlock className="h-10 w-full rounded-xl sm:w-64" /></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map(item => (
              <div key={item} className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center gap-4"><SkeletonBlock className="h-14 w-14 shrink-0 rounded-2xl" /><div className="flex-1 space-y-3"><SkeletonBlock className="h-5 w-2/3 rounded-lg" /><SkeletonBlock className="h-4 w-1/2 rounded-lg" /></div><SkeletonBlock className="h-5 w-5 rounded-lg" /></div>
                <SkeletonBlock className="mt-5 h-4 w-28 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      );
    }
    const imageHeight = variant === "promotions" ? "h-40" : "h-48";
    return (
      <div className="space-y-6">
        <PageHeading />
        <div className="grid gap-6 sm:grid-cols-2">
          {[0, 1, 2, 3].map(item => (
            <div key={item} className="overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <SkeletonBlock className={clsx(imageHeight, "rounded-none")} />
              <div className="space-y-4 p-5"><SkeletonBlock className="h-6 w-2/3 rounded-lg" /><Lines widths={["w-full", "w-4/5"]} /><SkeletonBlock className="h-10 w-full rounded-xl" /></div>
            </div>
          ))}
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
  if (variant === "map-list") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <PageHeading />
          <SkeletonBlock className="h-10 w-full rounded-xl sm:w-64" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonBlock className="h-[400px] rounded-[2rem]" />
          <div className="space-y-4">
            {[0, 1, 2].map(i => <SkeletonBlock key={i} className="h-24 rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }
  if (variant === "tickets") {
    return (
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <PageHeading />
          <SkeletonBlock className="h-10 w-28 rounded-xl" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map(i => <div key={i} className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><div className="flex items-start justify-between gap-4"><div className="flex flex-1 gap-3"><SkeletonBlock className="h-12 w-12 shrink-0 rounded-2xl" /><div className="flex-1 space-y-3"><SkeletonBlock className="h-5 w-2/3 rounded-lg" /><SkeletonBlock className="h-4 w-1/2 rounded-lg" /></div></div><SkeletonBlock className="h-6 w-16 rounded-full" /></div><div className="mt-5 flex gap-3"><SkeletonBlock className="h-9 flex-1 rounded-xl" /><SkeletonBlock className="h-9 w-24 rounded-xl" /></div></div>)}
        </div>
      </div>
    );
  }
  if (variant === "overview") {
    return (
      <div className="space-y-8">
        <PageHeading />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map(i => <SkeletonBlock key={i} className="h-28 rounded-3xl" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <SkeletonBlock className="h-[420px] rounded-[2rem]" />
          <div className="space-y-4">
            <SkeletonBlock className="h-52 rounded-[2rem]" />
            <SkeletonBlock className="h-40 rounded-[2rem]" />
          </div>
        </div>
      </div>
    );
  }

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
      <aside className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] w-64 shrink-0 space-y-4 overflow-y-auto overscroll-contain md:block">
        <div className="flex items-center justify-between"><SkeletonBlock className="h-5 w-24 rounded-lg" /><SkeletonBlock className="h-9 w-9 rounded-xl" /></div>
        <SkeletonBlock className="h-16 rounded-2xl" />
        {Array.from({ length: navigationItems }, (_, item) => <SkeletonBlock key={item} className="h-12 rounded-2xl" />)}
      </aside>
      <div className="min-w-0 flex-1">{children ?? <PageSkeleton />}</div>
    </div>
  );
}
