"use client";
import { useTheme } from './ThemeProvider';

export default function ThemeSwitcher() {
  const { theme, actualTheme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600 dark:text-gray-300">Theme:</span>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
        className="text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
        aria-label="Select theme"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <span className="text-xs text-gray-400 dark:text-gray-500">
        ({actualTheme})
      </span>
    </div>
  );
}
