# Client Component Logger Fix

## Summary

- Next.js builds failed because client bundles imported `node:async_hooks` through `logger-enterprise`.
- The browser build cannot include Node.js APIs, so any client component that pulled the enterprise logger crashed.
- All client-facing modules now import the lightweight `logger-client`, and error metadata is normalized.

## Root Cause

1. Client component (`DataWarmup.tsx`) imported `internalFetchClient.ts`.
2. `internalFetchClient.ts` imported `logger-enterprise.ts`.
3. `logger-enterprise.ts` uses `async_hooks` to manage correlation IDs.
4. Webpack/Turbopack rejected `node:` imports while compiling the client bundle.

## Remediation

### New Browser-Safe Logger

```typescript
// src/lib/logger-client.ts
export const logger = {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
```

### Updated Call Sites

```diff
- import { logger } from '@/lib/logger-enterprise';
+ import { logger } from '@/lib/logger-client';
```

Applied to:

- `src/components/DataWarmup.tsx`
- `src/components/PwaManager.tsx`
- `src/components/BookingForm.tsx`
- `src/components/ApartmentGalleryLightbox.tsx`
- `src/components/LeafletMap.tsx`
- `src/components/ThemeToggle.tsx`
- `src/components/ShareButton.tsx`
- `src/lib/internalFetchClient.ts`
- `src/lib/internalFetch.ts`
- `src/lib/analyticsClient.ts`
- `src/lib/favorites.ts`
- `src/lib/dateUtils.ts`

### Error Normalization Pattern

```typescript
catch (err) {
  logger.warn('Favorites read failed', err instanceof Error ? err : { error: String(err) });
}
```

## Verification

```bash
npm run build
npm run lint
```

Both commands now pass without `async_hooks` errors or TypeScript complaints.

## Next Steps

- If client code ever needs richer logging, extend `logger-client` with the same interface but stay browser compliant.
- Consider publishing a shared logging type definition to enforce consistent method signatures.
