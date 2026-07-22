import { Link } from "react-router-dom";
import { PublicPageShell } from "../components/PublicPageShell";

export default function NotFoundPage() {
  return (
    <PublicPageShell>
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">404</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Page not found.</h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-gray-600 dark:text-gray-300">
        The page may have moved, or the address may be incorrect.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/" className="rounded-full bg-[#1b1b1b] px-6 py-3 text-sm font-semibold text-white dark:bg-white dark:text-[#1b1b1b]">Go home</Link>
        <Link to="/stores" className="rounded-full border border-black/15 px-6 py-3 text-sm font-semibold dark:border-white/20">Browse stores</Link>
      </div>
    </PublicPageShell>
  );
}
