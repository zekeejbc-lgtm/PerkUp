import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../contexts/AuthContext";
import { SkeletonBlock } from "./LoadingSkeleton";

interface PublicSiteHeaderProps {
  onSignIn: () => void;
  onSignUp: () => void;
  onTrack?: () => void;
}

export function PublicSiteHeader({ onSignIn, onSignUp, onTrack }: PublicSiteHeaderProps) {
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-[#1b1b1b]/10 bg-white/85 backdrop-blur-md transition-colors dark:border-white/10 dark:bg-[#1b1b1b]/85">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" aria-label="Perk home">
          <BrandMark compact />
        </Link>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {onTrack && (
            <button
              type="button"
              onClick={onTrack}
              aria-label="Track partner application"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1b1b1b] transition-opacity hover:opacity-70 dark:text-white"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Track</span>
            </button>
          )}
          {loading ? (
            <div className="flex items-center gap-3" aria-label="Loading account controls"><SkeletonBlock className="h-5 w-12 rounded-lg" /><SkeletonBlock className="hidden h-9 w-20 rounded-full sm:block" /></div>
          ) : user ? (
            <Link
              to="/dashboard"
              className="rounded-full bg-[#1b1b1b] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-[#1b1b1b] dark:hover:bg-gray-100"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <button
                type="button"
                onClick={onSignIn}
                className="text-sm font-medium text-[#1b1b1b] transition-opacity hover:opacity-70 dark:text-white"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={onSignUp}
                className="hidden rounded-full bg-[#1b1b1b] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-[#1b1b1b] dark:hover:bg-gray-100 sm:block"
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
