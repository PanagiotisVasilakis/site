// Legacy route shim: keep old /house URL working temporarily.
// Re-export the new /apartment page implementation. Remove this file once external links updated.
export { default } from '@/app/[locale]/apartment/page';
export const dynamic = 'auto';