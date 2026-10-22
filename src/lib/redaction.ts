const TOKEN_CHARACTERS = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'.split(''));
const PHONE_CHARACTERS = new Set('0123456789+()- '.split(''));

function isWhitespace(character: string): boolean {
  return character === ' ' || character === '\n' || character === '\r' || character === '\t';
}

function redactPhoneSequences(value: string): string {
  let output = '';
  let index = 0;
  while (index < value.length) {
    const first = value[index];
    if (first !== '+' && (first < '0' || first > '9')) {
      output += first;
      index += 1;
      continue;
    }

    let end = index;
    let digits = 0;
    while (end < value.length && end - index < 32 && PHONE_CHARACTERS.has(value[end])) {
      if (value[end] >= '0' && value[end] <= '9') digits += 1;
      end += 1;
    }
    let replacementEnd = end;
    while (replacementEnd > index && value[replacementEnd - 1] === ' ') replacementEnd -= 1;
    if (digits >= 10 || (first === '+' && digits >= 8)) {
      output += '[REDACTED_PHONE]';
      index = replacementEnd;
      continue;
    }
    output += first;
    index += 1;
  }
  return output;
}

function looksLikeEmail(token: string): boolean {
  const at = token.indexOf('@');
  if (at < 1 || at !== token.lastIndexOf('@')) return false;
  // WebKit and Gecko stack frames are `function@https://host/file.js:line:col`, not addresses.
  if (token.includes('://', at)) return false;
  const dot = token.indexOf('.', at + 2);
  return dot > at + 1 && dot < token.length - 1;
}

function looksLikeLongToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length < 2 || parts[0].length < 20 || parts[1].length < 20) return false;
  return parts[0].split('').every((character) => TOKEN_CHARACTERS.has(character))
    && parts[1].split('').every((character) => TOKEN_CHARACTERS.has(character));
}

// Booking claim capabilities: `claim_` followed by base64url (see portalAuthService).
function containsClaimToken(token: string): boolean {
  const start = token.indexOf('claim_');
  if (start < 0) return false;
  let length = 0;
  for (let index = start + 'claim_'.length; index < token.length && TOKEN_CHARACTERS.has(token[index]); index += 1) {
    length += 1;
  }
  return length >= 32;
}

function isLocationBoundary(character: string): boolean {
  return isWhitespace(character) || '()"\'`<>'.includes(character);
}

/** The `:line` or `:line:column` that ends a stack-frame location, or an empty string. */
function trailingPosition(text: string): string {
  let end = text.length;
  for (let groups = 0; groups < 2; groups += 1) {
    let start = end;
    while (start > 0 && text[start - 1] >= '0' && text[start - 1] <= '9') start -= 1;
    if (start === end || start === 0 || text[start - 1] !== ':') break;
    end = start - 1;
  }
  return text.slice(end);
}

/**
 * Removes the query string and the fragment from every URL or file location in a message, a stack
 * trace or a file name (`https://host/app.js?token=x#y:10:20` becomes `https://host/app.js:10:20`):
 * a query often carries a token, an address or a booking reference, and none of it is needed to find
 * the code. A `?` or `#` counts only inside a word that looks like a location (it holds a `/` or a
 * `.` before it), so "what?" and "#3" are left alone. A word ends at white space, a parenthesis or a quote.
 */
export function stripUrlQueryAndFragment(value: string): string {
  let output = '';
  let index = 0;
  while (index < value.length) {
    if (isLocationBoundary(value[index])) {
      output += value[index];
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < value.length && !isLocationBoundary(value[end])) end += 1;
    const word = value.slice(index, end);
    const cut = word.search(/[?#]/u);
    const location = cut > 0 && /[/.]/u.test(word.slice(0, cut))
      ? word.slice(0, cut) + trailingPosition(word.slice(cut))
      : word;
    output += location;
    index = end;
  }
  return output;
}

/** Redact common credential and contact-data shapes without backtracking regular expressions. */
export function redactSensitiveText(value: string, maxLength = 500): string {
  const phoneSafe = redactPhoneSequences(value.slice(0, Math.max(maxLength * 4, maxLength)));
  let output = '';
  let index = 0;
  while (index < phoneSafe.length && output.length < maxLength) {
    if (isWhitespace(phoneSafe[index])) {
      output += phoneSafe[index];
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < phoneSafe.length && !isWhitespace(phoneSafe[end])) end += 1;
    const token = phoneSafe.slice(index, end);
    // Test each maximal run of token characters too: `name=<jwt>;`, quotes and compact JSON glue
    // a secret or an address to other characters. One negated class: linear, no backtracking.
    const runs = token.split(/[^A-Za-z0-9_.@+-]+/u);
    // An address may hold non-ASCII letters or digits (an internationalised local part or domain); tokens stay ASCII.
    const addressRuns = token.split(/[^\p{L}\p{N}_.@+-]+/u);
    // Letters may also carry combining marks (a decomposed accent, an Indic vowel sign). A second split, not a wider
    // class above: a run joined at a mark can hold two @ and lose a match that the split above finds.
    const markedAddressRuns = token.split(/[^\p{L}\p{M}\p{N}_.@+-]+/u);
    output += looksLikeEmail(token) || runs.some(looksLikeEmail) || addressRuns.some(looksLikeEmail)
      || markedAddressRuns.some(looksLikeEmail)
      ? '[REDACTED_EMAIL]'
      : looksLikeLongToken(token) || runs.some(looksLikeLongToken) || containsClaimToken(token)
        ? '[REDACTED_TOKEN]'
        : token;
    index = end;
  }
  return output.slice(0, maxLength);
}

export function isSensitiveFieldName(key: string): boolean {
  const normalized = key.toLowerCase().split('').filter((character) => (
    (character >= 'a' && character <= 'z') || (character >= '0' && character <= '9')
  )).join('');
  return [
    'authorization',
    'cookie',
    'password',
    'secret',
    'token',
    'email',
    'phone',
    'useragent',
    'forwardedfor',
    'connectingip',
    'realip',
    'verifiedclientip',
    'originproxyattestation',
  ]
    .some((sensitive) => normalized.includes(sensitive));
}
