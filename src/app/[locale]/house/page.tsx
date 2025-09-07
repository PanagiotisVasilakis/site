// Legacy route shim: keep old /house URL working temporarily.
// Re-export the new /villa page implementation. Remove this file once external links updated.
export { default, dynamic } from '@/app/[locale]/villa/page';