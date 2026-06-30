import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  ["/privacy", "Privacy Policy"],
  ["/data-deletion", "Data Deletion"],
  ["/terms", "Terms of Service"],
  ["/feedback", "Feedback"],
];

export function PublicSiteFooter() {
  return (
    <footer className="mt-auto border-t border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">© {new Date().getFullYear()} PerkUp. All rights reserved.</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500 dark:text-gray-400" aria-label="Legal and support">
          {links.map(([to, label]) => <Link key={to} to={to} className="hover:text-black dark:hover:text-white">{label}</Link>)}
        </nav>
      </div>
    </footer>
  );
}

export function PublicPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#1b1b1b] dark:bg-[#1b1b1b] dark:text-white">
      <header className="sticky top-0 z-40 border-b border-black/10 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-[#1b1b1b]/85">
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" aria-label="PerkUp home"><BrandMark compact /></Link>
          <ThemeToggle />
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8 sm:py-10">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/10 sm:mb-12"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        {children}
      </main>
      <footer className="border-t border-black/10 dark:border-white/10">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">© {new Date().getFullYear()} PerkUp. All rights reserved.</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500 dark:text-gray-400" aria-label="Legal and support">
            {links.map(([to, label]) => <Link key={to} to={to} className="hover:text-black dark:hover:text-white">{label}</Link>)}
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function PolicyPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <PublicPageShell>
      <article>
        <p className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">Last updated: June 29, 2026</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300">{intro}</p>
        <div className="mt-12 space-y-10 text-[15px] leading-7 text-gray-600 dark:text-gray-300">{children}</div>
      </article>
    </PublicPageShell>
  );
}

export function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">{title}</h2>{children}</section>;
}
