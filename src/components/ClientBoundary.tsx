"use client";
import React from 'react';

interface ClientBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// Simple boundary to isolate heavy client-only widgets in tests.
export function ClientBoundary({ children, fallback = null }: ClientBoundaryProps) {
  return <>{children ?? fallback}</>;
}
