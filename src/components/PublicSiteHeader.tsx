import { Link } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";

interface PublicSiteHeaderProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

export function PublicSiteHeader({ onSignIn, onSignUp }: PublicSiteHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-[#1b1b1b]/10 bg-white/85 backdrop-blur-md transition-colors dark:border-white/10 dark:bg-[#1b1b1b]/85">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" aria-label="PerkUp home">
          <BrandMark compact />
        </Link>
        <div className="flex items-center gap-4">
          <ThemeToggle />
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
        </div>
      </nav>
    </header>
  );
}
