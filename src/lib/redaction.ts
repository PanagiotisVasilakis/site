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
  const dot = token.indexOf('.', at + 2);
  return dot > at + 1 && dot < token.length - 1;
}

function looksLikeLongToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length < 2 || parts[0].length < 20 || parts[1].length < 20) return false;
  return parts[0].split('').every((character) => TOKEN_CHARACTERS.has(character))
    && parts[1].split('').every((character) => TOKEN_CHARACTERS.has(character));
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
    output += looksLikeEmail(token)
      ? '[REDACTED_EMAIL]'
      : looksLikeLongToken(token)
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
