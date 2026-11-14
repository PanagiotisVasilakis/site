/**
 * Free text from a guest or a browser is stored, shown to the host and written to logs. Some
 * characters make a string read differently from what it contains: bidi overrides and isolates
 * reorder what a reader sees, zero-width characters hide or split words, and C0/C1 controls
 * (ESC, CR, VT, FF, NEL, DEL ...) forge log lines and terminal output.
 *
 * Tab and newline stay, because a multi-line message is ordinary. Everything below is in the
 * Basic Multilingual Plane, so a surrogate half of an emoji or of a supplementary letter is never
 * touched.
 */
function isUnsafeTextCodeUnit(code: number): boolean {
  return (code <= 0x1f && code !== 0x09 && code !== 0x0a) // C0 except tab and newline (NUL, CR, ESC ...)
    || (code >= 0x7f && code <= 0x9f) // DEL and C1
    || (code >= 0x200b && code <= 0x200f) // zero-width space and joiners, LRM, RLM
    || (code >= 0x202a && code <= 0x202e) // bidi embeddings and overrides
    || (code >= 0x2066 && code <= 0x2069) // bidi isolates
    || code === 0xfeff; // zero-width no-break space / byte order mark
}

/** Removes the control, zero-width and bidi characters listed above; every other character is kept. */
export function stripUnsafeTextCharacters(value: string): string {
  let output = '';
  let kept = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (!isUnsafeTextCodeUnit(value.charCodeAt(index))) continue;
    output += value.slice(kept, index);
    kept = index + 1;
  }
  return kept === 0 ? value : output + value.slice(kept);
}
