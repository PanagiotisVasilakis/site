"use client";
import React from 'react';
import ThemeToggle from './ThemeToggle';
import LocaleSwitcher from './LocaleSwitcher';

export default function MinimalTopControls() {
  return (
    <div className="fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
      <div className="w-full px-4 pt-2 pointer-events-auto">
        <div className="flex items-center justify-end gap-2 h-8 rounded-full px-3 backdrop-blur bg-white/12 border shadow-sm border-transparent"
             style={{ color: 'var(--text-accent)' }}>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="h-8 rounded-full flex items-center px-2 bg-white/30 dark:bg-zinc-800/60 border border-white/30"><LocaleSwitcher /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
