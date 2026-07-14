import crypto from 'node:crypto';

export const GUEST_TERMS_VERSION = '2026-07-14';
export const GUEST_TERMS_TEXT = [
  'I confirm that the account details I provided are accurate.',
  'I understand that portal access is limited to the booking linked by the host-issued claim token.',
  'I consent to the processing of my booking and check-in data for providing the stay service.',
].join('\n');
export const GUEST_TERMS_CONTENT_HASH = crypto
  .createHash('sha256')
  .update(GUEST_TERMS_TEXT, 'utf8')
  .digest('hex');
