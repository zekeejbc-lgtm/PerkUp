import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 border border-gray-200 dark:border-gray-700 shadow-sm transition-all hover:scale-105"
      title={`Current theme: ${theme}. Click to change.`}
    >
      {theme === 'light' && <Sun className="w-5 h-5" />}
      {theme === 'dark' && <Moon className="w-5 h-5" />}
      {theme === 'system' && <Monitor className="w-5 h-5" />}
    </button>
  );
}
