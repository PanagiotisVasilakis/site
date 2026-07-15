const LOCAL_VALIDATION_BASE = 'https://local.invalid/';
const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/;
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;

/**
 * Canonicalize an absolute local path and reject values that a WHATWG URL
 * parser could reinterpret as a different origin.
 */
export function toSafeLocalPath(
  value?: string | null,
  baseHref = LOCAL_VALIDATION_BASE,
): string | null {
  if (typeof value !== 'string') return null;
  const isAbsolutePath = value.startsWith('/');
  const isAbsoluteUrl = /^[a-z][a-z\d+.-]*:/i.test(value);
  if (!isAbsolutePath && !isAbsoluteUrl) return null;

  const pathOnly = value.split(/[?#]/, 1)[0] ?? '';
  if (CONTROL_OR_BACKSLASH.test(value) || ENCODED_PATH_SEPARATOR.test(pathOnly)) return null;

  try {
    const base = new URL(baseHref);
    const target = new URL(value, base);
    if (!['http:', 'https:'].includes(base.protocol) || target.origin !== base.origin) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}
