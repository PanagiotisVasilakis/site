/// <reference types="react/canary" />
import * as React from 'react';
import type { ReactNode } from 'react';

/*
 * React's <ViewTransition> is a canary API (identity §5.7), exported by the React that Next vendors for the
 * App Router (next/dist/compiled/react, client and react-server builds) but not by the stable `react`
 * package the unit tests resolve. It is read off the namespace so a React without it renders the children
 * unchanged, and it stays isolated in this one file.
 */
const ViewTransition = (React as Partial<typeof React>).ViewTransition;

/**
 * §5.7 shared element: the same `name` on the list card image and the detail hero morphs one into the
 * other during a navigation (`share="morph"`, `default="none"`). The motion safety net in motion.css stops
 * the animation without `data-motion="full"` or with an OS reduce preference.
 */
export function SharedElement({ name, children }: { name: string; children: ReactNode }) {
  if (!ViewTransition) return <>{children}</>;
  return <ViewTransition name={name} share="morph" default="none">{children}</ViewTransition>;
}
