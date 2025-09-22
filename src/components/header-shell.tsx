"use client";
import React, { type PropsWithChildren } from 'react';

// Legacy passthrough. The app no longer relies on this conditional shell.
// Keep it as a no-op wrapper to avoid breaking imports.
export default function HeaderShell({ children }: PropsWithChildren<Record<string, never>>) {
  return <>{children}</>;
}
